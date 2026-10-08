import { AI_LIMITS } from '../../shared/ai.ts'
import { sanitizeAiErrorContext } from '../../shared/aiErrorContext.ts'
import {
  BUILDER_AGGREGATIONS,
  BUILDER_TIME_BUCKETS,
  isBuilderTemporalDataType,
  isBuilderTimeBucketSupported,
  type BuilderAggregation,
  type BuilderTimeBucket,
} from '../../shared/builderCapabilities.ts'
import {
  isMinuteBucketAvailable,
  parseBuilderRollingTimeRange,
  validateBuilderTimeRange,
  type BuilderTimeRange,
} from '../../shared/builderTimeRange.ts'
import { materializeAiBuilderTargetState } from '../../shared/aiBuilder.ts'
import {
  DATA_SOURCE_DESCRIPTORS,
  isNumericType,
  type SqlDialect,
} from '../../shared/types.ts'
import type {
  AiBuilderPatch,
  AiBuilderProposal,
  AiBuilderProposalRequest,
  AiBuilderState,
  AiBuilderStep,
  AiContextRequest,
  AiErrorCode,
  AiQueryProposal,
  AiQueryProposalRequest,
  AiQueryStep,
  AiSettingsInput,
} from '../../shared/ai.ts'

export class AiError extends Error {
  code: AiErrorCode
  constructor(code: AiErrorCode, message: string) {
    super(message)
    this.code = code
  }
}
export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new AiError('validation', 'Invalid AI request.')
  return value as Record<string, unknown>
}
export function textValue(value: unknown, max: number, empty = false): string {
  if (
    typeof value !== 'string' ||
    value.length > max ||
    (!empty && !value.trim())
  )
    throw new AiError('validation', 'Invalid or oversized AI input.')
  return value
}
export function requestId(value: unknown): string {
  return textValue(value, 128)
}
export function settingsInput(value: unknown): AiSettingsInput {
  const input = record(value)
  return {
    model: textValue(input.model, 256),
    ...(input.apiKey === undefined
      ? {}
      : { apiKey: textValue(input.apiKey, 1024, true).trim() }),
  }
}
const supportedSqlDialects = new Set<SqlDialect>(
  Object.values(DATA_SOURCE_DESCRIPTORS).map(
    (descriptor) => descriptor.dialect,
  ),
)

