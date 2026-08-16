import React from 'react'
void React
import { useEffect, useMemo, useRef, useState } from 'react'
import CodeMirror, { type ReactCodeMirrorRef } from '@uiw/react-codemirror'
import { sql as sqlExtension } from '@codemirror/lang-sql'
import { PromQLExtension } from '@prometheus-io/codemirror-promql'
import { oneDark } from '@codemirror/theme-one-dark'
import { selectActiveSession, selectSession, useStore } from '../store/useStore'
import { api } from '../lib/api'
import { ensureConnectionForTab } from '../lib/tabConnection'
import { CopySqlButton } from './CopySqlButton'
import { DATA_SOURCE_CAPABILITIES, queryLanguageForSourceKind, type QueryResult } from '@shared/types'
import { formatSql } from '../lib/formatSql'
import { ModeSwitch } from './ModeSwitch'
import { queryResultFilters, wrapSqlWithResultFilters } from '../lib/resultFilters'
import { codeMirrorDialect, formatterDialect } from '../lib/sqlDialect'
import { buildSqlCompletionSchema } from '../lib/sqlCompletionSchema'
import { sqlAliasCompletionSource } from '../lib/sqlAliasCompletion'
import { ensureRelationColumns } from '../lib/relationColumns'
import { TimeRangeField } from './time-range/TimeRangeField'
import { QueryUtilityActions } from './QueryUtilityActions'
import { prometheusRangeBounds } from '../lib/prometheusTimeRange'
import { PromqlBuilderPanel } from './PromqlBuilderPanel'
import { validatePromqlBuilder } from '../lib/promqlBuilder'
import { InfoTooltip } from './ui/InfoTooltip'
import { Combobox } from './ui/combobox'
import { notify } from './NotificationArea'

