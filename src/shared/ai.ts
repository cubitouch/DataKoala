export interface AiSettingsSummary {
  provider: 'openrouter'
  model: string
  hasApiKey: boolean
}
// Write-only credential input. Never returned by a settings read.
export interface AiSettingsInput {
  model: string
  apiKey?: string
}
export interface AiModel {
  id: string
  name: string
}
export interface AiRelationContext {
  schema: string
  name: string
  kind: 'table' | 'view' | 'matview'
  columns: Array<{ name: string; dataType: string; nullable?: boolean }>
}
export interface AiQueryContext {
  language: { kind: 'sql'; dialect: 'postgres' }
  relations: AiRelationContext[]
}
export interface AiQueryProposalRequest {
  requestId: string
  intent: 'generate' | 'repair'
  prompt?: string
  currentQuery?: string
  error?: string
  context: AiQueryContext
}
export interface AiQueryProposal {
  query: string
  explanation: string
  assumptions: string[]
}
export interface AiContextRequest {
  searchTerms: string[]
  reason: string
}
export type AiQueryStep =
  | { kind: 'proposal'; proposal: AiQueryProposal }
  | { kind: 'context-request'; request: AiContextRequest }
export type AiErrorCode =
  | 'cancelled'
  | 'timeout'
  | 'authentication'
  | 'rate-limit'
  | 'model'
  | 'invalid-response'
  | 'configuration'
  | 'provider'
  | 'validation'
export type AiResult<T> =
  { ok: true; value: T } | { ok: false; code: AiErrorCode; message: string }
export const AI_LIMITS = {
  relations: 8,
  initialRelations: 6,
  columnsPerRelation: 40,
  columns: 200,
  initialColumns: 140,
  contextCharacters: 24000,
  initialContextCharacters: 18000,
  prompt: 8000,
  query: 40000,
  errorCharacters: 6000,
  contextRequestTerms: 5,
  contextRequestTermCharacters: 80,
  contextRequestReason: 1000,
} as const
export const AI_PRIVACY_NOTICE =
  'AI requests are sent to OpenRouter. DataKoala may send your prompt, current query and bounded schema metadata. Database credentials and query result rows are not sent.'

/**
 * Single product-level availability rule for AI features.
 *
 * Keep AI entry points hidden until a provider has both a persisted key and
 * model. Future AI features should use the same rule rather than each
 * inventing their own notion of "configured".
 */
export function isAiConfigured(settings: AiSettingsSummary): boolean {
  return settings.hasApiKey && settings.model.trim().length > 0
}
