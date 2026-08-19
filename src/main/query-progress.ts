import { createRequire } from 'node:module'
import { IPC } from '../shared/ipc-channels.ts'
import type { TempoSearchProgress, TempoSearchProgressEnvelope } from '../shared/tempo.ts'

const require = createRequire(import.meta.url)

export function publishTempoSearchProgress(requestId: string, progress: TempoSearchProgress): void {
  // Keep Electron out of the module-load path: db.ts is exercised by plain Node tests,
  // where the `electron` package is only a CommonJS executable-path shim. In the actual
  // Electron main process, require('electron') synchronously exposes BrowserWindow.
  const { BrowserWindow } = require('electron') as typeof import('electron')
  const envelope: TempoSearchProgressEnvelope = { requestId, progress }
  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed() || window.webContents.isDestroyed()) continue
    window.webContents.send(IPC.QUERY_PROGRESS, envelope)
  }
}
