import { AI_LIMITS } from '../../../shared/ai.ts'
import type {
  AiBuilderPatch,
  AiBuilderProposal,
  AiBuilderProposalRequest,
  AiBuilderState,
  AiBuilderStep,
} from '../../../shared/ai.ts'
import {
  BUILDER_AGGREGATIONS,
  BUILDER_TIME_BUCKETS,
  isBuilderTemporalDataType,
  isBuilderTimeBucketSupported,
  type BuilderAggregation,
  type BuilderTimeBucket,
} from '../../../shared/builderCapabilities.ts'
import {
  isMinuteBucketAvailable,
  parseBuilderRollingTimeRange,
  validateBuilderTimeRange,
  type BuilderTimeRange,
} from '../../../shared/builderTimeRange.ts'
import { materializeAiBuilderTargetState } from '../../../shared/aiBuilder.ts'
import { isNumericType } from '../../../shared/types.ts'
import { AiError, record, requestId, textValue } from './primitives.ts'

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
