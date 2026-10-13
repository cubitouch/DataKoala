import assert from 'node:assert/strict'
import test from 'node:test'
import { validateVisualReport } from './assertions.mjs'
import { syntheticSources } from './fixtures.mjs'

const populated = { selector: '[data-chart]', description: 'fixture chart', minSeries: 1, minItems: 1 }
const current = { type: 'line', finished: true, series: 1, items: 4, fingerprint: 'current', expectedFingerprint: 'current' }

test('populated semantic report passes', () => {
  assert.doesNotThrow(() => validateVisualReport('populated.png', populated, current))
})

test('zero rendered items fails when populated data is expected', () => {
  assert.throws(() => validateVisualReport('empty-by-accident.png', populated, { type: 'line', finished: true, series: 1, items: 0 }), /actual items=0/)
})

test('zero rendered items passes when emptiness is explicit', () => {
  assert.doesNotThrow(() => validateVisualReport('intentional-empty.png', { ...populated, minSeries: undefined, minItems: undefined, expectEmpty: true }, { type: 'line', finished: true, series: 0, items: 0 }))
})

test('Tempo data outside its visible range fails the populated scatter expectation', () => {
  const timestamps = [Date.UTC(2026, 7, 19, 15), Date.UTC(2026, 7, 19, 16)]
  const range = [Date.UTC(2026, 7, 20, 15), Date.UTC(2026, 7, 20, 16)]
  const visible = timestamps.filter((value) => value >= range[0] && value <= range[1]).length
  assert.throws(() => validateVisualReport('tempo-trace-scatter.png', { selector: '[data-scatter]', description: 'Tempo scatter', minSeries: 1, minItems: 1 }, { type: 'scatter', finished: true, series: 1, items: visible, range: range.join('..') }), /actual items=0/)
})

test('a non-empty series with zero points in the effective domain fails', () => {
  assert.throws(() => validateVisualReport('outside-domain.png', populated, { ...current, items: 0, rawItems: 4 }), /actual items=0/)
})

test('a chart rendered for the previous configuration fails', () => {
  assert.throws(() => validateVisualReport('stale.png', populated, { ...current, fingerprint: 'previous' }), /stale chart/)
})

test('the current configuration with visible points passes', () => {
  const expectation = { ...populated, expectedConfig: { view: 'bar', x: 'series' } }
  assert.doesNotThrow(() => validateVisualReport('current.png', expectation, { ...current, type: 'bar', config: { view: 'bar', x: 'series', resultRevision: 7 } }))
})

test('PostgreSQL visual preview fixtures never embed saved passwords', () => {
  const postgresProfiles = syntheticSources.filter(
    (profile) => profile.kind === 'postgres',
  )
  assert.ok(postgresProfiles.length > 0)
  for (const profile of postgresProfiles) assert.equal(profile.password, '')
})

test('public Loki volume covers one hour with 60 grouped buckets and a spike', async () => {
  const { previewLokiTrendResult } = await import('./loki-fixtures.mjs')
  const times = [...new Set(previewLokiTrendResult.rows.map(row => Date.parse(row.timestamp)))].sort((a,b) => a-b)
  assert.equal(times.length, 60)
  assert.equal(times.at(-1) - times[0], 59 * 60_000)
  assert.equal(previewLokiTrendResult.rows.length, 180)
  const errors = previewLokiTrendResult.rows.filter(row => row.severity === 'ERROR').map(row => row.value)
  assert.ok(Math.max(...errors) > errors[0] * 10)
  assert.ok(errors.at(-1) < Math.max(...errors) / 5)
})

test('public Tempo cohort is separate from the five-trace filter regression', async () => {
  const { documentationTraceSearchResult: publicResult, previewTraceSearchResult: regression } = await import('./trace-fixtures.mjs')
  assert.equal(regression.rows.length, 5)
  assert.equal(publicResult.rows.length, 48)
  assert.equal(new Set(publicResult.rows.map(row => row.traceId)).size, 48)
  assert.deepEqual([...new Set(publicResult.rows.map(row => row.status))].sort(), ['error', 'ok'])
  assert.ok(publicResult.rows.filter(row => row.durationMs >= 1500).length >= 5)
})

test('Grafana sharing artwork is local and inherits the accent color', async () => {
  const { readFile } = await import('node:fs/promises')
  const html = await readFile(new URL('../../docs-site/index.html', import.meta.url), 'utf8')
  const css = await readFile(new URL('../../docs-site/src/styles.css', import.meta.url), 'utf8')
  assert.doesNotMatch(html, /cdn\.simpleicons\.org\/grafana/)
  assert.match(html, /svg\s+class="provider-logo"/)
  assert.match(css, /\.share-icon\s*\{[^}]*color: var\(--accent\)/s)
  assert.match(css, /\.share-icon svg.provider-logo\s*\{[^}]*fill: currentcolor/s)
})
