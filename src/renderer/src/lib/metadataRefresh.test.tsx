import { afterEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ refresh: vi.fn(), listObjects: vi.fn() }))
vi.mock('./api', () => ({
  api: {
    connections: {
      refreshMetadata: mocks.refresh,
      listObjects: mocks.listObjects,
    },
  },
}))

import { createQuerySession, useStore } from '@store/useStore'

const oldSchemas = [
  {
    name: 'public',
    isSystem: false,
    relations: [
      {
        schema: 'public',
        name: 'old_table',
        qualifiedName: 'public.old_table',
        kind: 'r' as const,
        columnsStatus: 'idle' as const,
      },
    ],
  },
]

function connectedState() {
  const tab = createQuerySession(1, {
    connectionProfileId: 'profile-a',
    sql: 'select 42',
  })
  useStore.setState(
    {
      ...useStore.getInitialState(),
      connectionStateByProfileId: {
        'profile-a': {
          status: 'connected',
          generation: 7,
          error: null,
          serverVersion: '16',
        },
      },
      tabs: [
        {
          ...tab,
          result: { columns: [], rows: [], rowCount: 0, durationMs: 1 },
        },
      ],
      activeTabId: tab.id,
      metadataByProfileId: {
        'profile-a': {
          schemas: oldSchemas,
          status: 'loaded',
          error: null,
          isStale: false,
        },
      },
    },
    true,
  )
}

function restoredConnectedState() {
  const tab = createQuerySession(1, {
    connectionProfileId: 'profile-a',
    sql: 'select 42',
  })
  useStore.setState(
    {
      ...useStore.getInitialState(),
      tabs: [tab],
      activeTabId: tab.id,
      connectionStateByProfileId: {
        'profile-a': {
          status: 'connected',
          generation: 7,
          error: null,
          serverVersion: null,
        },
      },
      metadataByProfileId: {},
    },
    true,
  )
}

afterEach(() => {
  vi.clearAllMocks()
  connectedState()
})

it('refreshes A while B is selected and leaves B metadata and A session state unchanged', async () => {
  connectedState()
  useStore.setState((state) => ({
    connectionStateByProfileId: {
      ...state.connectionStateByProfileId,
      'profile-b': {
        status: 'connected',
        generation: 2,
        error: null,
        serverVersion: '16-b',
      },
    },
    metadataByProfileId: {
      ...state.metadataByProfileId,
      'profile-b': {
        schemas: [],
        status: 'loaded',
        error: null,
        isStale: false,
      },
    },
  }))
  mocks.refresh.mockResolvedValue(undefined)
  mocks.listObjects.mockResolvedValue([
    { schema: 'public', name: 'new_table', kind: 'r' },
  ])
  const before = useStore.getState().tabs[0]
  await useStore.getState().refreshMetadata('profile-a')
  const state = useStore.getState()
  expect(
    state.metadataByProfileId['profile-a'].schemas[0].relations[0].name,
  ).toBe('new_table')
  expect(state.metadataByProfileId['profile-a'].revision).toBe(1)
  expect(state.metadataByProfileId['profile-b'].schemas).toEqual([])
  expect(state.tabs[0]).toEqual(before)
  expect(state.connectionStateByProfileId['profile-a'].status).toBe('connected')
  expect(state.connectionStateByProfileId['profile-a'].generation).toBe(7)
})

it('creates missing renderer metadata when refreshing a restored live session', async () => {
  restoredConnectedState()
  mocks.refresh.mockResolvedValue(undefined)
  mocks.listObjects.mockResolvedValue([
    { schema: 'public', name: 'orders', kind: 'r' },
  ])

  const pending = useStore.getState().refreshMetadata('profile-a')
  expect(useStore.getState().metadataByProfileId['profile-a']).toMatchObject({
    status: 'loading',
    refreshing: true,
  })
  await pending

  expect(mocks.listObjects).toHaveBeenCalledWith('profile-a')
  expect(useStore.getState().metadataByProfileId['profile-a']).toMatchObject({
    status: 'loaded',
    refreshing: false,
    revision: 1,
    schemas: [{ name: 'public', relations: [{ name: 'orders' }] }],
  })
})

it('reports a missing-state refresh failure and permits recovery', async () => {
  restoredConnectedState()
  let finishRetry!: () => void
  mocks.refresh
    .mockRejectedValueOnce(new Error('discovery unavailable'))
    .mockReturnValueOnce(
      new Promise<void>((resolve) => {
        finishRetry = resolve
      }),
    )
  mocks.listObjects.mockResolvedValue([
    { schema: 'public', name: 'orders', kind: 'r' },
  ])

  await useStore.getState().refreshMetadata('profile-a')
  expect(useStore.getState().metadataByProfileId['profile-a']).toMatchObject({
    schemas: [],
    status: 'error',
    error: 'discovery unavailable',
    refreshing: false,
    refreshError: null,
  })

  const retry = useStore.getState().refreshMetadata('profile-a')
  expect(useStore.getState().metadataByProfileId['profile-a']).toMatchObject({
    status: 'loading',
    refreshing: true,
    error: null,
  })
  finishRetry()
  await retry
  expect(useStore.getState().metadataByProfileId['profile-a']).toMatchObject({
    status: 'loaded',
    refreshing: false,
    revision: 1,
  })
})

