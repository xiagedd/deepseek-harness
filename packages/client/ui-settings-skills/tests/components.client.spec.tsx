// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SkillsSection } from '../src/client/SkillsSection.tsx'
import type { SkillsSectionInjected, SkillsSectionProps } from '../src/client/SkillsSection.tsx'
import { en, type SkillsSettingsLocaleKey } from '../src/client/locales.ts'

afterEach(cleanup)

type Snapshot = Awaited<ReturnType<SkillsSectionInjected['list']>>
const t = ((key: SkillsSettingsLocaleKey): string => en[key]) as SkillsSectionProps['t']

function props(
  list: SkillsSectionInjected['list'],
  setModelInvocable: SkillsSectionInjected['setModelInvocable'] = async () => ({ entries: [], cwd: null }),
  openPath: SkillsSectionInjected['openPath'] = async () => {},
): SkillsSectionProps {
  return {
    t,
    list,
    setModelInvocable,
    openPath,
    useSessions: (selector: (state: { current: undefined; byId: Record<string, never> }) => unknown) =>
      selector({ current: undefined, byId: {} }),
    useWorkspaces: (selector: (state: { recentWorkspaceId: undefined; items: [] }) => unknown) =>
      selector({ recentWorkspaceId: undefined, items: [] }),
  } as SkillsSectionProps
}

const SNAPSHOT = {
  cwd: '/ws',
  entries: [{
    name: 'demo-skill',
    description: 'Demo',
    source: 'user-dsh',
    path: '/home/.dsh/skills/demo-skill/SKILL.md',
    modelInvocable: true,
    userInvocable: true,
  }],
} as Snapshot

describe('SkillsSection', () => {
  it('renders skill rows with model visibility', async () => {
    const deferred = Promise.withResolvers<Snapshot>()
    render(<SkillsSection {...props(() => deferred.promise)} />)
    expect(screen.getByText(en.loading)).toBeTruthy()
    await act(async () => { deferred.resolve(SNAPSHOT) })
    expect(screen.getByText('demo-skill')).toBeTruthy()
    expect(screen.getByRole('switch', { name: 'Disable demo-skill for the model' }).getAttribute('aria-checked')).toBe('true')
  })

  it('writes model visibility and opens the file', async () => {
    const setModelInvocable = vi.fn(async () => ({
      cwd: '/ws',
      entries: [{ ...SNAPSHOT.entries[0]!, modelInvocable: false }],
    }))
    const openPath = vi.fn(async () => {})
    render(<SkillsSection {...props(async () => SNAPSHOT, setModelInvocable, openPath)} />)
    fireEvent.click(await screen.findByRole('switch', { name: 'Disable demo-skill for the model' }))
    await waitFor(() => {
      expect(setModelInvocable).toHaveBeenCalledWith(SNAPSHOT.entries[0]!.path, false, undefined)
    })
    fireEvent.click(screen.getByRole('button', { name: 'Open demo-skill' }))
    await waitFor(() => { expect(openPath).toHaveBeenCalledWith(SNAPSHOT.entries[0]!.path) })
  })

  it('shows empty and error states', async () => {
    const list = vi.fn<SkillsSectionInjected['list']>()
      .mockRejectedValueOnce(new Error('transport'))
      .mockResolvedValueOnce({ entries: [], cwd: null })
    render(<SkillsSection {...props(list)} />)
    expect((await screen.findByRole('alert')).textContent).toContain(en.error)
    fireEvent.click(screen.getByRole('button', { name: en.retry }))
    expect(await screen.findByText(en.empty)).toBeTruthy()
  })
})
