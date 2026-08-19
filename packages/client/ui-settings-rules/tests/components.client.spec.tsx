// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RulesSection } from '../src/client/RulesSection.tsx'
import type { RulesSectionInjected, RulesSectionProps } from '../src/client/RulesSection.tsx'
import { en, type RulesSettingsLocaleKey } from '../src/client/locales.ts'

afterEach(cleanup)

type Snapshot = Awaited<ReturnType<RulesSectionInjected['list']>>
const t = ((key: RulesSettingsLocaleKey): string => en[key]) as RulesSectionProps['t']

function props(
  list: RulesSectionInjected['list'],
  create: RulesSectionInjected['create'] = async () => ({
    entries: [], cwd: null, canCreateUserGlobal: false, canCreateProjectRoot: false,
  }),
  openPath: RulesSectionInjected['openPath'] = async () => {},
): RulesSectionProps {
  return {
    t,
    list,
    create,
    openPath,
    useSessions: (selector: (state: { current: undefined; byId: Record<string, never> }) => unknown) =>
      selector({ current: undefined, byId: {} }),
    useWorkspaces: (selector: (state: { recentWorkspaceId: undefined; items: [] }) => unknown) =>
      selector({ recentWorkspaceId: undefined, items: [] }),
  } as RulesSectionProps
}

const SNAPSHOT = {
  cwd: null,
  canCreateUserGlobal: true,
  canCreateProjectRoot: false,
  entries: [{
    displayPath: '~/.dsh/AGENTS.md',
    absolutePath: '/home/.dsh/AGENTS.md',
    scope: 'user-global',
    present: true,
  }],
} as Snapshot

describe('RulesSection', () => {
  it('renders rule rows and create affordances', async () => {
    const deferred = Promise.withResolvers<Snapshot>()
    render(<RulesSection {...props(() => deferred.promise)} />)
    expect(screen.getByText(en.loading)).toBeTruthy()
    await act(async () => { deferred.resolve(SNAPSHOT) })
    expect(screen.getByText('~/.dsh/AGENTS.md')).toBeTruthy()
    expect(screen.getByRole('button', { name: en.createUser })).toBeTruthy()
  })

  it('opens files and creates user-global AGENTS.md', async () => {
    const create = vi.fn(async () => ({
      ...SNAPSHOT,
      canCreateUserGlobal: false,
    }))
    const openPath = vi.fn(async () => {})
    render(<RulesSection {...props(async () => SNAPSHOT, create, openPath)} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Open ~/.dsh/AGENTS.md' }))
    await waitFor(() => { expect(openPath).toHaveBeenCalledWith('/home/.dsh/AGENTS.md') })
    fireEvent.click(screen.getByRole('button', { name: en.createUser }))
    await waitFor(() => { expect(create).toHaveBeenCalledWith('user-global', undefined) })
  })

  it('shows empty and error states', async () => {
    const list = vi.fn<RulesSectionInjected['list']>()
      .mockRejectedValueOnce(new Error('transport'))
      .mockResolvedValueOnce({
        entries: [], cwd: null, canCreateUserGlobal: false, canCreateProjectRoot: false,
      })
    render(<RulesSection {...props(list)} />)
    expect((await screen.findByRole('alert')).textContent).toContain(en.error)
    fireEvent.click(screen.getByRole('button', { name: en.retry }))
    expect(await screen.findByText(en.empty)).toBeTruthy()
  })
})
