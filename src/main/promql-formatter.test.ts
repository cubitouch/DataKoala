import assert from 'node:assert/strict'
import test from 'node:test'
import { formatPromql } from './promql-formatter.ts'

test('formats PromQL through promtool without a shell or datasource', async () => {
  let binary = ''
  let args: string[] = []
  const formatted = await formatPromql(
    'sum by(status)(rate(http_requests_total[5m]))',
    async (value, commandArgs) => {
      binary = value
      args = commandArgs
      return { stdout: 'sum by (status) (\n  rate(http_requests_total[5m])\n)\n', stderr: '' }
    },
    '/opt/promtool'
  )

  assert.equal(binary, '/opt/promtool')
  assert.deepEqual(args, ['--experimental', 'promql', 'format', 'sum by(status)(rate(http_requests_total[5m]))'])
  assert.equal(formatted, 'sum by (status) (\n  rate(http_requests_total[5m])\n)')
})

test('preserves actionable promtool parser errors', async () => {
  const failure = Object.assign(new Error('exit 1'), { code: 1, stderr: '1:5: parse error: unexpected token' })
  await assert.rejects(
    () => formatPromql('sum(', async () => { throw failure }, 'promtool'),
    /parse error: unexpected token/
  )
})

test('reports a useful error when promtool is missing', async () => {
  const failure = Object.assign(new Error('spawn promtool ENOENT'), { code: 'ENOENT' })
  await assert.rejects(
    () => formatPromql('up', async () => { throw failure }, 'promtool'),
    /PromQL formatting requires promtool/
  )
})

test('rejects empty queries and empty formatter output', async () => {
  await assert.rejects(() => formatPromql('   ', async () => ({ stdout: '', stderr: '' }), 'promtool'), /PromQL query is required/)
  await assert.rejects(() => formatPromql('up', async () => ({ stdout: '  ', stderr: '' }), 'promtool'), /empty formatted query/)
})
