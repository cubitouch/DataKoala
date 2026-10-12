// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'

const {
  explain,
  runQuery,
  formatQuery,
  labelsForMetric,
  labelValues,
  promqlAsExtension,
  notify,
  aiSettingsGet,
  aiPropose,
  aiCancel,
  describeTable,
} = vi.hoisted(() => ({
  explain: vi.fn(),
  runQuery: vi.fn(),
  formatQuery: vi.fn(),
  labelsForMetric: vi.fn(),
  labelValues: vi.fn(),
  promqlAsExtension: vi.fn(() => ({})),
  notify: vi.fn(),
  aiSettingsGet: vi.fn(),
  aiPropose: vi.fn(),
  aiCancel: vi.fn(),
  describeTable: vi.fn(),
}))
vi.mock('@lib/api', () => ({
  api: {
    ai: {
      settings: {
        get: aiSettingsGet,
      },
      proposeQuery: aiPropose,
      cancel: aiCancel,
    },
    connections: {
      describeTable,
      prometheus: { formatQuery, labelsForMetric, labelValues },
    },
    query: { explain, run: runQuery },
    export: { saveText: vi.fn() },
  },
}))
vi.mock('@components/ui/feedback/NotificationArea', () => ({ notify }))
vi.mock('@components/query/sql/ExecutionPlanGraph', () => ({
  ExecutionPlanGraph: () => (
    <div
      aria-label="Execution plan diagram"
      data-testid="execution-plan-test-double"
    />
  ),
}))
vi.mock('@uiw/react-codemirror', () => ({
  default: ({
    value,
    onChange,
    editable = true,
    ...props
  }: {
    value: string
    onChange: (value: string) => void
    editable?: boolean
    'aria-label'?: string
  }) => (
    <textarea
      aria-label={props['aria-label'] ?? 'SQL editor'}
      value={value}
      disabled={!editable}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
}))
vi.mock('@codemirror/lang-sql', () => {
  const dialect = { spec: {}, language: { data: { of: () => ({}) } } }
  return {
    sql: () => ({}),
    PostgreSQL: dialect,
    StandardSQL: dialect,
    SQLDialect: { define: () => dialect },
  }
})
vi.mock('@codemirror/theme-one-dark', () => ({ oneDark: {} }))
vi.mock('@prometheus-io/codemirror-promql', () => ({
  PromQLExtension: class {
    asExtension() {
      return promqlAsExtension()
    }
  },
}))
vi.mock('./ModeSwitch', () => ({
  ModeSwitch: () => <div aria-label="Query mode" />,
}))

import { BuilderPanel } from '@components/builder/sql/BuilderPanel'
import { QueryEditor } from './QueryEditor'
import { ExplainPane } from '@components/query/sql/ExplainPane'
import { AiQueryRepair } from '@components/ai/AiQueryRepair'
import { AiQueryRepairProvider } from '@components/ai/AiQueryRepairProvider'
import {
  activeTestSession,
  patchActiveTestSession,
  resetTestStore,
  setActiveTestMetadata,
} from '@test/sessionTestUtils'
import { createQuerySession, useStore } from '@store/useStore'
import { bindTabConnection } from '@lib/tabConnection'
import { QueryTabs } from './QueryTabs'
import { QueryExecutionError } from '@lib/queryErrors'
import { AI_LIMITS } from '@shared/ai'
import type { DataSourceProfile } from '@shared/types'

const deferred = <T,>() => {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}

function renderExplainUi() {
  resetTestStore({})
  patchActiveTestSession({
    connectionProfileId: 'profile-1',
    sql: 'select 1;',
    explainText: 'previous plan',
    showExplain: true,
    activeExplainRequest: null,
  })
  render(
    <>
      <QueryEditor />
      <ExplainPane />
    </>,
  )
}

beforeEach(() => {
  explain.mockReset()
  explain.mockResolvedValue({ text: 'new plan' })
  runQuery.mockReset()
  formatQuery.mockReset()
  labelsForMetric.mockReset()
  labelsForMetric.mockResolvedValue([])
  labelValues.mockReset()
  labelValues.mockResolvedValue([])
  promqlAsExtension.mockClear()
  notify.mockReset()
  aiSettingsGet.mockReset()
  aiSettingsGet.mockResolvedValue({
    ok: true,
    value: { provider: 'openrouter', model: '', hasApiKey: false },
  })
  aiPropose.mockReset()
  aiCancel.mockReset()
  aiCancel.mockResolvedValue({ ok: true, value: undefined })
  describeTable.mockReset()
  describeTable.mockResolvedValue([])
})

describe('PromQL execution', () => {
  function renderPromql(query = 'up') {
    resetTestStore({
      profiles: [
        {
          id: 'prom-1',
          name: 'Metrics',
          kind: 'prometheus',
          version: 1,
          readonly: true,
          transport: { kind: 'gcx', datasourceUid: 'prom-main' },
        },
      ],
    })
    patchActiveTestSession({
      connectionProfileId: 'prom-1',
      queryMode: 'sql',
      sql: query,
    })
    render(<QueryEditor />)
  }

  it('blocks Run and Ctrl/Command+Enter while metadata refreshes', async () => {
    renderPromql()
    useStore.setState((state) => ({
      metadataByProfileId: {
        ...state.metadataByProfileId,
        'prom-1': {
          schemas: [],
          status: 'loaded',
          error: null,
          isStale: false,
          refreshing: true,
        },
      },
    }))
    const run = screen.getByRole('button', { name: 'Run' }) as HTMLButtonElement
    await waitFor(() => expect(run.disabled).toBe(true))
    fireEvent.keyDown(screen.getByLabelText('PromQL editor'), {
      key: 'Enter',
      ctrlKey: true,
    })
    expect(runQuery).not.toHaveBeenCalled()
  })

  it('uses the PromQL editor and delivers normalized rows with timeseries defaults', async () => {
    const result = {
      columns: [
        { name: 'timestamp', dataTypeID: 1184, dataTypeName: 'timestamptz' },
        { name: 'value', dataTypeID: 701, dataTypeName: 'double precision' },
        { name: 'instance', dataTypeID: 25, dataTypeName: 'text' },
      ],
      rows: [
        { timestamp: '2026-08-14T10:00:00.000Z', value: 1, instance: 'a' },
      ],
      rowCount: 1,
      durationMs: 10,
    }
    runQuery.mockResolvedValue(result)
    resetTestStore({
      profiles: [
        {
          id: 'prom-1',
          name: 'Metrics',
          kind: 'prometheus',
          version: 1,
          readonly: true,
          transport: { kind: 'gcx' },
        },
      ],
    })
    patchActiveTestSession({
      connectionProfileId: 'prom-1',
      queryMode: 'sql',
      sql: 'up',
    })
    render(<QueryEditor />)

    expect(screen.getByLabelText('PromQL editor')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Run' }))
    await waitFor(() => expect(runQuery).toHaveBeenCalled())
    const call = runQuery.mock.calls[0]
    expect(call[0]).toBe('prom-1')
    expect(call[1]).toBe('up')
    expect(call[3]).toMatchObject({ step: '15s' })
    await waitFor(() =>
      expect(useStore.getState().tabs[0].result?.rows).toEqual(result.rows),
    )
    expect(useStore.getState().tabs[0].sqlVisualization).toMatchObject({
      view: 'line',
      xColumn: 'timestamp',
      valueColumn: 'value',
      seriesColumn: null,
      seriesColumns: [],
    })
  })

  it('activates the local PromQL language extension independently of remote formatting', () => {
    renderPromql('bad(')
    expect(promqlAsExtension).toHaveBeenCalledOnce()
    expect(formatQuery).not.toHaveBeenCalled()
  })

  it('groups the shared date-range picker and Resolution while hiding SQL-only actions', () => {
    renderPromql()
    expect(
      screen.getByRole('button', { name: /Time range: Last hour/ }),
    ).toBeTruthy()
    expect(screen.getByRole('combobox', { name: /Resolution:/ })).toBeTruthy()
    expect(screen.getAllByText('Resolution')).toHaveLength(1)
    const help = screen.getByRole('button', { name: 'Resolution help' })
    expect(help.tabIndex).toBe(0)
    expect(help.getAttribute('aria-describedby')).toBeTruthy()
    expect(screen.queryByLabelText('PromQL range start')).toBeNull()
    expect(screen.queryByText('From')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Explain' })).toBeNull()
    expect(screen.queryByRole('textbox', { name: 'AI prompt' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Explain Analyze' })).toBeNull()
    expect(screen.queryByText('⌘↵ run')).toBeNull()
    expect(screen.getByRole('button', { name: 'Run' }).title).toContain(
      'Ctrl/Command+Enter',
    )
  })

  it('persists each Resolution selection in the existing prometheusStep state', async () => {
    renderPromql()
    expect(useStore.getState().tabs[0].prometheusStep).toBe('auto')
    expect(
      screen.getByRole('combobox', { name: /Resolution: Auto \(15s\)/ }),
    ).toBeTruthy()
    for (const step of ['30s', '1m', '5m'] as const) {
      fireEvent.click(screen.getByRole('combobox', { name: /Resolution:/ }))
      fireEvent.click(await screen.findByRole('option', { name: step }))
      expect(useStore.getState().tabs[0].prometheusStep).toBe(step)
    }
  })

  it('uses a coarser Auto server-side step as the range grows', async () => {
    renderPromql()
    useStore.getState().setPrometheusQueryOptions({
      prometheusTimeRange: {
        kind: 'custom',
        startDate: '2026-05-01',
        startTime: '00:00',
        endDate: '2026-07-30',
        endTime: '00:00',
        recurringWindows: [],
      },
      prometheusStep: 'auto',
    })
    runQuery.mockResolvedValue({
      columns: [],
      rows: [],
      rowCount: 0,
      durationMs: 1,
    })
    fireEvent.click(screen.getByRole('button', { name: 'Run' }))
    await waitFor(() => expect(runQuery).toHaveBeenCalled())
    expect(runQuery.mock.calls[0][3].step).toBe('2h')
  })

  it('blocks an unsafe manual resolution without calling the backend', async () => {
    renderPromql()
    useStore.getState().setPrometheusQueryOptions({
      prometheusTimeRange: { kind: 'rolling', amount: 30, unit: 'day' },
      prometheusStep: '15s',
    })
    fireEvent.click(screen.getByRole('button', { name: 'Run' }))
    await waitFor(() =>
      expect(useStore.getState().tabs[0].queryError).toMatch(
        /Too many data points for this Resolution/,
      ),
    )
    expect(runQuery).not.toHaveBeenCalled()
    expect(useStore.getState().tabs[0].running).toBe(false)
    expect(
      useStore.getState().connectionStateByProfileId['prom-1'].status,
    ).toBe('connected')
  })

  it('can rerun successfully after an oversized provider error without reconnecting', async () => {
    renderPromql()
    runQuery
      .mockRejectedValueOnce(
        new Error(
          'Too many data points — use Auto, increase the Resolution, or reduce the time range.',
        ),
      )
      .mockResolvedValueOnce({
        columns: [],
        rows: [],
        rowCount: 0,
        durationMs: 1,
      })
    fireEvent.click(screen.getByRole('button', { name: 'Run' }))
    await waitFor(() =>
      expect(useStore.getState().tabs[0].queryError).toMatch(
        /Too many data points/,
      ),
    )
    expect(
      screen.getByLabelText('PromQL editor').hasAttribute('disabled'),
    ).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: 'Run' }))
    await waitFor(() => expect(runQuery).toHaveBeenCalledTimes(2))
    await waitFor(() =>
      expect(useStore.getState().tabs[0].queryError).toBeNull(),
    )
    expect(
      useStore.getState().connectionStateByProfileId['prom-1'].status,
    ).toBe('connected')
  })

  it('defaults Prometheus Builder chart Series from all Group by labels', async () => {
    labelsForMetric.mockResolvedValue(['continent', 'service'])
    runQuery.mockResolvedValue({
      columns: [],
      rows: [],
      rowCount: 0,
      durationMs: 1,
    })
    resetTestStore({
      profiles: [
        {
          id: 'prom-1',
          name: 'Metrics',
          kind: 'prometheus',
          version: 1,
          readonly: true,
          transport: { kind: 'gcx' },
        },
      ],
    })
    patchActiveTestSession({
      connectionProfileId: 'prom-1',
      queryMode: 'builder',
      sql: 'sum by (continent, service) (up)',
      promqlBuilder: {
        metric: 'up',
        filterBy: [],
        groupBy: ['continent', 'service'],
        labelValues: {},
        calculation: 'raw',
        aggregation: 'sum',
        window: '5m',
        percentile: 0.95,
      },
    })
    render(<QueryEditor builderMode />)
    fireEvent.click(screen.getByRole('button', { name: 'Run' }))
    await waitFor(() => expect(runQuery).toHaveBeenCalled())
    await waitFor(() =>
      expect(useStore.getState().tabs[0].sqlVisualization).toMatchObject({
        xColumn: 'timestamp',
        valueColumn: 'value',
        seriesColumn: null,
        seriesColumns: ['continent', 'service'],
      }),
    )
  })

  it('formats PromQL through the Prometheus API without executing it', async () => {
    formatQuery.mockResolvedValue(
      'sum by (status) (rate(http_requests_total{service="api"}[5m]))',
    )
    renderPromql('sum by(status)(rate(http_requests_total{service="api"}[5m]))')
    fireEvent.click(screen.getByRole('button', { name: 'Format' }))
    await waitFor(() =>
      expect(useStore.getState().tabs[0].sql).toBe(
        'sum by (status) (rate(http_requests_total{service="api"}[5m]))',
      ),
    )
    expect(formatQuery).toHaveBeenCalledWith(
      'prom-1',
      'sum by(status)(rate(http_requests_total{service="api"}[5m]))',
    )
    expect(runQuery).not.toHaveBeenCalled()
    expect(notify).toHaveBeenCalledWith({
      message: 'Formatted',
      duration: 2600,
    })
  })

  it('keeps PromQL formatting available while disconnected and without a Grafana datasource', async () => {
    resetTestStore({
      profiles: [
        {
          id: 'prom-1',
          name: 'Metrics',
          kind: 'prometheus',
          version: 1,
          readonly: true,
          transport: { kind: 'gcx' },
        },
      ],
    })
    patchActiveTestSession({
      connectionProfileId: 'prom-1',
      queryMode: 'sql',
      sql: 'sum(rate(http_requests_total[5m]))',
    })
    formatQuery.mockResolvedValue('sum(\n  rate(http_requests_total[5m])\n)')
    render(<QueryEditor />)

    const format = screen.getByRole('button', { name: 'Format' })
    expect(format.hasAttribute('disabled')).toBe(false)
    fireEvent.click(format)

    await waitFor(() =>
      expect(formatQuery).toHaveBeenCalledWith(
        'prom-1',
        'sum(rate(http_requests_total[5m]))',
      ),
    )
    expect(notify).toHaveBeenCalledWith({
      message: 'Formatted',
      duration: 2600,
    })
  })

  it('preserves PromQL when formatting fails and ignores duplicate clicks', async () => {
    const request = deferred<string>()
    formatQuery.mockReturnValue(request.promise)
    renderPromql('sum(')
    fireEvent.click(screen.getByRole('button', { name: 'Format' }))
    fireEvent.click(screen.getByRole('button', { name: 'Formatting…' }))
    expect(formatQuery).toHaveBeenCalledTimes(1)
    request.reject(new Error('bad_data: parse error'))
    await waitFor(() =>
      expect(notify).toHaveBeenCalledWith({
        message: 'bad_data: parse error',
        duration: 3200,
      }),
    )
    expect(useStore.getState().tabs[0].sql).toBe('sum(')
    expect(runQuery).not.toHaveBeenCalled()
  })

  it('disables Format for whitespace and runs the selected range and Resolution from keyboard', async () => {
    renderPromql('   ')
    expect(
      screen.getByRole('button', { name: 'Format' }).hasAttribute('disabled'),
    ).toBe(true)
    fireEvent.change(screen.getByLabelText('PromQL editor'), {
      target: { value: 'up' },
    })
    useStore.getState().setPrometheusQueryOptions({
      prometheusTimeRange: {
        kind: 'custom',
        startDate: '2026-08-10',
        startTime: '12:00',
        endDate: '2026-08-11',
        endTime: '13:30',
        recurringWindows: [],
      },
      prometheusStep: '5m',
    })
    runQuery.mockResolvedValue({
      columns: [],
      rows: [],
      rowCount: 0,
      durationMs: 1,
    })
    fireEvent.keyDown(screen.getByLabelText('PromQL editor'), {
      key: 'Enter',
      ctrlKey: true,
    })
    await waitFor(() => expect(runQuery).toHaveBeenCalled())
    expect(runQuery.mock.calls[0][3]).toEqual({
      start: '2026-08-10T12:00:00.000Z',
      end: '2026-08-11T13:30:00.000Z',
      step: '5m',
    })
  })
})
afterEach(() => {
  cleanup()
  resetTestStore()
})

describe('QueryEditor Explain loading states', () => {
  it('records sanitized provenance only after a PostgreSQL datasource rejection', async () => {
    resetTestStore({
      profiles: [
        {
          kind: 'postgres',
          version: 2,
          id: 'pg',
          name: 'PG',
          host: 'localhost',
          port: 5432,
          database: 'db',
          user: 'user',
          password: '',
          tlsMode: 'disable',
          readonly: true,
        },
      ],
    })
    const sql = 'SELECT device_id FROM orders'
    patchActiveTestSession({ connectionProfileId: 'pg', sql, queryMode: 'sql' })
    runQuery.mockRejectedValue(
      new QueryExecutionError(
        'query',
        'ERROR: column orders.device_id does not exist password=hunter2 /Users/alice/private.sql',
      ),
    )
    render(<QueryEditor />)
    fireEvent.click(screen.getByRole('button', { name: 'Run' }))
    await waitFor(() =>
      expect(activeTestSession().queryError).toContain('hunter2'),
    )
    expect(activeTestSession().repairableQueryError?.query).toBe(sql)
    expect(activeTestSession().repairableQueryError?.error).not.toMatch(
      /hunter2|\/Users\/alice/,
    )
  })
  it('records sanitized repair provenance for a BigQuery query failure', async () => {
    resetTestStore({
      profiles: [
        {
          kind: 'bigquery',
          version: 1,
          id: 'bq',
          name: 'BQ',
          billingProject: 'billing',
          maximumBytesBilled: '',
          readonly: true,
        },
      ],
    })
    const sql = 'SELECT revenu FROM `my-project.analytics.orders`'
    patchActiveTestSession({ connectionProfileId: 'bq', sql, queryMode: 'sql' })
    runQuery.mockRejectedValue(
      new QueryExecutionError(
        'query',
        'Unrecognized name: revenu at [1:8] token=secret /Users/alice/.config/gcloud/application_default_credentials.json',
      ),
    )
    render(<QueryEditor />)
    fireEvent.click(screen.getByRole('button', { name: 'Run' }))
    await waitFor(() =>
      expect(activeTestSession().queryError).toContain('Unrecognized name'),
    )
    expect(activeTestSession().repairableQueryError?.query).toBe(sql)
    expect(activeTestSession().repairableQueryError?.error).not.toMatch(
      /secret|\/Users\/alice/,
    )
  })

  it('does not record repair provenance for a classified connection failure', async () => {
    resetTestStore({
      profiles: [
        {
          kind: 'postgres',
          version: 2,
          id: 'pg',
          name: 'PG',
          host: 'localhost',
          port: 5432,
          database: 'db',
          user: 'user',
          password: '',
          tlsMode: 'disable',
          readonly: true,
        },
      ],
    })
    patchActiveTestSession({
      connectionProfileId: 'pg',
      sql: 'SELECT device_id FROM orders',
      queryMode: 'sql',
    })
    runQuery.mockRejectedValue(
      new QueryExecutionError('connection', 'opaque reconnect failure'),
    )
    render(<QueryEditor />)
    fireEvent.click(screen.getByRole('button', { name: 'Run' }))
    await waitFor(() =>
      expect(activeTestSession().queryError).toBe('opaque reconnect failure'),
    )
    expect(activeTestSession().repairableQueryError).toBeNull()
  })
  it('does not offer AI repair for a local read-only validation failure', async () => {
    aiSettingsGet.mockResolvedValue({
      ok: true,
      value: {
        provider: 'openrouter',
        model: 'vendor/model',
        hasApiKey: true,
      },
    })
    resetTestStore({
      profiles: [
        {
          kind: 'postgres',
          version: 2,
          id: 'pg',
          name: 'PG',
          host: 'localhost',
          port: 5432,
          database: 'db',
          user: 'user',
          password: '',
          tlsMode: 'disable',
          readonly: true,
        },
      ],
    })
    const sql = 'DELETE FROM orders'
    patchActiveTestSession({ connectionProfileId: 'pg', sql, queryMode: 'sql' })
    runQuery.mockRejectedValue(
      new QueryExecutionError(
        'validation',
        'Connection is read-only, so "DELETE" is not allowed.',
      ),
    )

    render(<QueryEditor />)
    fireEvent.click(screen.getByRole('button', { name: 'Run' }))

    await waitFor(() =>
      expect(activeTestSession().queryError).toMatch(/read-only.*DELETE/i),
    )
    expect(activeTestSession().repairableQueryError).toBeNull()
    expect(screen.queryByRole('button', { name: 'Fix with AI' })).toBeNull()
  })
  it('follows datasource capabilities when the active tab changes', () => {
    resetTestStore({
      profiles: [
        {
          kind: 'postgres',
          version: 2,
          id: 'pg',
          name: 'PG',
          host: 'localhost',
          port: 5432,
          database: 'db',
          user: 'user',
          password: '',
          tlsMode: 'disable',
          readonly: true,
        },
        {
          kind: 'bigquery',
          version: 1,
          id: 'bq',
          name: 'BQ',
          billingProject: 'billing',
          maximumBytesBilled: '',
          readonly: true,
        },
      ],
    })
    patchActiveTestSession({ connectionProfileId: 'bq', sql: 'select 1' })
    const view = render(<QueryEditor />)
    expect(screen.queryByRole('button', { name: 'Explain' })).toBeNull()
    expect(screen.queryByRole('textbox', { name: 'AI prompt' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Explain Analyze' })).toBeNull()
    useStore.setState((state) => ({
      tabs: state.tabs.map((tab) => ({ ...tab, connectionProfileId: 'pg' })),
    }))
    view.rerender(<QueryEditor />)
    expect(screen.getByRole('button', { name: 'Explain' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Explain Analyze' })).toBeTruthy()
    expect(screen.queryByRole('textbox', { name: 'AI prompt' })).toBeNull()
    view.rerender(<QueryEditor builderMode />)
    expect(screen.queryByRole('textbox', { name: 'AI prompt' })).toBeNull()
    expect(explain).not.toHaveBeenCalled()
  })
  const configuredAi = () =>
    aiSettingsGet.mockResolvedValue({
      ok: true,
      value: {
        provider: 'openrouter',
        model: 'vendor/model',
        hasApiKey: true,
      },
    })

  const sqlAiProfiles: DataSourceProfile[] = [
    {
      kind: 'postgres',
      version: 2,
      id: 'pg',
      name: 'PG',
      host: 'localhost',
      port: 5432,
      database: 'db',
      user: 'user',
      password: '',
      tlsMode: 'disable',
      readonly: true,
    },
    {
      kind: 'local-files',
      version: 1,
      id: 'local',
      name: 'Local',
      files: [
        {
          path: '/Users/example/private/customer-data.csv',
          alias: 'customer_data',
        },
      ],
      readonly: true,
    },
    {
      kind: 'sqlite-file',
      version: 1,
      id: 'sqlite',
      name: 'SQLite',
      path: '/Users/example/private/app.sqlite',
      readonly: true,
    },
    {
      kind: 'bigquery',
      version: 1,
      id: 'bq',
      name: 'BigQuery',
      billingProject: 'billing-project',
      defaultProject: 'my-project',
      defaultDataset: 'analytics',
      maximumBytesBilled: '',
      readonly: true,
    },
  ]

  it.each(sqlAiProfiles)(
    'shows the raw SQL AI composer for configured $kind connections',
    async (profile) => {
      configuredAi()
      resetTestStore({
        profiles: [profile],
      })
      patchActiveTestSession({
        connectionProfileId: profile.id,
        queryMode: 'sql',
        sql: 'select 1',
      })
      render(<QueryEditor />)
      expect(
        await screen.findByRole('textbox', { name: 'AI prompt' }),
      ).toBeTruthy()
    },
  )

  it('hides the raw SQL AI composer when no connection is selected', async () => {
    const settings = deferred<{
      ok: true
      value: {
        provider: 'openrouter'
        model: string
        hasApiKey: boolean
      }
    }>()
    aiSettingsGet.mockReturnValue(settings.promise)
    resetTestStore({
      profiles: [],
    })
    patchActiveTestSession({
      connectionProfileId: null,
      queryMode: 'sql',
      sql: 'select 1',
    })

    render(<QueryEditor />)

    await act(async () => {
      settings.resolve({
        ok: true,
        value: {
          provider: 'openrouter',
          model: 'vendor/model',
          hasApiKey: true,
        },
      })
      await settings.promise
    })
    expect(screen.queryByRole('textbox', { name: 'AI prompt' })).toBeNull()
  })

  it.each([
    {
      kind: 'prometheus',
      version: 1,
      id: 'prom',
      name: 'Prometheus',
      readonly: true,
      transport: { kind: 'gcx' },
    },
    {
      kind: 'loki',
      version: 1,
      id: 'loki',
      name: 'Loki',
      readonly: true,
      transport: { kind: 'gcx' },
    },
    {
      kind: 'tempo',
      version: 1,
      id: 'tempo',
      name: 'Tempo',
      readonly: true,
      transport: { kind: 'gcx' },
    },
  ] satisfies DataSourceProfile[])(
    'hides the raw SQL AI composer for $kind',
    (profile) => {
      configuredAi()
      resetTestStore({
        profiles: [profile],
      })
      patchActiveTestSession({
        connectionProfileId: profile.id,
        queryMode: 'sql',
        sql: 'query',
      })
      render(<QueryEditor />)
      expect(screen.queryByRole('textbox', { name: 'AI prompt' })).toBeNull()
    },
  )

  it.each([
    {
      profile: sqlAiProfiles.find((item) => item.kind === 'local-files')!,
      schema: 'main',
      relation: 'customer_data',
      dialect: 'duckdb',
      label: 'DuckDB · OpenRouter',
    },
    {
      profile: sqlAiProfiles.find((item) => item.kind === 'sqlite-file')!,
      schema: 'sqlite',
      relation: 'orders',
      dialect: 'duckdb',
      label: 'DuckDB · OpenRouter',
    },
    {
      profile: sqlAiProfiles.find((item) => item.kind === 'bigquery')!,
      schema: 'my-project.analytics',
      relation: 'orders',
      dialect: 'google-sql',
      label: 'GoogleSQL · OpenRouter',
    },
  ] as const)(
    'submits $dialect context for $profile.kind without leaking profile paths or auto-running',
    async ({ profile, schema, relation, dialect, label }) => {
      configuredAi()
      aiPropose.mockResolvedValue({
        ok: true,
        value: {
          kind: 'proposal',
          proposal: {
            query: `SELECT count(*) FROM ${schema}.${relation}`,
            explanation: 'Count rows.',
            assumptions: [],
          },
        },
      })
      resetTestStore({
        profiles: [profile],
        metadataByProfileId: {
          [profile.id]: {
            schemas: [
              {
                name: schema,
                isSystem: false,
                relations: [
                  {
                    schema,
                    name: relation,
                    kind: 'r',
                    qualifiedName: `${schema}.${relation}`,
                    columnsStatus: 'loaded',
                    columns: [{ name: 'id', dataTypeName: 'INTEGER' }],
                  },
                ],
              },
            ],
            status: 'loaded',
            error: null,
            isStale: false,
          },
        },
      })
      patchActiveTestSession({
        connectionProfileId: profile.id,
        queryMode: 'sql',
        sql: `SELECT * FROM ${schema}.${relation}`,
      })
      render(<QueryEditor />)

      const prompt = await screen.findByRole('textbox', { name: 'AI prompt' })
      fireEvent.change(prompt, { target: { value: 'count rows' } })
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Ask' })).not.toHaveProperty(
          'disabled',
          true,
        ),
      )
      fireEvent.click(screen.getByRole('button', { name: 'Ask' }))
      await waitFor(() => expect(aiPropose).toHaveBeenCalledTimes(1))

      const submitted = aiPropose.mock.calls[0][0]
      expect(submitted.context.language).toEqual({ kind: 'sql', dialect })
      expect(JSON.stringify(submitted)).not.toMatch(
        /\/Users\/example\/private|customer-data\.csv|app\.sqlite/,
      )
      expect(runQuery).not.toHaveBeenCalled()

      await screen.findByRole('region', { name: 'SQL proposal diff' })
      fireEvent.click(screen.getByRole('button', { name: 'View AI details' }))
      expect(await screen.findByText(label)).toBeTruthy()

      fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
      expect(runQuery).not.toHaveBeenCalled()
    },
  )

  it('discovers DuckDB metadata through one bounded expansion', async () => {
    configuredAi()
    const baseProfile = sqlAiProfiles.find(
      (item) => item.kind === 'local-files',
    )!
    const profile = {
      ...baseProfile,
      credential: 'private-profile-credential',
    } as DataSourceProfile
    const schema = 'main'
    const discoveredRelation = 'zz_orders'
    const initialRelations = Array.from(
      { length: AI_LIMITS.initialRelations },
      (_, index) => ({
        schema,
        name: `aa_relation_${index}`,
        kind: 'r' as const,
        qualifiedName: `${schema}.aa_relation_${index}`,
        columnsStatus: 'loaded' as const,
        columns: [{ name: 'id', dataTypeName: 'INTEGER' }],
      }),
    )
    const proposalSql = `SELECT order_id FROM ${schema}.${discoveredRelation}`

    describeTable.mockResolvedValue(
      Array.from({ length: AI_LIMITS.columnsPerRelation + 5 }, (_, index) => ({
        name: index === 0 ? 'order_id' : `column_${index}`,
        dataTypeName: 'BIGINT',
      })),
    )
    aiPropose
      .mockResolvedValueOnce({
        ok: true,
        value: {
          kind: 'context-request',
          request: {
            searchTerms: ['orders'],
            reason: 'Need the orders relation.',
          },
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        value: {
          kind: 'proposal',
          proposal: {
            query: proposalSql,
            explanation: 'Use the discovered orders relation.',
            assumptions: [],
          },
        },
      })

    resetTestStore({
      profiles: [profile],
      metadataByProfileId: {
        [profile.id]: {
          schemas: [
            {
              name: schema,
              isSystem: false,
              relations: [
                ...initialRelations,
                {
                  schema,
                  name: discoveredRelation,
                  kind: 'r',
                  qualifiedName: `${schema}.${discoveredRelation}`,
                  columnsStatus: 'idle',
                },
              ],
            },
          ],
          status: 'loaded',
          error: null,
          isStale: false,
        },
      },
    })
    patchActiveTestSession({
      connectionProfileId: profile.id,
      queryMode: 'sql',
      sql: 'SELECT 1',
      result: {
        columns: [],
        rows: [{ secret: 'private-result-row' }],
        rowCount: 1,
        durationMs: 1,
      },
    })
    render(<QueryEditor />)

    const prompt = await screen.findByRole('textbox', { name: 'AI prompt' })
    fireEvent.change(prompt, {
      target: { value: 'summarize the available data' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Ask' }))

    await waitFor(() => expect(aiPropose).toHaveBeenCalledTimes(2))
    const first = aiPropose.mock.calls[0][0]
    const second = aiPropose.mock.calls[1][0]

    expect(first.context.language).toEqual({ kind: 'sql', dialect: 'duckdb' })
    expect(second.context.language).toEqual({ kind: 'sql', dialect: 'duckdb' })
    expect(first.context.relations).toHaveLength(AI_LIMITS.initialRelations)
    expect(
      first.context.relations.some(
        (relation: { name: string }) => relation.name === discoveredRelation,
      ),
    ).toBe(false)
    expect(second.context.relations).toHaveLength(
      first.context.relations.length + 1,
    )
    const discovered = second.context.relations.find(
      (relation: { name: string }) => relation.name === discoveredRelation,
    )
    expect(discovered).toBeTruthy()
    expect(discovered.columns).toHaveLength(AI_LIMITS.columnsPerRelation)
    expect(second.context.relations.length).toBeLessThanOrEqual(
      AI_LIMITS.relations,
    )
    expect(
      second.context.relations.flatMap(
        (relation: { columns: unknown[] }) => relation.columns,
      ),
    ).toHaveLength(initialRelations.length + AI_LIMITS.columnsPerRelation)
    expect(
      second.context.relations.flatMap(
        (relation: { columns: unknown[] }) => relation.columns,
      ).length,
    ).toBeLessThanOrEqual(AI_LIMITS.columns)
    expect(JSON.stringify(first.context).length).toBeLessThanOrEqual(
      AI_LIMITS.initialContextCharacters,
    )
    expect(JSON.stringify(second.context).length).toBeLessThanOrEqual(
      AI_LIMITS.contextCharacters,
    )
    expect(describeTable).toHaveBeenCalledTimes(1)
    expect(describeTable).toHaveBeenCalledWith(
      profile.id,
      schema,
      discoveredRelation,
    )
    const submitted = JSON.stringify(
      aiPropose.mock.calls.map(([request]) => request),
    )
    expect(submitted).not.toMatch(
      /\/Users\/example\/private|private-profile-credential|private-result-row/,
    )
    expect(activeTestSession().sql).toBe('SELECT 1')
    expect(runQuery).not.toHaveBeenCalled()

    await screen.findByRole('region', { name: 'SQL proposal diff' })
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
    await waitFor(() => expect(activeTestSession().sql).toBe(proposalSql))
    expect(runQuery).not.toHaveBeenCalled()
  })

  it('discovers BigQuery metadata from a names-only catalog without requiring the table name in the prompt', async () => {
    configuredAi()
    const baseProfile = sqlAiProfiles.find((item) => item.kind === 'bigquery')!
    const profile = {
      ...baseProfile,
      credential: 'private-bigquery-credential',
    } as DataSourceProfile
    const schema = 'my-project.analytics'
    const discoveredRelation = 'order_facts'
    const naturalPrompt = 'show monthly revenue by country'
    const proposalSql =
      'SELECT country, SUM(revenue) AS revenue FROM `my-project.analytics.order_facts` GROUP BY country'
    const initialRelations = Array.from(
      { length: AI_LIMITS.initialRelations + 4 },
      (_, index) => ({
        schema,
        name: `aa_relation_${index}`,
        kind: 'r' as const,
        qualifiedName: `${schema}.aa_relation_${index}`,
        columnsStatus: 'loaded' as const,
        columns: [{ name: 'id', dataTypeName: 'INT64' }],
      }),
    )

    describeTable.mockResolvedValue([
      { name: 'country', dataTypeName: 'STRING' },
      { name: 'revenue', dataTypeName: 'NUMERIC' },
      { name: 'created_at', dataTypeName: 'TIMESTAMP' },
    ])
    aiPropose
      .mockResolvedValueOnce({
        ok: true,
        value: {
          kind: 'context-request',
          request: {
            searchTerms: [discoveredRelation],
            reason: 'Need the relation containing revenue facts.',
          },
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        value: {
          kind: 'proposal',
          proposal: {
            query: proposalSql,
            explanation: 'Aggregate revenue by country.',
            assumptions: [],
          },
        },
      })

    resetTestStore({
      profiles: [profile],
      metadataByProfileId: {
        [profile.id]: {
          schemas: [
            {
              name: schema,
              isSystem: false,
              relations: [
                ...initialRelations,
                {
                  schema,
                  name: discoveredRelation,
                  kind: 'r',
                  qualifiedName: `${schema}.${discoveredRelation}`,
                  columnsStatus: 'idle',
                },
              ],
            },
          ],
          status: 'loaded',
          error: null,
          isStale: false,
        },
      },
    })
    patchActiveTestSession({
      connectionProfileId: profile.id,
      queryMode: 'sql',
      sql: 'SELECT 1',
      result: {
        columns: [],
        rows: [{ secret: 'private-result-row' }],
        rowCount: 1,
        durationMs: 1,
      },
    })
    render(<QueryEditor />)

    const prompt = await screen.findByRole('textbox', { name: 'AI prompt' })
    fireEvent.change(prompt, { target: { value: naturalPrompt } })
    fireEvent.click(screen.getByRole('button', { name: 'Ask' }))

    await waitFor(() => expect(aiPropose).toHaveBeenCalledTimes(2))
    const first = aiPropose.mock.calls[0][0]
    const second = aiPropose.mock.calls[1][0]

    expect(first.prompt).toBe(naturalPrompt)
    expect(first.prompt).not.toContain(discoveredRelation)
    expect(first.context.language).toEqual({
      kind: 'sql',
      dialect: 'google-sql',
    })
    expect(second.context.language).toEqual({
      kind: 'sql',
      dialect: 'google-sql',
    })
    expect(
      first.context.relations.some(
        (relation: { name: string }) => relation.name === discoveredRelation,
      ),
    ).toBe(false)
    expect(
      first.context.availableRelations.some(
        (relation: { name: string }) => relation.name === discoveredRelation,
      ),
    ).toBe(true)
    expect(first.context.availableRelations.length).toBeLessThanOrEqual(
      AI_LIMITS.relationCatalog,
    )
    expect(
      JSON.stringify(first.context.availableRelations).length,
    ).toBeLessThanOrEqual(AI_LIMITS.relationCatalogCharacters)
    expect(
      first.context.availableRelations.every(
        (relation: Record<string, unknown>) =>
          Object.keys(relation).sort().join(',') === 'name,schema',
      ),
    ).toBe(true)

    const discovered = second.context.relations.find(
      (relation: { name: string }) => relation.name === discoveredRelation,
    )
    expect(discovered?.columns).toEqual([
      { name: 'country', dataType: 'STRING' },
      { name: 'revenue', dataType: 'NUMERIC' },
      { name: 'created_at', dataType: 'TIMESTAMP' },
    ])
    expect(second.context.relations.length).toBeLessThanOrEqual(
      AI_LIMITS.relations,
    )
    expect(
      second.context.relations.flatMap(
        (relation: { columns: unknown[] }) => relation.columns,
      ).length,
    ).toBeLessThanOrEqual(AI_LIMITS.columns)
    expect(JSON.stringify(second.context).length).toBeLessThanOrEqual(
      AI_LIMITS.contextCharacters,
    )
    expect(describeTable).toHaveBeenCalledTimes(1)
    expect(describeTable).toHaveBeenCalledWith(
      profile.id,
      schema,
      discoveredRelation,
    )
    const submitted = JSON.stringify(
      aiPropose.mock.calls.map(([request]) => request),
    )
    expect(submitted).not.toMatch(
      /billing-project|private-bigquery-credential|private-result-row/,
    )

    expect(activeTestSession().sql).toBe('SELECT 1')
    expect(runQuery).not.toHaveBeenCalled()
    await screen.findByRole('region', { name: 'SQL proposal diff' })
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
    await waitFor(() => expect(activeTestSession().sql).toBe(proposalSql))
    expect(runQuery).not.toHaveBeenCalled()
  })

  it('keeps SQL formatting local', async () => {
    renderExplainUi()
    fireEvent.change(screen.getByLabelText('SQL editor'), {
      target: { value: 'select 1 from users' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Format' }))
    await waitFor(() =>
      expect(useStore.getState().tabs[0].sql).toContain('SELECT'),
    )
    expect(formatQuery).not.toHaveBeenCalled()
    expect(notify).toHaveBeenCalledWith({
      message: 'Formatted',
      duration: 2600,
    })
  })
  it('keeps SQL Explain actions and does not expose Prometheus Resolution', () => {
    renderExplainUi()
    expect(screen.getByRole('button', { name: 'Explain' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Explain Analyze' })).toBeTruthy()
    expect(screen.queryByRole('combobox', { name: /Resolution:/ })).toBeNull()
  })
  it.each([
    ['Explain', 'success'],
    ['Explain', 'failure'],
    ['Explain Analyze', 'success'],
    ['Explain Analyze', 'failure'],
  ] as const)(
    'blocks Reset during %s and restores it after %s',
    async (action, outcome) => {
      const request = deferred<{ text: string }>()
      explain.mockReturnValueOnce(request.promise)
      renderExplainUi()
      const reset = screen.getByRole('button', { name: 'Reset query' })
      expect(reset.hasAttribute('disabled')).toBe(false)

      fireEvent.click(screen.getByRole('button', { name: action }))
      await waitFor(() => expect(explain).toHaveBeenCalledTimes(1))
      expect(activeTestSession().running).toBe(true)
      expect(reset.hasAttribute('disabled')).toBe(true)
      fireEvent.click(reset)
      expect(screen.queryByRole('dialog')).toBeNull()
      expect(activeTestSession().sql).toBe('select 1;')
      expect(activeTestSession().explainText).toBe('previous plan')

      if (outcome === 'success') request.resolve({ text: 'new plan' })
      else request.reject(new Error('explain failed'))
      await waitFor(() => expect(reset.hasAttribute('disabled')).toBe(false))
      fireEvent.click(reset)
      fireEvent.click(screen.getByRole('button', { name: 'Reset exploration' }))
      expect(activeTestSession().sql).toBe('')
      expect(activeTestSession().explainText).toBeNull()
      expect(activeTestSession().showExplain).toBe(false)
    },
  )

  it('shows Explaining, disables both buttons, preserves the previous plan, and ends after success', async () => {
    const request = deferred<{ text: string }>()
    explain.mockReturnValueOnce(request.promise)
    renderExplainUi()

    fireEvent.click(screen.getByRole('button', { name: 'Explain' }))

    expect(
      screen
        .getByRole('button', { name: 'Explaining…' })
        .getAttribute('aria-busy'),
    ).toBe('true')
    expect(
      screen
        .getByRole('button', { name: 'Explain Analyze' })
        .hasAttribute('disabled'),
    ).toBe(true)
    expect(
      screen.getByTestId('explain-loading-overlay').getAttribute('aria-live'),
    ).toBe('polite')
    expect(screen.getByText('previous plan')).toBeTruthy()
    expect(screen.getByLabelText('SQL editor')).toHaveProperty('disabled', true)

    fireEvent.click(screen.getByRole('button', { name: 'Explaining…' }))
    await waitFor(() => expect(explain).toHaveBeenCalledTimes(1))
    expect(explain).toHaveBeenCalledWith('profile-1', 'select 1;', false)

    request.resolve({ text: 'new plan' })
    await waitFor(() =>
      expect(
        screen
          .getByRole('button', { name: 'Explain' })
          .hasAttribute('disabled'),
      ).toBe(false),
    )
    expect(screen.getByText('new plan')).toBeTruthy()
    expect(screen.queryByText('Generating query plan…')).toBeNull()
  })

  it('keeps plan-level PostgreSQL timings with the captured Explain snapshot', async () => {
    explain.mockResolvedValueOnce({
      text: 'analyzed plan',
      tree: {
        id: '0',
        plan: 'Seq Scan · public.events',
        nodeType: 'Seq Scan',
        relation: 'events',
        schema: 'public',
        planRows: 100,
        actualRows: 120,
        actualTotalTime: 3.2,
        loops: 1,
      },
      analyze: true,
      planningTimeMs: 0.6,
      executionTimeMs: 3.8,
    })
    renderExplainUi()

    fireEvent.click(screen.getByRole('button', { name: 'Explain Analyze' }))

    await waitFor(() =>
      expect(activeTestSession().explainSnapshot).toMatchObject({
        query: 'select 1;',
        mode: 'analyze',
        planningTimeMs: 0.6,
        executionTimeMs: 3.8,
      }),
    )
    const summary = screen.getByLabelText('Plan summary').textContent
    expect(summary).toContain('Planning')
    expect(summary).toContain('0.60 ms')
    expect(summary).toContain('Execution')
    expect(summary).toContain('3.80 ms')
  })

  it('shows Analyzing, sends analyze=true, and ends after failure through existing error text', async () => {
    const request = deferred<{ text: string }>()
    explain.mockReturnValueOnce(request.promise)
    renderExplainUi()

    fireEvent.click(screen.getByRole('button', { name: 'Explain Analyze' }))

    expect(
      screen
        .getByRole('button', { name: 'Analyzing…' })
        .getAttribute('aria-busy'),
    ).toBe('true')
    expect(
      screen.getByRole('button', { name: 'Explain' }).hasAttribute('disabled'),
    ).toBe(true)
    expect(
      screen.getByTestId('explain-loading-overlay').getAttribute('aria-live'),
    ).toBe('polite')
    await waitFor(() =>
      expect(explain).toHaveBeenCalledWith('profile-1', 'select 1;', true),
    )

    request.reject(new Error('explain failed'))
    await waitFor(() =>
      expect(
        screen
          .getByRole('button', { name: 'Explain Analyze' })
          .hasAttribute('disabled'),
      ).toBe(false),
    )
    expect(screen.getByText('explain failed')).toBeTruthy()
    expect(screen.queryByText('Running EXPLAIN ANALYZE…')).toBeNull()
  })

  it('keeps toolbar button widths stable with explicit minimum widths', () => {
    renderExplainUi()
    expect(screen.getByRole('button', { name: 'Explain' }).className).toContain(
      'explain-action',
    )
    expect(
      screen.getByRole('button', { name: 'Explain Analyze' }).className,
    ).toContain('analyze')
  })
})

describe('profile-scoped query ownership', () => {
  it('keeps an in-flight query on A when the user switches to B', async () => {
    resetTestStore({
      profiles: [
        {
          kind: 'postgres',
          version: 2,
          id: 'profile-a',
          name: 'A',
          host: 'localhost',
          port: 5432,
          database: 'a',
          user: 'reader',
          password: '',
          tlsMode: 'disable',
          readonly: true,
        },
        {
          kind: 'postgres',
          version: 2,
          id: 'profile-b',
          name: 'B',
          host: 'localhost',
          port: 5432,
          database: 'b',
          user: 'reader',
          password: '',
          tlsMode: 'disable',
          readonly: true,
        },
      ],
      connectionStateByProfileId: {
        'profile-a': {
          status: 'connected',
          generation: 3,
          error: null,
          serverVersion: '16-a',
        },
        'profile-b': {
          status: 'connected',
          generation: 3,
          error: null,
          serverVersion: '16-b',
        },
      },
    })
    patchActiveTestSession({
      connectionProfileId: 'profile-a',
      sql: 'select A',
    })
    const tabA = activeTestSession().id
    const tabB = useStore.getState().createTab()
    useStore.setState((state) => ({
      activeTabId: tabA,
      tabs: state.tabs.map((tab) =>
        tab.id === tabB
          ? { ...tab, connectionProfileId: 'profile-b', sql: 'select B' }
          : tab,
      ),
    }))
    const pending = deferred<{
      columns: []
      rows: [{ source: string }]
      rowCount: number
      durationMs: number
    }>()
    runQuery.mockReturnValueOnce(pending.promise)

    render(<QueryEditor />)
    fireEvent.click(screen.getByRole('button', { name: 'Run' }))
    await waitFor(() => expect(runQuery).toHaveBeenCalledTimes(1))
    expect(runQuery.mock.calls[0][0]).toBe('profile-a')

    act(() => useStore.setState({ activeTabId: tabB }))
    pending.resolve({
      columns: [],
      rows: [{ source: 'A' }],
      rowCount: 1,
      durationMs: 1,
    })
    await waitFor(() =>
      expect(
        useStore.getState().tabs.find((tab) => tab.id === tabA)?.result?.rows,
      ).toEqual([{ source: 'A' }]),
    )
    expect(
      useStore.getState().tabs.find((tab) => tab.id === tabB)?.result,
    ).toBeNull()
    expect(useStore.getState().connectionStateByProfileId).toMatchObject({
      'profile-a': { status: 'connected', generation: 3 },
      'profile-b': { status: 'connected', generation: 3 },
    })
  })
})

describe('Fix with AI editor review', () => {
  const failed = 'SELECT device_id FROM public.orders'
  const fixed = 'SELECT id AS device_id FROM public.orders'
  const edited = 'SELECT id AS device_id, country FROM public.orders'
  const safeError =
    'ERROR: column orders.device_id does not exist LINE 1 Position: 8 SQLSTATE 42703'

  function renderRepairEditor() {
    aiSettingsGet.mockResolvedValue({
      ok: true,
      value: {
        provider: 'openrouter',
        model: 'vendor/model',
        hasApiKey: true,
      },
    })
    aiPropose.mockResolvedValue({
      ok: true,
      value: {
        kind: 'proposal',
        proposal: {
          query: fixed,
          explanation: 'Use the available id column.',
          assumptions: [],
        },
      },
    })
    resetTestStore({
      profiles: [
        {
          kind: 'postgres',
          version: 2,
          id: 'pg',
          name: 'PG',
          host: 'localhost',
          port: 5432,
          database: 'db',
          user: 'user',
          password: '',
          tlsMode: 'disable',
          readonly: true,
        },
      ],
      metadataByProfileId: {
        pg: {
          schemas: [
            {
              name: 'public',
              isSystem: false,
              relations: [
                {
                  schema: 'public',
                  name: 'orders',
                  kind: 'r',
                  qualifiedName: 'public.orders',
                  columnsStatus: 'loaded',
                  columns: [
                    { name: 'id', dataTypeName: 'uuid' },
                    { name: 'country', dataTypeName: 'text' },
                  ],
                },
              ],
            },
          ],
          status: 'loaded',
          error: null,
          isStale: false,
        },
      },
    })
    patchActiveTestSession({
      connectionProfileId: 'pg',
      queryMode: 'sql',
      sql: failed,
      queryError: safeError,
      repairableQueryError: { query: failed, error: safeError },
    })
    return render(
      <AiQueryRepairProvider>
        <QueryEditor />
        <AiQueryRepair />
      </AiQueryRepairProvider>,
    )
  }

  async function proposeRepair() {
    fireEvent.click(await screen.findByRole('button', { name: 'Fix with AI' }))
    await screen.findByRole('region', { name: 'SQL proposal diff' })
  }

  it.each([
    {
      kind: 'local-files',
      version: 1,
      id: 'local-repair',
      name: 'Local',
      files: [{ path: '/tmp/orders.csv', alias: 'orders' }],
      readonly: true,
    },
    {
      kind: 'sqlite-file',
      version: 1,
      id: 'sqlite-repair',
      name: 'SQLite',
      path: '/tmp/orders.sqlite',
      readonly: true,
    },
    {
      kind: 'bigquery',
      version: 1,
      id: 'bq-repair',
      name: 'BigQuery',
      billingProject: 'billing',
      maximumBytesBilled: '',
      readonly: true,
    },
  ] satisfies DataSourceProfile[])(
    'shows Fix with AI for raw $kind SQL failures',
    async (profile) => {
      aiSettingsGet.mockResolvedValue({
        ok: true,
        value: {
          provider: 'openrouter',
          model: 'vendor/model',
          hasApiKey: true,
        },
      })
      resetTestStore({
        profiles: [profile],
      })
      patchActiveTestSession({
        connectionProfileId: profile.id,
        queryMode: 'sql',
        sql: failed,
        queryError: safeError,
        repairableQueryError: { query: failed, error: safeError },
      })
      render(
        <AiQueryRepairProvider>
          <QueryEditor />
          <AiQueryRepair />
        </AiQueryRepairProvider>,
      )

      expect(
        await screen.findByRole('textbox', { name: 'AI prompt' }),
      ).toBeTruthy()
      expect(
        await screen.findByRole('button', { name: 'Fix with AI' }),
      ).toBeTruthy()
    },
  )

  it('reviews the repair as a diff and only replaces editor SQL on Apply', async () => {
    renderRepairEditor()
    await proposeRepair()

    const editor = screen.getByLabelText('SQL editor') as HTMLTextAreaElement
    expect(editor.value).toBe(failed)
    expect(activeTestSession().sql).toBe(failed)
    expect(
      screen.getByRole('region', { name: 'AI query repair review' }),
    ).toBeTruthy()
    expect(
      screen.getByRole('region', { name: 'SQL proposal diff' }),
    ).toBeTruthy()
    expect(screen.getByText('Proposed changes')).toBeTruthy()
    expect(screen.queryByRole('textbox', { name: 'AI prompt' })).toBeNull()
    expect(
      (screen.getByRole('button', { name: 'Run' }) as HTMLButtonElement)
        .disabled,
    ).toBe(false)

    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))

    await waitFor(() => expect(activeTestSession().sql).toBe(fixed))
    expect(activeTestSession().repairableQueryError).toBeNull()
    expect(
      (screen.getByLabelText('SQL editor') as HTMLTextAreaElement).value,
    ).toBe(fixed)
    expect(
      screen.queryByRole('region', { name: 'AI query repair review' }),
    ).toBeNull()
    expect(runQuery).not.toHaveBeenCalled()
  })

  it('Reject discards the proposal and keeps the failed SQL', async () => {
    renderRepairEditor()
    await proposeRepair()

    fireEvent.click(screen.getByRole('button', { name: 'Reject' }))

    expect(activeTestSession().sql).toBe(failed)
    expect(
      (screen.getByLabelText('SQL editor') as HTMLTextAreaElement).value,
    ).toBe(failed)
    expect(activeTestSession().repairableQueryError).toEqual({
      query: failed,
      error: safeError,
    })
    expect(
      screen.queryByRole('region', { name: 'AI query repair review' }),
    ).toBeNull()
    expect(screen.getByRole('button', { name: 'Fix with AI' })).toBeTruthy()
    expect(runQuery).not.toHaveBeenCalled()
  })

  it('Try again keeps the previous diff visible while pending and replaces it on success', async () => {
    renderRepairEditor()
    await proposeRepair()

    const retry = deferred<{
      ok: true
      value: {
        kind: 'proposal'
        proposal: {
          query: string
          explanation: string
          assumptions: string[]
        }
      }
    }>()
    aiPropose.mockReturnValueOnce(retry.promise)
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))

    await waitFor(() => expect(aiPropose).toHaveBeenCalledTimes(2))
    expect(aiPropose.mock.calls[1][0].currentQuery).toBe(failed)
    expect(
      (screen.getByLabelText('SQL editor') as HTMLTextAreaElement).value,
    ).toBe(failed)
    expect(
      screen.getByRole('region', { name: 'SQL proposal diff' }).textContent,
    ).toContain(fixed)
    expect(
      (screen.getByRole('button', { name: 'Apply' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true)

    const replacement = 'SELECT id AS device_id, amount FROM public.orders'
    retry.resolve({
      ok: true,
      value: {
        kind: 'proposal',
        proposal: {
          query: replacement,
          explanation: 'Use id and keep amount.',
          assumptions: [],
        },
      },
    })

    await waitFor(() =>
      expect(
        screen.getByRole('region', { name: 'SQL proposal diff' }).textContent,
      ).toContain(replacement),
    )
    expect(activeTestSession().sql).toBe(failed)
    expect(
      (screen.getByLabelText('SQL editor') as HTMLTextAreaElement).value,
    ).toBe(failed)
  })

  it('Cancel during Try again keeps the previous diff available', async () => {
    renderRepairEditor()
    await proposeRepair()

    const retry = deferred<{
      ok: true
      value: {
        kind: 'proposal'
        proposal: {
          query: string
          explanation: string
          assumptions: string[]
        }
      }
    }>()
    aiPropose.mockReturnValueOnce(retry.promise)
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))

    await waitFor(() => expect(aiPropose).toHaveBeenCalledTimes(2))
    const review = screen.getByRole('region', {
      name: 'AI query repair review',
    })
    fireEvent.click(within(review).getByRole('button', { name: 'Cancel' }))

    await waitFor(() =>
      expect(
        (screen.getByRole('button', { name: 'Apply' }) as HTMLButtonElement)
          .disabled,
      ).toBe(false),
    )
    expect(
      screen.getByRole('region', { name: 'SQL proposal diff' }).textContent,
    ).toContain(fixed)
    expect(activeTestSession().sql).toBe(failed)
    expect(aiCancel).toHaveBeenCalledTimes(1)
  })

  it('retry failure preserves the previous valid diff', async () => {
    renderRepairEditor()
    await proposeRepair()

    aiPropose.mockResolvedValueOnce({
      ok: false,
      code: 'invalid-response',
      message: 'invalid query step',
    })
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))

    await screen.findByText(/AI couldn't produce a usable repair this time/)
    expect(
      screen.getByRole('region', { name: 'SQL proposal diff' }).textContent,
    ).toContain(fixed)
    expect(activeTestSession().sql).toBe(failed)
    expect(
      (screen.getByRole('button', { name: 'Apply' }) as HTMLButtonElement)
        .disabled,
    ).toBe(false)
  })

  it('restores Fix with AI when edited SQL fails again after a stale review', async () => {
    renderRepairEditor()
    await proposeRepair()

    const editor = screen.getByLabelText('SQL editor') as HTMLTextAreaElement
    fireEvent.change(editor, { target: { value: edited } })

    await screen.findByText(/The failed SQL, tab, or connection changed/)
    expect(screen.queryByRole('button', { name: 'Fix with AI' })).toBeNull()

    const nextError =
      'ERROR: column orders.country does not exist LINE 1 Position: 25 SQLSTATE 42703'
    useStore
      .getState()
      .completeQuery(null, nextError, activeTestSession().id, edited)

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Fix with AI' })).toBeTruthy(),
    )
    expect(
      screen.queryByRole('region', { name: 'AI query repair review' }),
    ).toBeNull()
    expect(activeTestSession().repairableQueryError).toEqual({
      query: edited,
      error: nextError,
    })
  })

  it('keeps a changed SQL editor authoritative and marks the repair stale', async () => {
    renderRepairEditor()
    await proposeRepair()

    const editor = screen.getByLabelText('SQL editor') as HTMLTextAreaElement
    fireEvent.change(editor, { target: { value: edited } })

    await screen.findByText(/The failed SQL, tab, or connection changed/)
    expect(editor.value).toBe(edited)
    expect(activeTestSession().sql).toBe(edited)
    expect(
      screen.getByRole('region', { name: 'SQL proposal diff' }),
    ).toBeTruthy()
    expect(
      (screen.getByRole('button', { name: 'Apply' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true)
    expect(
      (screen.getByRole('button', { name: 'Try again' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true)
  })
})

// #371: retain the real editor/store ownership logic and remount on tab switch,
// matching App's keyed main shell. Only the provider transport/editor is mocked.
describe.each([
  'postgres',
  'bigquery',
  'local-files',
  'sqlite-file',
  'prometheus',
] as const)('#371 %s query lifecycle', (kind) => {
  function setup(mode: 'sql' | 'builder' = 'sql') {
    const base = { id: 'audit-profile', name: 'Audit', readonly: true as const }
    const profile: DataSourceProfile =
      kind === 'postgres'
        ? {
            ...base,
            kind,
            version: 2,
            host: 'localhost',
            port: 5432,
            database: 'db',
            user: 'reader',
            password: '',
            tlsMode: 'disable',
          }
        : kind === 'bigquery'
          ? {
              ...base,
              kind,
              version: 1,
              billingProject: 'billing',
              defaultProject: 'project',
              defaultDataset: 'dataset',
              maximumBytesBilled: '',
            }
          : kind === 'local-files'
            ? {
                ...base,
                kind,
                version: 1,
                files: [{ path: '/tmp/audit.csv', alias: 'audit' }],
              }
            : kind === 'sqlite-file'
              ? { ...base, kind, version: 1, path: '/tmp/audit.sqlite' }
              : {
                  ...base,
                  kind,
                  version: 1,
                  transport: { kind: 'gcx', datasourceUid: 'prom' },
                }
    resetTestStore({
      profiles: [profile],
      connectionStateByProfileId: {
        [profile.id]: {
          status: 'connected',
          generation: 1,
          error: null,
          serverVersion: null,
        },
      },
      tabs: ['A', 'B'].map((id, i) =>
        createQuerySession(i + 1, {
          id,
          connectionProfileId: profile.id,
          queryMode: mode,
          sql: kind === 'prometheus' ? 'up' : 'select 1',
        }),
      ),
      activeTabId: 'A',
    })
    if (mode === 'builder') {
      setActiveTestMetadata(
        [
          {
            name: 'public',
            isSystem: false,
            relations: [
              {
                name: 'events',
                schema: 'public',
                kind: 'r',
                qualifiedName: 'public.events',
                columnsStatus: 'loaded',
                columns: [{ name: 'created_at', dataTypeName: 'timestamp' }],
              },
            ],
          },
        ],
        'loaded',
        null,
        profile.id,
      )
      patchActiveTestSession({
        builder: {
          ...activeTestSession().builder,
          table: { schema: 'public', name: 'events' },
          timeColumn: 'created_at',
          timeBucket: 'hour',
        },
        builderVisualization: {
          ...activeTestSession().builderVisualization,
          xColumn: 'created_at',
          aggregation: 'count',
        },
      })
    }
    function Workspace() {
      const id = useStore((state) => state.activeTabId)
      const mode = useStore(
        (state) => state.tabs.find((tab) => tab.id === id)?.queryMode,
      )
      return (
        <>
          <QueryTabs />
          {mode === 'builder' && kind !== 'prometheus' ? (
            <BuilderPanel key={id} />
          ) : (
            <QueryEditor key={id} />
          )}
        </>
      )
    }
    render(<Workspace />)
  }
  const session = (id: string) =>
    useStore.getState().tabs.find((tab) => tab.id === id)
  const response = {
    columns: [],
    rows: [{ owner: 'A' }],
    rowCount: 1,
    durationMs: 1,
  }
  async function start(pending: ReturnType<typeof deferred<typeof response>>) {
    runQuery.mockReturnValueOnce(pending.promise)
    fireEvent.click(screen.getByRole('button', { name: 'Run' }))
    await waitFor(() => expect(session('A')?.running).toBe(true))
  }

  it.each(['resolve', 'reject'] as const)(
    'delivers background %s to A after workspace remount',
    async (outcome) => {
      setup()
      const pending = deferred<typeof response>()
      await start(pending)
      act(() => useStore.setState({ activeTabId: 'B' }))
      expect(session('A')?.running).toBe(true)
      expect(screen.getAllByLabelText('Query running')).toHaveLength(1)
      await act(async () => {
        if (outcome === 'resolve') pending.resolve(response)
        else pending.reject(new Error('A failed'))
        await pending.promise.catch(() => {})
      })
      await waitFor(() => expect(session('A')?.running).toBe(false))
      expect(
        outcome === 'resolve' ? session('A')?.result : session('A')?.queryError,
      ).toEqual(outcome === 'resolve' ? response : 'A failed')
      expect(session('B')?.result).toBeNull()
      expect(session('B')?.queryError).toBeNull()
    },
  )

  it('finishes A/B independently in reverse order', async () => {
    setup()
    const a = deferred<typeof response>(),
      b = deferred<typeof response>()
    await start(a)
    act(() => useStore.setState({ activeTabId: 'B' }))
    runQuery.mockReturnValueOnce(b.promise)
    fireEvent.click(screen.getByRole('button', { name: 'Run' }))
    await waitFor(() => expect(session('B')?.running).toBe(true))
    await act(async () => {
      b.resolve({ ...response, rows: [{ owner: 'B' }] })
      await b.promise
    })
    await waitFor(() => expect(session('B')?.running).toBe(false))
    expect(session('A')?.running).toBe(true)
    await act(async () => {
      a.resolve(response)
      await a.promise
    })
    await waitFor(() => expect(session('A')?.running).toBe(false))
    expect(session('B')?.result?.rows).toEqual([{ owner: 'B' }])
  })

  it.each(['close', 'rebind', 'generation'] as const)(
    'rejects stale completion after %s',
    async (change) => {
      setup()
      const pending = deferred<typeof response>()
      await start(pending)
      act(() => {
        useStore.setState({ activeTabId: 'B' })
        if (change === 'close') useStore.getState().closeTab('A')
        else if (change === 'rebind') bindTabConnection('A', null)
        else
          useStore.setState((state) => ({
            connectionStateByProfileId: {
              ...state.connectionStateByProfileId,
              'audit-profile': {
                status: 'connected',
                generation: 2,
                error: null,
                serverVersion: null,
              },
            },
          }))
      })
      await act(async () => {
        pending.resolve(response)
        await pending.promise
      })
      expect(session('A')?.result ?? null).toBeNull()
      expect(session('B')?.result).toBeNull()
      if (change === 'close') expect(session('A')).toBeUndefined()
      if (change === 'rebind') expect(session('A')?.running).toBe(false)
      // Generation-only replacement rejects results, but does not abandon running.
      // The expected-failure case below specifies the required cleanup separately.
    },
  )

  it.each(['resolve', 'reject'] as const)(
    'guards same-instance obsolete %s without clearing newer work',
    async (outcome) => {
      setup()
      const old = deferred<typeof response>(),
        newer = deferred<typeof response>()
      await start(old)
      runQuery.mockReturnValueOnce(newer.promise)
      fireEvent.keyDown(
        screen.getByLabelText(
          kind === 'prometheus' ? 'PromQL editor' : 'SQL editor',
        ),
        { key: 'Enter', ctrlKey: true },
      )
      await waitFor(() => expect(runQuery).toHaveBeenCalledTimes(2))
      await act(async () => {
        if (outcome === 'resolve') old.resolve(response)
        else old.reject(new Error('obsolete'))
        await old.promise.catch(() => {})
      })
      expect(session('A')?.running).toBe(true)
      expect(session('A')?.result).toBeNull()
      expect(session('A')?.queryError).toBeNull()
      await act(async () => {
        newer.resolve({ ...response, rows: [{ owner: 'newer' }] })
        await newer.promise
      })
      await waitFor(() => expect(session('A')?.running).toBe(false))
      expect(session('A')?.result?.rows).toEqual([{ owner: 'newer' }])
    },
  )

  it('keeps A pending when unrelated profile B fails', async () => {
    setup()
    const pending = deferred<typeof response>()
    await start(pending)
    act(() => {
      bindTabConnection('B', 'other-profile')
      useStore.getState().applyConnectionEvent({
        profileId: 'other-profile',
        generation: 1,
        state: 'failed',
        message: 'B failed',
        expected: false,
        code: null,
        timestamp: 1,
        recoverable: true,
      })
    })
    expect(session('A')?.running).toBe(true)
    await act(async () => {
      pending.resolve(response)
      await pending.promise
    })
    await waitFor(() => expect(session('A')?.running).toBe(false))
    expect(session('A')?.result).toEqual(response)
    expect(session('B')?.result).toBeNull()
  })

  it.each(['resolve', 'reject'] as const)(
    'rejects old %s after A remounts and starts newer work',
    async (outcome) => {
      setup()
      const old = deferred<typeof response>(),
        newer = deferred<typeof response>()
      await start(old)
      act(() => useStore.setState({ activeTabId: 'B' }))
      act(() => useStore.setState({ activeTabId: 'A' }))
      // Keyboard execution exposes overlap even though the Run button is disabled.
      runQuery.mockReturnValueOnce(newer.promise)
      fireEvent.keyDown(
        screen.getByLabelText(
          kind === 'prometheus' ? 'PromQL editor' : 'SQL editor',
        ),
        { key: 'Enter', ctrlKey: true },
      )
      await waitFor(() => expect(runQuery).toHaveBeenCalledTimes(2))
      await act(async () => {
        if (outcome === 'resolve') old.resolve(response)
        else old.reject(new Error('obsolete failure'))
        await old.promise.catch(() => {})
      })
      // Settle every deferred request before asserting the captured stale state.
      const pendingAfterOld = session('A')?.running
      const oldResult = session('A')?.result
      const oldError = session('A')?.queryError
      await act(async () => {
        newer.resolve({ ...response, rows: [{ owner: 'newer' }] })
        await newer.promise
      })
      expect(pendingAfterOld).toBe(true)
      expect(oldResult).toBeNull()
      expect(oldError).toBeNull()
    },
  )

  it('abandons pending state when only the connection generation is replaced', async () => {
    setup()
    const pending = deferred<typeof response>()
    await start(pending)
    act(() =>
      useStore.setState((state) => ({
        connectionStateByProfileId: {
          ...state.connectionStateByProfileId,
          'audit-profile': {
            status: 'connected',
            generation: 2,
            error: null,
            serverVersion: null,
          },
        },
      })),
    )
    await act(async () => {
      pending.resolve(response)
      await pending.promise
    })
    expect(session('A')?.running).toBe(false)
  })
  it.each(['rebind-back', 'reset', 'clear', 'preset', 'generation'] as const)(
    'keeps newer Run pending after %s and late rejection',
    async (change) => {
      setup()
      const old = deferred<typeof response>(),
        newer = deferred<typeof response>()
      await start(old)
      act(() => {
        if (change === 'rebind-back') {
          bindTabConnection('A', null)
          bindTabConnection('A', 'audit-profile')
        } else if (change === 'reset') useStore.getState().resetActiveQuery()
        else if (change === 'clear') useStore.getState().clearActiveResults()
        else if (change === 'preset')
          useStore
            .getState()
            .commitLoadedPreset(
              createQuerySession(1, { queryMode: 'sql' }),
              'A',
            )
        else
          useStore.setState((state) => ({
            connectionStateByProfileId: {
              ...state.connectionStateByProfileId,
              'audit-profile': {
                ...state.connectionStateByProfileId['audit-profile'],
                generation: 2,
              },
            },
          }))
        useStore
          .getState()
          .setSql(kind === 'prometheus' ? 'up' : 'select 2', 'A')
      })
      await start(newer)
      await act(async () => {
        old.reject(new Error('obsolete'))
        await old.promise.catch(() => {})
      })
      expect(session('A')?.running).toBe(true)
      expect(session('A')?.queryError).toBeNull()
      expect(session('A')?.result).toBeNull()
      await act(async () => {
        newer.resolve(response)
        await newer.promise
      })
      expect(session('A')?.running).toBe(false)
      expect(session('A')?.result).toEqual(response)
    },
  )

  if (kind === 'prometheus')
    it('does not apply stale visualization defaults', async () => {
      setup()
      const old = deferred<typeof response>(),
        newer = deferred<typeof response>()
      await start(old)
      act(() => useStore.setState({ activeTabId: 'B' }))
      act(() => useStore.setState({ activeTabId: 'A' }))
      runQuery.mockReturnValueOnce(newer.promise)
      fireEvent.keyDown(screen.getByLabelText('PromQL editor'), {
        key: 'Enter',
        ctrlKey: true,
      })
      await waitFor(() => expect(runQuery).toHaveBeenCalledTimes(2))
      act(() =>
        useStore
          .getState()
          .setVisualization(
            'sql',
            { view: 'bar', xColumn: 'chosen', aggregation: 'average' },
            'A',
          ),
      )
      const chosen = session('A')?.sqlVisualization
      await act(async () => {
        old.resolve(response)
        await old.promise
      })
      expect(session('A')?.sqlVisualization).toEqual(chosen)
      await act(async () => {
        newer.resolve(response)
        await newer.promise
      })
    })

  if (kind !== 'prometheus')
    it.each([
      ['builder', 'builder'],
      ['builder', 'sql'],
      ['sql', 'builder'],
    ] as const)(
      'shares primary ownership after remount and %s → %s transition',
      async (from, mode) => {
        setup('builder')
        if (from === 'sql')
          act(() => useStore.getState().setQueryMode('sql', 'A'))
        const old = deferred<typeof response>(),
          newer = deferred<typeof response>()
        await start(old)
        act(() => useStore.setState({ activeTabId: 'B' }))
        act(() => useStore.setState({ activeTabId: 'A' }))
        act(() => useStore.getState().setQueryMode(mode, 'A'))
        runQuery.mockReturnValueOnce(newer.promise)
        fireEvent.keyDown(
          mode === 'sql'
            ? screen.getByLabelText('SQL editor')
            : document.querySelector('[data-builder-panel]')!,
          { key: 'Enter', ctrlKey: true },
        )
        await waitFor(() => expect(runQuery).toHaveBeenCalledTimes(2))
        await act(async () => {
          old.resolve(response)
          await old.promise
        })
        expect(session('A')?.running).toBe(true)
        expect(session('A')?.result).toBeNull()
        await act(async () => {
          newer.resolve({ ...response, rows: [{ owner: 'newer' }] })
          await newer.promise
        })
        expect(session('A')?.running).toBe(false)
        expect(session('A')?.result?.rows).toEqual([{ owner: 'newer' }])
      },
    )
  it.each(['reset', 'rebind-back', 'generation'] as const)(
    'revalidates ownership after the connection await across %s',
    async (change) => {
      setup()
      const pending = deferred<typeof response>()
      runQuery.mockReturnValueOnce(pending.promise)
      fireEvent.click(screen.getByRole('button', { name: 'Run' }))
      act(() => {
        if (change === 'reset') useStore.getState().resetActiveQuery()
        else if (change === 'rebind-back') {
          bindTabConnection('A', null)
          bindTabConnection('A', 'audit-profile')
        } else
          useStore.setState((state) => ({
            connectionStateByProfileId: {
              ...state.connectionStateByProfileId,
              'audit-profile': {
                ...state.connectionStateByProfileId['audit-profile'],
                generation: 2,
              },
            },
          }))
      })
      await act(async () => {
        await Promise.resolve()
      })
      expect(runQuery).not.toHaveBeenCalled()
      act(() =>
        useStore
          .getState()
          .setSql(kind === 'prometheus' ? 'up' : 'select 2', 'A'),
      )
      fireEvent.click(screen.getByRole('button', { name: 'Run' }))
      await waitFor(() => expect(runQuery).toHaveBeenCalledTimes(1))
      await act(async () => {
        pending.resolve(response)
        await pending.promise
      })
      expect(session('A')?.running).toBe(false)
      expect(session('A')?.result).toEqual(response)
    },
  )
})

describe('#371 PostgreSQL Explain lifecycle', () => {
  function setup() {
    renderExplainUi()
    return activeTestSession().id
  }
  it.each(['Explain', 'Explain Analyze'])(
    'delivers background %s after editor unmount',
    async (action) => {
      const id = setup(),
        pending = deferred<{ text: string }>()
      explain.mockReturnValueOnce(pending.promise)
      fireEvent.click(screen.getByRole('button', { name: action }))
      await waitFor(() => expect(explain).toHaveBeenCalledTimes(1))
      cleanup()
      act(() => useStore.getState().createTab())
      await act(async () => {
        pending.resolve({ text: 'A plan' })
        await pending.promise
      })
      expect(
        useStore.getState().tabs.find((tab) => tab.id === id)?.explainText,
      ).toBe('A plan')
      expect(activeTestSession().explainText).toBeNull()
      expect(
        useStore.getState().tabs.find((tab) => tab.id === id)
          ?.activeExplainRequest,
      ).toBeNull()
    },
  )
  it.each(['Explain', 'Explain Analyze'])(
    'represents pending %s in tab.running',
    async (action) => {
      setup()
      const pending = deferred<{ text: string }>()
      explain.mockReturnValueOnce(pending.promise)
      fireEvent.click(screen.getByRole('button', { name: action }))
      await waitFor(() => expect(explain).toHaveBeenCalledTimes(1))
      const wasRunning = activeTestSession().running
      await act(async () => {
        pending.resolve({ text: 'plan' })
        await pending.promise
      })
      expect(wasRunning).toBe(true)
    },
  )
  it.each(['Run', 'Explain'] as const)(
    'preserves the other pending slot when %s completes first',
    async (first) => {
      setup()
      const primary = deferred<{
        columns: never[]
        rows: never[]
        rowCount: number
        durationMs: number
      }>()
      const plan = deferred<{ text: string }>()
      runQuery.mockReturnValueOnce(primary.promise)
      explain.mockReturnValueOnce(plan.promise)
      fireEvent.click(screen.getByRole('button', { name: 'Explain' }))
      await waitFor(() => expect(explain).toHaveBeenCalledTimes(1))
      // Run remains supported while Explain is pending, including the keyboard path.
      fireEvent.keyDown(screen.getByLabelText('SQL editor'), {
        key: 'Enter',
        ctrlKey: true,
      })
      await waitFor(() => expect(runQuery).toHaveBeenCalledTimes(1))
      expect(activeTestSession().pendingQueryOperations).toHaveLength(2)
      await act(async () => {
        if (first === 'Run') {
          primary.resolve({ columns: [], rows: [], rowCount: 0, durationMs: 1 })
          await primary.promise
        } else {
          plan.resolve({ text: 'plan' })
          await plan.promise
        }
      })
      expect(activeTestSession().running).toBe(true)
      expect(activeTestSession().activeExplainRequest).toBe(
        first === 'Run' ? 'explain' : null,
      )
      await act(async () => {
        if (first === 'Run') {
          plan.resolve({ text: 'plan' })
          await plan.promise
        } else {
          primary.resolve({ columns: [], rows: [], rowCount: 0, durationMs: 1 })
          await primary.promise
        }
      })
      expect(activeTestSession().running).toBe(false)
      expect(activeTestSession().explainText).toBe('plan')
      expect(activeTestSession().result).not.toBeNull()
    },
  )

  it.each(['reset', 'rebind', 'generation', 'failure'] as const)(
    'guards a newer Explain after %s against old success and rejection',
    async (change) => {
      for (const outcome of ['resolve', 'reject']) {
        const id = setup()
        const old = deferred<{ text: string }>(),
          newer = deferred<{ text: string }>()
        explain.mockReturnValueOnce(old.promise)
        fireEvent.click(screen.getByRole('button', { name: 'Explain' }))
        await waitFor(() =>
          expect(activeTestSession().activeExplainRequest).toBe('explain'),
        )
        act(() => {
          if (change === 'reset') useStore.getState().resetActiveQuery()
          else if (change === 'rebind') {
            bindTabConnection(id, null)
            bindTabConnection(id, 'profile-1')
          } else if (change === 'failure') {
            useStore.getState().applyConnectionEvent({
              profileId: 'profile-1',
              generation: 1,
              state: 'disconnected',
              expected: true,
              message: 'Disconnected for test',
              code: null,
              timestamp: 1,
              recoverable: true,
            })
          } else
            useStore.setState((state) => ({
              connectionStateByProfileId: {
                ...state.connectionStateByProfileId,
                'profile-1': {
                  ...state.connectionStateByProfileId['profile-1'],
                  generation: 2,
                },
              },
            }))
          useStore.setState((state) => ({
            connectionStateByProfileId: {
              ...state.connectionStateByProfileId,
              'profile-1': {
                ...state.connectionStateByProfileId['profile-1'],
                status: 'connected',
                error: null,
              },
            },
          }))
          useStore.getState().setSql('select 2', id)
        })
        explain.mockReturnValueOnce(newer.promise)
        fireEvent.click(screen.getByRole('button', { name: 'Explain Analyze' }))
        await waitFor(() =>
          expect(activeTestSession().activeExplainRequest).toBe('analyze'),
        )
        await act(async () => {
          if (outcome === 'resolve') old.resolve({ text: 'obsolete plan' })
          else old.reject(new Error('obsolete plan error'))
          await old.promise.catch(() => {})
        })
        expect(activeTestSession().activeExplainRequest).toBe('analyze')
        expect(activeTestSession().running).toBe(true)
        expect(activeTestSession().explainText).not.toBe('obsolete plan')
        expect(activeTestSession().explainText).not.toBe('obsolete plan error')
        await act(async () => {
          newer.resolve({ text: 'current plan' })
          await newer.promise
        })
        expect(activeTestSession().explainText).toBe('current plan')
        expect(activeTestSession().explainSnapshot?.query).toBe('select 2')
        expect(activeTestSession().running).toBe(false)
        cleanup()
        explain.mockClear()
      }
    },
  )
})
