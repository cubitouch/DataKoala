import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { resolve, dirname, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

export const boardRoot = fileURLToPath(new URL('.', import.meta.url))
const repositoryRoot = resolve(boardRoot, '../..')
const manifestFile = resolve(boardRoot, 'manifest.json')
const atlasFile = resolve(repositoryRoot, 'docs/audit/391/aggregation/agg-03-atlas.json')
const reportFile = resolve(repositoryRoot, 'docs/audit/391/aggregation/AGG-03.md')
export const outputFile = resolve(boardRoot, 'site/data.json')

function assert(condition, explanation) {
  if (!condition) throw new Error(explanation)
}
export function pngDimensions(bytes) {
  assert(bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')), 'Not a PNG file')
  assert(bytes.toString('ascii', 12, 16) === 'IHDR', 'Missing PNG IHDR')
  const width = bytes.readUInt32BE(16)
  const height = bytes.readUInt32BE(20)
  assert(width > 0 && height > 0 && width <= 32768 && height <= 32768, 'Invalid PNG dimensions')
  return { width, height }
}
export function gitBlobSha(bytes) {
  return createHash('sha1').update(Buffer.from('blob ' + bytes.length + '\0')).update(bytes).digest('hex')
}
function findReportLine(source, id) {
  const lines = source.split('\n')
  const n = lines.findIndex(line => line.startsWith('| ' + id + ' '))
  return n >= 0 ? n + 1 : 1
}
export async function generateBoard({ write = true, destination = outputFile } = {}) {
  const [manifest, atlas, report] = await Promise.all([
    readFile(manifestFile, 'utf8').then(JSON.parse),
    readFile(atlasFile, 'utf8').then(JSON.parse),
    readFile(reportFile, 'utf8'),
  ])
  assert(manifest.schemaVersion === 1, 'Unsupported manifest')
  assert(atlas.atlasEntries?.length === 107 && atlas.workPackages?.length === 25, 'Expected reconciled Atlas with 107 entries and 25 packages')
  assert(manifest.comparisons.length >= 15, 'Review board must contain at least 15 comparisons')
  const atlasById = new Map(atlas.atlasEntries.map(item => [item.id, item]))
  const assets = {}
  for (const [name, record] of Object.entries(manifest.assets)) {
    assert(/^(audit\/)?[a-z0-9-]+\.png$/.test(name), 'Unsafe image key: ' + name)
    const path = resolve(repositoryRoot, record.path)
    const root = resolve(boardRoot, 'images') + sep
    assert(path.startsWith(root), 'Image escapes snapshot directory: ' + name)
    const bytes = await readFile(path)
    const dimensions = pngDimensions(bytes)
    assert(gitBlobSha(bytes) === record.blobSha, 'Published screenshot blob SHA mismatch: ' + name)
    assert(bytes.length === record.byteSize, 'Published screenshot size mismatch: ' + name)
    assert(record.sourceHead === manifest.baseline.sourceHead, 'Untraceable source head: ' + name)
    assert(record.workflowRun && record.artifactId && record.publishedPath, 'Incomplete artifact identity: ' + name)
    assets[name] = { ...record, ...dimensions, url: '/images/' + name, verified: true }
  }
  const comparisons = manifest.comparisons.map(item => {
    const atlasEntry = atlasById.get(item.atlasId)
    assert(atlasEntry, 'Unknown Atlas entry: ' + item.atlasId)
    assert(item.question && item.providers?.length && item.images?.length === 2, 'Incomplete comparison: ' + item.id)
    const images = item.images.map(slot => {
      if (!slot.asset) return { role: slot.role, state: 'missing', reason: item.evidenceGap || 'Capture not yet sourced' }
      assert(assets[slot.asset], 'Undeclared screenshot: ' + slot.asset)
      return { role: slot.role, state: 'published_capture', name: slot.asset, ...assets[slot.asset] }
    })
    return {
      ...item,
      images,
      status: atlasEntry.status,
      priority: atlasEntry.priority,
      confidence: atlasEntry.confidence,
      workPackages: atlasEntry.workPackages,
      rationale: atlasEntry.rationale,
      sourceCandidates: atlasEntry.sourceCandidates,
      atlasUrl: 'https://github.com/cubitouch/DataKoala/blob/' + manifest.baseline.integrationHead + '/docs/audit/391/aggregation/AGG-03.md#L' + findReportLine(report, item.atlasId),
      sourceCitations: atlasEntry.sourceCitations?.map(source => ({ batch: source.batch, url: source.url })) ?? [],
    }
  })
  assert(new Set(comparisons.map(x => x.id)).size === comparisons.length, 'Duplicate comparison ID')
  const data = {
    schemaVersion: 1,
    title: manifest.title,
    baseline: manifest.baseline,
    counts: {
      comparisons: comparisons.length,
      uniqueImages: Object.keys(assets).length,
      missingSlots: comparisons.flatMap(x => x.images).filter(x => x.state === 'missing').length,
    },
    comparisons,
  }
  const output = JSON.stringify(data, null, 2) + '\n'
  if (write) {
    await mkdir(dirname(destination), { recursive: true })
    await writeFile(destination, output)
  } else {
    assert(await readFile(destination, 'utf8') === output, 'Generated data is stale. Run: node tools/visual-review/generate.mjs')
  }
  return data
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await generateBoard({ write: !process.argv.includes('--check') })
    process.stdout.write('VIS-01: ' + result.counts.comparisons + ' comparisons, ' + result.counts.uniqueImages + ' verified PNGs, ' + result.counts.missingSlots + ' explicitly missing slots\n')
  } catch (error) {
    console.error('VIS-01 generation failed:', error.message)
    process.exitCode = 1
  }
}
