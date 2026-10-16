import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { generateBoard, pngDimensions, gitBlobSha } from './generate.mjs'
import { startServer } from './serve.mjs'
import { CHOICES, readSaved, setDecision, exportPayload, importPayload, exportMarkdown } from './site/decisions.mjs'

test('generate reproducible Atlas review data and verify every published screenshot', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'datakoala-vis01-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  const destination = join(dir, 'data.json')
  const board = await generateBoard({ destination })
  assert.equal(board.counts.comparisons, 18)
  assert.equal(board.counts.uniqueImages, 23)
  assert.equal(board.counts.missingSlots, 3)
  assert.equal(board.comparisons.length, new Set(board.comparisons.map(row => row.id)).size)
  assert.equal(board.comparisons.filter(row => row.evidenceGap).length, 18)
  assert.ok(board.comparisons.every(row => row.atlasUrl.includes('#L') && row.question.length > 20))
  assert.ok(board.comparisons.flatMap(row => row.images).filter(image => image.state === 'published_capture')
    .every(image => image.verified && image.width > 0 && image.height > 0 && /^[0-9a-f]{40}$/.test(image.blobSha) && image.artifactId))
  assert.ok(board.comparisons.flatMap(row => row.images).filter(image => image.state === 'missing')
    .every(image => image.reason.length > 15 && !image.url))
  const persisted = JSON.parse(await readFile(destination, 'utf8'))
  assert.deepEqual(persisted, board)
  await generateBoard({ write: false, destination })
})

test('four decisions, notes, autosaved JSON reload, import and both exports survive one review workflow', async () => {
  const board = await generateBoard()
  const ids = board.comparisons.map(row => row.id)
  let state = {}
  state = setDecision(state, 'VIS-01', { choice: CHOICES[0], notes: 'Share row mechanics, preserve density.' }, ids)
  state = setDecision(state, 'VIS-02', { choice: CHOICES[1], notes: 'Provider-specific focus may differ.' }, ids)
  state = setDecision(state, 'VIS-03', { choice: CHOICES[2], notes: 'Require explicit keyboard design.' }, ids)
  state = setDecision(state, 'VIS-04', { choice: CHOICES[3], notes: 'Re-run narrow-paned evidence.' }, ids)
  const stored = JSON.stringify({ schemaVersion: 1, decisions: state })
  const reopened = readSaved(stored, ids)
  assert.deepEqual(reopened, state)
  const exported = exportPayload(reopened, board.comparisons, board.baseline, '2026-10-16T00:00:00Z')
  const transferred = importPayload(JSON.stringify(exported), board.comparisons)
  assert.deepEqual(transferred, state)
  const markdown = exportMarkdown(exported)
  assert.match(markdown, /VIS-03.*Request redesign/)
  assert.match(markdown, /Share row mechanics/)
  assert.match(markdown, /Source integration HEAD/)
  assert.deepEqual(readSaved('{invalid', ids), {})
  assert.deepEqual(importPayload(JSON.stringify({ schemaVersion: 1, decisions: { INVALID: { choice: CHOICES[0] } } }), board.comparisons), {})
  assert.throws(() => setDecision(state, 'INVALID', { choice: CHOICES[0] }, ids), /Unknown comparison/)
  assert.throws(() => setDecision(state, 'VIS-01', { choice: 'not a real decision' }, ids), /Unknown review decision/)
})

test('local startup serves review UI and every rendered real PNG, rejects absent routes', async t => {
  const board = await generateBoard()
  const server = await startServer({ port: 0 })
  t.after(() => new Promise(resolve => server.close(resolve)))
  const origin = 'http://127.0.0.1:' + server.address().port
  const index = await fetch(origin + '/')
  assert.equal(index.status, 200)
  assert.match(await index.text(), /Visual review board/)
  const app = await fetch(origin + '/app.mjs')
  assert.equal(app.status, 200)
  assert.match(await app.text(), /showModal/)
  const data = await fetch(origin + '/data.json')
  assert.equal(data.status, 200)
  assert.equal((await data.json()).counts.uniqueImages, 23)
  const unique = new Map(board.comparisons.flatMap(row => row.images)
    .filter(image => image.state === 'published_capture').map(image => [image.name, image]))
  for (const image of unique.values()) {
    const response = await fetch(origin + image.url)
    assert.equal(response.status, 200, image.name + ' not accessible')
    assert.match(response.headers.get('content-type'), /image\/png/)
    const bytes = Buffer.from(await response.arrayBuffer())
    assert.deepEqual(pngDimensions(bytes), { width: image.width, height: image.height })
    assert.equal(gitBlobSha(bytes), image.blobSha)
  }
  assert.equal((await fetch(origin + '/images/audit/unknown.png')).status, 404)
  assert.equal((await fetch(origin + '/manifest.json')).status, 404)
  assert.equal((await fetch(origin + '/.github/config')).status, 404)
})
