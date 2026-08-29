import React from 'react'
void React
// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

const { labelsForMetric, labelValues } = vi.hoisted(() => ({ labelsForMetric: vi.fn(), labelValues: vi.fn() }))
vi.mock('../lib/api', () => ({ api: { connections: { prometheus: { labelsForMetric, labelValues } } } }))
vi.mock('@uiw/react-codemirror', () => ({
  default: ({ value, ...props }: { value: string; 'aria-label'?: string }) => <textarea aria-label={props['aria-label']} value={value} readOnly />
}))

import { PromqlBuilderPanel } from './PromqlBuilderPanel'
import { resetPrometheusMetadataCache } from '../lib/prometheusMetadata'
import { patchActiveTestSession, resetTestStore, setActiveTestMetadata } from '../test/sessionTestUtils'
import { useStore } from '../store/useStore'

const profileId = 'prom-reconnect'
const deferred = <T,>() => { let resolve!: (value: T) => void; let reject!: (reason: unknown) => void; const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail }); return { promise, resolve, reject } }

beforeEach(() => {
  HTMLElement.prototype.scrollIntoView = vi.fn()
  resetPrometheusMetadataCache()
  labelsForMetric.mockReset()
    .mockResolvedValueOnce(['service', 'old_label', '__name__'])
    .mockResolvedValueOnce(['service', 'new_label', '__name__'])
  labelValues.mockReset().mockResolvedValue(['api'])

  resetTestStore({
    profiles: [{ id: profileId, name: 'Metrics', kind: 'prometheus', version: 1, readonly: true, transport: { kind: 'gcx' } }],
    activeProfileId: profileId,
    connected: true,
    connecting: false,
    connectionStatus: 'connected',
    connectionGeneration: 1
  })
  patchActiveTestSession({
    connectionProfileId: profileId,
    queryMode: 'builder',
    sql: 'sum(rate(requests_total[5m]))',
    promqlBuilder: {
      metric: 'requests_total',
      filterBy: [],
      groupBy: [],
      labelValues: {},
      calculation: 'rate',
      aggregation: 'sum',
      window: '5m',
      percentile: 0.95,
      histogramKindOverride: 'auto'
    }
  })
  setActiveTestMetadata([{ name: 'Prometheus', isSystem: false, relations: [{
    schema: 'Prometheus',
    name: 'requests_total',
    qualifiedName: 'requests_total',
    kind: 'metric',
    columnsStatus: 'idle',
    details: { kind: 'metric', type: 'counter' }
  }] }], 'loaded', null, profileId)
})

afterEach(() => { cleanup(); resetTestStore() })

it('reloads Group by options when a reconnect creates a new connection generation', async () => {
  render(<PromqlBuilderPanel />)

  await waitFor(() => expect(labelsForMetric).toHaveBeenCalledTimes(1))
  let groupPicker = await screen.findByRole('combobox', { name: 'Group by: No grouping' })
  fireEvent.click(groupPicker)
  expect(await screen.findByRole('option', { name: 'old_label' })).toBeTruthy()
  expect(screen.queryByRole('option', { name: 'new_label' })).toBeNull()
  fireEvent.keyDown(screen.getByLabelText('Search Group by'), { key: 'Escape' })

  act(() => {
    useStore.setState({ connectionGeneration: 2 })
  })
  await waitFor(() => expect(labelsForMetric).toHaveBeenCalledTimes(2))
  await waitFor(() => expect(screen.getByRole('combobox', { name: 'Group by: No grouping' }).hasAttribute('disabled')).toBe(false))

  groupPicker = screen.getByRole('combobox', { name: 'Group by: No grouping' })
  fireEvent.click(groupPicker)
  expect(await screen.findByRole('option', { name: 'new_label' })).toBeTruthy()
  expect(screen.queryByRole('option', { name: 'old_label' })).toBeNull()
})

