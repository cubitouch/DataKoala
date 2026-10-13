import { AI_LIMITS } from '../../../shared/ai.ts'
import type {
  AiPlanAnalysisRequest,
  AiPlanAnalysis,
} from '../../../shared/ai.ts'
import { sanitizeAiExecutionPlanContext } from '../../../shared/aiPlan.ts'
import { AiError, record, requestId, textValue } from './primitives.ts'

export function planAnalysisRequest(value: unknown): AiPlanAnalysisRequest {
  const input = record(value)
  if (input.mode !== 'explain' && input.mode !== 'analyze')
    throw new AiError('validation', 'Invalid execution plan mode.')
  const mode = input.mode
  let plan
  try {
    plan = sanitizeAiExecutionPlanContext(input.plan, mode)
  } catch {
    throw new AiError('validation', 'Invalid or oversized execution plan.')
  }
  return {
    requestId: requestId(input.requestId),
    sql: textValue(input.sql, AI_LIMITS.query),
    mode,
    plan,
  }
}

export function planAnalysis(
  value: unknown,
  request: AiPlanAnalysisRequest,
): AiPlanAnalysis {
  try {
    const input = record(value)
    if (
      Object.keys(input).some((key) => !['summary', 'hints'].includes(key)) ||
      Object.keys(input).length !== 2 ||
      !Array.isArray(input.hints) ||
      input.hints.length > AI_LIMITS.planHintCount
    )
      throw new Error()
    const nodeIds = new Set(request.plan.nodes.map((node) => node.id))
    const hints = input.hints.map((item) => {
      const hint = record(item)
      if (
        Object.keys(hint).some(
          (key) =>
            ![
              'title',
              'action',
              'detail',
              'severity',
              'nodeIds',
              'evidence',
            ].includes(key),
        ) ||
        Object.keys(hint).length !== 6 ||
        !Array.isArray(hint.nodeIds) ||
        hint.nodeIds.length < 1 ||
        hint.nodeIds.length > AI_LIMITS.planHintNodes ||
        (hint.severity !== 'info' && hint.severity !== 'warning')
      )
        throw new Error()
      const referenced = hint.nodeIds.map((id) => textValue(id, 128))
      if (referenced.some((id) => !nodeIds.has(id))) throw new Error()
      if (new Set(referenced).size !== referenced.length) throw new Error()
      return {
        title: textValue(hint.title, AI_LIMITS.planHintTitle),
        action:
          hint.action === null
            ? null
            : textValue(hint.action, AI_LIMITS.planHintAction),
        detail: textValue(hint.detail, AI_LIMITS.planHintDetail),
        severity: hint.severity as 'info' | 'warning',
        nodeIds: referenced,
        evidence: textValue(hint.evidence, AI_LIMITS.planHintEvidence),
      }
    })
    return {
      summary: textValue(input.summary, AI_LIMITS.planSummary),
      hints,
    }
  } catch {
    throw new AiError(
      'invalid-response',
      'The model returned invalid or ungrounded performance hints. Try again or choose another model.',
    )
  }
}
