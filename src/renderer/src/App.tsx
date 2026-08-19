import { useEffect, useRef, useState } from 'react'
import { Sidebar } from './components/Sidebar'
import { QueryEditor } from './components/QueryEditor'
import { ExplainPane } from './components/ExplainPane'
import { selectActiveSession, useStore } from './store/useStore'
import { BuilderPanel } from './components/BuilderPanel'
import { ResultExplorer } from './components/ResultExplorer'
import { TraceExplorer } from './components/TraceExplorer'
import { QueryTabs } from './components/QueryTabs'
import { ConnectionStatus } from './components/ConnectionStatus'
import {
  EDITOR_MIN, SIDEBAR_MIN, TITLEBAR_HEIGHT,
  clampDimension, editorBounds, keyboardDimension, parseStoredDimension, sidebarBounds
} from '@shared/layoutDimensions'
import { api } from './lib/api'
import type { ConnectionStateEvent } from '@shared/types'
import { NotificationArea } from './components/NotificationArea'
import styles from './App.module.css'

const SIDEBAR_STORAGE_KEY = 'datakoala.layout.v1.sidebarWidth'
const EDITOR_STORAGE_KEY = 'datakoala.layout.v1.editorHeight'

function storedDimension(primary: string): string | null {
  return localStorage.getItem(primary)
}

interface ActiveResize {
  axis: 'sidebar' | 'editor'
  pointerId: number
  handle: HTMLDivElement
  lastValid: number
  finish: () => void
}

