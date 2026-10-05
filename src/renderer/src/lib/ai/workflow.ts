import { ensureRelationColumns } from '@lib/relationColumns'
import { selectActiveSession, useStore } from '@store/useStore'
import type { AiContextRequest, AiQueryContext } from '@shared/ai'
import {
  appendAiContext,
  buildAiContext,
  expandAiRelations,
  selectAiRelations,
} from './context'

export interface AiQuerySnapshot {
  tabId: string
  profileId: string | null
  query: string
}
export interface AiDiscoveryDetails {
  initialContext: AiQueryContext
  request: AiContextRequest
  addedRelations: string[]
}
export interface AiPreparedContext {
  snapshot: AiQuerySnapshot
  prompt: string
  context: AiQueryContext
  discovery?: AiDiscoveryDetails
}
export const captureAiQuerySnapshot = (): AiQuerySnapshot => {
  const tab = selectActiveSession(useStore.getState())
  return { tabId: tab.id, profileId: tab.connectionProfileId, query: tab.sql }
}
export const matchesAiQuerySnapshot = (
  a: AiQuerySnapshot,
  b: AiQuerySnapshot,
) => a.tabId === b.tabId && a.profileId === b.profileId && a.query === b.query

export async function prepareAiQueryContext(
  snapshot: AiQuerySnapshot,
  rankingText: string,
): Promise<AiPreparedContext> {
  if (!snapshot.profileId) throw new Error('No PostgreSQL connection selected.')
  const schemas =
    useStore.getState().metadataByProfileId[snapshot.profileId]?.schemas ?? []
  const context = await buildAiContext(
    selectAiRelations(schemas, rankingText, snapshot.query),
    (relation) => ensureRelationColumns(snapshot.profileId!, relation),
  )
  return { snapshot, prompt: rankingText, context }
}

export async function expandAiQueryContext(
  input: AiPreparedContext,
  request: AiContextRequest,
): Promise<AiPreparedContext> {
  if (!input.snapshot.profileId)
    throw new Error('No PostgreSQL connection selected.')
  const schemas =
    useStore.getState().metadataByProfileId[input.snapshot.profileId]
      ?.schemas ?? []
  const candidates = expandAiRelations(
    schemas,
    request.searchTerms,
    input.snapshot.query,
    input.context.relations,
  )
  const initialContext = input.context
  const context = candidates.length
    ? await appendAiContext(initialContext, candidates, (relation) =>
        ensureRelationColumns(input.snapshot.profileId!, relation),
      )
    : initialContext
  const before = new Set(
    initialContext.relations.map(
      (relation) => `${relation.schema}.${relation.name}`,
    ),
  )
  return {
    ...input,
    context,
    discovery: {
      initialContext,
      request,
      addedRelations: context.relations
        .filter(
          (relation) => !before.has(`${relation.schema}.${relation.name}`),
        )
        .map((relation) => `${relation.schema}.${relation.name}`),
    },
  }
}

const requestedConcepts = (request: AiContextRequest) =>
  request.searchTerms.map((term) => `“${term}”`).join(', ')
export const noAiMetadataMatchMessage = (request: AiContextRequest) =>
  `AI requested more metadata for ${requestedConcepts(request)} (${request.reason}), but DataKoala found no undisclosed matching relation within the metadata budget. Make the prompt more specific or mention the relevant table.`
export const secondAiContextRequestMessage = (request: AiContextRequest) =>
  `AI still needs more metadata for ${requestedConcepts(request)} (${request.reason}) after one discovery step. DataKoala stops after one expansion. Make the prompt more specific or mention the relevant table or columns.`
