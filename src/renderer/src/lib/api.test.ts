import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const query = {
  run: vi.fn(),
  runLoki: vi.fn(),
  explain: vi.fn(),
  probeSeriesCardinality: vi.fn(),
  seriesStatistics: vi.fn(),
}

beforeEach(() => {
  vi.resetModules()
  vi.stubGlobal('window', { datakoala: { query } })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => vi.unstubAllGlobals())

it.each(Object.keys(query) as Array<keyof typeof query>)(
  'normalizes %s errors at the query API boundary',
  async (method) => {
    query[method].mockRejectedValueOnce(
      new Error(
        `Error invoking remote method 'query:${method}': Error: Invalid expression`,
      ),
    )
    const { api } = await import('@lib/api')
    // Exercise every method through the public boundary with representative opaque arguments.
    const invoke = api.query[method] as (...args: unknown[]) => Promise<unknown>
    await expect(invoke('connection', {})).rejects.toThrow('Invalid expression')
    expect(query[method]).toHaveBeenCalledWith('connection', {})
  },
)

it('forwards run arguments, progress callback and result unchanged', async () => {
  const result = { columns: [], rows: [], rowCount: 0, durationMs: 1 }
  query.run.mockResolvedValueOnce({ ok: true, result })
  const { api } = await import('@lib/api')
  const progress = vi.fn()
  const request = { start: '2026-09-28T00:00:00Z', end: '2026-09-28T01:00:00Z' }
  expect(await api.query.run('tempo', '{}', [], request, progress, true)).toBe(
    result,
  )
  expect(query.run).toHaveBeenCalledWith(
    'tempo',
    '{}',
    [],
    request,
    progress,
    true,
  )
})

it('preserves structured query versus connection failure classification', async () => {
  query.run
    .mockResolvedValueOnce({
      ok: false,
      kind: 'query',
      message: 'column does not exist',
    })
    .mockResolvedValueOnce({
      ok: false,
      kind: 'connection',
      message: 'opaque connection failure',
    })
  const { api } = await import('@lib/api')
  await expect(api.query.run('pg', 'select bad')).rejects.toMatchObject({
    kind: 'query',
    message: 'column does not exist',
  })
  await expect(api.query.run('pg', 'select 1')).rejects.toMatchObject({
    kind: 'connection',
    message: 'opaque connection failure',
  })
})
