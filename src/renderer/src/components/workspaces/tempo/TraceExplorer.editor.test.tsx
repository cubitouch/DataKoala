// @vitest-environment jsdom
import React from 'react'
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { notify } = vi.hoisted(() => ({ notify: vi.fn() }))
const copyTextToClipboard = vi.hoisted(() => vi.fn())
vi.mock('@lib/clipboardText', () => ({ copyTextToClipboard }))
vi.mock('@components/ui/feedback/NotificationArea', () => ({ notify }))
vi.mock('@lib/api', () => ({
  api: {
    tempoPerformanceEnabled: false,
    connections: {
      tempo: {
        attributes: vi.fn().mockResolvedValue([]),
        attributeValues: vi.fn().mockResolvedValue([]),
      },
    },
    query: { run: vi.fn() },
  },
}))
vi.mock('@codemirror/theme-one-dark', () => ({ oneDark: {} }))
vi.mock('@uiw/react-codemirror', () => ({
  default: React.forwardRef(function MockCodeMirror(
    {
      value,
      onChange,
      ...props
    }: {
      value: string
      onChange: (value: string) => void
      'aria-label'?: string
    },
    _ref,
  ) {
    return (
      <textarea
        aria-label={props['aria-label']}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    )
  }),
}))
vi.mock('@components/builder/tempo/TraceBuilderPanel', () => ({
  TraceBuilderPanel: ({
    value,
    traceql,
    onOpenTraceql,
    onChange,
  }: {
    value: {
      service: string
      advancedFilters: Array<{
        attribute: string
        scope: 'resource' | 'span'
        mode: 'include'
        values: string[]
      }>
    }
    traceql: string
    onOpenTraceql: () => void
    onChange: (patch: { advancedFilters: unknown[] }) => void
  }) => (
    <div data-testid="trace-builder">
      Builder remains available<output>{traceql}</output>
      <span data-testid="builder-service">{value.service}</span>
      <span data-testid="selected-facets">
        {value.advancedFilters
          .map((filter) => `${filter.attribute}:${filter.values.join(',')}`)
          .join('|')}
      </span>
      <button
        type="button"
        onClick={() =>
          onChange({
            advancedFilters: [
              {
                attribute: 'resource.cloud.region',
                scope: 'resource',
                mode: 'include',
                values: ['eu-west-1', 'eu-west-3'],
              },
            ],
          })
        }
      >
        Add facet
      </button>
      <button
        type="button"
        onClick={() =>
          onChange({
            advancedFilters: [
              {
                attribute: 'resource.a',
                scope: 'resource',
                mode: 'include',
                values: [],
              },
              {
                attribute: 'span.b',
                scope: 'span',
                mode: 'include',
                values: [],
              },
            ],
          })
        }
      >
        Select A and B
      </button>
      <button
        type="button"
        onClick={() =>
          onChange({
            advancedFilters: value.advancedFilters.map((filter) =>
              filter.attribute === 'resource.a'
                ? { ...filter, values: ['one'] }
                : filter,
            ),
          })
        }
      >
        Set A
      </button>
      <button
        type="button"
        onClick={() =>
          onChange({
            advancedFilters: value.advancedFilters.map((filter) =>
              filter.attribute === 'span.b'
                ? { ...filter, values: ['two'] }
                : filter,
            ),
          })
        }
      >
        Set B
      </button>
      <button type="button" onClick={onOpenTraceql}>
        Open in TraceQL mode
      </button>
    </div>
  ),
}))
vi.mock('@components/results/traces/TraceScatterChart', () => ({
  TraceScatterChart: ({
    onSelectRange,
    option,
  }: {
    onSelectRange: (range: { startMs: number; endMs: number }) => void
    option: { series: Array<{ data: Array<{ traceId: string }> }> }
  }) => (
    <div>
      <output data-testid="scatter-traces">
        {option.series
          .flatMap((series) => series.data.map((point) => point.traceId))
          .join(',')}
      </output>
      {[
        ['Refine scatter range', '10:00:00', '10:30:00'],
        ['Sub-minute interval', '10:00:00.123', '10:00:10.789'],
        ['Smaller interval', '10:05:00', '10:15:00'],
        ['Different interval', '10:30:00', '11:00:00'],
      ].map(([label, from, to]) => (
        <button
          key={label}
          type="button"
          onClick={() =>
            onSelectRange({
              startMs: Date.parse(`2026-08-30T${from}Z`),
              endMs: Date.parse(`2026-08-30T${to}Z`),
            })
          }
        >
          {label}
        </button>
      ))}
    </div>
  ),
}))

