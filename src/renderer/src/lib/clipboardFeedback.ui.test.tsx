import { expect, it } from 'vitest'
import { clipboardFailure } from './clipboardFeedback'

it('keeps actionable clipboard guidance primary and strips only transport wrappers from details', () => {
  const detail = clipboardFailure(
    new Error(
      "Error invoking remote method 'clipboard:write': Error: Permission denied",
    ),
  )
  expect(detail.message).toBe(
    'Could not copy to clipboard. Check clipboard permissions and try Copy again.',
  )
  expect(detail.details).toBe('Permission denied')
  expect(detail.tone).toBe('error')
  expect(clipboardFailure(undefined).details).toBeUndefined()
})
