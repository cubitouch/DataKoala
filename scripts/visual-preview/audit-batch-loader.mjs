/** Repository-owned modules only; never import an arbitrary environment path. */
import { readdir, readFile, writeFile, mkdir, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const batchDirectory = new URL('./audit-batches/', import.meta.url)
const moduleName = /^[a-z]+-[0-9]{2}\.mjs$/
const pngName = /^[a-z0-9][a-z0-9-]*\.png$/

export async function discoverAuditBatches(directory = batchDirectory) {
  let entries
  try { entries = await readdir(directory, { withFileTypes: true }) }
  catch (error) { if (error.code === 'ENOENT') return []; throw error }
  return entries.filter(entry => entry.isFile() && moduleName.test(entry.name))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(entry => ({ id: entry.name.slice(0, -4), url: pathToFileURL(resolve(directory instanceof URL ? fileURLToPath(directory) : directory, entry.name)) }))
}

export async function loadAuditBatch(id, { directory = batchDirectory, importer = url => import(url.href) } = {}) {
  const entry = (await discoverAuditBatches(directory)).find(entry => entry.id === id)
  if (!entry) throw Error(`Unknown audit batch: ${id}`)
  let module
  try { module = await importer(entry.url) }
  catch (cause) { throw new Error(`Could not load audit batch ${id}`, { cause }) }
  for (const name of ['installAuditIpc', 'runVisualAudit']) {
    if (typeof module[name] !== 'function') throw Error(`${id}: missing ${name} export`)
  }
  if (!Array.isArray(module.screenshots) || module.screenshots.some(name => typeof name !== 'string' || !pngName.test(name)) || new Set(module.screenshots).size !== module.screenshots.length) {
    throw Error(`${id}: screenshots must be unique flat PNG filenames`)
  }
  return { ...entry, module }
}

export async function verifyBatchEvidence(directory, screenshots, sourceHead) {
  const actual = (await readdir(directory)).filter(name => name.endsWith('.png')).sort()
  if (JSON.stringify(actual) !== JSON.stringify([...screenshots].sort())) throw Error('Batch screenshot manifest mismatch')
  for (const filename of screenshots) {
    const png = await readFile(resolve(directory, filename))
    if (png.length < 24 || !png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) || png.readUInt32BE(16) !== 1440 || png.readUInt32BE(20) !== 900) throw Error(`${filename}: expected 1440x900 PNG`)
  }
  const report = JSON.parse(await readFile(resolve(directory, 'measurements.json'), 'utf8'))
  if (!sourceHead || report.sourceHead !== sourceHead) throw Error('Batch sourceHead mismatch')
  if (!Array.isArray(report.observations)) throw Error('Batch observations are missing')
  for (const filename of screenshots) {
    const observation = report.observations.find(item => item.filename === filename)
    if (!observation || observation.dpr !== 1 || observation.zoom !== 1 || !(observation.target?.width > 0 && observation.target?.height > 0)) throw Error(`${filename}: missing scale-1 semantic observation`)
  }
  return report
}

export async function executeAuditBatch(batch, context, sourceHead) {
  await mkdir(context.outputDir, { recursive: true })
  // This directory belongs to one module, never the canonical audit output.
  for (const filename of [...batch.module.screenshots, 'measurements.json', 'status.json']) await rm(resolve(context.outputDir, filename), { force: true })
  try {
    await batch.module.runVisualAudit(context)
    await verifyBatchEvidence(context.outputDir, batch.module.screenshots, sourceHead)
    await writeFile(resolve(context.outputDir, 'status.json'), JSON.stringify({ id: batch.id, sourceHead, status: 'success' }) + '\n')
  } catch (error) {
    await writeFile(resolve(context.outputDir, 'status.json'), JSON.stringify({ id: batch.id, sourceHead, status: 'failure', error: error.message }) + '\n')
    throw error
  }
}
