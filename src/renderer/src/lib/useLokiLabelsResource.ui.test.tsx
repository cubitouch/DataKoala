import { cleanup, render, screen, waitFor } from '@testing-library/react'
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