export function App() {
  const profiles = useStore((s) => s.profiles)
  const activeTabId = useStore((s) => s.activeTabId)
  const mode = useStore((s) => selectActiveSession(s).queryMode)
  const tabConnectionId = useStore((s) => selectActiveSession(s).connectionProfileId)
  const builderHasRun = useStore((s) => selectActiveSession(s).builderHasRun)
  const workspaceRef = useRef<HTMLDivElement>(null)
  const mainRef = useRef<HTMLDivElement>(null)
  const activeResize = useRef<ActiveResize | null>(null)
  const [sidebarWidth, setSidebarWidth] = useState(() => clampDimension(parseStoredDimension(storedDimension(SIDEBAR_STORAGE_KEY), 240), sidebarBounds(window.innerWidth)))
  const [editorHeight, setEditorHeight] = useState(() => clampDimension(parseStoredDimension(storedDimension(EDITOR_STORAGE_KEY), 300), editorBounds(window.innerHeight - TITLEBAR_HEIGHT)))
  const [grafanaSignal, setGrafanaSignal] = useState<'metrics' | 'traces'>('metrics')

  useEffect(() => api.connections.onStateChanged((event: ConnectionStateEvent) => {
    useStore.getState().applyConnectionEvent(event)
  }), [])

  useEffect(() => setGrafanaSignal('metrics'), [activeTabId, tabConnectionId])

  const tabProfile = profiles.find((profile) => profile.id === tabConnectionId)
  const prometheusBuilder = tabProfile?.kind === 'prometheus' && mode === 'builder'
  const effectiveMode = prometheusBuilder ? 'sql' : mode
  // A restored tab is available before saved profiles finish loading. Do not
  // guess PostgreSQL during that gap: the profile may be a non-SQL datasource.
  const queryProfileLoading = Boolean(tabConnectionId && !tabProfile)
  const querySurfaceBlocked = queryProfileLoading
  const showGrafanaSignals = tabProfile?.kind === 'prometheus' && !querySurfaceBlocked
  const traceMode = showGrafanaSignals && grafanaSignal === 'traces'

  const currentSidebarBounds = () => sidebarBounds(workspaceRef.current?.clientWidth ?? window.innerWidth)
  const currentEditorBounds = () => editorBounds(mainRef.current?.clientHeight ?? window.innerHeight - TITLEBAR_HEIGHT)
  const applySidebarWidth = (value: number) => {
    const next = clampDimension(value, currentSidebarBounds())
    workspaceRef.current?.style.setProperty('--sidebar-width', `${next}px`)
    return next
  }
  const applyEditorHeight = (value: number) => {
    const next = clampDimension(value, currentEditorBounds())
    mainRef.current?.style.setProperty('--editor-height', `${next}px`)
    return next
  }

  useEffect(() => {
    const restoreSafeDimensions = () => {
      const safeSidebar = applySidebarWidth(sidebarWidth)
      const safeEditor = applyEditorHeight(editorHeight)
      if (safeSidebar !== sidebarWidth) {
        setSidebarWidth(safeSidebar)
        localStorage.setItem(SIDEBAR_STORAGE_KEY, String(safeSidebar))
      }
      if (safeEditor !== editorHeight) {
        setEditorHeight(safeEditor)
        localStorage.setItem(EDITOR_STORAGE_KEY, String(safeEditor))
      }
    }
    restoreSafeDimensions()
    window.addEventListener('resize', restoreSafeDimensions)
    return () => window.removeEventListener('resize', restoreSafeDimensions)
  }, [sidebarWidth, editorHeight])

  useEffect(() => () => activeResize.current?.finish(), [])

  const beginResize = (axis: 'sidebar' | 'editor') => (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    event.preventDefault()
    activeResize.current?.finish()
    const handle = event.currentTarget
    const pointerId = event.pointerId
    const start = axis === 'sidebar' ? event.clientX : event.clientY
    const initial = axis === 'sidebar' ? sidebarWidth : editorHeight
    const operation: ActiveResize = { axis, pointerId, handle, lastValid: initial, finish: () => undefined }
    document.body.classList.add(axis === 'sidebar' ? 'resizing-column' : 'resizing-row')
    const move = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId !== pointerId || activeResize.current !== operation) return
      const delta = (axis === 'sidebar' ? moveEvent.clientX : moveEvent.clientY) - start
      operation.lastValid = axis === 'sidebar' ? applySidebarWidth(initial + delta) : applyEditorHeight(initial + delta)
    }
    let finished = false
    const finish = () => {
      if (finished) return
      finished = true
      if (activeResize.current === operation) activeResize.current = null
      document.body.classList.remove('resizing-column', 'resizing-row')
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', finish)
      window.removeEventListener('blur', finish)
      handle.removeEventListener('lostpointercapture', finish)
      if (handle.hasPointerCapture(pointerId)) handle.releasePointerCapture(pointerId)
      if (axis === 'sidebar') setSidebarWidth(operation.lastValid); else setEditorHeight(operation.lastValid)
      localStorage.setItem(axis === 'sidebar' ? SIDEBAR_STORAGE_KEY : EDITOR_STORAGE_KEY, String(operation.lastValid))
    }
    operation.finish = finish
    activeResize.current = operation
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', finish)
    window.addEventListener('pointercancel', finish)
    window.addEventListener('blur', finish)
    handle.addEventListener('lostpointercapture', finish)
    handle.setPointerCapture(pointerId)
  }

  const resizeWithKeyboard = (axis: 'sidebar' | 'editor') => (event: React.KeyboardEvent<HTMLDivElement>) => {
    const next = keyboardDimension(axis === 'sidebar' ? sidebarWidth : editorHeight, event.key, axis,
      axis === 'sidebar' ? currentSidebarBounds() : currentEditorBounds())
    if (next === null) return
    event.preventDefault()
    if (axis === 'sidebar') { applySidebarWidth(next); setSidebarWidth(next) } else { applyEditorHeight(next); setEditorHeight(next) }
    localStorage.setItem(axis === 'sidebar' ? SIDEBAR_STORAGE_KEY : EDITOR_STORAGE_KEY, String(next))
  }

  return (
    <div className={`app ${styles.app}`}>
      <div className={`titlebar ${styles.titlebar}`}>
        <span className={styles.logo}>DataKoala</span>
        <QueryTabs className={styles.queryTabs} />
        <div className={styles.dragSpace} data-testid="titlebar-drag-space" aria-hidden="true" />
        <ConnectionStatus className={styles.connectionStatus} />
      </div>

      <div className={`workspace ${styles.workspace}`} ref={workspaceRef} style={{ '--sidebar-width': `${sidebarWidth}px` } as React.CSSProperties}>
        <Sidebar />
        <div className={`sidebar-resizer ${styles.resizer} ${styles.sidebarResizer}`} role="separator" aria-label="Resize sidebar" aria-orientation="vertical"
          aria-valuemin={SIDEBAR_MIN} aria-valuemax={Math.max(SIDEBAR_MIN, currentSidebarBounds().max)} aria-valuenow={Math.round(sidebarWidth)}
          tabIndex={0} onPointerDown={beginResize('sidebar')} onKeyDown={resizeWithKeyboard('sidebar')} />
        <div className={`main-shell ${styles.mainShell}`}>
          {showGrafanaSignals && (
            <div className={styles.signalBar} role="group" aria-label="Grafana signal">
              <span>Explore</span>
              <button type="button" className={grafanaSignal === 'metrics' ? styles.signalActive : ''} aria-pressed={grafanaSignal === 'metrics'} onClick={() => setGrafanaSignal('metrics')}>Metrics</button>
              <button type="button" className={grafanaSignal === 'traces' ? styles.signalActive : ''} aria-pressed={grafanaSignal === 'traces'} onClick={() => setGrafanaSignal('traces')}>Traces</button>
            </div>
          )}
          <div key={activeTabId} className={`main ${styles.main} ${effectiveMode === 'sql' && !querySurfaceBlocked && !traceMode ? `sql-layout ${styles.sqlLayout}` : ''}`} ref={mainRef}
            style={{ '--editor-height': `${editorHeight}px` } as React.CSSProperties}>
            {queryProfileLoading ? <div className={`query-unavailable ${styles.queryUnavailable}`} role="status" aria-label="Loading connection…">Loading datasource…</div> : traceMode ? <TraceExplorer connectionId={tabConnectionId!} /> : <>{effectiveMode === 'sql' ? <><QueryEditor builderMode={prometheusBuilder} /><div className={`editor-resizer ${styles.resizer} ${styles.editorResizer}`} role="separator" aria-label="Resize query editor"
              aria-orientation="horizontal" aria-valuemin={EDITOR_MIN} aria-valuemax={Math.max(EDITOR_MIN, currentEditorBounds().max)}
              aria-valuenow={Math.round(editorHeight)} tabIndex={0} onPointerDown={beginResize('editor')}
              onKeyDown={resizeWithKeyboard('editor')} /></> : <BuilderPanel />}
            <ResultExplorer mode={effectiveMode} hasRun={effectiveMode === 'sql' || builderHasRun}/></>}
          </div>
        </div>
      </div>

      <ExplainPane />
      <NotificationArea />
    </div>
  )
}