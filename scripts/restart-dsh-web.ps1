#Requires -Version 5.1
<#
.SYNOPSIS
  Safely kill, wait, and restart `dsh web` on a chosen port (default 3080).

.DESCRIPTION
  Finds LISTENING owners of -Port, kills only processes whose CommandLine
  matches this repo's `dsh web` / `bin.ts web` / `--port <n>` launch, waits
  until the port is free, starts a new server, then prints self-proof
  (PID, CreationDate, CommandLine) after listen + HTTP 200.

  Default mode detaches the server and writes logs to:
    .dsh-web-<port>.log
    .dsh-web-<port>.err.log
  Use -Foreground to keep the server in this terminal (no detach).

.PARAMETER Port
  Listen port (default 3080).

.PARAMETER NoKill
  Skip kill; only start if the port is already free.

.PARAMETER Timeout
  Seconds for port-free wait, listen wait, and health wait (default 10).

.PARAMETER Foreground
  Run the new server in this terminal instead of background + log files.

.PARAMETER SkipStart
  Stop after confirming the port is free (or empty). Used by dry-run tests;
  never starts `dsh web`.

.PARAMETER DryRun
  Parse parameters and print the planned action; do not kill or start.
#>
[CmdletBinding()]
param(
  [int]$Port = 3080,
  [switch]$NoKill,
  [int]$Timeout = 10,
  [switch]$Foreground,
  [switch]$SkipStart,
  [switch]$DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Write-Fail([string]$Message) {
  Write-Host "ERROR: $Message" -ForegroundColor Red
  exit 1
}

function Get-RepoRoot {
  return (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
}

function Get-ListeningPids([int]$ListenPort) {
  $pids = New-Object 'System.Collections.Generic.List[int]'
  $seen = New-Object 'System.Collections.Generic.HashSet[int]'
  try {
    $conns = @(Get-NetTCPConnection -LocalPort $ListenPort -State Listen -ErrorAction SilentlyContinue)
    foreach ($c in $conns) {
      if ($null -ne $c.OwningProcess -and $c.OwningProcess -gt 0) {
        $id = [int]$c.OwningProcess
        if ($seen.Add($id)) { [void]$pids.Add($id) }
      }
    }
  } catch {
    # Fall through to netstat when the NetTCPConnection cmdlet is unavailable.
  }
  if ($pids.Count -eq 0) {
    $lines = @(& netstat -ano -p tcp 2>$null)
    foreach ($line in $lines) {
      if ($line -notmatch 'LISTENING') { continue }
      if ($line -notmatch ":$ListenPort\s+") { continue }
      if ($line -match '\s+(\d+)\s*$') {
        $pidValue = [int]$Matches[1]
        if ($pidValue -gt 0 -and $seen.Add($pidValue)) { [void]$pids.Add($pidValue) }
      }
    }
  }
  # Unary comma / NoEnumerate: PowerShell otherwise unwraps List`1 to $null or a bare int.
  Write-Output -NoEnumerate $pids
}

function Convert-CimDate([object]$Raw) {
  if ($null -eq $Raw -or [string]::IsNullOrWhiteSpace([string]$Raw)) { return $null }
  try {
    if ($Raw -is [datetime]) { return [datetime]$Raw }
    return [System.Management.ManagementDateTimeConverter]::ToDateTime([string]$Raw)
  } catch {
    # Some CIM rows carry empty or out-of-range DMTF timestamps; omit rather than abort.
    return $null
  }
}

function Get-ProcessInfo([int]$ProcessId) {
  $proc = Get-CimInstance Win32_Process -Filter "ProcessId = $ProcessId" -ErrorAction SilentlyContinue
  if (-not $proc) { return $null }
  return [pscustomobject]@{
    ProcessId = [int]$proc.ProcessId
    ParentProcessId = [int]$proc.ParentProcessId
    Name = [string]$proc.Name
    CommandLine = [string]$proc.CommandLine
    CreationDate = (Convert-CimDate $proc.CreationDate)
  }
}

function Test-IsDshWebCommand([string]$CommandLine, [int]$ListenPort) {
  if ([string]::IsNullOrWhiteSpace($CommandLine)) { return $false }
  $cl = $CommandLine
  # Require an explicit --port <n> (quotes allowed: "--port" "3080").
  if ($cl -notmatch "(?i)(?:--port|-Port)[`"']?\s*[`"']?$ListenPort(?:\s|[`"']|$)") { return $false }
  $hasBinWeb = $cl -match '(?i)bin\.ts(?:\s|[`"''])+web\b'
  $hasDshWeb = $cl -match '(?i)(?:\bdsh\b|[\\/]dsh(?:\.cmd|\.ps1|\.exe)?)\b.*\bweb\b'
  $hasWebFlag = $cl -match '(?i)(?:^|[\s`"''])web(?:[\s`"'']|$)'
  $hasTsxOrNode = $cl -match '(?i)(?:tsx[/\\]esm|apps[/\\]cli[/\\]src[/\\]bin\.ts|\bnode(?:\.exe)?\b)'
  if ($hasBinWeb) { return $true }
  if ($hasDshWeb -and $hasTsxOrNode) { return $true }
  if ($hasWebFlag -and ($cl -match '(?i)bin\.ts') -and $hasTsxOrNode) { return $true }
  return $false
}

function Test-IsLauncherName([string]$Name) {
  if ([string]::IsNullOrWhiteSpace($Name)) { return $false }
  return $Name -match '(?i)^(node|nodejs|corepack|pnpm|npm)(\.exe)?$'
}

function Get-KillCandidates([int]$ListenPort) {
  $listeners = Get-ListeningPids -ListenPort $ListenPort
  $toKill = New-Object 'System.Collections.Generic.List[int]'
  $toKillSet = New-Object 'System.Collections.Generic.HashSet[int]'
  $rejected = New-Object 'System.Collections.Generic.List[string]'
  foreach ($pidValue in $listeners) {
    $info = Get-ProcessInfo -ProcessId ([int]$pidValue)
    if (-not $info) {
      [void]$rejected.Add("PID $pidValue (process vanished before CommandLine check)")
      continue
    }
    if (-not (Test-IsLauncherName $info.Name)) {
      [void]$rejected.Add("PID $pidValue Name=$($info.Name) CommandLine=$($info.CommandLine)")
      continue
    }
    if (-not (Test-IsDshWebCommand -CommandLine $info.CommandLine -ListenPort $ListenPort)) {
      [void]$rejected.Add("PID $pidValue Name=$($info.Name) CommandLine=$($info.CommandLine)")
      continue
    }
    if ($toKillSet.Add([int]$pidValue)) { [void]$toKill.Add([int]$pidValue) }
    # Optionally include a corepack/pnpm parent that launched this confirmed dsh web child.
    $parent = Get-ProcessInfo -ProcessId $info.ParentProcessId
    if (
      $parent -and
      (Test-IsLauncherName $parent.Name) -and
      (
        (Test-IsDshWebCommand -CommandLine $parent.CommandLine -ListenPort $ListenPort) -or
        (
          $parent.Name -match '(?i)^(corepack|pnpm)(\.exe)?$' -and
          $parent.CommandLine -match '(?i)\b(?:dsh|bin\.ts)\b' -and
          $parent.CommandLine -match '(?i)\bweb\b'
        )
      )
    ) {
      if ($toKillSet.Add($parent.ProcessId)) { [void]$toKill.Add($parent.ProcessId) }
    }
  }
  return [pscustomobject]@{
    Listeners = $listeners
    ToKill = $toKill
    Rejected = $rejected
  }
}

function Stop-ConfirmedProcesses([System.Collections.Generic.List[int]]$ProcessIds) {
  foreach ($pidValue in $ProcessIds) {
    $info = Get-ProcessInfo -ProcessId ([int]$pidValue)
    if (-not $info) {
      Write-Host "PID $pidValue already gone."
      continue
    }
    Write-Host "Stopping PID $pidValue ($($info.Name)) Created=$($info.CreationDate) CMD=$($info.CommandLine)"
    Stop-Process -Id ([int]$pidValue) -Force -ErrorAction SilentlyContinue
  }
}

function Wait-PortFree([int]$ListenPort, [int]$Seconds) {
  $deadline = [datetime]::UtcNow.AddSeconds($Seconds)
  while ([datetime]::UtcNow -lt $deadline) {
    $left = Get-ListeningPids -ListenPort $ListenPort
    if ($left.Count -eq 0) { return }
    Start-Sleep -Milliseconds 250
  }
  $still = Get-ListeningPids -ListenPort $ListenPort
  $details = foreach ($pidValue in $still) {
    $info = Get-ProcessInfo -ProcessId ([int]$pidValue)
    if ($info) { "PID $($info.ProcessId) Name=$($info.Name) CMD=$($info.CommandLine)" }
    else { "PID $pidValue (no CommandLine)" }
  }
  Write-Fail "Port $ListenPort still LISTENING after ${Seconds}s:`n$($details -join "`n")"
}

function Wait-PortListen([int]$ListenPort, [int]$Seconds) {
  $deadline = [datetime]::UtcNow.AddSeconds($Seconds)
  while ([datetime]::UtcNow -lt $deadline) {
    $pids = Get-ListeningPids -ListenPort $ListenPort
    if ($pids.Count -gt 0) { return $pids }
    Start-Sleep -Milliseconds 250
  }
  Write-Fail "Port $ListenPort did not enter LISTENING within ${Seconds}s. Check .dsh-web-$ListenPort.log / .dsh-web-$ListenPort.err.log"
}

function Wait-HttpOk([int]$ListenPort, [int]$Seconds) {
  $url = "http://127.0.0.1:$ListenPort/"
  $deadline = [datetime]::UtcNow.AddSeconds($Seconds)
  $last = $null
  while ([datetime]::UtcNow -lt $deadline) {
    try {
      $resp = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 2
      if ($resp.StatusCode -ge 200 -and $resp.StatusCode -lt 400) { return }
      $last = "HTTP $($resp.StatusCode)"
    } catch {
      $last = $_.Exception.Message
    }
    Start-Sleep -Milliseconds 300
  }
  Write-Fail "Health check failed for $url within ${Seconds}s. Last error: $last"
}

function Start-DshWeb([int]$ListenPort, [string]$RepoRoot, [switch]$InForeground) {
  $env:PATH = "$env:PATH;C:\Program Files\nodejs"
  $node = Get-Command node -ErrorAction SilentlyContinue
  if (-not $node) { Write-Fail "node not found on PATH (expected under C:\Program Files\nodejs)." }
  $bin = Join-Path $RepoRoot 'apps\cli\src\bin.ts'
  if (-not (Test-Path -LiteralPath $bin)) { Write-Fail "Missing CLI entry: $bin" }
  $argList = @('--import', 'tsx/esm', $bin, 'web', '--port', "$ListenPort")
  if ($InForeground) {
    Write-Host "Starting dsh web in FOREGROUND on port $ListenPort (this terminal stays occupied)."
    Write-Host "Command: node $($argList -join ' ')"
    Set-Location $RepoRoot
    & node @argList
    exit $LASTEXITCODE
  }
  $outLog = Join-Path $RepoRoot ".dsh-web-$ListenPort.log"
  $errLog = Join-Path $RepoRoot ".dsh-web-$ListenPort.err.log"
  Write-Host "Starting dsh web in BACKGROUND on port $ListenPort."
  Write-Host "Logs: $outLog"
  Write-Host "      $errLog"
  Write-Host "Command: node $($argList -join ' ')"
  $proc = Start-Process -FilePath $node.Source -ArgumentList $argList -WorkingDirectory $RepoRoot `
    -RedirectStandardOutput $outLog -RedirectStandardError $errLog -PassThru -WindowStyle Hidden
  return $proc.Id
}

# --- main ---
if ($Port -lt 1 -or $Port -gt 65535) { Write-Fail "Invalid -Port $Port (1-65535)." }
if ($Timeout -lt 1) { Write-Fail "Invalid -Timeout $Timeout (must be >= 1)." }

$repoRoot = Get-RepoRoot
Write-Host "Repo: $repoRoot"
Write-Host "Port: $Port  Timeout: ${Timeout}s  NoKill=$NoKill  Foreground=$Foreground  SkipStart=$SkipStart  DryRun=$DryRun"

if ($DryRun) {
  $plan = Get-KillCandidates -ListenPort $Port
  Write-Host "DryRun: listeners=$(($plan.Listeners -join ',')) killCandidates=$(($plan.ToKill -join ',')) rejected=$($plan.Rejected.Count)"
  Write-Host "DryRun: would start: node --import tsx/esm apps/cli/src/bin.ts web --port $Port"
  if ($Foreground) { Write-Host "DryRun: foreground mode (terminal occupied)." }
  else { Write-Host "DryRun: background mode -> .dsh-web-$Port.log / .dsh-web-$Port.err.log" }
  exit 0
}

if (-not $NoKill) {
  $plan = Get-KillCandidates -ListenPort $Port
  if ($plan.Rejected.Count -gt 0 -and $plan.ToKill.Count -eq 0 -and $plan.Listeners.Count -gt 0) {
    Write-Fail ("Port $Port is LISTENING but no confirmed dsh-web process matched. Refusing to kill unrelated owners:`n" + ($plan.Rejected -join "`n"))
  }
  if ($plan.Rejected.Count -gt 0 -and $plan.ToKill.Count -gt 0) {
    Write-Host "WARNING: some listeners were skipped (not confirmed dsh web):"
    $plan.Rejected | ForEach-Object { Write-Host "  $_" }
  }
  if ($plan.ToKill.Count -gt 0) {
    Stop-ConfirmedProcesses -ProcessIds $plan.ToKill
    Wait-PortFree -ListenPort $Port -Seconds $Timeout
    Write-Host "Port $Port is free."
  } else {
    Write-Host "No confirmed dsh-web listener on port $Port."
    $left = Get-ListeningPids -ListenPort $Port
    if ($left.Count -gt 0) {
      Write-Fail "Port $Port still has listeners but none matched dsh web. PIDs: $($left -join ', ')"
    }
  }
} else {
  Write-Host "-NoKill set: leaving existing listeners alone."
  $left = Get-ListeningPids -ListenPort $Port
  if ($left.Count -gt 0) {
    Write-Fail "Port $Port already LISTENING (PIDs $($left -join ', ')). Clear it or omit -NoKill."
  }
}

if ($SkipStart) {
  Write-Host "SkipStart: port clear; not starting dsh web."
  exit 0
}

$startedPid = Start-DshWeb -ListenPort $Port -RepoRoot $repoRoot -InForeground:$Foreground
# Foreground path never returns.
$listenerPids = Wait-PortListen -ListenPort $Port -Seconds $Timeout
Wait-HttpOk -ListenPort $Port -Seconds $Timeout

Write-Host ""
Write-Host "=== RESTART SELF-PROOF ===" -ForegroundColor Green
Write-Host "URL: http://127.0.0.1:$Port/"
if ($startedPid) { Write-Host "Start-Process PID: $startedPid" }
foreach ($pidValue in $listenerPids) {
  $info = Get-ProcessInfo -ProcessId $pidValue
  if (-not $info) {
    Write-Host "Listener PID $pidValue (details unavailable)"
    continue
  }
  Write-Host "Listener PID: $($info.ProcessId)"
  Write-Host "CreationDate: $($info.CreationDate)"
  Write-Host "CommandLine: $($info.CommandLine)"
}
Write-Host ""
Write-Host "If CreationDate is later than your last code change, the new process loaded that code."
Write-Host "Browser refresh alone does NOT restart the host. Hard-refresh only helps rebuilt client bundles."
exit 0
