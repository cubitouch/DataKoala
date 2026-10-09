import type {
  BuilderAggregation,
  BuilderTimeBucket,
} from './builderCapabilities.ts'
import type { BuilderTimeRange } from './builderTimeRange.ts'
import type { SqlDialect } from './types.ts'

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
export interface AiRelationCatalogEntry {
  schema: string
  name: string
}
export interface AiQueryContext {
  language: { kind: 'sql'; dialect: SqlDialect }
  relations: AiRelationContext[]
  availableRelations?: AiRelationCatalogEntry[]
}
export interface AiAnomalyChartContext {
  chartType: string
  xColumn: string
  valueColumn: string
  series: Array<{
    name: string
    originalPointCount: number
    validPointCount: number
    sampleCoverage: number
    samplingMethod: 'all-points' | 'bucket-extrema'
    points: Array<{ x: string | number; y: number }>
  }>
}
export interface AiAnomalyAnalysisRequest {
  requestId: string
  chart: AiAnomalyChartContext
}
export interface AiDetectedAnomaly {
  seriesIndex: number
  pointIndex: number
  title: string
  reason: string
  severity?: 'low' | 'medium' | 'high'
}
export interface AiAnomalyAnalysis {
  summary: string
  anomalies: AiDetectedAnomaly[]
  limitations: string[]
  followUps: string[]
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

export interface AiBuilderColumnContext {
  name: string
  dataType: string
  nullable?: boolean
}
export interface AiBuilderState {
  relation: { schema: string; name: string }
  xColumn: string | null
  valueColumn: string | null
  aggregation: BuilderAggregation
  timeColumn: string | null
  timeBucket: BuilderTimeBucket
  timeRange?: BuilderTimeRange
}
export interface AiBuilderPatch {
  xColumn?: string | null
  valueColumn?: string | null
  aggregation?: BuilderAggregation
  timeColumn?: string | null
  timeBucket?: BuilderTimeBucket
  timeRange?: BuilderTimeRange
}
export interface AiBuilderProposalRequest {
  requestId: string
  prompt: string
  state: AiBuilderState
  columns: AiBuilderColumnContext[]
}
export interface AiBuilderProposal {
  patch: AiBuilderPatch
  explanation: string
  assumptions: string[]
}

export interface AiExecutionPlanNode {
  id: string
  parentId?: string
  nodeType: string
  schema?: string
  relation?: string
  alias?: string
  index?: string
  joinType?: string
  strategy?: string
  startupCost?: number
  totalCost?: number
  estimatedRows?: number
  actualRows?: number
  loops?: number
  actualTotalTimeMs?: number
  filter?: string
  indexCondition?: string
  hashCondition?: string
  mergeCondition?: string
  joinFilter?: string
  groupKey?: string[]
  sortKey?: string[]
  rowsRemovedByFilter?: number
  sharedHitBlocks?: number
  sharedReadBlocks?: number
  tempReadBlocks?: number
  tempWrittenBlocks?: number
  sortMethod?: string
  sortSpaceUsedKb?: number
  sortSpaceType?: string
  hashBatches?: number
  peakMemoryUsageKb?: number
}

export interface AiExecutionPlanContext {
  truncated: boolean
  planningTimeMs?: number
  executionTimeMs?: number
  nodes: AiExecutionPlanNode[]
}

export interface AiPlanAnalysisRequest {
  requestId: string
  sql: string
  mode: 'explain' | 'analyze'
  plan: AiExecutionPlanContext
}

export interface AiPerformanceHint {
  title: string
  /** Concise next action when justified, otherwise null for an observation. */
  action: string | null
  detail: string
  severity: 'info' | 'warning'
  nodeIds: string[]
  evidence: string
}

export interface AiPlanAnalysis {
  summary: string
  hints: AiPerformanceHint[]
}
export type AiBuilderStep =
  | { kind: 'proposal'; proposal: AiBuilderProposal }
  | { kind: 'unsupported'; reason: string }
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
  relationCatalog: 200,
  relationCatalogCharacters: 12000,
  prompt: 8000,
  query: 40000,
  errorCharacters: 6000,
  contextRequestTerms: 5,
  contextRequestTermCharacters: 80,
  contextRequestReason: 1000,
  builderUnsupportedReason: 2000,
  anomalySeries: 8,
  anomalyPointsPerSeries: 32,
  anomalyMinimumPointsPerSeries: 3,
  anomalyCount: 12,
  anomalyTitle: 120,
  anomalyReason: 400,
  anomalySummary: 1000,
  anomalyText: 500,
  planNodes: 80,
  planCharacters: 24000,
  planNodeText: 512,
  planKeyCharacters: 256,
  planKeysPerNode: 16,
  planHintCount: 8,
  planHintTitle: 120,
  planHintAction: 200,
  planHintDetail: 1200,
  planHintEvidence: 600,
  planHintNodes: 8,
  planSummary: 1200,
} as const
export const AI_PRIVACY_NOTICE =
  'AI requests are sent to OpenRouter. DataKoala may send your prompt, current query or Builder state, SQL, bounded schema metadata, a small capped chart sample for AI anomaly analysis, or a captured execution plan. Database credentials and full query result rows are not sent.'

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
