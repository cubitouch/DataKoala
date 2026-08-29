import React from 'react'
void React
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ labels: vi.fn() }))
vi.mock('./api.ts', () => ({ api: { connections: { loki: { labels: mocks.labels } } } }))
import { clearLokiMetadataCache } from './lokiMetadata.ts'
import { clearLokiLabelsResources, useLokiLabelsResource } from './useLokiLabelsResource.ts'
const range = { kind: 'rolling', amount: 1, unit: 'hour' } as const
function Consumer({ name }: { name: string }) { const resource = useLokiLabelsResource('loki', 4, 'tab-a', range); return <div>{name}:{resource.status}:{resource.labels.join(',')}</div> }
afterEach(() => { cleanup(); clearLokiMetadataCache(); clearLokiLabelsResources(); mocks.labels.mockReset() })
it('shares one resolved rolling-range request and one snapshot across metadata consumers', async () => {
  mocks.labels.mockResolvedValue(['service_name', 'namespace', '__stream_shard__'])
  render(<><Consumer name="sidebar"/><Consumer name="builder"/></>)
  await waitFor(() => expect(screen.getByText('sidebar:loaded:namespace,service_name')).toBeTruthy())
  expect(screen.getByText('builder:loaded:namespace,service_name')).toBeTruthy()
  expect(mocks.labels).toHaveBeenCalledTimes(1)
  expect(mocks.labels.mock.calls[0][1]).toEqual(expect.objectContaining({ start: expect.any(String), end: expect.any(String) }))
})
function RetryConsumer() { const resource = useLokiLabelsResource('loki', 9, 'tab-retry', range); return <><span>{resource.status}:{resource.error}</span><button onClick={() => void resource.retry()}>Retry</button></> }
it('shares errors and retries the same resource without retaining stale failure state', async () => {
  mocks.labels.mockRejectedValueOnce(new Error('metadata unavailable')).mockResolvedValueOnce(['level'])
  render(<RetryConsumer/>)
  await waitFor(() => expect(screen.getByText('error:metadata unavailable')).toBeTruthy())
  screen.getByRole('button', { name: 'Retry' }).click()
  await waitFor(() => expect(screen.getByText('loaded:')).toBeTruthy())
  expect(mocks.labels).toHaveBeenCalledTimes(2)
})
function LifecycleConsumer({ enabled, generation }: { enabled: boolean; generation: number }) { const resource = useLokiLabelsResource('loki', generation, 'tab-lifecycle', range, enabled); return <span>{resource.status}:{resource.error}:{resource.labels.join(',')}</span> }
it('does not load while disabled and ignores a request rejected after disabling', async () => {
  let reject!: (reason: unknown) => void
  const pending = new Promise<string[]>((_, fail) => { reject = fail })
  mocks.labels.mockReturnValue(pending)
  const view = render(<LifecycleConsumer enabled generation={1} />)
  await waitFor(() => expect(mocks.labels).toHaveBeenCalledTimes(1))
  view.rerender(<LifecycleConsumer enabled={false} generation={2} />)
  await act(async () => { reject(new Error('This profile is not connected')); await pending.catch(() => undefined) })
  expect(screen.getByText('loaded::')).toBeTruthy()
  expect(mocks.labels).toHaveBeenCalledTimes(1)
})
it('shares one fresh request after metadata loading is re-enabled', async () => {
  mocks.labels.mockResolvedValue(['service'])
  const view = render(<><LifecycleConsumer enabled={false} generation={1} /><LifecycleConsumer enabled={false} generation={1} /></>)
  expect(mocks.labels).not.toHaveBeenCalled()
  view.rerender(<><LifecycleConsumer enabled generation={2} /><LifecycleConsumer enabled generation={2} /></>)
  await waitFor(() => expect(screen.getAllByText('loaded::service')).toHaveLength(2))
  expect(mocks.labels).toHaveBeenCalledTimes(1)
})
