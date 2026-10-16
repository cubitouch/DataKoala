import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { DatabaseColumnNode, DatabaseRelationNode } from '@shared/types'
import { AI_LIMITS } from '@shared/ai'
import { createQuerySession, useStore } from '@store/useStore'
import { resetTestStore } from '@test/sessionTestUtils'
import { ensureRelationColumns } from '@lib/relationColumns'
import { useAiQueryCopilot } from './useAiQueryCopilot'
import { useAiQueryRepair } from './useAiQueryRepair'
import type { AiPreparedContext } from './workflow'

const api = vi.hoisted(() => ({
  propose: vi.fn(),
  cancel: vi.fn(),
  run: vi.fn(),
  connect: vi.fn(),
}))
vi.mock('@lib/api', () => ({
  api: {
    ai: {
      settings: {
        get: async () => ({
          ok: true,
          value: {
            provider: 'openrouter',
            model: 'test/model',
            hasApiKey: true,
          },
        }),
      },
      proposeQuery: api.propose,
      cancel: api.cancel,
    },
    query: { run: api.run },
    connections: { connect: api.connect },
  },
}))
vi.mock('@lib/relationColumns', () => ({ ensureRelationColumns: vi.fn() }))

const columns = [{ name: 'id', dataTypeName: 'integer' }]
const relation = (name: string): DatabaseRelationNode => ({
  schema: 'public',
  name,
  qualifiedName: `public.${name}`,
  kind: 'r',
  columnsStatus: 'idle',
})
const relations = [
  ...Array.from({ length: AI_LIMITS.initialRelations }, (_, i) =>
    relation(`aa_${i}`),
  ),
  relation('zz_devices'),
]
const proposal = {
  ok: true,
  value: {
    kind: 'proposal',
    proposal: {
      query: 'SELECT id FROM public.zz_devices',
      explanation: 'Use devices.',
      assumptions: [],
    },
  },
}
const discovery = {
  ok: true,
  value: {
    kind: 'context-request',
    request: { searchTerms: ['devices'], reason: 'Find devices.' },
  },
}
const deferred = <T,>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}
const replaceMetadata = () =>
  useStore.getState().setMetadata(
    [
      {
        name: 'public',
        isSystem: false,
        relations: relations.map((item) => ({ ...item })),
      },
    ],
    'loaded',
    null,
    'pg',
  )

beforeEach(() => {
  resetTestStore({
    profiles: [
      {
        id: 'pg',
        kind: 'postgres',
        version: 2,
        name: 'Test',
        host: 'localhost',
        port: 5432,
        database: 'db',
        user: 'test',
        password: '',
        readonly: true,
        tlsMode: 'disable',
      },
    ],
    tabs: [
      {
        ...createQuerySession(1, {
          id: 'ai-tab',
          connectionProfileId: 'pg',
          sql: 'SELECT 1',
          queryMode: 'sql',
        }),
        repairableQueryError: { query: 'SELECT 1', error: 'relation missing' },
      },
    ],
    activeTabId: 'ai-tab',
    connectionStateByProfileId: {
      pg: {
        status: 'connected',
        generation: 1,
        error: null,
        serverVersion: null,
      },
    },
  })
  replaceMetadata()
  vi.mocked(ensureRelationColumns).mockReset().mockResolvedValue(columns)
  api.propose.mockReset().mockResolvedValue(proposal)
  api.cancel.mockReset().mockResolvedValue({ ok: true })
})
afterEach(() => {
  cleanup()
  resetTestStore()
})

interface TestController {
  configured: boolean | null
  busy: boolean
  error: string
  review: { stale: boolean } | null
  request: () => Promise<void>
  apply: () => void
  prompt: (value: string) => void
  context: AiPreparedContext | null
}
function useGenerateController(): TestController {
  const c = useAiQueryCopilot()
  return {
    configured: c.configured,
    busy: c.busy,
    error: c.error,
    review: c.review,
    request: c.generate,
    apply: c.apply,
    prompt: c.setPrompt,
    context: c.contextInput,
  }
}
function useRepairController(): TestController {
  const c = useAiQueryRepair()
  return {
    configured: c.configured,
    busy: c.busy,
    error: c.error,
    review: c.review,
    request: c.repair,
    apply: c.apply,
    prompt: (_value: string) => {},
    context: c.sent,
  }
}

