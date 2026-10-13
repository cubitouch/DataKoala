import { AI_LIMITS } from '../../../shared/ai.ts'
import type {
  AiContextRequest,
  AiQueryProposal,
  AiQueryProposalRequest,
  AiQueryStep,
} from '../../../shared/ai.ts'
import { sanitizeAiErrorContext } from '../../../shared/aiErrorContext.ts'
import {
  DATA_SOURCE_DESCRIPTORS,
  type SqlDialect,
} from '../../../shared/types.ts'
import { AiError, record, requestId, textValue } from './primitives.ts'

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
      return {
        kind: 'context-request',
        request: validateContextRequest(input),
      }
    throw new Error()
  } catch {
    throw new AiError(
      'invalid-response',
      'The model returned an invalid query step. Try again or choose another model.',
    )
  }
}
