/** One fresh Electron process per module: IPC, store, and window cannot leak. */
import { spawnSync } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { discoverAuditBatches } from './audit-batch-loader.mjs'

export async function runAuditBatches({ directory, outputDir, execute, sourceHead }) {
  const results = []
  await mkdir(outputDir, { recursive: true })
  for (const batch of await discoverAuditBatches(directory)) {
    const batchOutput = resolve(outputDir, batch.id.toUpperCase())
    let result
    try { result = await execute(batch.id, batchOutput) }
    catch (error) { result = { status: 1, error: error.message } }
    results.push({ id: batch.id, sourceHead, status: result.status === 0 ? 'success' : 'failure', error: result.error?.message ?? result.error ?? result.signal ?? null })
    await writeFile(resolve(outputDir, 'index.json'), JSON.stringify({ sourceHead, batches: results }, null, 2) + '\n')
  }
  if (!results.length) await writeFile(resolve(outputDir, 'index.json'), JSON.stringify({ sourceHead, batches: [] }) + '\n')
  return results.every(result => result.status === 'success')
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const { default: electron } = await import('electron')
  const success = await runAuditBatches({
    outputDir: resolve(process.env.DATAKOALA_PREVIEW_OUTPUT ?? 'visual-audit', 'batches'),
    sourceHead: process.env.DATAKOALA_AUDIT_HEAD,
    execute: (id, outputDir) => spawnSync(electron, ['--no-sandbox', 'scripts/capture-visual-preview.mjs'], {
      stdio: 'inherit', timeout: 180_000,
      env: { ...process.env, DATAKOALA_PREVIEW_KIND: 'audit', DATAKOALA_AUDIT_BATCH: id, DATAKOALA_PREVIEW_OUTPUT: outputDir },
    }),
  })
  process.exitCode = success ? 0 : 1
}
