import { notify } from '../components/NotificationArea'

export function notifyChartCopyResult(ok: boolean): void {
  notify(ok
    ? { message: 'Chart copied' }
    : { message: 'Could not copy chart', tone: 'error' })
}
