import type { NotificationDetail } from '@components/ui/feedback/NotificationArea'
import { queryErrorMessage } from './queryErrors'

/** Text-copy feedback shared by query, table, logs and contextual inspectors. */
export function clipboardFailure(error: unknown): NotificationDetail {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : ''
  return {
    message:
      'Could not copy to clipboard. Check clipboard permissions. Try Copy again.',
    tone: 'error',
    duration: 6000,
    ...(raw ? { details: queryErrorMessage(raw) } : {}),
  }
}