it('keeps previous metadata after failure and permits a retry', async () => {
  connectedState()
  mocks.refresh
    .mockRejectedValueOnce(new Error('discovery unavailable'))
    .mockResolvedValueOnce(undefined)
  mocks.listObjects.mockResolvedValue([
    { schema: 'public', name: 'new_table', kind: 'r' },
  ])
  await useStore.getState().refreshMetadata('profile-a')
  expect(useStore.getState().metadataByProfileId['profile-a']).toMatchObject({
    schemas: oldSchemas,
    refreshing: false,
    refreshError: 'discovery unavailable',
  })
  expect(
    useStore.getState().metadataByProfileId['profile-a'].revision,
  ).toBeUndefined()
  await useStore.getState().refreshMetadata('profile-a')
  expect(
    useStore.getState().metadataByProfileId['profile-a'].schemas[0].relations[0]
      .name,
  ).toBe('new_table')
})

it('deduplicates concurrent refreshes for one profile', async () => {
  connectedState()
  let resolve!: () => void
  mocks.refresh.mockReturnValue(
    new Promise<void>((done) => {
      resolve = done
    }),
  )
  mocks.listObjects.mockResolvedValue([])
  const first = useStore.getState().refreshMetadata('profile-a')
  const second = useStore.getState().refreshMetadata('profile-a')
  expect(mocks.refresh).toHaveBeenCalledTimes(1)
  resolve()
  await Promise.all([first, second])
  expect(mocks.listObjects).toHaveBeenCalledTimes(1)
})

it.each(['success', 'error'] as const)(
  'discards stale metadata %s for A without consulting the active profile or global generation',
  async (outcome) => {
    connectedState()
    let resolveObjects!: (
      objects: Array<{ schema: string; name: string; kind: 'r' }>,
    ) => void
    let rejectObjects!: (error: Error) => void
    mocks.refresh.mockResolvedValue(undefined)
    mocks.listObjects.mockReturnValue(
      new Promise((done, reject) => {
        resolveObjects = done
        rejectObjects = reject
      }),
    )
    const pending = useStore.getState().refreshMetadata('profile-a')
    await vi.waitFor(() => expect(mocks.listObjects).toHaveBeenCalled())
    useStore.setState((state) => ({
      connectionStateByProfileId: {
        ...state.connectionStateByProfileId,
        'profile-a': {
          status: 'connected',
          generation: 8,
          error: null,
          serverVersion: '17',
        },
        'profile-b': {
          status: 'connected',
          generation: 8,
          error: null,
          serverVersion: '16',
        },
      },
      metadataByProfileId: {
        ...state.metadataByProfileId,
        'profile-b': {
          schemas: [],
          status: 'loaded',
          error: null,
          isStale: false,
        },
      },
    }))
    if (outcome === 'success')
      resolveObjects([{ schema: 'public', name: 'stale_table', kind: 'r' }])
    else rejectObjects(new Error('stale discovery failure'))
    await pending
    expect(
      useStore.getState().metadataByProfileId['profile-a'].schemas,
    ).toEqual(oldSchemas)
    expect(useStore.getState().metadataByProfileId['profile-b']).toMatchObject({
      schemas: [],
      status: 'loaded',
    })
  },
)

// #365 D1 regression: replacement generations must start fresh work.
it('starts fresh metadata work for a replacement generation while old refresh is pending', async () => {
  connectedState()
  let finishOld!: () => void
  mocks.refresh
    .mockReturnValueOnce(
      new Promise<void>((resolve) => {
        finishOld = resolve
      }),
    )
    .mockResolvedValue(undefined)
  mocks.listObjects.mockResolvedValue([])
  const old = useStore.getState().refreshMetadata('profile-a')
  useStore.setState((state) => ({
    connectionStateByProfileId: {
      ...state.connectionStateByProfileId,
      'profile-a': {
        ...state.connectionStateByProfileId['profile-a'],
        generation: 8,
      },
    },
  }))
  const replacement = useStore.getState().refreshMetadata('profile-a')
  const callsBeforeOldCompletion = mocks.refresh.mock.calls.length
  finishOld()
  await Promise.all([old, replacement])
  expect(callsBeforeOldCompletion).toBe(2)
})

