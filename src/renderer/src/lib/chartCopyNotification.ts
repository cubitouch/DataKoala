import { notify } from '@components/ui/feedback/NotificationArea'

export function notifyChartCopyResult(ok: boolean): void {
  notify(
    ok
      ? { message: 'Chart copied' }
      : { message: 'Could not copy chart', tone: 'error' },
  )
}

export function notifyChartExportResult(ok: boolean): void {
  notify(
    ok
      ? { message: 'Chart exported' }
      : {
          message: 'Could not export chart. Try Export PNG again.',
          tone: 'error',
        },
  )
}