export function proposalRequest(value: unknown): AiQueryProposalRequest {
  const input = record(value),
    context = record(input.context),
    language = record(context.language)
  const dialect = language.dialect
  if (
    language.kind !== 'sql' ||
    typeof dialect !== 'string' ||
    !supportedSqlDialects.has(dialect as SqlDialect) ||
    !Array.isArray(context.relations) ||
    context.relations.length > AI_LIMITS.relations
  )
    throw new AiError('validation', 'Invalid SQL AI context.')
  let columns = 0
  const relations = context.relations.map((item) => {
    const relation = record(item)
    if (
      !['table', 'view', 'matview'].includes(String(relation.kind)) ||
      !Array.isArray(relation.columns) ||
      relation.columns.length > AI_LIMITS.columnsPerRelation
    )
      throw new AiError('validation', 'Invalid AI relation context.')
    columns += relation.columns.length
    return {
      schema: textValue(relation.schema, 256),
      name: textValue(relation.name, 256),
      kind: relation.kind as 'table' | 'view' | 'matview',
      columns: relation.columns.map((item) => {
        const column = record(item)
        if (
          column.nullable !== undefined &&
          typeof column.nullable !== 'boolean'
        )
          throw new AiError('validation', 'Invalid AI column context.')
        return {
          name: textValue(column.name, 256),
          dataType: textValue(column.dataType, 256),
          ...(typeof column.nullable === 'boolean'
            ? { nullable: column.nullable }
            : {}),
        }
      }),
    }
  })
  const rawAvailableRelations = context.availableRelations
  if (
    rawAvailableRelations !== undefined &&
    (!Array.isArray(rawAvailableRelations) ||
      rawAvailableRelations.length > AI_LIMITS.relationCatalog)
  )
    throw new AiError('validation', 'Invalid AI relation catalog.')
  const availableRelations = (rawAvailableRelations ?? []).map((item) => {
    const relation = record(item)
    return {
      schema: textValue(relation.schema, 256),
      name: textValue(relation.name, 256),
    }
  })
  const cleanContext = {
    language: { kind: 'sql' as const, dialect: dialect as SqlDialect },
    relations,
    ...(rawAvailableRelations === undefined ? {} : { availableRelations }),
  }
  if (
    columns > AI_LIMITS.columns ||
    JSON.stringify(availableRelations).length >
      AI_LIMITS.relationCatalogCharacters ||
    JSON.stringify(cleanContext).length > AI_LIMITS.contextCharacters
  )
    throw new AiError('validation', 'AI schema context is too large.')
  // Reconstruct an allowlist: accidental profile/result properties never reach the provider.
  if (input.intent !== 'generate' && input.intent !== 'repair')
    throw new AiError('validation', 'Invalid AI request intent.')
  const intent = input.intent
  if (
    intent === 'repair' &&
    (Object.keys(input).some(
      (key) =>
        !['requestId', 'intent', 'currentQuery', 'error', 'context'].includes(
          key,
        ),
    ) ||
      Object.keys(context).some(
        (key) => !['language', 'relations', 'availableRelations'].includes(key),
      ))
  )
    throw new AiError('validation', 'Invalid AI repair request.')
  const currentQuery =
    input.currentQuery === undefined
      ? undefined
      : textValue(input.currentQuery, AI_LIMITS.query, intent === 'generate')
  if (intent === 'generate' && input.error !== undefined)
    throw new AiError(
      'validation',
      'Generation requests cannot include an error.',
    )
  if (intent === 'repair' && (input.prompt !== undefined || !currentQuery))
    throw new AiError('validation', 'Invalid AI repair request.')
  return {
    requestId: requestId(input.requestId),
    intent,
    ...(intent === 'generate'
      ? { prompt: textValue(input.prompt, AI_LIMITS.prompt) }
      : {
          error: sanitizeAiErrorContext(textValue(input.error, 100_000)),
        }),
    ...(currentQuery === undefined ? {} : { currentQuery }),
    context: cleanContext,
  }
}
function validateProposal(input: Record<string, unknown>): AiQueryProposal {
  if (
    !Array.isArray(input.assumptions) ||
    input.assumptions.length > 30 ||
    !Array.isArray(input.searchTerms) ||
    input.searchTerms.length !== 0 ||
    input.reason !== ''
  )
    throw new Error()
  return {
    query: textValue(input.query, AI_LIMITS.query),
    explanation: textValue(input.explanation, 8000, true),
    assumptions: input.assumptions.map((a) => textValue(a, 2000, true)),
  }
}
const contextSearchTerm = (value: unknown) => {
  const term = textValue(value, AI_LIMITS.contextRequestTermCharacters)
  if (
    !/^[\p{L}\p{N}_. -]+$/u.test(term) ||
    /\b(select|insert|update|delete|drop|alter|create|grant|revoke|execute|query|sql|ipc|credential|password|secret|token|connection string|datasource|describetable|listobjects)\b/i.test(
      term,
    )
  )
    throw new Error()
  return term
}
function validateContextRequest(
  input: Record<string, unknown>,
): AiContextRequest {
  if (
    input.query !== '' ||
    input.explanation !== '' ||
    !Array.isArray(input.assumptions) ||
    input.assumptions.length !== 0 ||
    !Array.isArray(input.searchTerms) ||
    input.searchTerms.length < 1 ||
    input.searchTerms.length > AI_LIMITS.contextRequestTerms
  )
    throw new Error()
  return {
    searchTerms: input.searchTerms.map(contextSearchTerm),
    reason: textValue(input.reason, AI_LIMITS.contextRequestReason),
  }
}
export function queryStep(value: unknown): AiQueryStep {
  try {
    const input = record(value)
    if (
      Object.keys(input).some(
        (key) =>
          ![
            'kind',
            'query',
            'explanation',
            'assumptions',
            'searchTerms',
            'reason',
          ].includes(key),
      ) ||
      Object.keys(input).length !== 6
    )
      throw new Error()
    if (input.kind === 'proposal')
      return { kind: 'proposal', proposal: validateProposal(input) }
    if (input.kind === 'context-request')
      return { kind: 'context-request', request: validateContextRequest(input) }
    throw new Error()
  } catch {
    throw new AiError(
      'invalid-response',
      'The model returned an invalid query step. Try again or choose another model.',
    )
  }
}

