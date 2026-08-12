// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DatabaseRelationNode } from '@shared/types'

const { describeTable } = vi.hoisted(() => ({ describeTable: vi.fn() }))
vi.mock('./api', () => ({ api: { connections: { describeTable } } }))

import { ensureRelationColumns } from './relationColumns'
import { useStore } from '../store/useStore'
import { resetTestStore } from '../test/sessionTestUtils'

const relation: DatabaseRelationNode = {
  schema: 'public', name: 'orders', qualifiedName: 'public.orders', kind: 'r', columnsStatus: 'idle'
}

beforeEach(() => {
  resetTestStore()
  describeTable.mockReset()
  useStore.getState().setMetadata([{ name: 'public', isSystem: false, relations: [relation] }], 'loaded', null, 'p1')
})

describe('ensureRelationColumns', () => {
  it('deduplicates tree/autocomplete loads and shares the cached result', async () => {
    let finish!: (columns: Array<{ name: string; dataTypeName: string }>) => void
    describeTable.mockReturnValue(new Promise((resolve) => { finish = resolve }))
    const first = ensureRelationColumns('p1', relation)
    const second = ensureRelationColumns('p1', relation)
    expect(describeTable).toHaveBeenCalledTimes(1)
    finish([{ name: 'id', dataTypeName: 'integer' }])
    await expect(first).resolves.toEqual([{ name: 'id', dataTypeName: 'integer' }])
    await expect(second).resolves.toEqual([{ name: 'id', dataTypeName: 'integer' }])
    await ensureRelationColumns('p1', relation)
    expect(describeTable).toHaveBeenCalledTimes(1)
  })

  it('keeps a pending result scoped to its original profile', async () => {
    let finish!: (columns: Array<{ name: string; dataTypeName: string }>) => void
    describeTable.mockReturnValue(new Promise((resolve) => { finish = resolve }))
    const request = ensureRelationColumns('p1', relation)
    useStore.getState().setMetadata([{ name: 'public', isSystem: false, relations: [{ ...relation, name: 'other', qualifiedName: 'public.other' }] }], 'loaded', null, 'p2')
    useStore.getState().setActive('p2')
    finish([{ name: 'id', dataTypeName: 'integer' }])
    await request
    expect(useStore.getState().metadataByProfileId.p2.schemas[0].relations[0].name).toBe('other')
    expect(useStore.getState().metadataByProfileId.p1.schemas[0].relations[0].columns?.[0].name).toBe('id')
  })
})
