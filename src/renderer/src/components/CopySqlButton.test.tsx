import React from 'react'
void React
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/react'

const { copyTextToClipboard } = vi.hoisted(() => ({ copyTextToClipboard: vi.fn() }))
vi.mock('../lib/clipboardText', () => ({ copyTextToClipboard }))
import { CopySqlButton } from './CopySqlButton'

beforeEach(() => {
  cleanup()
  copyTextToClipboard.mockReset()
})

afterEach(() => {
  cleanup()
})

describe('CopySqlButton', () => {
  it('copies the displayed SQL exactly and shows then resets success feedback', async () => {
    copyTextToClipboard.mockResolvedValue(undefined)
    const sql = 'select *\nfrom users\nwhere id = $1;\n'
    const { container } = render(<CopySqlButton sql={sql} resetMs={50} />)
    const view = within(container)

    fireEvent.click(view.getByRole('button', { name: 'Copy SQL to clipboard' }))

    await waitFor(() => expect(copyTextToClipboard).toHaveBeenCalledWith(sql))
    expect(view.getByRole('button', { name: 'Copy SQL to clipboard' }).textContent).toContain('Copied')
    expect(view.getByText('SQL copied to clipboard')).toBeTruthy()

    await waitFor(() => expect(view.getByRole('button', { name: 'Copy SQL to clipboard' }).textContent).toBe('Copy'))
  })

  it('disables copying when SQL is empty', () => {
    const { container } = render(<CopySqlButton sql={'   \n'} />)
    const view = within(container)

    expect((view.getByRole('button', { name: 'Copy SQL to clipboard' }) as HTMLButtonElement).disabled).toBe(true)
    expect(copyTextToClipboard).not.toHaveBeenCalled()
  })

  it('keeps the button usable and shows an error when clipboard writing fails', async () => {
    copyTextToClipboard.mockRejectedValue(new Error('denied'))
    const { container } = render(<CopySqlButton sql="select 1;" />)
    const view = within(container)

    fireEvent.click(view.getByRole('button', { name: 'Copy SQL to clipboard' }))

    await waitFor(() => expect(view.getAllByText('Could not copy SQL')).toHaveLength(2))
    expect((view.getByRole('button', { name: 'Copy SQL to clipboard' }) as HTMLButtonElement).disabled).toBe(false)
  })
})