for (const intent of ['generate', 'repair'] as const) {
  const useController =
    intent === 'generate' ? useGenerateController : useRepairController
  it(`${intent}: revision replacement during initial columns blocks the first model call and permits explicit retry`, async () => {
    const pending = deferred<DatabaseColumnNode[]>()
    vi.mocked(ensureRelationColumns).mockReturnValueOnce(pending.promise)
    const { result } = renderHook(useController)
    await waitFor(() => expect(result.current.configured).toBe(true))
    act(() => result.current.prompt('overview'))
    let request!: Promise<void>
    act(() => {
      request = result.current.request()
    })
    await waitFor(() => expect(ensureRelationColumns).toHaveBeenCalledTimes(1))
    act(replaceMetadata)
    await act(async () => {
      pending.resolve([{ name: 'old_column', dataTypeName: 'text' }])
      await request
    })
    expect(api.propose).not.toHaveBeenCalled()
    expect(ensureRelationColumns).toHaveBeenCalledTimes(1)
    expect(result.current.busy).toBe(false)
    expect(result.current.review).toBeNull()
    expect(result.current.error).toMatch(/metadata|schema/i)
    await act(async () => {
      await result.current.request()
    })
    expect(api.propose).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(api.propose.mock.calls[0][0].context)).not.toContain(
      'old_column',
    )
    expect(api.run).not.toHaveBeenCalled()
    expect(api.connect).not.toHaveBeenCalled()
  })

  it(`${intent}: revision replacement while first model response is pending blocks discovery column loads and the second call`, async () => {
    const first = deferred<typeof discovery>()
    api.propose.mockReturnValueOnce(first.promise)
    const { result } = renderHook(useController)
    await waitFor(() => expect(result.current.configured).toBe(true))
    act(() => result.current.prompt('overview'))
    let request!: Promise<void>
    act(() => {
      request = result.current.request()
    })
    await waitFor(() => expect(api.propose).toHaveBeenCalledTimes(1))
    const initialLoads = vi.mocked(ensureRelationColumns).mock.calls.length
    act(replaceMetadata)
    await act(async () => {
      first.resolve(discovery)
      await request
    })
    expect(ensureRelationColumns).toHaveBeenCalledTimes(initialLoads)
    expect(api.propose).toHaveBeenCalledTimes(1)
    expect(result.current.busy).toBe(false)
    expect(result.current.review).toBeNull()
  })

  it(`${intent}: revision replacement during discovery columns blocks the second model request`, async () => {
    const pending = deferred<DatabaseColumnNode[]>()
    vi.mocked(ensureRelationColumns).mockImplementation(async (_id, item) =>
      item.name === 'zz_devices' ? pending.promise : columns,
    )
    api.propose.mockResolvedValueOnce(discovery)
    const { result } = renderHook(useController)
    await waitFor(() => expect(result.current.configured).toBe(true))
    act(() => result.current.prompt('overview'))
    let request!: Promise<void>
    act(() => {
      request = result.current.request()
    })
    await waitFor(() =>
      expect(ensureRelationColumns).toHaveBeenCalledWith(
        'pg',
        relations.at(-1),
      ),
    )
    act(replaceMetadata)
    await act(async () => {
      pending.resolve([{ name: 'old_column', dataTypeName: 'text' }])
      await request
    })
    expect(api.propose).toHaveBeenCalledTimes(1)
    expect(result.current.busy).toBe(false)
    expect(result.current.review).toBeNull()
    expect(result.current.error).toMatch(/metadata|schema/i)
    expect(api.run).not.toHaveBeenCalled()
  })

  it(`${intent}: unchanged revision permits one discovery step and marks review stale after replacement`, async () => {
    api.propose.mockResolvedValueOnce(discovery).mockResolvedValueOnce(proposal)
    const { result } = renderHook(useController)
    await waitFor(() => expect(result.current.configured).toBe(true))
    act(() => result.current.prompt('overview'))
    await act(async () => {
      await result.current.request()
    })
    expect(api.propose).toHaveBeenCalledTimes(2)
    expect(api.propose.mock.calls[1][0].context.relations).toHaveLength(
      AI_LIMITS.initialRelations + 1,
    )
    expect(result.current.review?.stale).toBe(false)
    act(replaceMetadata)
    expect(result.current.review?.stale).toBe(true)
    act(() => {
      result.current.apply()
    })
    expect(useStore.getState().tabs[0].sql).toBe('SELECT 1')
    expect(api.run).not.toHaveBeenCalled()
    expect(api.connect).not.toHaveBeenCalled()
  })
}

it('generate: revalidates cached prepared context before the first model request', async () => {
  const { result } = renderHook(useGenerateController)
  await waitFor(() => expect(result.current.configured).toBe(true))
  act(() => result.current.prompt('overview'))
  await waitFor(() => expect(result.current.context).not.toBeNull())
  vi.mocked(ensureRelationColumns).mockResolvedValue([
    { name: 'fresh_id', dataTypeName: 'integer' },
  ])
  let request!: Promise<void>
  act(() => {
    replaceMetadata()
    // Keep the old render's cached preparation in this event turn.
    request = result.current.request()
  })
  await act(async () => {
    await request
  })
  expect(api.propose).toHaveBeenCalledTimes(1)
  expect(
    api.propose.mock.calls[0][0].context.relations[0].columns[0].name,
  ).toBe('fresh_id')
})
