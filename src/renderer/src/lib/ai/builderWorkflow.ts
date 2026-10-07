import { materializeAiBuilderTargetState } from '@shared/aiBuilder'
import {
  AI_LIMITS,
  type AiBuilderColumnContext,
  type AiBuilderPatch,
  type AiBuilderState,
} from '@shared/ai'
import {
  BUILDER_AGGREGATIONS,
  BUILDER_TIME_BUCKETS,
  isBuilderTemporalDataType,
  isBuilderTimeBucketSupported,
} from '@shared/builderCapabilities'
import {
  isMinuteBucketAvailable,
  validateBuilderTimeRange,
} from '@shared/builderTimeRange'
import {
  isNumericType,
  type DatabaseColumnNode,
  type DatabaseRelationNode,
} from '@shared/types'
import {
  aiBuilderMutationFingerprint,
  normalizedAiBuilderState,
  transitionBuilderConfiguration,
} from '@lib/builderConfiguration'
import { selectSession, useStore } from '@store/useStore'

export interface AiBuilderSnapshot {
  tabId: string
  profileId: string
  state: AiBuilderState
  guard: string
}

export interface AiPreparedBuilderContext {
  snapshot: AiBuilderSnapshot
  prompt: string
  columns: AiBuilderColumnContext[]
}

const relationKey = (relation: { schema: string; name: string }) =>
  `${relation.schema}.${relation.name}`

export function captureAiBuilderSnapshot(): AiBuilderSnapshot | null {
  const store = useStore.getState()
  const session = selectSession(store, store.activeTabId)
  if (
    !session ||
    session.queryMode !== 'builder' ||
    !session.connectionProfileId
  )
    return null
  const profile = store.profiles.find(
    (candidate) => candidate.id === session.connectionProfileId,
  )
  if (profile?.kind !== 'postgres') return null
  const state = normalizedAiBuilderState(session)
  return state
    ? {
        tabId: session.id,
        profileId: session.connectionProfileId,
        state,
        guard: aiBuilderMutationFingerprint(session),
      }
    : null
}

export const matchesAiBuilderSnapshot = (
  snapshot: AiBuilderSnapshot,
  current = captureAiBuilderSnapshot(),
): boolean =>
  Boolean(
    current &&
    snapshot.tabId === current.tabId &&
    snapshot.profileId === current.profileId &&
    snapshot.guard === current.guard &&
    JSON.stringify(snapshot.state) === JSON.stringify(current.state),
  )

function selectedRelation(
  snapshot: AiBuilderSnapshot,
): DatabaseRelationNode | null {
  const metadata =
    useStore.getState().metadataByProfileId[snapshot.profileId]?.schemas ?? []
  for (const schema of metadata) {
    const relation = schema.relations.find(
      (candidate) =>
        candidate.schema === snapshot.state.relation.schema &&
        candidate.name === snapshot.state.relation.name,
    )
    if (relation) return relation
  }
  return null
}

const tokens = (value: string) =>
  new Set(value.toLowerCase().match(/[\p{L}\p{N}_]+/gu) ?? [])

function rankColumns(
  columns: DatabaseColumnNode[],
  prompt: string,
  state: AiBuilderState,
): DatabaseColumnNode[] {
  const requested = tokens(prompt)
  const current = new Set(
    [state.xColumn, state.valueColumn, state.timeColumn].filter(
      (value): value is string => Boolean(value),
    ),
  )
  return columns
    .map((column, index) => {
      const words = tokens(`${column.name} ${column.name.replaceAll('_', ' ')}`)
      let score = current.has(column.name) ? 100 : 0
      for (const word of requested) if (words.has(word)) score += 10
      return { column, index, score }
    })
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ column }) => column)
}

function validateAiBuilderTarget(
  target: AiBuilderState,
  columns: AiBuilderColumnContext[],
): void {
  const byName = new Map(columns.map((column) => [column.name, column]))
  const x = target.xColumn ? byName.get(target.xColumn) : undefined
  if (target.xColumn && !x)
    throw new Error('The proposed X axis is not an available column.')
  const y = target.valueColumn ? byName.get(target.valueColumn) : undefined
  if (target.valueColumn && (!y || !isNumericType(y.dataType)))
    throw new Error('The proposed Y axis is not an available numeric column.')
  if (
    !BUILDER_AGGREGATIONS.includes(target.aggregation) ||
    (target.aggregation !== 'count' && !y) ||
    (target.xColumn && target.xColumn === target.valueColumn)
  )
    throw new Error('The proposed aggregation cannot be represented safely.')
  const time = target.timeColumn ? byName.get(target.timeColumn) : undefined
  if (target.timeColumn && (!time || !isBuilderTemporalDataType(time.dataType)))
    throw new Error('The proposed time column is not temporal.')
  if (
    !BUILDER_TIME_BUCKETS.includes(target.timeBucket) ||
    !isBuilderTimeBucketSupported(x?.dataType, target.timeBucket, 'postgres')
  )
    throw new Error('The proposed time bucket is not supported.')
  if (
    target.timeRange &&
    (!target.timeColumn ||
      validateBuilderTimeRange(target.timeRange) ||
      (target.timeBucket === 'minute' &&
        !isMinuteBucketAvailable(target.timeRange)))
  )
    throw new Error('The proposed time range is not valid for this Builder.')
}

export function prepareAiBuilderContext(
  snapshot: AiBuilderSnapshot,
  prompt: string,
): AiPreparedBuilderContext {
  const relation = selectedRelation(snapshot)
  if (
    !relation ||
    relationKey(relation) !== relationKey(snapshot.state.relation) ||
    relation.columnsStatus !== 'loaded' ||
    !relation.columns
  )
    throw new Error(
      'Column metadata for the selected relation is not available yet.',
    )

  const columns: AiBuilderColumnContext[] = []
  for (const column of rankColumns(relation.columns, prompt, snapshot.state)) {
    if (columns.length >= AI_LIMITS.columnsPerRelation) break
    const next = {
      name: column.name,
      dataType: column.dataTypeName,
      ...(column.nullable === undefined ? {} : { nullable: column.nullable }),
    }
    const candidate = [...columns, next]
    if (
      JSON.stringify({
        prompt,
        state: snapshot.state,
        columns: candidate,
      }).length > AI_LIMITS.contextCharacters
    )
      break
    columns.push(next)
  }
  if (!columns.length)
    throw new Error('No usable column metadata is available for this relation.')
  return { snapshot, prompt, columns }
}

export function materializeEffectiveAiBuilderTarget(
  prepared: AiPreparedBuilderContext,
  patch: AiBuilderPatch,
): AiBuilderState {
  const target = materializeAiBuilderTargetState(
    prepared.snapshot.state,
    patch,
    prepared.columns,
  )
  validateAiBuilderTarget(target, prepared.columns)
  const session = selectSession(useStore.getState(), prepared.snapshot.tabId)
  if (!session) throw new Error('The Builder tab no longer exists.')
  const transition = transitionBuilderConfiguration(session, target)
  const effective = normalizedAiBuilderState({
    builder: transition.builder,
    builderVisualization: transition.builderVisualization,
  })
  if (!effective) throw new Error('The Builder relation is no longer selected.')
  return effective
}
