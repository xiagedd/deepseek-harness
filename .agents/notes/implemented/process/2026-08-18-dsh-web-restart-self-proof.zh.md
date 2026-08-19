# Agent Note: dsh web 重启自证

Status: implemented

[English](2026-08-18-dsh-web-restart-self-proof.md) | 中文

## 问题

操作者多次“重启”`dsh web` 时，旧监听进程仍占着端口，第二次启动以 `EADDRINUSE` 失败，旧 PID 继续提供过期 Host 代码，而浏览器刷新又被误当成宿主重启。工作流需要一条命令：只结束已确认的 `dsh web` 监听者、拒绝无关 Node 进程、等待端口空闲、启动新服务，并打印任一步失败都会吵出来的自证信息。

## 决策

`pnpm run web:restart` 运行 [`scripts/restart-dsh-web.mjs`](../../../../scripts/restart-dsh-web.mjs)。Windows 委托 [`scripts/restart-dsh-web.ps1`](../../../../scripts/restart-dsh-web.ps1)；macOS／Linux 用 `lsof`／`ps`／`kill`，确认规则相同。

结束进程要求同时满足：进程在 `--port <n>` 上 LISTENING，且 CommandLine 匹配本仓库启动方式（`bin.ts` + `web` + `--port <n>`，或带同一端口的等价 `dsh`／`tsx` web 启动）。未匹配的监听者绝不结束；脚本非零退出并打印其 PID 与 CommandLine。已确认子进程的 matching corepack／pnpm 父进程可一并结束。停止后默认轮询至多 10 秒确认端口空闲，再启动 `node --import tsx/esm apps/cli/src/bin.ts web --port <n>`。成功条件是 LISTENING 且 `http://127.0.0.1:<port>/` 返回 HTTP 200，随后打印 PID、CreationDate（Windows）与 CommandLine。默认后台分离并把日志追加到仓库根 `.dsh-web-<port>.log`／`.dsh-web-<port>.err.log`；`--foreground` 则占住当前终端。`--no-kill`、`--timeout`、`--skip-start`、`--dry-run` 用于安全启动与干跑校验。

区分宿主重启与浏览器硬刷新的贡献者说明见开发指南（[English](../../../../docs/development.md#restarting-dsh-web-vs-refreshing-the-browser)／[中文](../../../../docs/development.zh.md#重启-dsh-web-与刷新浏览器)）。已经加载 `host.restartWeb` 的 Host 运行时，设置 → 通用设置 → 重启 Web 服务会调用同一脚本（[功能说明](../feature/2026-08-18-settings-web-restart.md)）。

## 验证

PowerShell 与 Node 的 dry-run 解析参数且不触碰 3080。临时高位端口 Node HTTP 监听器验证「发现 → 确认结束 → 等待端口空闲」并配合 `--skip-start`，用后清理。缺少 CommandLine 标记的无关监听者必须保持存活，并在单独占用端口时让脚本失败。

## 曾考虑的替代方案

**只写文档检查清单。** 操作者仍会发明留下陈旧监听者的临时杀／启步骤。

**结束该端口上每个 LISTENING PID。** 更快，但会误杀同机其它 Node 项目。

**仅 Windows 脚本、无 Node 入口。** 够一台工作站用，但 npm script 与 Unix 路径让其它贡献者共用同一命令。

## 后果

宿主重启变成一条失败即吵的命令并打印自证。浏览器刷新仍属独立的 Client 关切。后台日志在仓库根被忽略的 `.dsh-web-*.log` 名下累积。杀进程失败后不会把仍属旧进程的 HTTP 200 当成成功：先等端口空闲再启动，CreationDate／CommandLine 供操作者与改动时间对照。