const exactKeys = (
  input: Record<string, unknown>,
  allowed: readonly string[],
  required: readonly string[] = [],
) => {
  if (
    Object.keys(input).some((key) => !allowed.includes(key)) ||
    required.some((key) => !(key in input))
  )
    throw new Error()
}

const nullableText = (value: unknown, max = 256): string | null => {
  if (value === null) return null
  return textValue(value, max)
}

const parseBuilderTimeRange = (value: unknown): BuilderTimeRange => {
  const input = record(value)
  const recurring = () => {
    if (input.recurringWindows === undefined) return undefined
    if (
      !Array.isArray(input.recurringWindows) ||
      input.recurringWindows.length > 24
    )
      throw new Error()
    return input.recurringWindows.map((item) => {
      const window = record(item)
      exactKeys(window, ['id', 'from', 'to'], ['id', 'from', 'to'])
      return {
        id: textValue(window.id, 128),
        from: textValue(window.from, 5, true),
        to: textValue(window.to, 5, true),
      }
    })
  }
  if (input.kind === 'all') {
    exactKeys(
      input,
      [
        'kind',
        'amount',
        'unit',
        'startDate',
        'startTime',
        'endDate',
        'endTime',
        'recurringWindows',
      ],
      ['kind'],
    )
    const recurringWindows = recurring()
    return recurringWindows?.length
      ? { kind: 'all', recurringWindows }
      : { kind: 'all' }
  }
  if (input.kind === 'rolling') {
    exactKeys(
      input,
      [
        'kind',
        'amount',
        'unit',
        'startDate',
        'startTime',
        'endDate',
        'endTime',
        'recurringWindows',
      ],
      ['kind', 'amount', 'unit'],
    )
    const rolling = parseBuilderRollingTimeRange(input.amount, input.unit)
    if (!rolling) throw new Error()
    const recurringWindows = recurring()
    return {
      ...rolling,
      ...(recurringWindows?.length ? { recurringWindows } : {}),
    }
  }
  if (input.kind === 'custom') {
    exactKeys(
      input,
      [
        'kind',
        'amount',
        'unit',
        'startDate',
        'startTime',
        'endDate',
        'endTime',
        'recurringWindows',
      ],
      ['kind', 'startDate', 'startTime', 'endDate', 'endTime'],
    )
    const date = (item: unknown) => (item === null ? null : textValue(item, 10))
    const recurringWindows = recurring()
    return {
      kind: 'custom',
      startDate: date(input.startDate),
      startTime: textValue(input.startTime, 5, true),
      endDate: date(input.endDate),
      endTime: textValue(input.endTime, 5, true),
      ...(recurringWindows ? { recurringWindows } : {}),
    }
  }
  throw new Error()
}

