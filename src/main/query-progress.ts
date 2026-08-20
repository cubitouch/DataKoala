import { createRequire } from 'node:module'
import { IPC } from '../shared/ipc-channels.ts'
import type { TempoSearchProgress, TempoSearchProgressEnvelope } from '../shared/tempo.ts'

const require = createRequire(import.meta.url)

function progressStatusCounts(rows: Record<string, unknown>[]): { ok: number; error: number; unknown: number } {
  let ok = 0
  let error = 0
  let unknown = 0
  for (const row of rows) {
    const status = String(row.status ?? '').trim().toLowerCase()
    if (status === 'ok' || status.includes('success')) ok += 1
    else if (status.includes('error') || status === 'failed' || status === 'failure') error += 1
    else unknown += 1
  }
  return { ok, error, unknown }
}

export function publishTempoSearchProgress(requestId: string, progress: TempoSearchProgress): void {
  // Keep Electron out of the module-load path: db.ts is exercised by plain Node tests,
  // where the `electron` package is only a CommonJS executable-path shim. In the actual
  // Electron main process, require('electron') synchronously exposes BrowserWindow.
  const { BrowserWindow } = require('electron') as typeof import('electron')
  const envelope: TempoSearchProgressEnvelope = { requestId, progress }
  const windows = BrowserWindow.getAllWindows().filter((window) => !window.isDestroyed() && !window.webContents.isDestroyed())

  console.info('[tempo-status-ipc] publish progress', {
    request: requestId.slice(-8),
    rows: progress.rows.length,
    statuses: progressStatusCounts(progress.rows),
    tracesFound: progress.tracesFound,
    queriesCompleted: progress.queriesCompleted,
    rendererWindows: windows.length
  })

  for (const window of windows) window.webContents.send(IPC.QUERY_PROGRESS, envelope)
}
