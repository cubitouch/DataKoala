import { AI_LIMITS } from '../../shared/ai.ts'
import type {
  AiErrorCode,
  AiQueryProposal,
  AiQueryProposalRequest,
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
export function proposalRequest(value: unknown): AiQueryProposalRequest {
  const input = record(value),
    context = record(input.context),
    language = record(context.language)
  if (
    language.kind !== 'sql' ||
    language.dialect !== 'postgres' ||
    !Array.isArray(context.relations) ||
    context.relations.length > AI_LIMITS.relations
  )
    throw new AiError('validation', 'Invalid PostgreSQL AI context.')
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
  const cleanContext = {
    language: { kind: 'sql' as const, dialect: 'postgres' as const },
    relations,
  }
  if (
    columns > AI_LIMITS.columns ||
    JSON.stringify(cleanContext).length > AI_LIMITS.contextCharacters
  )
    throw new AiError('validation', 'AI schema context is too large.')
  // Reconstruct an allowlist: accidental profile/result properties never reach the provider.
  return {
    requestId: requestId(input.requestId),
    prompt: textValue(input.prompt, AI_LIMITS.prompt),
    ...(input.currentQuery === undefined
      ? {}
      : { currentQuery: textValue(input.currentQuery, AI_LIMITS.query, true) }),
    context: cleanContext,
  }
}
export function proposal(value: unknown): AiQueryProposal {
  try {
    const p = record(value)
    if (
      Object.keys(p).some(
        (key) => !['query', 'explanation', 'assumptions'].includes(key),
      ) ||
      !Array.isArray(p.assumptions) ||
      p.assumptions.length > 30
    )
      throw new Error()
    return {
      query: textValue(p.query, AI_LIMITS.query),
      explanation: textValue(p.explanation, 8000, true),
      assumptions: p.assumptions.map((a) => textValue(a, 2000, true)),
    }
  } catch {
    throw new AiError(
      'invalid-response',
      'The model returned an invalid query proposal. Try again or choose another model.',
    )
  }
}