const cleanBuilderState = (value: unknown): AiBuilderState => {
  const input = record(value)
  exactKeys(
    input,
    [
      'relation',
      'xColumn',
      'valueColumn',
      'aggregation',
      'timeColumn',
      'timeBucket',
      'timeRange',
    ],
    [
      'relation',
      'xColumn',
      'valueColumn',
      'aggregation',
      'timeColumn',
      'timeBucket',
    ],
  )
  const relation = record(input.relation)
  exactKeys(relation, ['schema', 'name'], ['schema', 'name'])
  if (
    !BUILDER_AGGREGATIONS.includes(input.aggregation as BuilderAggregation) ||
    !BUILDER_TIME_BUCKETS.includes(input.timeBucket as BuilderTimeBucket)
  )
    throw new Error()
  const state: AiBuilderState = {
    relation: {
      schema: textValue(relation.schema, 256),
      name: textValue(relation.name, 256),
    },
    xColumn: nullableText(input.xColumn),
    valueColumn: nullableText(input.valueColumn),
    aggregation: input.aggregation as BuilderAggregation,
    timeColumn: nullableText(input.timeColumn),
    timeBucket: input.timeBucket as BuilderTimeBucket,
    ...(input.timeRange === undefined
      ? {}
      : { timeRange: parseBuilderTimeRange(input.timeRange) }),
  }
  if (state.timeRange && validateBuilderTimeRange(state.timeRange))
    throw new Error()
  return state
}

export function builderProposalRequest(
  value: unknown,
): AiBuilderProposalRequest {
  try {
    const input = record(value)
    exactKeys(
      input,
      ['requestId', 'prompt', 'state', 'columns'],
      ['requestId', 'prompt', 'state', 'columns'],
    )
    if (
      !Array.isArray(input.columns) ||
      input.columns.length > AI_LIMITS.columnsPerRelation
    )
      throw new Error()
    const columns = input.columns.map((item) => {
      const column = record(item)
      exactKeys(column, ['name', 'dataType', 'nullable'], ['name', 'dataType'])
      if (column.nullable !== undefined && typeof column.nullable !== 'boolean')
        throw new Error()
      return {
        name: textValue(column.name, 256),
        dataType: textValue(column.dataType, 256),
        ...(typeof column.nullable === 'boolean'
          ? { nullable: column.nullable }
          : {}),
      }
    })
    if (new Set(columns.map((column) => column.name)).size !== columns.length)
      throw new Error()
    const request: AiBuilderProposalRequest = {
      requestId: requestId(input.requestId),
      prompt: textValue(input.prompt, AI_LIMITS.prompt),
      state: cleanBuilderState(input.state),
      columns,
    }
    if (JSON.stringify(request).length > AI_LIMITS.contextCharacters)
      throw new Error()
    validateBuilderTarget(request.state, request.columns)
    return request
  } catch (error) {
    if (error instanceof AiError) throw error
    throw new AiError('validation', 'Invalid or oversized Builder AI request.')
  }
}

const cleanBuilderPatch = (value: unknown): AiBuilderPatch => {
  const input = record(value)
  exactKeys(input, [
    'xColumn',
    'valueColumn',
    'aggregation',
    'timeColumn',
    'timeBucket',
    'timeRange',
  ])
  const patch: AiBuilderPatch = {}
  if ('xColumn' in input) patch.xColumn = nullableText(input.xColumn)
  if ('valueColumn' in input)
    patch.valueColumn = nullableText(input.valueColumn)
  if ('aggregation' in input) {
    if (!BUILDER_AGGREGATIONS.includes(input.aggregation as BuilderAggregation))
      throw new Error()
    patch.aggregation = input.aggregation as BuilderAggregation
  }
  if ('timeColumn' in input) patch.timeColumn = nullableText(input.timeColumn)
  if ('timeBucket' in input) {
    if (!BUILDER_TIME_BUCKETS.includes(input.timeBucket as BuilderTimeBucket))
      throw new Error()
    patch.timeBucket = input.timeBucket as BuilderTimeBucket
  }
  if ('timeRange' in input)
    patch.timeRange = parseBuilderTimeRange(input.timeRange)
  return patch
}

