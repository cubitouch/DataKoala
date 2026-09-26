import { describe, expect, it } from 'vitest'
import { sqlPresetAdapter } from './sqlPresetAdapter'
import { prometheusPresetAdapter } from './prometheusPresetAdapter'
import { lokiPresetAdapter } from './lokiPresetAdapter'
import { tempoPresetAdapter } from './tempoPresetAdapter'
import { testSession } from './testUtils'

describe('datasource preset adapters', () => {
  it.each(['postgres', 'bigquery', 'local-files', 'sqlite-file'])('round-trips SQL raw and structured Builder definitions for %s', () => {
    const source = testSession({ queryMode: 'builder', sql: 'select * from orders' })
    source.builder = { table: { schema: 'sales', name: 'orders' }, timeColumn: 'created_at', timeBucket: 'hour', seriesColumns: ['region'], timeRange: { kind: 'rolling', amount: 24, unit: 'hour' } }
    source.sqlVisualization = { ...source.sqlVisualization, view: 'bar', xColumn: 'region' }
    source.builderVisualization = { ...source.builderVisualization, view: 'area', seriesColumns: ['region'] }
    const payload = sqlPresetAdapter.capture(source), parsed = sqlPresetAdapter.parse(JSON.parse(JSON.stringify(payload)))
    expect(parsed).toEqual(payload)
    const target = testSession({ id: 'target', title: 'Target', connectionProfileId: 'target-profile' })
    expect(sqlPresetAdapter.apply(target, parsed!)).toMatchObject({ id: 'target', title: 'Target', connectionProfileId: 'target-profile', queryMode: 'builder', sql: source.sql, builder: source.builder })
    expect(sqlPresetAdapter.parse({ ...payload, builder: { nope: true } })).toBeNull()
  })

  it('round-trips all structured Prometheus exploration fields', () => {
    const source = testSession({ queryMode: 'builder', sql: 'rate(http_requests_total[5m])' })
    source.promqlBuilder = { metric: 'http_requests_total', filterBy: ['method'], labelValues: { method: ['GET', 'POST'] }, groupBy: ['service'], calculation: 'percentile', aggregation: 'sum', window: '10m', percentile: 0.99, histogramKindOverride: 'classic' }
    source.prometheusTimeRange = { kind: 'rolling', amount: 30, unit: 'day' }; source.prometheusStep = '2m'
    const payload = prometheusPresetAdapter.capture(source)
    expect(prometheusPresetAdapter.parse(payload)).toEqual(payload)
    expect(prometheusPresetAdapter.apply(testSession(), payload)).toMatchObject(payload)
    expect(prometheusPresetAdapter.parse({ ...payload, promqlBuilder: { ...payload.promqlBuilder, labelValues: { method: [false] } } })).toBeNull()
  })

  it('round-trips Loki pipeline state while excluding range navigation history', () => {
    const source = testSession({ queryMode: 'builder', sql: '{app="api"} |= "error"' })
    source.lokiBuilder = { labelMatchers: [{ label: 'app', operator: '=', value: 'api', values: ['api'] }], lineFilters: [{ operator: '|=', value: 'error' }], parsers: [{ kind: 'json' }, { kind: 'regexp', expression: 'status=(?P<status>\\d+)' }], fieldFilters: [{ field: 'status', operator: '=~', value: '5..' }] }
    source.lokiTimeRange = { kind: 'rolling', amount: 6, unit: 'hour' }; source.lokiResultLimit = 500; source.lokiGroupBy = ['app']; source.lokiResultView = 'patterns'
    source.lokiRangeHistory = [{ kind: 'all' }]
    const payload = lokiPresetAdapter.capture(source)
    expect(payload).not.toHaveProperty('lokiRangeHistory')
    expect(lokiPresetAdapter.parse(payload)).toEqual(payload)
    const target = testSession(); target.lokiRangeHistory = [{ kind: 'rolling', amount: 1, unit: 'hour' }]
    expect(lokiPresetAdapter.apply(target, payload).lokiRangeHistory).toEqual(target.lokiRangeHistory)
  })

  it('round-trips Tempo structured search independently of raw TraceQL', () => {
    const source = testSession({ queryMode: 'builder', sql: '{ resource.service.name = "raw-only" }' })
    source.tempoBuilder = { ...source.tempoBuilder, serviceNamespace: 'shop', service: 'checkout', spanKind: 'server', protocol: 'http', httpMethod: 'POST', endpoint: '/checkout', spanName: 'pay', status: 'error', minDurationMs: '500', advancedFilters: [{ attribute: 'deployment.environment', scope: 'resource', mode: 'include', values: ['prod'] }, { attribute: 'http.response.status_code', scope: 'span', mode: 'exclude', values: ['200'] }] }
    source.tempoTimeRange = { kind: 'rolling', amount: 12, unit: 'hour' }; source.tempoSampleSize = '500'; source.tempoResultView = 'service-map'
    const payload = tempoPresetAdapter.capture(source), target = testSession()
    expect(tempoPresetAdapter.parse(payload)).toEqual(payload)
    const applied = tempoPresetAdapter.apply(target, payload)
    expect(applied.tempoBuilder).toEqual(source.tempoBuilder)
    expect(applied.sql).toBe(source.sql)
    expect(applied.tempoBuilder.service).not.toBe('raw-only')
  })

  it('never captures or transfers runtime state', () => {
    const source = testSession({ sql: 'select 42' })
    Object.assign(source, { running: true, queryError: 'source error', result: { columns: [], rows: [], rowCount: 0, durationMs: 1 }, pendingResult: { columns: [], rows: [], rowCount: 0, durationMs: 2 }, resultRevision: 9, lastSuccessfulResultRevision: 8, isResultStale: true, explainText: 'plan', showExplain: true, activeExplainRequest: 'analyze', seriesVisibility: { hidden: false }, builderFilterNotice: { id: 1, message: 'notice' } })
    const payload = sqlPresetAdapter.capture(source)
    for (const key of ['running', 'queryError', 'result', 'pendingResult', 'resultRevision', 'lastSuccessfulResultRevision', 'isResultStale', 'explainText', 'showExplain', 'activeExplainRequest', 'seriesVisibility', 'builderFilterNotice']) expect(payload).not.toHaveProperty(key)
    const target = testSession(); target.queryError = 'keep'; target.running = false; target.resultRevision = 77; target.explainText = 'keep plan'; target.seriesVisibility = { keep: true }
    const applied = sqlPresetAdapter.apply(target, payload)
    expect(applied).toMatchObject({ queryError: 'keep', running: false, resultRevision: 77, explainText: 'keep plan', seriesVisibility: { keep: true } })
    expect(applied).not.toBe(target); expect(applied.builder).not.toBe(payload.builder)
  })
})
