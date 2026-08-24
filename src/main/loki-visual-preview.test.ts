import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import test from 'node:test'

const root = new URL('../../', import.meta.url)

test('Loki preview fixture preserves log field boundaries and realistic severities', async () => {
  const fixtureUrl = pathToFileURL(new URL('scripts/visual-preview/loki-fixtures.mjs', root).pathname).href
  const fixture = await import(fixtureUrl)
  const row = fixture.previewLokiRows[0]
  assert.deepEqual(row.labels, { environment: 'production', cluster: 'eu-west-1', namespace: 'payments', service_name: 'checkout-api' })
  assert.equal(row.structuredMetadata.severity, 'ERROR')
  assert.equal(row.parsedFields.downstream_service, 'inventory-service')
  assert.equal(row.traceId, '8f4a02ce4d7b41a2bd63688cf774913e')
  assert.deepEqual(new Set(fixture.previewLokiRows.map((item: { severity: string }) => item.severity)), new Set(['INFO', 'WARN', 'ERROR']))
})

test('Loki preview workflow, documentation, and screenshot command stay synchronized', async () => {
  const [workflow, docs, packageJson] = await Promise.all([
    readFile(new URL('.github/workflows/visual-preview.yml', root), 'utf8'),
    readFile(new URL('docs-site/src/main.ts', root), 'utf8'),
    readFile(new URL('package.json', root), 'utf8')
  ])
  assert.match(workflow, /^\s+loki-log-list\.png$/m)
  assert.match(workflow, /^\s+loki-log-chart\.png$/m)
  assert.match(workflow, /scripts\/capture-loki-preview\.mjs/)
  assert.match(workflow, /Loki — production checkout logs and selected event inspector/)
  assert.match(workflow, /Loki — production incident log-volume trend/)
  assert.match(docs, /shot\('loki-log-list', 'Loki production checkout log list/)
  assert.match(docs, /shot\('loki-log-chart', 'Loki log-volume chart/)
  assert.match(docs, /\.\/screenshots\/\$\{name\}\.png/)
  assert.match(JSON.parse(packageJson).scripts['docs:screenshots'], /scripts\/capture-loki-preview\.mjs/)
})