const validateBuilderTarget = (
  target: AiBuilderState,
  columns: AiBuilderProposalRequest['columns'],
) => {
  const byName = new Map(columns.map((column) => [column.name, column]))
  const x = target.xColumn ? byName.get(target.xColumn) : undefined
  if (target.xColumn && !x) throw new Error()
  const y = target.valueColumn ? byName.get(target.valueColumn) : undefined
  if (target.valueColumn && (!y || !isNumericType(y.dataType)))
    throw new Error()
  if (
    !BUILDER_AGGREGATIONS.includes(target.aggregation) ||
    (target.aggregation !== 'count' && !y) ||
    (target.xColumn && target.xColumn === target.valueColumn)
  )
    throw new Error()
  const time = target.timeColumn ? byName.get(target.timeColumn) : undefined
  if (target.timeColumn && (!time || !isBuilderTemporalDataType(time.dataType)))
    throw new Error()
  if (
    !BUILDER_TIME_BUCKETS.includes(target.timeBucket) ||
    !isBuilderTimeBucketSupported(x?.dataType, target.timeBucket, 'postgres')
  )
    throw new Error()
  if (target.timeRange) {
    if (!target.timeColumn || validateBuilderTimeRange(target.timeRange))
      throw new Error()
    if (
      target.timeBucket === 'minute' &&
      !isMinuteBucketAvailable(target.timeRange)
    )
      throw new Error()
  }
}

const TEMPORAL_GROUPING_PATTERNS: Array<{
  bucket: BuilderTimeBucket
  pattern: RegExp
}> = [
  {
    bucket: 'minute',
    pattern:
      /\b(?:per|each|every|by|group(?:ed|ing)?(?:\s+by)?)\s+(?:the\s+)?minute\b|\bminutely\b/i,
  },
  {
    bucket: 'hour',
    pattern:
      /\b(?:per|each|every|by|group(?:ed|ing)?(?:\s+by)?)\s+(?:the\s+)?hour\b|\bhourly\b/i,
  },
  {
    bucket: 'day',
    pattern:
      /\b(?:per|each|every|by|group(?:ed|ing)?(?:\s+by)?)\s+(?:the\s+)?day\b|\bdaily\b/i,
  },
  {
    bucket: 'week',
    pattern:
      /\b(?:per|each|every|by|group(?:ed|ing)?(?:\s+by)?)\s+(?:the\s+)?week\b|\bweekly\b/i,
  },
  {
    bucket: 'month',
    pattern:
      /\b(?:per|each|every|by|group(?:ed|ing)?(?:\s+by)?)\s+(?:the\s+)?month\b|\bmonthly\b/i,
  },
  {
    bucket: 'quarter',
    pattern:
      /\b(?:per|each|every|by|group(?:ed|ing)?(?:\s+by)?)\s+(?:the\s+)?quarter\b|\bquarterly\b/i,
  },
  {
    bucket: 'year',
    pattern:
      /\b(?:per|each|every|by|group(?:ed|ing)?(?:\s+by)?)\s+(?:the\s+)?year\b|\byearly\b|\bannually\b/i,
  },
]

const countIntent = (prompt: string): boolean =>
  /\b(?:count|number\s+of|how\s+many)\b/i.test(prompt)

const requestedTemporalBucket = (prompt: string): BuilderTimeBucket | null =>
  TEMPORAL_GROUPING_PATTERNS.find(({ pattern }) => pattern.test(prompt))
    ?.bucket ?? null

const normalizedWords = (value: string): string =>
  value.toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim()

const explicitCategoricalGrouping = (
  prompt: string,
  columns: AiBuilderProposalRequest['columns'],
): boolean => {
  const normalizedPrompt = ` ${normalizedWords(prompt)} `
  return columns.some((column) => {
    if (isBuilderTemporalDataType(column.dataType)) return false
    const name = normalizedWords(column.name)
    if (!name) return false
    return (
      normalizedPrompt.includes(` by ${name} `) ||
      normalizedPrompt.includes(` grouped by ${name} `) ||
      normalizedPrompt.includes(` grouping by ${name} `) ||
      normalizedPrompt.includes(` per ${name} `)
    )
  })
}

