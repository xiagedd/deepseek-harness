// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { FilesOpenAction, type FilesOpenActionProps } from '../src/client/FilesOpenAction.tsx'
import { zh } from '../src/client/locales.ts'

afterEach(() => {
  cleanup()
})

describe('FilesOpenAction', () => {
  it('opens the details column', () => {
    const openDetails = vi.fn()
    render(<FilesOpenAction {...{
      openDetails,
      t: makeTranslate(zh),
    } as FilesOpenActionProps} />)
    fireEvent.click(screen.getByRole('button', { name: zh['header.aria'] }))
    expect(openDetails).toHaveBeenCalledTimes(1)
    expect(screen.getByText(zh['header.label'])).toBeTruthy()
  })
})