export function QueryEditor({ builderMode = false }: { builderMode?: boolean }) {
  const tabId = useStore((s) => s.activeTabId)
  const sql = useStore((s) => selectActiveSession(s).sql)
  const setSql = useStore((s) => s.setSql)
  const prometheusTimeRange = useStore((s) => selectActiveSession(s).prometheusTimeRange)
  const prometheusStep = useStore((s) => selectActiveSession(s).prometheusStep)
  const promqlBuilder = useStore((s) => selectActiveSession(s).promqlBuilder)
  const setPrometheusQueryOptions = useStore((s) => s.setPrometheusQueryOptions)
  const tabConnectionId = useStore((s) => selectActiveSession(s).connectionProfileId)
  const connectionKind = useStore((s) => s.profiles.find((profile) => profile.id === tabConnectionId)?.kind)
  const prometheusDatasourceUid = useStore((s) => {
    const profile = s.profiles.find((item) => item.id === tabConnectionId)
    return profile?.kind === 'prometheus' ? profile.transport.datasourceUid : undefined
  })
  const language = queryLanguageForSourceKind(connectionKind ?? 'postgres')
  const dialect = language.kind === 'sql' ? language.dialect : 'postgres'
  const metadata = useStore((s) => tabConnectionId ? s.metadataByProfileId[tabConnectionId] : undefined)
  const schemas = metadata?.schemas ?? []
  const connecting = useStore((s) => s.connecting)
  const connected = useStore((s) => s.connected)
  const running = useStore((s) => selectActiveSession(s).running)
  const startQuery = useStore((s) => s.startQuery)
  const completeQuery = useStore((s) => s.completeQuery)
  const setResult = useStore((s) => s.setResult)
  const setVisualization = useStore((s) => s.setVisualization)
  const result = useStore((s) => selectActiveSession(s).result)
  const setExplain = useStore((s) => s.setExplain)
  const setShowExplain = useStore((s) => s.setShowExplain)
  const activeExplainRequest = useStore((s) => selectActiveSession(s).activeExplainRequest)
  const setActiveExplainRequest = useStore((s) => s.setActiveExplainRequest)
  const [formatting, setFormatting] = useState(false)
  const editorRef = useRef<ReactCodeMirrorRef>(null)
  const filters = useStore((s) => selectActiveSession(s).sqlResultFilters)
  const filterRevision = useStore((s) => selectActiveSession(s).queryFilterRevision.sql)
  const initialFilterRevision = useRef(new Map<string, number>())
  const runRevisions = useRef(new Map<string, number>())

  const extensions = useMemo(() => {
    if (language.kind === 'promql') return [new PromQLExtension().asExtension()]
    const editorDialect = codeMirrorDialect(dialect)
    const completion = buildSqlCompletionSchema(schemas, dialect)
    return [
      sqlExtension({ dialect: editorDialect, schema: completion.schema, defaultSchema: completion.defaultSchema, upperCaseKeywords: true }),
      editorDialect.language.data.of({ autocomplete: sqlAliasCompletionSource(schemas, dialect, async (relation) => {
        const state = useStore.getState()
        if (!tabConnectionId || state.activeProfileId !== tabConnectionId || !state.connected) return undefined
        return ensureRelationColumns(tabConnectionId, relation)
      }) })
    ]
  }, [language.kind, dialect, schemas, tabConnectionId])
  const stillBoundTo = (requestTabId: string, profileId: string) => selectSession(useStore.getState(), requestTabId)?.connectionProfileId === profileId

  const run = async () => {
    if (connecting) return
    const requestTabId = tabId
    const requestSql = sql
    const requestFilters = filters
    if (!requestSql.trim()) {
      setResult(null, 'Nothing to run — the editor is empty.', requestTabId)
      return
    }
    if (!tabConnectionId) {
      setResult(null, 'Not connected. Pick a connection in the sidebar first.', requestTabId)
      return
    }
    const requestProfileId = await ensureConnectionForTab(requestTabId)
    if (!requestProfileId) {
      const error = useStore.getState().connectionError
      if (error) setResult(null, error, requestTabId)
      return
    }
    if (!stillBoundTo(requestTabId, requestProfileId)) return
    const revision = (runRevisions.current.get(requestTabId) ?? 0) + 1
    runRevisions.current.set(requestTabId, revision)
    startQuery(requestTabId)
    try {
      const promoted = language.kind === 'sql' ? queryResultFilters(requestFilters) : []
      const execution = promoted.length ? wrapSqlWithResultFilters(requestSql, promoted, dialect) : { sql: requestSql, parameters: [] }
      if (!execution) throw new Error('This SQL cannot safely be wrapped; move query filters back to the client.')
      const requestSession = selectSession(useStore.getState(), requestTabId)
      const promRange = language.kind === 'promql' && requestSession
        ? { ...prometheusRangeBounds(requestSession.prometheusTimeRange), step: requestSession.prometheusStep }
        : undefined
      const res: QueryResult = await api.query.run(requestProfileId, execution.sql, execution.parameters, promRange)
      if (language.kind === 'promql') {
        const seriesColumns = builderMode ? (requestSession?.promqlBuilder.groupBy ?? []) : []
        setVisualization('sql', { view: 'line', xColumn: 'timestamp', valueColumn: 'value', seriesColumn: seriesColumns.length === 1 ? seriesColumns[0] : null, seriesColumns: seriesColumns.length > 1 ? seriesColumns : [], aggregation: 'sum' }, requestTabId)
      }
      if (runRevisions.current.get(requestTabId) === revision && stillBoundTo(requestTabId, requestProfileId)) completeQuery(res, null, requestTabId)
    } catch (e) {
      if (runRevisions.current.get(requestTabId) === revision && stillBoundTo(requestTabId, requestProfileId)) completeQuery(null, e instanceof Error ? e.message : String(e), requestTabId)
    }
  }

  useEffect(() => {
    const previous = initialFilterRevision.current.get(tabId)
    if (previous !== undefined && filterRevision !== previous && result && !running) void run()
    initialFilterRevision.current.set(tabId, filterRevision)
  }, [tabId, filterRevision])

  const explain = async (mode: 'explain' | 'analyze') => {
    if (activeExplainRequest || !tabConnectionId || connecting) return
    const requestTabId = tabId
    const requestSql = sql
    setActiveExplainRequest(mode, requestTabId)
    setShowExplain(true, requestTabId)
    const requestProfileId = await ensureConnectionForTab(requestTabId)
    if (!requestProfileId || !stillBoundTo(requestTabId, requestProfileId)) {
      setActiveExplainRequest(null, requestTabId)
      return
    }
    try {
      const res = await api.query.explain(requestProfileId, requestSql, mode === 'analyze')
      if (stillBoundTo(requestTabId, requestProfileId)) setExplain(res.text, requestTabId)
    } catch (e) {
      if (stillBoundTo(requestTabId, requestProfileId)) setExplain(e instanceof Error ? e.message : String(e), requestTabId)
    } finally {
      setActiveExplainRequest(null, requestTabId)
    }
  }

  const isExplainLoading = activeExplainRequest === 'explain'
  const isAnalyzeLoading = activeExplainRequest === 'analyze'
  const isAnyExplainLoading = activeExplainRequest !== null
  const canUseDatabase = Boolean(tabConnectionId) && !connecting
  const canFormatPromql = language.kind !== 'promql' || Boolean(tabConnectionId && connected && prometheusDatasourceUid?.trim())
  const capabilities = DATA_SOURCE_CAPABILITIES[connectionKind ?? 'postgres']
  const canExplain = canUseDatabase && capabilities.explain
  const canAnalyze = canUseDatabase && capabilities.analyze

  const applyFormattedQuery = (formatted: string, requestTabId: string) => {
    const active = useStore.getState().activeTabId === requestTabId
    const view = active ? editorRef.current?.view : undefined
    if (view) {
      const anchor = Math.min(view.state.selection.main.anchor, formatted.length)
      const head = Math.min(view.state.selection.main.head, formatted.length)
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: formatted }, selection: { anchor, head }, userEvent: 'input.format' })
      view.focus()
    } else {
      setSql(formatted, requestTabId)
      if (active) requestAnimationFrame(() => document.querySelector<HTMLElement>(language.kind === 'promql' ? '[aria-label="PromQL editor"]' : '[aria-label="SQL editor"]')?.focus())
    }
  }

  const doFormat = async () => {
    if (!sql.trim() || formatting) return
    const requestTabId = tabId
    const originalQuery = sql
    if (language.kind === 'promql') {
      if (!canFormatPromql || !tabConnectionId) return
      setFormatting(true)
      try {
        const formatted = await api.connections.prometheus.formatQuery(tabConnectionId, originalQuery)
        if (selectSession(useStore.getState(), requestTabId)?.sql !== originalQuery) return
        applyFormattedQuery(formatted, requestTabId)
        notify({ message: 'Formatted', duration: 2600 })
      } catch (error) {
        notify({ message: error instanceof Error ? error.message : 'Could not format PromQL', duration: 3200 })
      } finally {
        setFormatting(false)
      }
      return
    }
    const r = formatSql(originalQuery, formatterDialect(dialect))
    if (r.ok) {
      const formatted = r.sql
      applyFormattedQuery(formatted, requestTabId)
      notify({ message: 'Formatted', duration: 2600 })
    } else {
      notify({ message: r.error ?? 'Could not format', duration: 3200 })
    }
  }

  const onKey = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      run()
      return
    }
    if (!builderMode && e.shiftKey && e.altKey && e.key.toLowerCase() === 'f') {
      e.preventDefault()
      void doFormat()
    }
  }

  return (
    <div className="editor-pane" onKeyDown={onKey}>
      <div className="editor-head">
        <div className="query-toolbar-group query-mode-group"><ModeSwitch /></div>
        {language.kind === 'promql' && <div className="query-toolbar-group query-time-group" aria-label="Prometheus time controls"><TimeRangeField value={prometheusTimeRange} onChange={(value) => setPrometheusQueryOptions({ prometheusTimeRange: value }, tabId)} /><div className="promql-step"><span>Resolution <InfoTooltip label="Resolution">How often Prometheus evaluates the query across the selected time range. Example: 30s produces one evaluation point every 30 seconds.</InfoTooltip></span><Combobox label="PromQL query resolution" value={prometheusStep} options={['15s', '30s', '1m', '5m'].map((value) => ({ value, label: value }))} onChange={(value) => setPrometheusQueryOptions({ prometheusStep: value as typeof prometheusStep }, tabId)} /></div></div>}
        <div className="spacer" />
        <QueryUtilityActions />
        <div className="query-toolbar-group query-editor-actions">{!builderMode && <button className="btn ghost" onClick={() => void doFormat()} title={`Format ${language.kind === 'promql' ? 'PromQL' : 'SQL'} (Shift+Alt+F)`} disabled={!sql.trim() || formatting || !canFormatPromql} aria-busy={formatting}>
          {formatting ? 'Formatting…' : 'Format'}
        </button>}
        <CopySqlButton sql={sql} />
        {language.kind === 'sql' && capabilities.explain && <button className="btn ghost explain-action" onClick={() => explain('explain')} disabled={isAnyExplainLoading || !canExplain} aria-busy={isExplainLoading}>
          {isExplainLoading && <span className="spinner" aria-hidden="true" />}
          {isExplainLoading ? 'Explaining…' : 'Explain'}
        </button>}
        {language.kind === 'sql' && capabilities.analyze && <button className="btn ghost explain-action analyze" onClick={() => explain('analyze')} disabled={isAnyExplainLoading || !canAnalyze} aria-busy={isAnalyzeLoading}>
          {isAnalyzeLoading && <span className="spinner" aria-hidden="true" />}
          {isAnalyzeLoading ? 'Analyzing…' : 'Explain Analyze'}
        </button>}</div>
        <div className="query-toolbar-group execution-group"><button className="btn primary" onClick={run} disabled={!canUseDatabase || running || (builderMode && Boolean(validatePromqlBuilder(promqlBuilder)))} title="Run (Ctrl/Command+Enter)">
          {running ? 'Running…' : connecting ? 'Connecting…' : 'Run'}
        </button></div>
      </div>

      {builderMode ? <PromqlBuilderPanel /> : <div className="cm-wrap">
        <CodeMirror
          ref={editorRef}
          value={sql}
          height="100%"
          theme={oneDark}
          extensions={extensions}
          onChange={(value) => setSql(value, tabId)}
          editable={!isAnyExplainLoading}
          aria-label={language.kind === 'promql' ? 'PromQL editor' : 'SQL editor'}
          basicSetup={{ lineNumbers: true, foldGutter: false }}
        />
      </div>}

    </div>
  )
}
