import { afterEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ConfirmationDialog } from './ConfirmationDialog'

afterEach(cleanup)
it('locks repeated confirmation and dismissal while pending, retains failures and retries', async () => {
  let reject!: (error: Error) => void
  const confirm = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise((_resolve, fail) => {
          reject = fail
        }),
    )
    .mockResolvedValue(undefined)
  const cancel = vi.fn()
  render(
    <ConfirmationDialog
      title="Delete target?"
      description="Delete captured A."
      confirmLabel="Delete A"
      onConfirm={confirm}
      onCancel={cancel}
    />,
  )
  const action = screen.getByRole('button', { name: 'Delete A' })
  fireEvent.click(action)
  fireEvent.click(action)
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(confirm).toHaveBeenCalledTimes(1)
  expect(cancel).not.toHaveBeenCalled()
  await act(async () => reject(new Error('Storage unavailable')))
  expect(screen.getByRole('alert').textContent).toContain(
    'Delete A failed: Storage unavailable',
  )
  expect(screen.getByRole('dialog').textContent).toContain('captured A')
  await act(async () =>
    fireEvent.click(screen.getByRole('button', { name: 'Delete A' })),
  )
  expect(confirm).toHaveBeenCalledTimes(2)
  expect(screen.queryByRole('alert')).toBeNull()
})
it('only the top modal handles Escape and Tab, ignores hidden controls', () => {
  const first = vi.fn(),
    second = vi.fn()
  render(
    <>
      <ConfirmationDialog
        title="First"
        description="A"
        confirmLabel="A"
        onConfirm={vi.fn()}
        onCancel={first}
      />
      <ConfirmationDialog
        title="Second"
        description="B"
        confirmLabel="B"
        onConfirm={vi.fn()}
        onCancel={second}
      />
    </>,
  )
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(first).not.toHaveBeenCalled()
  expect(second).toHaveBeenCalledOnce()
})
