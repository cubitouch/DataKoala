import assert from 'node:assert/strict'
import test from 'node:test'
import { buildLokiQuery, logqlResultKind, selectorWithoutMatcher } from './loki-builder.ts'

test('generates parser-valid LogQL for every supported operator and escaped input', () => {
  const query = buildLokiQuery({
    labelMatchers: [
      { label: 'service_name', operator: '=', value: 'check"out' }, { label: 'namespace', operator: '!=', value: 'pay\\ments' },
      { label: 'pod', operator: '=~', value: 'api-.+\nnext' }, { label: 'cluster', operator: '!~', value: 'dev|test' }
    ],
    lineFilters: [{ operator: '|=', value: 'a"b' }, { operator: '!=', value: 'noise' }, { operator: '|~', value: '\\berror\\b' }, { operator: '!~', value: 'health\ncheck' }],
    parsers: [{ kind: 'json' }], fieldFilters: [{ field: 'order_id', operator: '!=', value: '42"' }]
  })
  assert.match(query, /service_name="check\\"out"/)
  assert.match(query, /namespace!="pay\\\\ments"/)
  assert.equal(logqlResultKind(query), 'logs')
})

test('rejects invalid label names and requires a stream matcher', () => {
  assert.throws(() => buildLokiQuery({ labelMatchers: [], lineFilters: [], parsers: [], fieldFilters: [] }), /at least one/)
  assert.throws(() => buildLokiQuery({ labelMatchers: [{ label: 'bad-label', operator: '=', value: 'x' }], lineFilters: [], parsers: [], fieldFilters: [] }), /Invalid Loki label/)
})

test('dependent metadata selector excludes its own matcher only', () => {
  assert.equal(selectorWithoutMatcher([
    { label: 'environment', operator: '=', value: 'prod' }, { label: 'service', operator: '=~', value: 'check.*' }
  ], 'service'), '{environment="prod"}')
})
