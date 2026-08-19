// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { McpSection } from '../src/client/McpSection.tsx'
import type { McpSectionInjected, McpSectionProps } from '../src/client/McpSection.tsx'
import { en, type McpSettingsLocaleKey } from '../src/client/locales.ts'

afterEach(cleanup)

type Snapshot = Awaited<ReturnType<McpSectionInjected['list']>>
const t = ((key: McpSettingsLocaleKey): string => en[key]) as McpSectionProps['t']

function props(
  list: McpSectionInjected['list'],
  setEnabled: McpSectionInjected['setEnabled'] = async () => ({ entries: [] }),
): McpSectionProps {
  return { t, list, setEnabled } as McpSectionProps
}

const SNAPSHOT = {
  entries: [
    {
      entryId: 'mcp-codedb',
      serverName: 'codedb',
      transport: 'stdio',
      enabled: true,
      status: 'connected',
      toolCount: 3,
    },
    {
      entryId: 'mcp-deepwiki',
      serverName: 'deepwiki',
      transport: 'stdio',
      enabled: false,
      status: 'disabled',
      toolCount: 0,
    },
  ],
} as unknown as Snapshot

describe('McpSection', () => {
  it('renders configured MCP rows with status and tool counts', async () => {
    const deferred = Promise.withResolvers<Snapshot>()
    render(<McpSection {...props(() => deferred.promise)} />)
    expect(screen.getByText(en.loading)).toBeTruthy()
    await act(async () => { deferred.resolve(SNAPSHOT) })
    expect(screen.getByRole('heading', { name: en.title })).toBeTruthy()
    expect(screen.getByText(en.catalog)).toBeTruthy()
    expect(screen.getByText('codedb')).toBeTruthy()
    expect(screen.getByText('deepwiki')).toBeTruthy()
    expect(screen.getByText('3 tools')).toBeTruthy()
    expect(screen.getByRole('img', { name: en.statusConnected })).toBeTruthy()
    expect(screen.getByRole('img', { name: en.statusDisabled })).toBeTruthy()
    expect(screen.getByRole('switch', { name: 'Disable codedb' }).getAttribute('aria-checked')).toBe('true')
    expect(screen.getByRole('switch', { name: 'Enable deepwiki' }).getAttribute('aria-checked')).toBe('false')
  })

  it('writes enablement through setEnabled and refreshes the list', async () => {
    const setEnabled = vi.fn(async () => ({
      entries: [{
        entryId: 'mcp-codedb',
        serverName: 'codedb',
        transport: 'stdio',
        enabled: false,
        status: 'disabled',
        toolCount: 0,
      }],
    } as Snapshot))
    render(<McpSection {...props(async () => SNAPSHOT, setEnabled)} />)
    const toggle = await screen.findByRole('switch', { name: 'Disable codedb' })
    fireEvent.click(toggle)
    await waitFor(() => { expect(setEnabled).toHaveBeenCalledWith('mcp-codedb', false) })
    expect(await screen.findByRole('switch', { name: 'Enable codedb' })).toBeTruthy()
  })

  it('shows empty and error states', async () => {
    const list = vi.fn<McpSectionInjected['list']>()
      .mockRejectedValueOnce(new Error('transport'))
      .mockResolvedValueOnce({ entries: [] })
    render(<McpSection {...props(list)} />)
    expect((await screen.findByRole('alert')).textContent).toContain(en.error)
    fireEvent.click(screen.getByRole('button', { name: en.retry }))
    expect(await screen.findByText(en.empty)).toBeTruthy()
  })
})