it('shows loading states while reconnect label metadata is being fetched', async () => {
  const reconnectLabels = deferred<string[]>()
  labelsForMetric.mockReset()
    .mockResolvedValueOnce(['service', 'old_label', '__name__'])
    .mockReturnValueOnce(reconnectLabels.promise)

  render(<PromqlBuilderPanel />)
  await screen.findByRole('combobox', { name: 'Group by: No grouping' })

  act(() => {
    useStore.setState({ connectionGeneration: 2 })
  })

  expect(await screen.findByRole('combobox', { name: 'Group by: Loading labels…' })).toBeTruthy()
  expect(screen.getByRole('combobox', { name: 'Filter by: Loading labels…' })).toBeTruthy()

  await act(async () => {
    reconnectLabels.resolve(['service', 'new_label', '__name__'])
    await reconnectLabels.promise
  })
  await screen.findByRole('combobox', { name: 'Group by: No grouping' })
})

it('shows a loading state while metric metadata is being fetched', () => {
  useStore.setState((state) => ({
    metadataByProfileId: {
      ...state.metadataByProfileId,
      [profileId]: { ...state.metadataByProfileId[profileId], status: 'loading' }
    }
  }))

  patchActiveTestSession({ promqlBuilder: { ...useStore.getState().tabs[0].promqlBuilder, metric: '' } })
  render(<PromqlBuilderPanel />)

  expect(screen.getByRole('combobox', { name: 'Metric: Loading metrics…' })).toBeTruthy()
})

it('keeps metadata controls calm and makes no requests when already disconnected', () => {
  patchActiveTestSession({ promqlBuilder: {
    ...useStore.getState().tabs[0].promqlBuilder,
    groupBy: ['service'], filterBy: ['region'], labelValues: { region: ['eu'] }
  } })
  useStore.setState({ connected: false, connectionStatus: 'disconnected' })

  render(<PromqlBuilderPanel />)

  expect(labelsForMetric).not.toHaveBeenCalled()
  expect(labelValues).not.toHaveBeenCalled()
  expect(screen.queryByRole('alert')).toBeNull()
  expect(screen.queryByRole('button', { name: /retry/i })).toBeNull()
  expect(screen.getByRole('combobox', { name: /Metric:/ }).hasAttribute('disabled')).toBe(true)
  expect(screen.getByRole('combobox', { name: /Group by:/ }).hasAttribute('disabled')).toBe(true)
  expect(screen.getByRole('combobox', { name: /Filter by:/ }).hasAttribute('disabled')).toBe(true)
  expect(screen.getByRole('combobox', { name: /region values:/ }).hasAttribute('disabled')).toBe(true)
})

it('ignores metadata failures which arrive after disconnect and clears loading state', async () => {
  const pendingLabels = deferred<string[]>()
  labelsForMetric.mockReset().mockReturnValue(pendingLabels.promise)
  render(<PromqlBuilderPanel />)
  expect(await screen.findByRole('combobox', { name: 'Group by: Loading labels…' })).toBeTruthy()

  act(() => useStore.setState({ connected: false, connectionStatus: 'disconnected', connectionGeneration: 2 }))
  await act(async () => {
    pendingLabels.reject(new Error('This profile is not connected'))
    await pendingLabels.promise.catch(() => undefined)
  })

  expect(labelsForMetric).toHaveBeenCalledTimes(1)
  expect(screen.queryByText(/This profile is not connected/)).toBeNull()
  expect(screen.queryByRole('button', { name: /retry/i })).toBeNull()
  expect(screen.getByRole('combobox', { name: 'Group by: Metadata unavailable' }).hasAttribute('disabled')).toBe(true)
})

it('refreshes active metadata once on reconnect without changing builder configuration', async () => {
  const configured = {
    ...useStore.getState().tabs[0].promqlBuilder,
    groupBy: ['service'], filterBy: ['region'], labelValues: { region: ['eu'] }
  }
  patchActiveTestSession({ promqlBuilder: configured })
  useStore.setState({ connected: false, connectionStatus: 'reconnecting' })
  render(<PromqlBuilderPanel />)
  expect(labelsForMetric).not.toHaveBeenCalled()
  expect(labelValues).not.toHaveBeenCalled()

  act(() => useStore.setState({ connected: true, connectionStatus: 'connected', connectionGeneration: 2 }))
  await waitFor(() => expect(labelsForMetric).toHaveBeenCalledTimes(1))
  await waitFor(() => expect(labelValues).toHaveBeenCalledTimes(2))
  await waitFor(() => expect(screen.getByRole('combobox', { name: /Group by:/ }).hasAttribute('disabled')).toBe(false))
  expect(useStore.getState().tabs[0].promqlBuilder).toEqual(configured)
})

