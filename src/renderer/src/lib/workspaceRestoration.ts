import type { QuerySession } from '@store/useStore.ts'
import { cloneTempoBuilder } from './tempoQueryState.ts'
import {
  builderQueryFilters,
  cloneTimeRange,
  type QuerySessionDraft,
  type WorkspaceDraft,
} from './workspaceFormat.ts'

export interface WorkspaceRestorePatch {
  tabs: QuerySession[]
  activeTabId: string
}

function restoredSession(draft: QuerySessionDraft): QuerySession {
  return {
    id: draft.id,
    queryContextId: crypto.randomUUID(),
    title: draft.title,
    connectionProfileId: draft.connectionProfileId,
    sql: draft.sql,
    prometheusTimeRange: draft.prometheusTimeRange,
    prometheusStep: draft.prometheusStep,
    promqlBuilder: draft.promqlBuilder,
    lokiTimeRange: draft.lokiTimeRange,
    lokiBuilder: draft.lokiBuilder,
    lokiResultLimit: draft.lokiResultLimit,
    lokiGroupBy: draft.lokiGroupBy,
    lokiResultView: draft.lokiResultView,
    tempoBuilder: cloneTempoBuilder(draft.tempoBuilder),
    tempoTimeRange: cloneTimeRange(draft.tempoTimeRange)!,
    tempoSampleSize: draft.tempoSampleSize,
    tempoResultView: draft.tempoResultView,
    running: false,
    queryError: null,
    repairableQueryError: null,
    result: null,
    pendingResult: null,
    resultRevision: 0,
    lastSuccessfulResultRevision: 0,
    isResultStale: false,
    queryMode: draft.queryMode,
    builder: draft.builder,
    builderHasRun: false,
    sqlVisualization: draft.sqlVisualization,
    builderVisualization: draft.builderVisualization,
    sqlResultFilters: [],
    builderResultFilters: builderQueryFilters(draft.builderQueryFilters),
    queryFilterRevision: { sql: 0, builder: 0 },
    builderFilterNotice: null,
    explainText: null,
    explainTree: null,
    explainSnapshot: null,
    showExplain: false,
    activeExplainRequest: null,
    seriesVisibility: {},
  }
}

/** Allocate cold runtime state from an already validated, nonempty draft. */
export function workspaceRestorePatch(
  draft: WorkspaceDraft,
): WorkspaceRestorePatch {
  const tabs = draft.tabs.map(restoredSession)
  const activeTabId = tabs.some((tab) => tab.id === draft.activeTabId)
    ? draft.activeTabId
    : tabs[0].id
  return { tabs, activeTabId }
}
