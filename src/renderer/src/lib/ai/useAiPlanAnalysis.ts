import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { isAiConfigured, type AiPlanAnalysis } from '@shared/ai'
import { explainTreeToAiExecutionPlan } from '@shared/aiPlan'
import type { ExplainNode } from '@shared/types'
import { api } from '@lib/api'
import { selectActiveSession, useStore } from '@store/useStore'

interface PlanSnapshot {
  tabId: string
  query: string
  mode: 'explain' | 'analyze'
  planningTimeMs?: number
  executionTimeMs?: number
  tree: ExplainNode
}

interface Flight extends PlanSnapshot {
  id: string
  sent: boolean
}

function capturePlan(): PlanSnapshot | null {
  const state = useStore.getState()
  const session = selectActiveSession(state)
  if (
    !session.showExplain ||
    session.activeExplainRequest !== null ||
    !session.explainTree ||
    !session.explainSnapshot
  )
    return null
  const profile = state.profiles.find(
    (item) => item.id === session.connectionProfileId,
  )
  if (profile?.kind !== 'postgres') return null
  return {
    tabId: session.id,
    query: session.explainSnapshot.query,
    mode: session.explainSnapshot.mode,
    planningTimeMs: session.explainSnapshot.planningTimeMs,
    executionTimeMs: session.explainSnapshot.executionTimeMs,
    tree: session.explainTree,
  }
}

function samePlan(a: PlanSnapshot, b: PlanSnapshot | null): boolean {
  return Boolean(
    b &&
    a.tabId === b.tabId &&
    a.query === b.query &&
    a.mode === b.mode &&
    a.planningTimeMs === b.planningTimeMs &&
    a.executionTimeMs === b.executionTimeMs &&
    a.tree === b.tree,
  )
}

export function useAiPlanAnalysis() {
  const [configured, setConfigured] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [analysisState, setAnalysisState] = useState<{
    analysis: AiPlanAnalysis
    plan: PlanSnapshot
  } | null>(null)
  const [selectedHintId, setSelectedHintId] = useState<string | null>(null)
  const [sentContext, setSentContext] = useState<{
    plan: PlanSnapshot
    context: ReturnType<typeof explainTreeToAiExecutionPlan>
  } | null>(null)
  const flight = useRef<Flight | null>(null)
  const mounted = useRef(true)
  const session = useStore(selectActiveSession)
  const tabId = useStore((state) => state.activeTabId)
  const profileKind = useStore(
    (state) =>
      state.profiles.find((item) => item.id === session.connectionProfileId)
        ?.kind,
  )
  const snapshot = session.explainSnapshot
  const tree = session.explainTree
  const currentPlan = useMemo<PlanSnapshot | null>(() => {
    if (
      profileKind !== 'postgres' ||
      !session.showExplain ||
      session.activeExplainRequest !== null ||
      !snapshot ||
      !tree
    )
      return null
    return {
      tabId,
      query: snapshot.query,
      mode: snapshot.mode,
      planningTimeMs: snapshot.planningTimeMs,
      executionTimeMs: snapshot.executionTimeMs,
      tree,
    }
  }, [
    profileKind,
    session.activeExplainRequest,
    session.showExplain,
    snapshot,
    tabId,
    tree,
  ])
  const currentContext = useMemo(
    () =>
      currentPlan
        ? explainTreeToAiExecutionPlan(
            currentPlan.tree,
            {
              planningTimeMs: currentPlan.planningTimeMs,
              executionTimeMs: currentPlan.executionTimeMs,
            },
            currentPlan.mode,
          )
        : null,
    [currentPlan],
  )

  const cancel = useCallback(() => {
    const active = flight.current
    flight.current = null
    if (active?.sent) void api.ai.cancel(active.id)
    setBusy(false)
  }, [])

  useEffect(() => {
    mounted.current = true
    const unsubscribe = useStore.subscribe(() => {
      const active = flight.current
      if (active && !samePlan(active, capturePlan())) cancel()
    })
    return () => {
      mounted.current = false
      unsubscribe()
      const active = flight.current
      flight.current = null
      if (active?.sent) void api.ai.cancel(active.id)
    }
  }, [cancel])

  useEffect(() => {
    let active = true
    const refresh = () =>
      void api.ai.settings
        .get()
        .then((result) => {
          if (active && result.ok) setConfigured(isAiConfigured(result.value))
          else if (active) setConfigured(false)
        })
        .catch(() => {
          if (active) setConfigured(false)
        })
    refresh()
    window.addEventListener('datakoala:ai-settings-changed', refresh)
    return () => {
      active = false
      window.removeEventListener('datakoala:ai-settings-changed', refresh)
    }
  }, [])

  useEffect(() => {
    const active = flight.current
    if (active && !samePlan(active, currentPlan)) cancel()
    setError('')
    setSelectedHintId(null)
    setAnalysisState(null)
    setSentContext(null)
  }, [cancel, currentPlan])

  const analyze = useCallback(async () => {
    const plan = capturePlan()
    if (!configured || !plan || !samePlan(plan, currentPlan) || busy) return
    const id = crypto.randomUUID()
    const context = explainTreeToAiExecutionPlan(
      plan.tree,
      {
        planningTimeMs: plan.planningTimeMs,
        executionTimeMs: plan.executionTimeMs,
      },
      plan.mode,
    )
    const active: Flight = { ...plan, id, sent: true }
    flight.current = active
    setBusy(true)
    setError('')
    setSelectedHintId(null)
    setAnalysisState(null)
    setSentContext({ plan, context })
    let result
    try {
      result = await api.ai.analyzePlan({
        requestId: id,
        sql: plan.query,
        mode: plan.mode,
        plan: context,
      })
    } catch {
      if (!mounted.current || flight.current !== active) return
      flight.current = null
      setBusy(false)
      setError('The AI request failed. Check AI settings and try again.')
      return
    }
    if (!mounted.current || flight.current !== active) return
    flight.current = null
    setBusy(false)
    if (result.ok) setAnalysisState({ analysis: result.value, plan })
    else if (result.code !== 'cancelled') setError(result.message)
  }, [busy, configured, currentPlan])

  const activeAnalysis =
    analysisState && samePlan(analysisState.plan, currentPlan)
      ? analysisState.analysis
      : null
  const submitted =
    sentContext && samePlan(sentContext.plan, currentPlan)
      ? sentContext.context
      : currentContext
  const selectedHint =
    activeAnalysis?.hints.find(
      (hint, index) => selectedHintId === `${hint.title}:${index}`,
    ) ?? null

  return {
    configured,
    busy,
    error,
    analysis: activeAnalysis,
    context: submitted,
    plan: currentPlan,
    selectedHint,
    highlightedNodeIds: selectedHint?.nodeIds ?? [],
    focusNodeId: selectedHint?.nodeIds[0] ?? null,
    selectHint(index: number) {
      const hint = activeAnalysis?.hints[index]
      if (!hint) return
      const id = `${hint.title}:${index}`
      setSelectedHintId((current) => (current === id ? null : id))
    },
    clearHint() {
      setSelectedHintId(null)
    },
    analyze,
    cancel,
  }
}