it.each(['success', 'error'] as const)(
  'keeps replacement refresh registered after obsolete %s and stops stale discovery',
  async (outcome) => {
    connectedState()
    let finishOld!: () => void
    let failOld!: (error: Error) => void
    let finishNew!: () => void
    mocks.refresh.mockReset()
    mocks.refresh
      .mockReturnValueOnce(
        new Promise<void>((resolve, reject) => {
          finishOld = resolve
          failOld = reject
        }),
      )
      .mockReturnValueOnce(
        new Promise<void>((resolve) => {
          finishNew = resolve
        }),
      )
      .mockResolvedValue(undefined)
    mocks.listObjects.mockResolvedValue([])
    const old = useStore.getState().refreshMetadata('profile-a')
    useStore.setState((state) => ({
      connectionStateByProfileId: {
        ...state.connectionStateByProfileId,
        'profile-a': {
          ...state.connectionStateByProfileId['profile-a'],
          generation: 8,
        },
        'profile-b': {
          ...state.connectionStateByProfileId['profile-a'],
          generation: 2,
        },
      },
    }))
    const replacement = useStore.getState().refreshMetadata('profile-a')
    if (outcome === 'success') finishOld()
    else failOld(new Error('obsolete refresh'))
    await old
    expect(mocks.listObjects).not.toHaveBeenCalled()
    expect(useStore.getState().metadataByProfileId['profile-a']).toMatchObject({
      schemas: oldSchemas,
      refreshing: true,
      refreshError: null,
    })
    const joined = useStore.getState().refreshMetadata('profile-a')
    expect(mocks.refresh).toHaveBeenCalledTimes(2)
    await useStore.getState().refreshMetadata('profile-b')
    expect(mocks.refresh).toHaveBeenCalledTimes(3)
    expect(mocks.listObjects).toHaveBeenCalledExactlyOnceWith('profile-b')
    finishNew()
    await Promise.all([replacement, joined])
    expect(mocks.listObjects).toHaveBeenCalledTimes(2)
    expect(useStore.getState().metadataByProfileId['profile-a']).toMatchObject({
      schemas: [],
      refreshing: false,
      revision: 1,
    })
  },
)

it.each(['success', 'error'] as const)(
  'discards obsolete discovery %s while replacement discovery remains pending',
  async (outcome) => {
    connectedState()
    let finishOld!: (
      objects: Array<{ schema: string; name: string; kind: 'r' }>,
    ) => void
    let failOld!: (error: Error) => void
    let failNew!: (error: Error) => void
    let startedOld!: () => void
    let startedNew!: () => void
    const oldStarted = new Promise<void>((resolve) => {
      startedOld = resolve
    })
    const newStarted = new Promise<void>((resolve) => {
      startedNew = resolve
    })
    mocks.refresh.mockReset()
    mocks.refresh.mockResolvedValue(undefined)
    mocks.listObjects.mockReset()
    mocks.listObjects
      .mockImplementationOnce(() => {
        startedOld()
        return new Promise((resolve, reject) => {
          finishOld = resolve
          failOld = reject
        })
      })
      .mockImplementationOnce(() => {
        startedNew()
        return new Promise((_, reject) => {
          failNew = reject
        })
      })
      .mockResolvedValue([])
    const old = useStore.getState().refreshMetadata('profile-a')
    await oldStarted
    useStore.setState((state) => ({
      connectionStateByProfileId: {
        ...state.connectionStateByProfileId,
        'profile-a': {
          ...state.connectionStateByProfileId['profile-a'],
          generation: 8,
        },
      },
    }))
    const replacement = useStore.getState().refreshMetadata('profile-a')
    await newStarted
    if (outcome === 'success')
      finishOld([{ schema: 'public', name: 'obsolete', kind: 'r' }])
    else failOld(new Error('obsolete discovery'))
    await old
    expect(useStore.getState().metadataByProfileId['profile-a']).toMatchObject({
      schemas: oldSchemas,
      refreshing: true,
      refreshError: null,
    })
    const joined = useStore.getState().refreshMetadata('profile-a')
    expect(mocks.refresh).toHaveBeenCalledTimes(2)
    failNew(new Error('current discovery'))
    await Promise.all([replacement, joined])
    expect(useStore.getState().metadataByProfileId['profile-a']).toMatchObject({
      schemas: oldSchemas,
      refreshing: false,
      refreshError: 'current discovery',
    })
    await useStore.getState().refreshMetadata('profile-a')
    expect(mocks.refresh).toHaveBeenCalledTimes(3)
    expect(useStore.getState().metadataByProfileId['profile-a']).toMatchObject({
      schemas: [],
      refreshing: false,
      refreshError: null,
      revision: 1,
    })
  },
)
