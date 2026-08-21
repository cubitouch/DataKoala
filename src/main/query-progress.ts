import { createRequire } from 'node:module'
import { IPC } from '../shared/ipc-channels.ts'
import type { TempoSearchProgress, TempoSearchProgressEnvelope } from '../shared/tempo.ts'
import { tempoPerformanceEnabled, tempoPerformanceLog } from './tempo-performance.ts'

const firstUsefulPublished = new Set<string>()

const require = createRequire(import.meta.url)

export function publishTempoSearchProgress(requestId: string, progress: TempoSearchProgress, elapsedMs?: number): void {
  // Keep Electron out of the module-load path: db.ts is exercised by plain Node tests,
  // where the `electron` package is only a CommonJS executable-path shim. In the actual
  // Electron main process, require('electron') synchronously exposes BrowserWindow.
  const { BrowserWindow } = require('electron') as typeof import('electron')
  const envelope: TempoSearchProgressEnvelope = { requestId, progress }
  const windows = BrowserWindow.getAllWindows().filter((window) => !window.isDestroyed() && !window.webContents.isDestroyed())
  if (tempoPerformanceEnabled() && progress.rows.length > 0 && !firstUsefulPublished.has(requestId)) {
    firstUsefulPublished.add(requestId)
    tempoPerformanceLog('search.first-result-main', { requestId, elapsedMs, rowsInBatch: progress.rows.length, tracesFound: progress.tracesFound })
  }


  for (const window of windows) window.webContents.send(IPC.QUERY_PROGRESS, envelope)
}
