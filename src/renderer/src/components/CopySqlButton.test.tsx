import React from 'react'
void React
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/react'

const { copyTextToClipboard } = vi.hoisted(() => ({ copyTextToClipboard: vi.fn() }))
vi.mock('../lib/clipboardText', () => ({ copyTextToClipboard }))
import { CopySqlButton } from './CopySqlButton'
import { NotificationArea } from './NotificationArea'

beforeEach(() => {
  cleanup()
  copyTextToClipboard.mockReset()
})

afterEach(() => {
  cleanup()
})

describe('CopySqlButton', () => {
  it('copies the displayed SQL exactly while keeping its label stable and using the notification area', async () => {
    copyTextToClipboard.mockResolvedValue(undefined)
    const sql = 'select *\nfrom users\nwhere id = $1;\n'
    const { container } = render(<><CopySqlButton sql={sql} /><NotificationArea /></>)
    const view = within(container)

    fireEvent.click(view.getByRole('button', { name: 'Copy SQL to clipboard' }))

    await waitFor(() => expect(copyTextToClipboard).toHaveBeenCalledWith(sql))
    expect(view.getByRole('button', { name: 'Copy SQL to clipboard' }).textContent).toBe('Copy')
    expect((await view.findByRole('status')).textContent).toBe('Copied to clipboard')
  })

  it('disables copying when SQL is empty', () => {
    const { container } = render(<CopySqlButton sql={'   \n'} />)
    const view = within(container)

    expect((view.getByRole('button', { name: 'Copy SQL to clipboard' }) as HTMLButtonElement).disabled).toBe(true)
    expect(copyTextToClipboard).not.toHaveBeenCalled()
  })

  it('keeps the button usable and shows an error when clipboard writing fails', async () => {
    copyTextToClipboard.mockRejectedValue(new Error('denied'))
    const { container } = render(<><CopySqlButton sql="select 1;" /><NotificationArea /></>)
    const view = within(container)

    fireEvent.click(view.getByRole('button', { name: 'Copy SQL to clipboard' }))

    expect((await view.findByRole('alert')).textContent).toBe('Could not copy: denied')
    expect(view.queryByText('Copied to clipboard')).toBeNull()
    expect((view.getByRole('button', { name: 'Copy SQL to clipboard' }) as HTMLButtonElement).disabled).toBe(false)
  })
})
