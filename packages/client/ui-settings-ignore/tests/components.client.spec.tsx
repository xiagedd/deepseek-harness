// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { IgnoreSection } from '../src/client/IgnoreSection.tsx'
import type { IgnoreSectionInjected, IgnoreSectionProps } from '../src/client/IgnoreSection.tsx'
import type { IgnoreFileState } from '../src/client/ignore-io.ts'
import { en, type IgnoreSettingsLocaleKey } from '../src/client/locales.ts'

afterEach(cleanup)

const t = ((key: IgnoreSettingsLocaleKey): string => en[key]) as IgnoreSectionProps['t']

function props(
  overrides: Partial<IgnoreSectionProps> & Pick<IgnoreSectionInjected, 'load' | 'save'>,
): IgnoreSectionProps {
  const useSessions = overrides.useSessions ?? ((selector: (state: {
    current: string | undefined
    byId: Record<string, { cwd?: string }>
  }) => unknown) => selector({
    current: 's1',
    byId: { s1: { cwd: '/ws' } },
  }))
  const useWorkspaces = overrides.useWorkspaces ?? ((selector: (state: {
    recentWorkspaceId: string | undefined
    items: { workspaceId: string; path: string }[]
  }) => unknown) => selector({
    recentWorkspaceId: 'w1',
    items: [{ workspaceId: 'w1', path: '/ws' }],
  }))
  return {
    t,
    useSessions,
    useWorkspaces,
    ...overrides,
  } as IgnoreSectionProps
}

describe('IgnoreSection', () => {
  it('shows the no-workspace empty state', () => {
    render(<IgnoreSection {...props({
      load: async () => ({ path: '', content: '', exists: false, cursorFallback: false }),
      save: async () => {},
      useSessions: selector => selector({ current: undefined, byId: {} }),
      useWorkspaces: selector => selector({ recentWorkspaceId: undefined, items: [] }),
    })} />)
    expect(screen.getByText(en.noWorkspace)).toBeTruthy()
  })

  it('loads an existing .dshignore and saves updates', async () => {
    const load = vi.fn(async (): Promise<IgnoreFileState> => ({
      path: '/ws/.dshignore',
      content: 'Library/\n',
      exists: true,
      cursorFallback: false,
    }))
    const save = vi.fn(async () => {})
    render(<IgnoreSection {...props({ load, save })} />)
    const editor = await screen.findByLabelText(en.editorLabel)
    expect((editor as HTMLTextAreaElement).value).toBe('Library/\n')
    fireEvent.change(editor, { target: { value: 'Temp/\n' } })
    fireEvent.click(screen.getByRole('button', { name: en.save }))
    await waitFor(() => { expect(save).toHaveBeenCalledWith('/ws/.dshignore', 'Temp/\n') })
    expect(await screen.findByText(en.saved)).toBeTruthy()
  })

  it('creates .dshignore from an empty missing state', async () => {
    const load = vi.fn(async (): Promise<IgnoreFileState> => ({
      path: '/ws/.dshignore',
      content: '',
      exists: false,
      cursorFallback: false,
    }))
    const save = vi.fn(async () => {})
    render(<IgnoreSection {...props({ load, save })} />)
    expect(await screen.findByText(en.missingHint)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: en.save }))
    await waitFor(() => { expect(save).toHaveBeenCalledWith('/ws/.dshignore', '') })
  })

  it('shows the cursor-compat hint and save failures', async () => {
    const deferred = Promise.withResolvers<IgnoreFileState>()
    const save = vi.fn(async () => { throw new Error('denied') })
    render(<IgnoreSection {...props({ load: () => deferred.promise, save })} />)
    expect(screen.getByText(en.loading)).toBeTruthy()
    await act(async () => {
      deferred.resolve({
        path: '/ws/.dshignore',
        content: '',
        exists: false,
        cursorFallback: true,
      })
    })
    expect(screen.getByText(en.cursorHint)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: en.save }))
    expect((await screen.findByRole('alert')).textContent).toContain(en.saveFailed)
  })
})
