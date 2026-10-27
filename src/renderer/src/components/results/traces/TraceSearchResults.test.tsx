// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { TraceSearchResults, type TraceResultView } from './TraceSearchResults'

afterEach(cleanup)

const rows = [{ traceId: 'trace-one' }, { traceId: 'trace-two' }]

function renderResults(
  resultView: TraceResultView = 'list',
  loading: 'search' | 'trace' | null = null,
  onResultViewChange = vi.fn(),
) {
  render(
    <TraceSearchResults
      rows={rows}
      notice="Tempo returned candidate traces."
      loading={loading}
      resultView={resultView}
      onResultViewChange={onResultViewChange}
      listView={<div>Supplied list</div>}
      scatterView={<div>Supplied scatter</div>}
      serviceMapView={<div>Supplied service map</div>}
    />,
  )
  return onResultViewChange
}

describe('TraceSearchResults', () => {
  it('renders a dedicated picker/count bar, preserves a non-routine notice, and shows only active List content', () => {
    renderResults()
    expect(
      Array.from(
        document.querySelectorAll(
          '[data-trace-view-bar] [role=toolbar] button',
        ),
      ).map((b) => b.getAttribute('aria-label')),
    ).toEqual(['List', 'Scatter', 'Service map'])

    expect(screen.queryByRole('heading', { name: 'Trace search' })).toBeNull()
    expect(
      document.querySelector('[data-trace-view-bar] [role=toolbar]'),
    ).toBeTruthy()
    expect(
      screen
        .getByRole('toolbar', { name: 'Result view' })
        .contains(document.querySelector('[data-trace-count]')),
    ).toBe(true)
    expect(document.querySelector('[data-trace-count]')?.textContent).toBe(
      '2 traces',
    )
    expect(screen.getByText('Tempo returned candidate traces.')).toBeTruthy()
    expect(screen.getByText('2 traces')).toBeTruthy()
    expect(
      screen.getByRole('button', { name: 'List' }).getAttribute('aria-pressed'),
    ).toBe('true')
    expect(screen.getByText('Supplied list')).toBeTruthy()
    expect(screen.queryByText('Supplied scatter')).toBeNull()
    expect(screen.queryByText('Supplied service map')).toBeNull()
  })

  it.each([
    ['list', 'List', 'Supplied list'],
    ['scatter', 'Scatter', 'Supplied scatter'],
    ['service-map', 'Service map', 'Supplied service map'],
  ] as const)(
    'marks %s active, renders its supplied view, and reports view clicks',
    (view, buttonName, content) => {
      const onResultViewChange = renderResults(view)

      expect(
        screen
          .getByRole('button', { name: buttonName })
          .getAttribute('aria-pressed'),
      ).toBe('true')
      expect(screen.getByText(content)).toBeTruthy()
      for (const target of ['List', 'Scatter', 'Service map'] as const)
        fireEvent.click(screen.getByRole('button', { name: target }))
      expect(onResultViewChange.mock.calls.map(([next]) => next)).toEqual([
        'list',
        'scatter',
        'service-map',
      ])
    },
  )

  it('shows an in-progress count and disables Service map while searching', () => {
    renderResults('list', 'search')

    expect(screen.getByText('2 traces so far')).toBeTruthy()
    expect(
      (screen.getByRole('button', { name: 'Service map' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true)
  })

  it('shows the idle empty state', () => {
    render(
      <TraceSearchResults
        rows={[]}
        notice=""
        loading={null}
        resultView="list"
        onResultViewChange={vi.fn()}
        listView={null}
        scatterView={null}
        serviceMapView={null}
      />,
    )

    expect(screen.getByText('0 traces')).toBeTruthy()
    expect(
      screen.getByText(
        'Search for a trace by service, operation, status or duration; use Trace ID above when you already know the exact trace.',
      ),
    ).toBeTruthy()
  })

  it('shows the searching empty state', () => {
    render(
      <TraceSearchResults
        rows={[]}
        notice="Searching Tempo."
        loading="search"
        resultView="list"
        onResultViewChange={vi.fn()}
        listView={null}
        scatterView={null}
        serviceMapView={null}
      />,
    )

    expect(
      screen.getByText('Waiting for the first Tempo trace summaries…'),
    ).toBeTruthy()
    expect(screen.getByRole('toolbar', { name: 'Result view' })).toBeTruthy()
    expect(
      (screen.getByRole('button', { name: 'Service map' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true)
  })
})

it('keeps only the visible sampled count in the bar, hides routine metrics and retains a zero-filter Scatter', () => {
  render(
    <TraceSearchResults
      rows={[]}
      fetchedTraceCount={20}
      locallyFiltered
      sampled
      notice="Tempo search · complete period · 20 returned · 3 queries"
      loading={null}
      resultView="scatter"
      onResultViewChange={vi.fn()}
      listView={null}
      scatterView={<div>Empty scatter retained</div>}
      serviceMapView={null}
    />,
  )
  expect(document.querySelector('[data-trace-count]')?.textContent).toBe(
    '0 sampled traces',
  )
  expect(screen.queryByText(/complete period/)).toBeNull()
  expect(screen.getByText('Empty scatter retained')).toBeTruthy()
  expect(screen.getByRole('status').textContent).toContain(
    'No retrieved traces',
  )
})
