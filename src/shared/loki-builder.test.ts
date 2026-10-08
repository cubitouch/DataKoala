import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildLokiQuery,
  logqlResultKind,
  resolveIndexedSeverityLabel,
  selectorWithoutMatcher,
} from './loki-builder.ts'

test('resolves only supported indexed severity labels deterministically', () => {
  for (const label of [
    'level',
    'LEVEL',
    'severity',
    'SEVERITY_TEXT',
    'loglevel',
    'log_level',
  ])
    assert.equal(resolveIndexedSeverityLabel([label]), label)
  assert.equal(
    resolveIndexedSeverityLabel(['severity', 'LEVEL', 'level', 'log_level']),
    'level',
  )
  assert.equal(
    resolveIndexedSeverityLabel(['severity_text', 'log_level']),
    'log_level',
  )
  assert.equal(resolveIndexedSeverityLabel(['detected_level']), null)
  assert.equal(
    resolveIndexedSeverityLabel(['service_level', 'severity_count']),
    null,
  )
})

test('Level values use one case-insensitive indexed-label matcher and preserve other filters', () => {
  const base = {
    lineFilters: [{ operator: '|=' as const, value: 'timeout' }],
    parsers: [{ kind: 'json' as const }],
    fieldFilters: [{ field: 'attempt', operator: '!=' as const, value: '2' }],
  }
  const matcher = (values: string[]) => ({
    label: 'level',
    operator: '=~' as const,
    value: '',
    values,
  })
  const unrelated = {
    label: 'service_name',
    operator: '=~' as const,
    value: '.+',
  }
  assert.equal(
    buildLokiQuery({ ...base, labelMatchers: [unrelated, matcher(['ERROR'])] }),
    '{service_name=~".+", level=~"(?i)^(?:ERROR)$"} |= "timeout" | json | attempt!="2"',
  )
  assert.equal(
    buildLokiQuery({
      ...base,
      labelMatchers: [unrelated, matcher(['ERROR', 'WARN'])],
    }),
    '{service_name=~".+", level=~"(?i)^(?:ERROR|WARN)$"} |= "timeout" | json | attempt!="2"',
  )
  assert.equal(
    buildLokiQuery({ ...base, labelMatchers: [unrelated] }),
    '{service_name=~".+"} |= "timeout" | json | attempt!="2"',
  )
  assert.equal(
    buildLokiQuery({
      ...base,
      labelMatchers: [unrelated, matcher(['ERR.OR'])],
    }),
    '{service_name=~".+", level=~"(?i)^(?:ERR\\\\.OR)$"} |= "timeout" | json | attempt!="2"',
  )
})

