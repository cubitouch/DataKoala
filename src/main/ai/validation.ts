// Stable compatibility facade for main-process AI callers.
export {
  AiError,
  record,
  textValue,
  requestId,
  settingsInput,
} from './validation/primitives.ts'
export { proposalRequest, queryStep } from './validation/query.ts'
export { planAnalysisRequest, planAnalysis } from './validation/plan.ts'
export {
  anomalyAnalysisRequest,
  anomalyAnalysis,
} from './validation/anomaly.ts'
export { builderProposalRequest, builderStep } from './validation/builder.ts'
