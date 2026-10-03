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
  prompt: string
  currentQuery?: string
  context: AiQueryContext
}
export interface AiQueryProposal {
  query: string
  explanation: string
  assumptions: string[]
}
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
  columnsPerRelation: 40,
  columns: 200,
  contextCharacters: 24000,
  prompt: 8000,
  query: 40000,
} as const
export const AI_PRIVACY_NOTICE =
  'AI requests are sent to OpenRouter. DataKoala may send your prompt, current query and bounded schema metadata. Database credentials and query result rows are not sent.'