it('keeps actionable metadata errors while connected', async () => {
  labelsForMetric.mockReset().mockRejectedValue(new Error('upstream denied the request'))
  render(<PromqlBuilderPanel />)

  expect((await screen.findByRole('alert')).textContent).toContain('upstream denied the request')
  expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy()
})

it('preserves a label-detected classic histogram interpretation across disconnect and reconnect', async () => {
  const reconnectLabels = deferred<string[]>()
  labelsForMetric.mockReset()
    .mockResolvedValueOnce(['service', 'le', '__name__'])
    .mockReturnValueOnce(reconnectLabels.promise)
  patchActiveTestSession({
    sql: '',
    promqlBuilder: {
      ...useStore.getState().tabs[0].promqlBuilder,
      metric: 'request_latency',
      calculation: 'percentile',
      aggregation: 'sum',
      groupBy: ['service'],
      histogramKindOverride: 'auto'
    }
  })
  setActiveTestMetadata([{ name: 'Prometheus', isSystem: false, relations: [{
    schema: 'Prometheus', name: 'request_latency', qualifiedName: 'request_latency', kind: 'metric', columnsStatus: 'idle',
    details: { kind: 'metric', type: 'histogram' }
  }] }], 'loaded', null, profileId)

  render(<PromqlBuilderPanel />)
  await waitFor(() => expect(useStore.getState().tabs[0].sql).toContain('sum by (service, le)'))
  const beforeBuilder = useStore.getState().tabs[0].promqlBuilder
  const beforeSql = useStore.getState().tabs[0].sql
  expect(screen.queryByRole('combobox', { name: /Histogram representation/ })).toBeNull()

  act(() => useStore.setState({ connected: false, connectionStatus: 'reconnecting', connectionGeneration: 2 }))

  expect(labelsForMetric).toHaveBeenCalledTimes(1)
  expect(screen.queryByRole('alert')).toBeNull()
  expect(screen.queryByRole('combobox', { name: /Histogram representation/ })).toBeNull()
  expect(useStore.getState().tabs[0].promqlBuilder).toEqual(beforeBuilder)
  expect(useStore.getState().tabs[0].sql).toBe(beforeSql)
  expect((screen.getByLabelText('Generated PromQL query') as HTMLTextAreaElement).value).toBe(beforeSql)

  act(() => useStore.setState({ connected: true, connectionStatus: 'connected', connectionGeneration: 3 }))
  await waitFor(() => expect(labelsForMetric).toHaveBeenCalledTimes(2))
  expect(await screen.findByRole('combobox', { name: 'Group by: Loading labels…' })).toBeTruthy()

  fireEvent.click(screen.getByRole('combobox', { name: 'Percentile: P95' }))
  fireEvent.click(await screen.findByRole('option', { name: 'P99' }))
  const loadingSql = useStore.getState().tabs[0].sql
  expect(loadingSql).toMatch(/histogram_quantile\(\s*0\.99/)
  expect(loadingSql).toContain('sum by (service, le)')
  expect((screen.getByLabelText('Generated PromQL query') as HTMLTextAreaElement).value).toBe(loadingSql)

  await act(async () => {
    reconnectLabels.resolve(['service', 'le', '__name__'])
    await reconnectLabels.promise
  })
  await waitFor(() => expect(screen.getByRole('combobox', { name: /Group by:/ }).hasAttribute('disabled')).toBe(false))
  expect(useStore.getState().tabs[0].promqlBuilder).toEqual({ ...beforeBuilder, percentile: 0.99 })
  expect(useStore.getState().tabs[0].sql).toContain('sum by (service, le)')
})
