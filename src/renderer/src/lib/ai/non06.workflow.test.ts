import { expect, test, vi } from 'vitest'
import type { DatabaseColumnNode, DatabaseRelationNode, DatabaseSchemaNode } from '@shared/types'
import { ensureRelationColumns } from '@lib/relationColumns'
import { expandAiQueryContext } from './workflow'

const fixture = vi.hoisted(() => ({
  state: { metadataByProfileId: {} } as {
    metadataByProfileId: Record<string, { schemas: unknown[] }>
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
  prompt: 'count devices',
  context: {
    language: { kind: 'sql' as const, dialect: 'postgres' as const },
    relations: [],
  },
}
const request = { searchTerms: ['device'], reason: 'Find device metadata' }

test.fails('NON06 EXPECTED FAILURE: discovery must refuse columns resolved after the originating profile metadata is replaced', async () => {
  fixture.state = {
    metadataByProfileId: { 'profile-a': { schemas } },
  }
  let finish: ((value: DatabaseColumnNode[]) => void) | undefined
  vi.mocked(ensureRelationColumns).mockImplementation(
    () => new Promise<DatabaseColumnNode[]>((resolve) => { finish = resolve }),
  )
  const expansion = expandAiQueryContext(input, request)
  expect(ensureRelationColumns).toHaveBeenCalledWith('profile-a', relation)
  // Replace the original profile's metadata while a synthetic describeTable
  // is still pending. The workflow does not compare a metadata revision here.
  fixture.state = { metadataByProfileId: { 'profile-a': { schemas: [] } } }
  finish?.([{ name: 'id', dataTypeName: 'uuid' }])
  await expect(expansion).rejects.toThrow(/stale|changed|invalidated/i)
})

test('NON06 expansion remains tied to the original profile ID rather than the newly active profile', async () => {
  fixture.state = {
    metadataByProfileId: {
      'profile-a': { schemas },
      'profile-b': { schemas: [{ name: 'public', isSystem: false, relations: [] }] },
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
