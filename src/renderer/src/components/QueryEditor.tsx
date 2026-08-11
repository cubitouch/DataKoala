import React from 'react'
void React
import { useEffect, useMemo, useRef, useState } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { sql as sqlExtension, PostgreSQL, StandardSQL } from '@codemirror/lang-sql'
import { oneDark } from '@codemirror/theme-one-dark'
import { selectActiveSession, selectSession, useStore } from '../store/useStore'
import { api } from '../lib/api'
import { ensureConnectionForTab } from '../lib/tabConnection'
import { CopySqlButton } from './CopySqlButton'
import type { QueryResult } from '@shared/types'
import { formatSql } from '../lib/formatSql'
import { ModeSwitch } from './ModeSwitch'
import { queryResultFilters, wrapSqlWithResultFilters } from '../lib/resultFilters'

export function QueryEditor() {
  const tabId = useStore((s) => s.activeTabId)
  const sql = useStore((s) => selectActiveSession(s).sql)
  const setSql = useStore((s) => s.setSql)
  const tabConnectionId = useStore((s) => selectActiveSession(s).connectionProfileId)
  const connectionKind = useStore((s) => s.profiles.find((profile) => profile.id === tabConnectionId)?.kind)
  const dialect = connectionKind === 'bigquery' ? 'bigquery' : 'postgresql'
  const connecting = useStore((s) => s.connecting)
  const running = useStore((s) => selectActiveSession(s).running)
  const startQuery = useStore((s) => s.startQuery)
  const completeQuery = useStore((s) => s.completeQuery)
  const setResult = useStore((s) => s.setResult)
  const result = useStore((s) => selectActiveSession(s).result)
  const setExplain = useStore((s) => s.setExplain)
  const setShowExplain = useStore((s) => s.setShowExplain)
  const activeExplainRequest = useStore((s) => selectActiveSession(s).activeExplainRequest)
  const setActiveExplainRequest = useStore((s) => s.setActiveExplainRequest)
  const [showToast, setShowToast] = useState<string | null>(null)
  const filters = useStore((s) => selectActiveSession(s).sqlResultFilters)
  const filterRevision = useStore((s) => selectActiveSession(s).queryFilterRevision.sql)
  const initialFilterRevision = useRef(new Map<string, number>())
  const runRevisions = useRef(new Map<string, number>())

  const flash = (msg: string, ms = 2600) => {
    setShowToast(msg)
    setTimeout(() => setShowToast(null), ms)
  }

  const extensions = useMemo(() => [sqlExtension({ dialect: dialect === 'bigquery' ? StandardSQL : PostgreSQL, upperCaseKeywords: true })], [dialect])
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
      const promoted = queryResultFilters(requestFilters)
      const execution = promoted.length ? wrapSqlWithResultFilters(requestSql, promoted, dialect === 'bigquery' ? 'google-sql' : 'postgres') : { sql: requestSql, parameters: [] }
      if (!execution) throw new Error('This SQL cannot safely be wrapped; move query filters back to the client.')
      const res: QueryResult = await api.query.run(requestProfileId, execution.sql, execution.parameters)
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
  // Older persisted/test sessions may not have loaded their profile list yet;
  // preserve the historical PostgreSQL behavior until a non-Postgres kind is known.
  const canExplain = canUseDatabase && (connectionKind === undefined || connectionKind === 'postgres')

  const doFormat = () => {
    const r = formatSql(sql, dialect)
    if (r.ok) {
      setSql(r.sql, tabId)
      flash('Formatted')
    } else {
      flash(r.error ?? 'Could not format', 3200)
    }
  }

  const onKey = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      run()
      return
    }
    if (e.shiftKey && e.altKey && e.key.toLowerCase() === 'f') {
      e.preventDefault()
      doFormat()
    }
  }

  return (
    <div className="editor-pane" onKeyDown={onKey}>
      <div className="editor-head">
        <ModeSwitch />
        <div className="spacer" />
        <span className="info">⌘↵ run · ⇧⌥F format</span>
        <button className="btn ghost" onClick={doFormat} title="Format SQL (Shift+Alt+F)">
          Format
        </button>
        <CopySqlButton sql={sql} />
        <button className="btn ghost explain-action" onClick={() => explain('explain')} disabled={isAnyExplainLoading || !canExplain} aria-busy={isExplainLoading}>
          {isExplainLoading && <span className="spinner" aria-hidden="true" />}
          {isExplainLoading ? 'Explaining…' : 'Explain'}
        </button>
        <button className="btn ghost explain-action analyze" onClick={() => explain('analyze')} disabled={isAnyExplainLoading || !canExplain} aria-busy={isAnalyzeLoading}>
          {isAnalyzeLoading && <span className="spinner" aria-hidden="true" />}
          {isAnalyzeLoading ? 'Analyzing…' : 'Explain Analyze'}
        </button>
        <button className="btn primary" onClick={run} disabled={!canUseDatabase || running}>
          {running ? 'Running…' : connecting ? 'Connecting…' : 'Run'}
        </button>
      </div>

      <div className="cm-wrap">
        <CodeMirror
          value={sql}
          height="100%"
          theme={oneDark}
          extensions={extensions}
          onChange={(value) => setSql(value, tabId)}
          editable={!isAnyExplainLoading}
          basicSetup={{ lineNumbers: true, foldGutter: false }}
        />
      </div>

      {showToast && <div className="toast">{showToast}</div>}
    </div>
  )
}