import { TraceExplorer } from './TraceExplorer'
import {
  activeTestSession,
  patchActiveTestSession,
  resetTestStore,
} from '@test/sessionTestUtils'
import { useStore } from '@store/useStore'
import { formatTraceql } from '@lib/formatTraceql'
import { buildTraceql, traceBuilderFromTraceql } from '@lib/traceBuilder'
import { api } from '@lib/api'
import { createPresetFromSession } from '@lib/explorationPresets'
import { explorationPresetRepository } from '@lib/explorationPresetRepository'

describe('TraceExplorer TraceQL editor', () => {
  beforeEach(() => {
    window.localStorage.clear()
    resetTestStore({
      connectionStateByProfileId: {
        'tempo-1': {
          status: 'connected',
          generation: 7,
          error: null,
          serverVersion: null,
        },
      },
    })
    const traceql = '{resource.service.name="checkout"}'
    patchActiveTestSession({
      connectionProfileId: 'tempo-1',
      queryMode: 'sql',
      sql: traceql,
      tempoBuilder: traceBuilderFromTraceql(traceql),
    })
    useStore.setState({
      profiles: [
        {
          id: 'tempo-1',
          name: 'Tempo',
          kind: 'tempo',
          version: 1,
          readonly: true,
          transport: {
            kind: 'gcx',
            context: 'test',
            datasourceUid: 'tempo-main',
          },
          grafana: {
            baseUrl: 'https://grafana.example',
            datasourceType: 'tempo',
          },
        },
      ],
    })
    notify.mockReset()
    copyTextToClipboard.mockReset()
    vi.mocked(api.query.run).mockReset()
  })
  afterEach(cleanup)

  it('edits and locally formats Plain mode through CodeMirror', async () => {
    expect(formatTraceql('{duration>300ms}')).toEqual({
      ok: true,
      query: '{ duration > 300ms }',
    })
    render(<TraceExplorer connectionId="tempo-1" />)
    expect(screen.getAllByText('Trace ID')).toHaveLength(1)
    expect(screen.getAllByLabelText('Query mode')[0].textContent).toBe(
      'TraceQLBuilder',
    )
    expect(
      screen
        .getByRole('button', { name: 'Run' })
        .hasAttribute('data-tempo-run-query'),
    ).toBe(true)
    const editor = screen.getByLabelText('TraceQL editor')
    expect(editor.tagName).toBe('TEXTAREA') // CodeMirror is represented by the focused test double.
    expect((editor as HTMLTextAreaElement).value).toBe(
      '{resource.service.name="checkout"}',
    )
    expect(document.querySelector('#traceql-query')).toBeNull()
    fireEvent.change(editor, { target: { value: '{duration>300ms}' } })
    await waitFor(() =>
      expect(activeTestSession().sql).toBe('{duration>300ms}'),
    )
    expect(activeTestSession().tempoBuilder.service).toBe('checkout')
    fireEvent.click(screen.getByRole('button', { name: 'Format' }))
    await waitFor(() =>
      expect(activeTestSession().sql).toBe('{ duration > 300ms }'),
    )
    expect(activeTestSession().tempoBuilder.service).toBe('checkout')
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Formatted' }),
    )
  })

  it('keeps Builder mode free of the Format action', () => {
    patchActiveTestSession({ queryMode: 'builder' })
    render(<TraceExplorer connectionId="tempo-1" />)
    expect(screen.getByTestId('trace-builder')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Format' })).toBeNull()
    expect(screen.queryByLabelText('TraceQL editor')).toBeNull()
  })

  it('disables and guards Tempo execution while metadata refreshes', () => {
    useStore.setState({
      metadataByProfileId: {
        'tempo-1': {
          schemas: [],
          status: 'loaded',
          error: null,
          isStale: false,
          refreshing: true,
        },
      },
    })
    render(<TraceExplorer connectionId="tempo-1" />)
    const run = screen.getByRole('button', { name: 'Run' }) as HTMLButtonElement
    expect(run.disabled).toBe(true)
    fireEvent.submit(run.closest('form')!)
    expect(api.query.run).not.toHaveBeenCalled()
  })

  it('executes, copies, hands off, and opens the formatted Builder TraceQL without mutating raw TraceQL', async () => {
    const manualTraceql = '{ resource.service.name = "manual-do-not-run" }'
    patchActiveTestSession({
      queryMode: 'builder',
      sql: manualTraceql,
      tempoBuilder: traceBuilderFromTraceql(''),
    })
    vi.mocked(api.query.run).mockResolvedValue({
      columns: [
        {
          name: 'traceId',
          dataTypeID: 0,
          dataTypeName: 'text',
          logicalType: 'string',
        },
      ],
      rows: [],
      rowCount: 0,
      durationMs: 1,
    })
    render(<TraceExplorer connectionId="tempo-1" />)

    const generated = buildTraceql(traceBuilderFromTraceql(''))
    const formatted = formatTraceql(generated)
    const expected = formatted.ok ? formatted.query : generated
    expect(
      screen.getByTestId('trace-builder').querySelector('output')?.textContent,
    ).toBe(expected)
    const copy = screen.getByRole('button', {
      name: 'Copy TraceQL to clipboard',
    }) as HTMLButtonElement
    expect(copy.disabled).toBe(false)
    fireEvent.click(copy)
    await waitFor(() =>
      expect(copyTextToClipboard).toHaveBeenCalledWith(expected),
    )
    expect(activeTestSession().sql).toBe(manualTraceql)

    fireEvent.click(screen.getByRole('button', { name: 'Run' }))
    await waitFor(() => expect(api.query.run).toHaveBeenCalled())
    expect(vi.mocked(api.query.run).mock.calls[0]?.[1]).toBe(expected)
    expect(activeTestSession().sql).toBe(manualTraceql)

    fireEvent.click(screen.getByRole('button', { name: 'Grafana handoff' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Copy Grafana link' }))
    const pane = JSON.parse(
      new URL(copyTextToClipboard.mock.calls.at(-1)![0]).searchParams.get(
        'panes',
      )!,
    )
    expect(pane.datakoala.queries[0].query).toBe(expected)
    expect(activeTestSession().sql).toBe(manualTraceql)

    fireEvent.click(
      screen.getByRole('button', { name: 'Open in TraceQL mode' }),
    )
    await waitFor(() => expect(activeTestSession().queryMode).toBe('sql'))
    expect(activeTestSession().sql).toBe(expected)
  })

  it('formats generated TraceQL after Builder edits without changing raw TraceQL', async () => {
    const manualTraceql = '{ resource.service.name = "manual-query" }'
    patchActiveTestSession({
      queryMode: 'builder',
      sql: manualTraceql,
      tempoBuilder: traceBuilderFromTraceql('{ }'),
    })
    render(<TraceExplorer connectionId="tempo-1" />)
    fireEvent.click(screen.getByRole('button', { name: 'Add facet' }))
    const generated =
      '{ (resource.cloud.region = "eu-west-1" || resource.cloud.region = "eu-west-3") && span:duration > 300ms }'
    const expected = formatTraceql(generated)
    expect(expected.ok).toBe(true)
    if (!expected.ok) return
    expect(expected.query).not.toBe(generated)
    await waitFor(() =>
      expect(
        screen.getByTestId('trace-builder').querySelector('output')
          ?.textContent,
      ).toBe(expected.query),
    )
    expect(activeTestSession().sql).toBe(manualTraceql)
    expect(notify).not.toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Formatted' }),
    )
  })

  it('preserves incomplete selected facets while other facet values change', async () => {
    const manualTraceql = '{ resource.service.name = "manual-query" }'
    patchActiveTestSession({
      queryMode: 'builder',
      sql: manualTraceql,
      tempoBuilder: traceBuilderFromTraceql('{ }'),
    })
    render(<TraceExplorer connectionId="tempo-1" />)
    fireEvent.click(screen.getByRole('button', { name: 'Select A and B' }))
    expect(screen.getByTestId('selected-facets').textContent).toBe(
      'resource.a:|span.b:',
    )
    fireEvent.click(screen.getByRole('button', { name: 'Set A' }))
    await waitFor(() =>
      expect(screen.getByTestId('selected-facets').textContent).toBe(
        'resource.a:one|span.b:',
      ),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Set B' }))
    await waitFor(() =>
      expect(screen.getByTestId('selected-facets').textContent).toBe(
        'resource.a:one|span.b:two',
      ),
    )
    const generated =
      screen.getByTestId('trace-builder').querySelector('output')
        ?.textContent ?? ''
    expect(generated).toContain('resource.a = "one"')
    expect(generated).toContain('span.b = "two"')
    expect(activeTestSession().sql).toBe(manualTraceql)
  })

  it('keeps raw TraceQL when Explore similar switches to Builder and runs the generated query', async () => {
    const manualTraceql = '{ resource.service.name = "manual-query" }'
    const traceId = '00000000000000000000000000000001'
    const source = {
      traceId,
      spanId: 'root',
      parentSpanId: '',
      serviceNamespace: 'payments',
      service: 'checkout',
      name: 'GET /orders',
      kind: 'SERVER',
      status: 'OK',
      startTimeMs: 1_000,
      durationMs: 20,
      attributes: { 'http.request.method': 'GET', 'http.route': '/orders' },
      resourceAttributes: { 'service.namespace': 'payments' },
    }
    patchActiveTestSession({
      queryMode: 'sql',
      sql: manualTraceql,
      tempoBuilder: traceBuilderFromTraceql('{ }'),
    })
    vi.mocked(api.query.run)
      .mockResolvedValueOnce({
        columns: [
          {
            name: 'spanId',
            dataTypeID: 0,
            dataTypeName: 'text',
            logicalType: 'string',
          },
        ],
        rows: [source],
        rowCount: 1,
        durationMs: 1,
      })
      .mockResolvedValueOnce({
        columns: [
          {
            name: 'traceId',
            dataTypeID: 0,
            dataTypeName: 'text',
            logicalType: 'string',
          },
        ],
        rows: [],
        rowCount: 0,
        durationMs: 1,
      })
    render(<TraceExplorer connectionId="tempo-1" />)

    fireEvent.change(screen.getByLabelText('Trace ID'), {
      target: { value: traceId },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Open trace' }))
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Explore similar traces' }),
      ).toBeTruthy(),
    )

    fireEvent.click(
      screen.getByRole('button', { name: 'Explore similar traces' }),
    )
    await waitFor(() =>
      expect(vi.mocked(api.query.run)).toHaveBeenCalledTimes(2),
    )

    expect(activeTestSession().queryMode).toBe('builder')
    expect(activeTestSession().tempoBuilder).toMatchObject({
      serviceNamespace: 'payments',
      service: 'checkout',
      protocol: 'http',
      httpMethod: 'GET',
      endpoint: '/orders',
    })
    const generated = buildTraceql(activeTestSession().tempoBuilder)
    const formatted = formatTraceql(generated)
    expect(vi.mocked(api.query.run).mock.calls[1]?.[1]).toBe(
      formatted.ok ? formatted.query : generated,
    )
    expect(activeTestSession().sql).toBe(manualTraceql)
  })

  it('keeps the primary action named Run for exhaustive searches', () => {
    render(<TraceExplorer connectionId="tempo-1" />)
    expect(screen.getAllByText('Sample size')).toHaveLength(1)
    fireEvent.click(screen.getByRole('combobox', { name: /Sample size:/ }))
    fireEvent.click(screen.getByRole('option', { name: 'All traces' }))
    expect(
      screen
        .getByRole('button', { name: 'Run' })
        .hasAttribute('data-tempo-run-query'),
    ).toBe(true)
  })

  it('opens the generated query in TraceQL mode without changing it', async () => {
    const generated =
      '{ resource.service.name = "checkout" && duration > 300ms }'
    patchActiveTestSession({
      queryMode: 'builder',
      sql: generated,
      tempoBuilder: traceBuilderFromTraceql(generated),
    })
    render(<TraceExplorer connectionId="tempo-1" />)
    fireEvent.click(
      screen.getByRole('button', { name: 'Open in TraceQL mode' }),
    )
    await waitFor(() => expect(activeTestSession().queryMode).toBe('sql'))
    const builderQuery = buildTraceql(traceBuilderFromTraceql(generated))
    const formatted = formatTraceql(builderQuery)
    expect(activeTestSession().sql).toBe(
      formatted.ok ? formatted.query : builderQuery,
    )
    expect(
      screen
        .getByRole('button', { name: 'TraceQL' })
        .getAttribute('aria-pressed'),
    ).toBe('true')
  })

  it('restores each Tempo tab Builder and query options when switching tabs', async () => {
    const firstId = useStore.getState().activeTabId
    patchActiveTestSession({
      queryMode: 'builder',
      tempoBuilder: { ...traceBuilderFromTraceql('{ }'), service: 'checkout' },
      tempoTimeRange: { kind: 'rolling', amount: 6, unit: 'hour' },
      tempoSampleSize: '500',
      tempoResultView: 'scatter',
    })
    const secondId = useStore.getState().createTab()
    useStore.getState().setTempoState(
      {
        tempoBuilder: {
          ...traceBuilderFromTraceql('{ }'),
          service: 'payments',
        },
        tempoTimeRange: { kind: 'rolling', amount: 30, unit: 'minute' },
        tempoSampleSize: '100',
        tempoResultView: 'service-map',
      },
      secondId,
    )
    useStore.setState({ activeTabId: firstId })
    render(<TraceExplorer connectionId="tempo-1" />)

    expect(screen.getByTestId('builder-service').textContent).toBe('checkout')
    expect(
      screen.getByRole('combobox', { name: /Sample size:/ }).textContent,
    ).toContain('500 traces')
    useStore.setState({ activeTabId: secondId })
    await waitFor(() =>
      expect(screen.getByTestId('builder-service').textContent).toBe(
        'payments',
      ),
    )
    expect(
      screen.getByRole('combobox', { name: /Sample size:/ }).textContent,
    ).toContain('100 traces')
    useStore.setState({ activeTabId: firstId })
    await waitFor(() =>
      expect(screen.getByTestId('builder-service').textContent).toBe(
        'checkout',
      ),
    )
    expect(activeTestSession().tempoResultView).toBe('scatter')
  })

  it('filters retrieved scatter and list results without rerunning or changing the picker', async () => {
    const result = {
      columns: [
        {
          name: 'traceId',
          dataTypeID: 0,
          dataTypeName: 'text',
          logicalType: 'string' as const,
        },
      ],
      rows: [
        {
          traceId: '00000000000000000000000000000001',
          rootService: 'service-01',
          rootOperation: 'GET /example',
          startTimeMs: Date.parse('2026-08-30T10:10:00Z'),
          durationMs: 120,
          matchedSpans: 3,
          status: 'ok',
        },
      ],
      rowCount: 1,
      durationMs: 1,
      notice: 'Synthetic search',
    }
    result.rows.push({
      ...result.rows[0],
      traceId: '00000000000000000000000000000002',
      rootService: 'service-02',
      startTimeMs: Date.parse('2026-08-30T10:30:00Z'),
    })
    result.rowCount = 2
    vi.mocked(api.query.run).mockResolvedValue(result)
    render(<TraceExplorer connectionId="tempo-1" />)

    fireEvent.click(screen.getByRole('button', { name: 'Run' }))
    await waitFor(() => expect(screen.getByText('2 traces')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'Scatter' }))
    expect(
      screen
        .getByRole('button', { name: 'Scatter' })
        .getAttribute('aria-pressed'),
    ).toBe('true')

    const originalRange = activeTestSession().tempoTimeRange
    const picker = screen.getByRole('button', {
      name: /Time range/,
    }).textContent
    const select = (name: string) =>
      fireEvent.click(screen.getByRole('button', { name }))
    select('Refine scatter range')
    expect(screen.getByTestId('scatter-traces').textContent).toBe(
      result.rows[0].traceId,
    )
    expect(screen.getByText('1 of 2 retrieved traces')).toBeTruthy()
    expect(activeTestSession().result?.rows).toEqual(result.rows)
    expect(activeTestSession().tempoTimeRange).toEqual(originalRange)
    expect(screen.getByRole('button', { name: /Time range/ }).textContent).toBe(
      picker,
    )
    select('Smaller interval')
    expect(screen.getByTestId('scatter-traces').textContent).toBe(
      result.rows[0].traceId,
    )
    select('Different interval')
    expect(screen.getByTestId('scatter-traces').textContent).toBe(
      result.rows[1].traceId,
    )
    expect(
      screen.getAllByRole('button', { name: /Remove filter/ }),
    ).toHaveLength(1)
    select('List')
    expect(screen.queryByText('service-01')).toBeNull()
    expect(screen.getByText('service-02')).toBeTruthy()
    select('Scatter')
    fireEvent.click(screen.getByRole('button', { name: /Remove filter/ }))
    expect(screen.getByTestId('scatter-traces').textContent).toContain(
      result.rows[0].traceId,
    )
    expect(screen.getByTestId('scatter-traces').textContent).toContain(
      result.rows[1].traceId,
    )
    expect(api.query.run).toHaveBeenCalledTimes(1)
    select('Different interval')
    const emptyTrace = {
      columns: [{ name: 'spanId', dataTypeID: 0, dataTypeName: 'text' }],
      rows: [],
      rowCount: 0,
      durationMs: 1,
    }
    vi.mocked(api.query.run)
      .mockResolvedValueOnce(emptyTrace)
      .mockResolvedValueOnce(emptyTrace)
    select('Service map')
    expect(
      screen.getByText(/Service map uses the full retrieved cohort/),
    ).toBeTruthy()
    expect(screen.getByText('2 traces')).toBeTruthy()
    await waitFor(() => expect(api.query.run).toHaveBeenCalledTimes(3))
    expect(
      vi
        .mocked(api.query.run)
        .mock.calls.slice(1)
        .map((call) => call[1])
        .sort(),
    ).toEqual(result.rows.map((row) => row.traceId).sort())
    select('Scatter')
    expect(screen.getByTestId('scatter-traces').textContent).toBe(
      result.rows[1].traceId,
    )
    fireEvent.click(screen.getByRole('button', { name: /Remove filter/ }))
    expect(screen.getByTestId('scatter-traces').textContent).toContain(
      result.rows[0].traceId,
    )
    expect(screen.getByTestId('scatter-traces').textContent).toContain(
      result.rows[1].traceId,
    )
    expect(api.query.run).toHaveBeenCalledTimes(3)
    select('Refine scatter range')
    select('Run')
    await waitFor(() => expect(screen.getByText('2 traces')).toBeTruthy())
    expect(screen.queryByLabelText('Active result filters')).toBeNull()
    expect(api.query.run).toHaveBeenCalledTimes(4)
  })

  it('uses inclusive start and exclusive end on fetched millisecond timestamps', () => {
    const start = Date.parse('2026-08-30T10:00:00.123Z')
    const end = Date.parse('2026-08-30T10:00:10.789Z')
    const result = {
      columns: [{ name: 'traceId', dataTypeID: 0, dataTypeName: 'text' }],
      rows: [start - 1, start, end - 1, end].map((startTimeMs, index) => ({
        traceId: String(index + 1).padStart(32, '0'),
        startTimeMs,
        status: 'ok',
      })),
      rowCount: 4,
      durationMs: 1,
    }
    patchActiveTestSession({ result, tempoResultView: 'scatter' })
    render(<TraceExplorer connectionId="tempo-1" />)
    fireEvent.click(screen.getByRole('button', { name: 'Sub-minute interval' }))
    expect(screen.getByTestId('scatter-traces').textContent).toBe(
      [result.rows[1].traceId, result.rows[2].traceId].join(','),
    )
    expect(screen.getByText('2 of 4 retrieved traces')).toBeTruthy()
    expect(
      screen
        .getByRole('button', { name: /Remove filter/ })
        .getAttribute('aria-label'),
    ).toContain('2026-08-30T10:00:00.123Z, 2026-08-30T10:00:10.789Z')
    expect(activeTestSession().result).toBe(result)
    fireEvent.click(screen.getByRole('button', { name: /Remove filter/ }))
    expect(screen.getByTestId('scatter-traces').textContent).toBe(
      result.rows.map((row) => row.traceId).join(','),
    )
    expect(api.query.run).not.toHaveBeenCalled()
  })

  it('clears the local interval on connection generation change and actual preset load', () => {
    const result = {
      columns: [{ name: 'traceId', dataTypeID: 0, dataTypeName: 'text' }],
      rows: [
        {
          traceId: '00000000000000000000000000000001',
          startTimeMs: Date.parse('2026-08-30T10:10:00Z'),
        },
      ],
      rowCount: 1,
      durationMs: 1,
    }
    patchActiveTestSession({ result, tempoResultView: 'scatter' })
    explorationPresetRepository().create(
      createPresetFromSession({
        name: 'Tempo baseline',
        profile: useStore.getState().profiles[0],
        session: activeTestSession(),
      }),
    )
    render(<TraceExplorer connectionId="tempo-1" />)
    const select = (name: string | RegExp) =>
      fireEvent.click(screen.getByRole('button', { name }))
    select('Refine scatter range')
    expect(screen.getByLabelText('Active result filters')).toBeTruthy()
    act(() =>
      useStore.setState((state) => ({
        connectionStateByProfileId: {
          ...state.connectionStateByProfileId,
          'tempo-1': {
            ...state.connectionStateByProfileId['tempo-1'],
            generation: 8,
          },
        },
      })),
    )
    expect(screen.queryByLabelText('Active result filters')).toBeNull()
    expect(screen.getByText('1 traces')).toBeTruthy()
    select('Refine scatter range')
    select('Manage saved presets')
    select('Load preset Tempo baseline')
    expect(screen.queryByLabelText('Active result filters')).toBeNull()
    expect(activeTestSession().result).toBeNull()
    expect(screen.queryByTestId('scatter-traces')).toBeNull()
    expect(api.query.run).not.toHaveBeenCalled()
  })

  it('clears the filter on session switch, picker edits, reset, and failed refresh', async () => {
    const result = {
      columns: [{ name: 'traceId', dataTypeID: 0, dataTypeName: 'text' }],
      rows: [
        {
          traceId: '00000000000000000000000000000001',
          rootService: 'checkout',
          startTimeMs: Date.parse('2026-08-30T10:10:00Z'),
        },
      ],
      rowCount: 1,
      durationMs: 1,
      notice: 'Retrieved sample',
    }
    vi.mocked(api.query.run).mockResolvedValue(result)
    render(<TraceExplorer connectionId="tempo-1" />)
    const select = (name: string | RegExp) =>
      fireEvent.click(screen.getByRole('button', { name }))
    select('Run')
    await waitFor(() => expect(screen.getByText('1 traces')).toBeTruthy())
    select('Scatter')
    select('Refine scatter range')
    const firstTab = activeTestSession().id
    act(() => {
      useStore.getState().createTab()
    })
    expect(screen.queryByLabelText('Active result filters')).toBeNull()
    await act(async () => {
      await useStore.getState().activateTab(firstTab)
    })
    expect(screen.getByText('1 traces')).toBeTruthy()
    select('Refine scatter range')
    select(/Time range/)
    select('Last day')
    select('Confirm')
    expect(screen.queryByLabelText('Active result filters')).toBeNull()
    // The existing picker edits criteria; Run explicitly fetches the new window.
    expect(api.query.run).toHaveBeenCalledTimes(1)
    select('Run')
    await waitFor(() => expect(api.query.run).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.getByText('1 traces')).toBeTruthy())
    const options = vi.mocked(api.query.run).mock.calls[1][3]
    expect(Date.parse(options!.end!) - Date.parse(options!.start!)).toBe(
      24 * 60 * 60 * 1000,
    )
    select('Refine scatter range')
    vi.mocked(api.query.run).mockRejectedValueOnce(
      new Error('Tempo unavailable'),
    )
    select('Run')
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain(
        'Tempo unavailable',
      ),
    )
    expect(screen.queryByLabelText('Active result filters')).toBeNull()
    select('Run')
    await waitFor(() => expect(screen.getByText('1 traces')).toBeTruthy())
    select('Refine scatter range')
    select('Reset query')
    select('Reset exploration')
    expect(screen.queryByLabelText('Active result filters')).toBeNull()
    expect(activeTestSession().result).toBeNull()
  })

  it('opens search and direct-ID traces and returns to the retained search results', async () => {
    const searchedTraceId = '00000000000000000000000000000001'
    const directTraceId = '00000000000000000000000000000002'
    const searchResult = {
      columns: [
        {
          name: 'traceId',
          dataTypeID: 0,
          dataTypeName: 'text',
          logicalType: 'string' as const,
        },
      ],
      rows: [
        {
          traceId: searchedTraceId,
          rootService: 'checkout',
          rootOperation: 'GET /cart',
          startTimeMs: 1_000,
          durationMs: 20,
          matchedSpans: 1,
        },
      ],
      rowCount: 1,
      durationMs: 1,
    }
    const openedResult = (id: string) => ({
      columns: [
        {
          name: 'spanId',
          dataTypeID: 0,
          dataTypeName: 'text',
          logicalType: 'string' as const,
        },
      ],
      rows: [
        {
          traceId: id,
          spanId: `span-${id}`,
          parentSpanId: '',
          service: 'checkout',
          name: 'GET /cart',
          startTimeMs: 1_000,
          durationMs: 20,
          kind: 'SERVER',
        },
      ],
      rowCount: 1,
      durationMs: 1,
    })
    vi.mocked(api.query.run)
      .mockResolvedValueOnce(searchResult)
      .mockResolvedValueOnce(openedResult(searchedTraceId))
      .mockResolvedValueOnce(openedResult(searchedTraceId))
      .mockResolvedValueOnce(openedResult(directTraceId))
    render(<TraceExplorer connectionId="tempo-1" />)

    fireEvent.click(screen.getByRole('button', { name: 'Run' }))
    await waitFor(() => expect(screen.getByText('checkout')).toBeTruthy())
    fireEvent.click(screen.getByText('checkout'))
    await waitFor(() =>
      expect(screen.getByText(`${searchedTraceId}`)).toBeTruthy(),
    )
    expect(vi.mocked(api.query.run).mock.calls[1]?.[1]).toBe(searchedTraceId)

    fireEvent.click(screen.getByRole('button', { name: '← Search results' }))
    expect(screen.getByText('checkout')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Scatter' }))
    fireEvent.click(
      screen.getByRole('button', { name: 'Refine scatter range' }),
    )
    expect(
      screen.getByText(/No retrieved traces in this local interval/),
    ).toBeTruthy()
    expect(screen.getByText('0 of 1 retrieved traces')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Open trace' }))
    await waitFor(() => expect(screen.getByText(searchedTraceId)).toBeTruthy())
    expect(
      screen.getByText(/Opened trace is outside the filtered results/),
    ).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Remove filter/ }))
    expect(screen.getByText(searchedTraceId)).toBeTruthy()
    expect(screen.queryByText(/Opened trace is outside/)).toBeNull()
    expect(api.query.run).toHaveBeenCalledTimes(3)
    fireEvent.click(screen.getByRole('button', { name: '← Search results' }))
    expect(screen.getByTestId('scatter-traces').textContent).toBe(
      searchedTraceId,
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'Refine scatter range' }),
    )
    fireEvent.change(screen.getByLabelText('Trace ID'), {
      target: { value: '2' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Open trace' }))
    await waitFor(() =>
      expect(vi.mocked(api.query.run)).toHaveBeenCalledTimes(4),
    )
    expect(vi.mocked(api.query.run).mock.calls[3]).toEqual([
      'tempo-1',
      directTraceId,
      [],
      undefined,
      undefined,
      true,
    ])
    await waitFor(() => expect(screen.getByText(directTraceId)).toBeTruthy())
    expect(
      screen.getByText(/Opened trace is outside the filtered results/),
    ).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Remove filter/ }))
    expect(screen.getByText(directTraceId)).toBeTruthy()
    expect(screen.queryByText(/Opened trace is outside/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '← Search results' }))
    expect(screen.getByTestId('scatter-traces').textContent).toBe(
      searchedTraceId,
    )
    expect(api.query.run).toHaveBeenCalledTimes(4)
  })
})
