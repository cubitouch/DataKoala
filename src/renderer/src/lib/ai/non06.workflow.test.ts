import { expect, test, vi } from 'vitest'
import type {
  DatabaseColumnNode,
  DatabaseRelationNode,
  DatabaseSchemaNode,
} from '@shared/types'
import { ensureRelationColumns } from '@lib/relationColumns'
import { expandAiQueryContext } from './workflow'

const fixture = vi.hoisted(() => ({
  state: { metadataByProfileId: {}, connectionStateByProfileId: {} } as {
    connectionStateByProfileId: Record<string, { generation: number }>
    metadataByProfileId: Record<
      string,
      { schemas: unknown[]; revision?: number }
    >
  },
}))
vi.mock('@store/useStore', () => ({
  useStore: { getState: () => fixture.state },
  selectActiveSession: vi.fn(),
}))
vi.mock('@lib/relationColumns', () => ({
  ensureRelationColumns: vi.fn(),
}))

const relation: DatabaseRelationNode = {
  schema: 'public',
  name: 'devices',
  qualifiedName: 'public.devices',
  kind: 'r',
  columnsStatus: 'idle',
}
const schemas: DatabaseSchemaNode[] = [
  { name: 'public', isSystem: false, relations: [relation] },
]
const input = {
  snapshot: { tabId: 'non06-tab', profileId: 'profile-a', query: '' },
  metadata: {
    profileId: 'profile-a',
    revision: 1,
    generation: undefined,
    present: true,
  },
  prompt: 'count devices',
  context: {
    language: { kind: 'sql' as const, dialect: 'postgres' as const },
    relations: [],
  },
}
const request = { searchTerms: ['device'], reason: 'Find device metadata' }

test('NON06 discovery refuses columns resolved after the originating profile metadata revision changes', async () => {
  fixture.state = {
    connectionStateByProfileId: {},
    metadataByProfileId: { 'profile-a': { schemas, revision: 1 } },
  }
  let finish: ((value: DatabaseColumnNode[]) => void) | undefined
  vi.mocked(ensureRelationColumns).mockImplementation(
    () =>
      new Promise<DatabaseColumnNode[]>((resolve) => {
        finish = resolve
      }),
  )
  const expansion = expandAiQueryContext(input, request)
  expect(ensureRelationColumns).toHaveBeenCalledWith('profile-a', relation)
  // Replace the original profile's metadata while a synthetic describeTable
  // is still pending. The captured revision must invalidate this discovery result.
  fixture.state = {
    connectionStateByProfileId: {},
    metadataByProfileId: { 'profile-a': { schemas: [], revision: 2 } },
  }
  finish?.([{ name: 'id', dataTypeName: 'uuid' }])
  await expect(expansion).rejects.toThrow(/stale|changed|invalidated/i)
})

test('NON06 expansion remains tied to the original profile ID rather than the newly active profile', async () => {
  fixture.state = {
    connectionStateByProfileId: {},
    metadataByProfileId: {
      'profile-a': { schemas, revision: 1 },
      'profile-b': {
        schemas: [{ name: 'public', isSystem: false, relations: [] }],
      },
    },
  }
  vi.mocked(ensureRelationColumns).mockResolvedValue([
    { name: 'device_id', dataTypeName: 'uuid' },
  ])
  const expanded = await expandAiQueryContext(input, request)
  expect(ensureRelationColumns).toHaveBeenCalledWith('profile-a', relation)
  expect(expanded.discovery?.addedRelations).toEqual(['public.devices'])
  expect(expanded.context.relations[0].columns[0].name).toBe('device_id')
  expect(expanded.context.language.dialect).toBe('postgres')
})

test('NON06 refuses stale prepared metadata before any discovery column load', async () => {
  fixture.state = {
    connectionStateByProfileId: {},
    metadataByProfileId: { 'profile-a': { schemas, revision: 2 } },
  }
  vi.mocked(ensureRelationColumns).mockClear()
  await expect(expandAiQueryContext(input, request)).rejects.toThrow(/changed/i)
  expect(ensureRelationColumns).not.toHaveBeenCalled()
})

test('NON06 stops subsequent discovery column loads when the first invalidates metadata', async () => {
  const next = {
    ...relation,
    name: 'devices_next',
    qualifiedName: 'public.devices_next',
  }
  fixture.state = {
    connectionStateByProfileId: {},
    metadataByProfileId: {
      'profile-a': {
        schemas: [{ ...schemas[0], relations: [relation, next] }],
        revision: 1,
      },
    },
  }
  vi.mocked(ensureRelationColumns)
    .mockReset()
    .mockImplementation(async () => {
      fixture.state.metadataByProfileId['profile-a'].revision = 2
      return [{ name: 'old_id', dataTypeName: 'uuid' }]
    })
  await expect(expandAiQueryContext(input, request)).rejects.toThrow(/changed/i)
  expect(ensureRelationColumns).toHaveBeenCalledTimes(1)
})

test('NON06 rejects a replacement connection generation before loading discovery columns', async () => {
  fixture.state = {
    connectionStateByProfileId: { 'profile-a': { generation: 2 } },
    metadataByProfileId: { 'profile-a': { schemas, revision: 1 } },
  }
  vi.mocked(ensureRelationColumns).mockClear()
  const prepared = { ...input, metadata: { ...input.metadata, generation: 1 } }
  await expect(expandAiQueryContext(prepared, request)).rejects.toThrow(
    /changed/i,
  )
  expect(ensureRelationColumns).not.toHaveBeenCalled()
})