const normalizeCountOverTimeTarget = (
  request: AiBuilderProposalRequest,
  target: AiBuilderState,
): AiBuilderState => {
  const bucket = requestedTemporalBucket(request.prompt)
  if (!bucket || !countIntent(request.prompt)) return target
  if (explicitCategoricalGrouping(request.prompt, request.columns))
    throw new Error()

  const byName = new Map(request.columns.map((column) => [column.name, column]))
  const temporalColumns = request.columns.filter((column) =>
    isBuilderTemporalDataType(column.dataType),
  )
  const normalizedPrompt = ` ${normalizedWords(request.prompt)} `
  const mentionedTemporal = temporalColumns.find((column) =>
    normalizedPrompt.includes(` ${normalizedWords(column.name)} `),
  )
  const currentTime = request.state.timeColumn
    ? byName.get(request.state.timeColumn)
    : undefined
  const currentX = request.state.xColumn
    ? byName.get(request.state.xColumn)
    : undefined
  const timeColumn =
    mentionedTemporal?.name ??
    (currentTime && isBuilderTemporalDataType(currentTime.dataType)
      ? currentTime.name
      : currentX && isBuilderTemporalDataType(currentX.dataType)
        ? currentX.name
        : temporalColumns.length === 1
          ? temporalColumns[0].name
          : null)
  if (!timeColumn) throw new Error()

  return {
    ...target,
    xColumn: timeColumn,
    valueColumn: null,
    aggregation: 'count',
    timeColumn,
    timeBucket: bucket,
    timeRange: target.timeRange ?? request.state.timeRange,
  }
}
const normalizedBuilderPatch = (
  before: AiBuilderState,
  target: AiBuilderState,
): AiBuilderPatch => {
  const patch: AiBuilderPatch = {}
  const fields = [
    'xColumn',
    'valueColumn',
    'aggregation',
    'timeColumn',
    'timeBucket',
  ] as const
  for (const field of fields)
    if (before[field] !== target[field])
      Object.assign(patch, { [field]: target[field] })
  if (JSON.stringify(before.timeRange) !== JSON.stringify(target.timeRange)) {
    if (target.timeRange) patch.timeRange = target.timeRange
  }
  return patch
}

function validateBuilderProposal(
  input: Record<string, unknown>,
  request: AiBuilderProposalRequest,
): AiBuilderProposal {
  if (
    input.reason !== '' ||
    !Array.isArray(input.assumptions) ||
    input.assumptions.length > 30
  )
    throw new Error()
  const proposedPatch = cleanBuilderPatch(input.patch)
  const target = normalizeCountOverTimeTarget(
    request,
    materializeAiBuilderTargetState(
      request.state,
      proposedPatch,
      request.columns,
    ),
  )
  validateBuilderTarget(target, request.columns)
  return {
    patch: normalizedBuilderPatch(request.state, target),
    explanation: textValue(input.explanation, 8000, true),
    assumptions: input.assumptions.map((item) => textValue(item, 2000, true)),
  }
}

export function builderStep(
  value: unknown,
  request: AiBuilderProposalRequest,
): AiBuilderStep {
  try {
    const input = record(value)
    exactKeys(
      input,
      ['kind', 'patch', 'explanation', 'assumptions', 'reason'],
      ['kind', 'patch', 'explanation', 'assumptions', 'reason'],
    )
    if (input.kind === 'proposal')
      return {
        kind: 'proposal',
        proposal: validateBuilderProposal(input, request),
      }
    if (input.kind === 'unsupported') {
      const patch = record(input.patch)
      if (
        Object.keys(patch).length ||
        input.explanation !== '' ||
        !Array.isArray(input.assumptions) ||
        input.assumptions.length
      )
        throw new Error()
      return {
        kind: 'unsupported',
        reason: textValue(input.reason, AI_LIMITS.builderUnsupportedReason),
      }
    }
    throw new Error()
  } catch {
    throw new AiError(
      'invalid-response',
      'The model returned an invalid Builder proposal. Try again or choose another model.',
    )
  }
}
