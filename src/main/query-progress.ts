import { BrowserWindow } from 'electron'
import { IPC } from '../shared/ipc-channels.ts'
import type { TempoSearchProgress, TempoSearchProgressEnvelope } from '../shared/tempo.ts'

export function publishTempoSearchProgress(requestId: string, progress: TempoSearchProgress): void {
  const envelope: TempoSearchProgressEnvelope = { requestId, progress }
  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed() || window.webContents.isDestroyed()) continue
    window.webContents.send(IPC.QUERY_PROGRESS, envelope)
  }
}