test('generates parser-valid LogQL for every supported operator and escaped input', () => {
  const query = buildLokiQuery({
    labelMatchers: [
      { label: 'service_name', operator: '=', value: 'check"out' },
      { label: 'namespace', operator: '!=', value: 'pay\\ments' },
      { label: 'pod', operator: '=~', value: 'api-.+\nnext' },
      { label: 'cluster', operator: '!~', value: 'dev|test' },
    ],
    lineFilters: [
      { operator: '|=', value: 'a"b' },
      { operator: '!=', value: 'noise' },
      { operator: '|~', value: '\\berror\\b' },
      { operator: '!~', value: 'health\ncheck' },
    ],
    parsers: [{ kind: 'json' }],
    fieldFilters: [{ field: 'order_id', operator: '!=', value: '42"' }],
  })
  assert.match(query, /service_name="check\\"out"/)
  assert.match(query, /namespace!="pay\\\\ments"/)
  assert.equal(logqlResultKind(query), 'logs')
})

test('rejects invalid label names and requires a stream matcher', () => {
  assert.throws(
    () =>
      buildLokiQuery({
        labelMatchers: [],
        lineFilters: [],
        parsers: [],
        fieldFilters: [],
      }),
    /safe fallback selector/,
  )
  assert.throws(
    () =>
      buildLokiQuery({
        labelMatchers: [{ label: 'bad-label', operator: '=', value: 'x' }],
        lineFilters: [],
        parsers: [],
        fieldFilters: [],
      }),
    /Invalid Loki label/,
  )
})

test('uses a safe provider fallback only when user matchers are incomplete', () => {
  const base = {
    labelMatchers: [],
    lineFilters: [],
    parsers: [],
    fieldFilters: [],
  }
  const fallbackMatcher = {
    label: 'service_name',
    operator: '=~' as const,
    value: '.+',
  }
  const query = buildLokiQuery(base, { fallbackMatcher })
  assert.equal(query, '{service_name=~".+"}')
  assert.equal(logqlResultKind(query), 'logs')
  assert.equal(
    buildLokiQuery(
      {
        ...base,
        labelMatchers: [{ label: 'app', operator: '=', value: '', values: [] }],
      },
      { fallbackMatcher },
    ),
    query,
  )
  assert.throws(
    () =>
      buildLokiQuery(base, {
        fallbackMatcher: { label: 'service_name', operator: '=~', value: '.*' },
      }),
    /positive matcher/,
  )
})

test('appends the normal pipeline to the provider fallback selector', () => {
  const query = buildLokiQuery(
    {
      labelMatchers: [],
      lineFilters: [{ operator: '|=', value: 'timeout' }],
      parsers: [
        { kind: 'json' },
        { kind: 'regexp', expression: 'status=(?P<status>\\d+)' },
      ],
      fieldFilters: [{ field: 'status', operator: '!=', value: '200' }],
    },
    { fallbackMatcher: { label: 'service_name', operator: '=~', value: '.+' } },
  )
  assert.equal(
    query,
    '{service_name=~".+"} |= "timeout" | json | regexp "status=(?P<status>\\\\d+)" | status!="200"',
  )
})

test('orders JSON parsing before included and excluded parsed-field filters', () => {
  const base = {
    labelMatchers: [
      { label: 'service_name', operator: '=' as const, value: 'checkout' },
    ],
    lineFilters: [],
    parsers: [{ kind: 'json' as const }],
  }
  const included = buildLokiQuery({
    ...base,
    fieldFilters: [{ field: 'attempt', operator: '=', value: '3' }],
  })
  const excluded = buildLokiQuery({
    ...base,
    fieldFilters: [{ field: 'attempt', operator: '!=', value: '3' }],
  })
  assert.equal(included, '{service_name="checkout"} | json | attempt="3"')
  assert.equal(excluded, '{service_name="checkout"} | json | attempt!="3"')
  assert.equal(logqlResultKind(included), 'logs')
  assert.equal(logqlResultKind(excluded), 'logs')
})

test('does not require a parser for a structured-metadata field filter', () => {
  assert.equal(
    buildLokiQuery({
      labelMatchers: [
        { label: 'service_name', operator: '=', value: 'checkout' },
      ],
      lineFilters: [],
      parsers: [],
      fieldFilters: [{ field: 'trace_id', operator: '=', value: 'abc' }],
    }),
    '{service_name="checkout"} | trace_id="abc"',
  )
})

test('does not use the fallback when a completed user matcher exists', () => {
  const state = {
    labelMatchers: [
      { label: 'app', operator: '=' as const, value: 'checkout' },
    ],
    lineFilters: [],
    parsers: [],
    fieldFilters: [],
  }
  assert.equal(
    buildLokiQuery(state, {
      fallbackMatcher: { label: 'service_name', operator: '=~', value: '.+' },
    }),
    '{app="checkout"}',
  )
})

test('dependent metadata selector excludes its own matcher only', () => {
  assert.equal(
    selectorWithoutMatcher(
      [
        { label: 'environment', operator: '=', value: 'prod' },
        { label: 'service', operator: '=~', value: 'check.*' },
      ],
      'service',
    ),
    '{environment="prod"}',
  )
})

test('dependent metadata selectors require a positive non-empty anchor', () => {
  assert.equal(selectorWithoutMatcher([], 'service'), undefined)
  assert.equal(
    selectorWithoutMatcher(
      [{ label: 'environment', operator: '!=', value: 'production' }],
      'service',
    ),
    undefined,
  )
  assert.equal(
    selectorWithoutMatcher(
      [{ label: 'environment', operator: '!~', value: 'dev|test' }],
      'service',
    ),
    undefined,
  )
  assert.equal(
    selectorWithoutMatcher(
      [{ label: 'environment', operator: '=~', value: '.*' }],
      'service',
    ),
    undefined,
  )
  assert.equal(
    selectorWithoutMatcher(
      [{ label: 'environment', operator: '=~', value: '.+' }],
      'service',
    ),
    '{environment=~".+"}',
  )
  assert.equal(
    selectorWithoutMatcher(
      [{ label: 'environment', operator: '=~', value: '[' }],
      'service',
    ),
    undefined,
  )
  assert.equal(
    selectorWithoutMatcher(
      [{ label: 'environment', operator: '=~', value: '(?!production).*' }],
      'service',
    ),
    undefined,
  )
})

test('dependent metadata selectors retain filters when a positive anchor exists', () => {
  assert.equal(
    selectorWithoutMatcher(
      [
        { label: 'service_name', operator: '=', value: 'checkout' },
        { label: 'environment', operator: '!=', value: 'development' },
      ],
      'namespace',
    ),
    '{service_name="checkout", environment!="development"}',
  )
  assert.equal(
    selectorWithoutMatcher(
      [
        {
          label: 'environment',
          operator: '=',
          value: '',
          values: ['production', 'staging'],
        },
        { label: 'service_name', operator: '=', value: 'checkout' },
      ],
      'service_name',
    ),
    '{environment=~"^(?:production|staging)$"}',
  )
  assert.equal(
    selectorWithoutMatcher(
      [
        { label: 'environment', operator: '=', value: '', values: [] },
        { label: 'service_name', operator: '=', value: 'checkout' },
      ],
      'service_name',
    ),
    undefined,
  )
})

test('dependent metadata selectors omit unsafe regexes while retaining a valid equality anchor', () => {
  const equality = {
    label: 'service_name',
    operator: '=' as const,
    value: 'checkout',
  }
  assert.equal(
    selectorWithoutMatcher(
      [equality, { label: 'environment', operator: '=~', value: '[' }],
      'namespace',
    ),
    '{service_name="checkout"}',
  )
  assert.equal(
    selectorWithoutMatcher(
      [equality, { label: 'environment', operator: '!~', value: '[' }],
      'namespace',
    ),
    '{service_name="checkout"}',
  )
  assert.equal(
    selectorWithoutMatcher(
      [
        equality,
        { label: 'environment', operator: '!=', value: 'development' },
      ],
      'namespace',
    ),
    '{service_name="checkout", environment!="development"}',
  )
})

test('value selections generate exact and anchored escaped regex matchers', () => {
  const base = { lineFilters: [], parsers: [], fieldFilters: [] }
  assert.equal(
    buildLokiQuery({
      ...base,
      labelMatchers: [
        {
          label: 'environment',
          operator: '=',
          value: 'production',
          values: ['production'],
        },
      ],
    }),
    '{environment="production"}',
  )
  assert.equal(
    buildLokiQuery({
      ...base,
      labelMatchers: [
        {
          label: 'environment',
          operator: '=',
          value: 'production',
          values: ['production', 'staging', 'production'],
        },
      ],
    }),
    '{environment=~"^(?:production|staging)$"}',
  )
  assert.equal(
    buildLokiQuery({
      ...base,
      labelMatchers: [
        {
          label: 'service',
          operator: '=',
          value: '',
          values: ['api.v2', 'a"b', String.raw`c\\d`],
        },
      ],
    }),
    String.raw`{service=~"^(?:api\\.v2|a\"b|c\\\\\\\\d)$"}`,
  )
  assert.throws(
    () =>
      buildLokiQuery({
        ...base,
        labelMatchers: [
          { label: 'environment', operator: '=', value: '', values: [] },
        ],
      }),
    /at least one/,
  )
})
