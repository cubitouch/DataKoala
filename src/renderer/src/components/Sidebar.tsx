import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import type { DataSourceProfile, DatabaseColumnNode, DatabaseRelationNode } from '@shared/types'
import { api } from '../lib/api'
import { ensureRelationColumns } from '../lib/relationColumns'
import { normalizeDatabaseObjects } from '../lib/databaseObjects'
import { relationIdentity, selectionPatchForColumns } from '../lib/builderRelations'
import { isBuilderTemporalDataType } from '../lib/builderSql'
import { buildPromql, detectPromqlHistogramKind, resolvePromqlHistogramKind, type PromqlCalculation, type PromqlHistogramKind } from '../lib/promqlBuilder'
import { bindTabConnection, ensureConnectionForTab } from '../lib/tabConnection'
import { selectActiveSession, selectSession, useStore } from '../store/useStore'
import { ConnectionModal } from './ConnectionModal'
import { connectionKindLabel } from '../lib/connectionKind'
import { DeleteConnectionDialog } from './DeleteConnectionDialog'
import { MetricDetails } from './MetricDetails'
import styles from './Sidebar.module.css'

const cx = (...classes: Array<string | false | undefined>) => classes.filter(Boolean).join(' ')

const typeLabel = (kind: DatabaseRelationNode['kind']) => kind === 'metric' ? 'metric' : kind === 'service' ? 'service' : kind === 'v' ? 'view' : kind === 'm' ? 'matview' : 'table'
const ordinaryPromqlCalculations = ['raw', 'rate', 'increase'] as const
const histogramPromqlCalculations = ['observation-rate', 'histogram-average', 'histogram-sum', 'percentile'] as const
const histogramPromqlCalculationSet = new Set<PromqlCalculation>(histogramPromqlCalculations)

function calculationsForHistogramKind(kind: PromqlHistogramKind): readonly PromqlCalculation[] {
  if (kind === 'classic') return ['raw', 'percentile']
  if (kind === 'native') return ['raw', ...histogramPromqlCalculations]
  if (kind === 'not-histogram') return ordinaryPromqlCalculations
  return [...ordinaryPromqlCalculations, ...histogramPromqlCalculations]
}

function traceqlForService(relation: DatabaseRelationNode): string {
  const namespace = relation.details?.kind === 'service' ? relation.details.serviceNamespace : undefined
  const service = `resource.service.name = ${JSON.stringify(relation.name)}`
  return namespace
    ? `{ resource.service.namespace = ${JSON.stringify(namespace)} && ${service} }`
    : `{ ${service} }`
}

function RelationName({ relation, current, onClick }: { relation: DatabaseRelationNode; current: boolean; onClick: () => void }) {
  const tooltipId = useId()
  const metricHelp = relation.details?.kind === 'metric' ? relation.details.help : undefined
  const isMetric = relation.kind === 'metric'
  const isService = relation.kind === 'service'
  const ariaLabel = isMetric
    ? `Select ${relation.name} for Builder`
    : isService ? `Explore traces for ${relation.name}` : `Select ${relation.qualifiedName} for Builder`
  return <>
    <button
      className={cx(styles.relationName, styles.truncate, metricHelp && styles.tooltipTrigger)}
      title={isMetric ? undefined : isService ? relation.name : relation.qualifiedName}
      aria-label={ariaLabel}
      aria-describedby={metricHelp ? tooltipId : undefined}
      aria-current={current ? 'true' : undefined}
      onClick={onClick}
    >{relation.name}</button>
    {metricHelp && <span className={cx('info-tooltip', styles.metricHelpTooltip)} id={tooltipId} role="tooltip">{metricHelp}</span>}
  </>
}

export function Sidebar() {
  const profiles = useStore((s) => s.profiles)
  const setProfiles = useStore((s) => s.setProfiles)
  const activeId = useStore((s) => s.activeProfileId)
  const detachProfile = useStore((s) => s.detachProfile)
  const connectionError = useStore((s) => s.connectionError)
  const connecting = useStore((s) => s.connecting)
  const connected = useStore((s) => s.connected)
  const activeTabId = useStore((s) => s.activeTabId)
  const activeTabConnectionId = useStore((s) => selectActiveSession(s).connectionProfileId)
  const currentSql = useStore((s) => selectActiveSession(s).sql)
  const metadata = useStore((s) => activeTabConnectionId ? s.metadataByProfileId[activeTabConnectionId] : undefined)
  const schemas = metadata?.schemas ?? []
  const metadataStatus = metadata?.status ?? 'idle'
  const metadataError = metadata?.error ?? null
  const setMetadata = useStore((s) => s.setMetadata)
  const builderTable = useStore((s) => selectActiveSession(s).builder.table)
  const promqlBuilder = useStore((s) => selectActiveSession(s).promqlBuilder)
  const selectBuilderRelation = useStore((s) => s.selectBuilderRelation)
  const setPromqlBuilder = useStore((s) => s.setPromqlBuilder)
  const setQueryMode = useStore((s) => s.setQueryMode)
  const setSql = useStore((s) => s.setSql)
  const [editing, setEditing] = useState<DataSourceProfile | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<DataSourceProfile | null>(null)
  const deleteOrigin = useRef<HTMLButtonElement | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [filter, setFilter] = useState('')
  const tabConnected = Boolean(activeTabConnectionId && connected && activeId === activeTabConnectionId)

  const loadProfiles = async () => setProfiles(await api.connections.list())
  useEffect(() => { void loadProfiles() }, [])

  useEffect(() => {
    if (metadataStatus !== 'loaded' || expanded.size || !schemas.length) return
    const initial = schemas.find((schema) => schema.name === 'public' && !schema.isSystem) ?? schemas.find((schema) => !schema.isSystem)
    if (initial) setExpanded(new Set([`schema:${initial.name}`]))
  }, [metadataStatus, schemas, expanded.size])

  const loadObjects = async (id: string) => {
    setMetadata([], 'loading', null, id)
    try {
      const nodes = normalizeDatabaseObjects(await api.connections.listObjects(id))
      setMetadata(nodes, 'loaded', null, id)
    } catch (error) {
      setMetadata([], 'error', error instanceof Error ? error.message : String(error), id)
    }
  }

  const connect = async (profile: DataSourceProfile) => {
    if (connecting) return
    const state = useStore.getState()
    const switchingLiveConnection = Boolean(state.activeProfileId && state.activeProfileId !== profile.id)
    const wouldInterrupt = switchingLiveConnection && state.tabs.some((tab) => tab.connectionProfileId === state.activeProfileId && tab.running)
    if (wouldInterrupt && !window.confirm('A query is still running on the current connection. Switching connections will stop it. Continue?')) return
    bindTabConnection(activeTabId, profile.id)
    await ensureConnectionForTab(activeTabId, { confirmInterrupt: false })
  }

  const retryObjects = async () => {
    if (!activeTabConnectionId) return
    const id = await ensureConnectionForTab(activeTabId)
    if (id) await loadObjects(id)
  }

  const remove = async (id: string) => {
    await api.connections.remove(id)
    detachProfile(id)
    void loadProfiles()
  }
  const cancelDelete = useCallback(() => {
    setPendingDelete(null)
    requestAnimationFrame(() => deleteOrigin.current?.focus())
  }, [])
  const confirmDelete = async () => {
    if (!pendingDelete) return
    const id = pendingDelete.id
    setPendingDelete(null)
    await remove(id)
  }

  const toggle = (id: string) => setExpanded((old) => {
    const next = new Set(old); next.has(id) ? next.delete(id) : next.add(id); return next
  })

  const reconcileSelectedBuilderColumns = (requested: DatabaseRelationNode, columns: DatabaseColumnNode[]) => {
    const state = useStore.getState()
    const session = selectSession(state, activeTabId)
    if (!session || !session.builder.table || relationIdentity(session.builder.table) !== relationIdentity(requested)) return
    const patch = selectionPatchForColumns(requested, session.builder.table, session.builder, columns, (column) => isBuilderTemporalDataType(column.dataTypeName))
    if (patch) state.setBuilder(patch, activeTabId)
    const sourceX = session.builderVisualization.xColumn === 'time_bucket' ? session.builder.timeColumn : session.builderVisualization.xColumn
    const nextX = sourceX && columns.some((column) => column.name === sourceX) ? sourceX : null
    const sourceY = session.builderVisualization.aggregation === 'count' ? null : session.builderVisualization.valueColumn
    const nextY = sourceY && columns.some((column) => column.name === sourceY) ? sourceY : null
    if (nextX !== sourceX || nextY !== sourceY) state.setVisualization('builder', { xColumn: nextX, valueColumn: nextY }, activeTabId)
  }

  const loadRelationColumns = async (relation: DatabaseRelationNode) => {
    if (relation.columnsStatus === 'loaded' && relation.columns) {
      reconcileSelectedBuilderColumns(relation, relation.columns)
      return
    }
    if (relation.columnsStatus !== 'idle' && relation.columnsStatus !== 'error') return
    const requestProfileId = await ensureConnectionForTab(activeTabId)
    if (!requestProfileId) return
    const columns = await ensureRelationColumns(requestProfileId, relation, relation.columnsStatus === 'error')
    if (columns) reconcileSelectedBuilderColumns(relation, columns)
  }

  const expandRelation = async (relation: DatabaseRelationNode) => {
    if (relation.kind === 'service') return
    const treeId = `relation:${relation.qualifiedName}`
    toggle(treeId)
    if (relation.kind === 'metric' || expanded.has(treeId) || relation.columnsStatus !== 'idle') return
    await loadRelationColumns(relation)
  }

  const visibleSchemas = useMemo(() => {
    const needle = filter.trim().toLocaleLowerCase()
    if (!needle) return schemas
    return schemas.map((schema) => ({ ...schema, relations: schema.relations.filter((relation) =>
      schema.name.toLocaleLowerCase().includes(needle) || relation.name.toLocaleLowerCase().includes(needle) ||
      relation.columns?.some((column) => column.name.toLocaleLowerCase().includes(needle) || column.dataTypeName.toLocaleLowerCase().includes(needle)))
    })).filter((schema) => schema.relations.length || schema.name.toLocaleLowerCase().includes(needle))
  }, [filter, schemas])
  const filtering = Boolean(filter.trim())

  const selectForBuilder = (relation: DatabaseRelationNode) => {
    if (relation.kind === 'service') {
      const generated = traceqlForService(relation)
      setQueryMode('builder', activeTabId)
      setSql(generated, activeTabId)
      return
    }
    if (relation.kind === 'metric') {
      if (promqlBuilder.metric === relation.name) return
      const metadataType = relation.details?.kind === 'metric' ? relation.details.type : undefined
      const detectedKind = detectPromqlHistogramKind({ metric: relation.name, labels: [], metadataType })
      const histogramKind = resolvePromqlHistogramKind(detectedKind, 'auto')
      const calculation = calculationsForHistogramKind(histogramKind).includes(promqlBuilder.calculation) ? promqlBuilder.calculation : 'raw' as const
      const next = {
        ...promqlBuilder,
        metric: relation.name,
        calculation,
        histogramKindOverride: 'auto' as const,
        aggregation: histogramPromqlCalculationSet.has(calculation) ? 'sum' as const : calculation === 'raw' ? 'none' as const : promqlBuilder.aggregation,
        filterBy: [],
        groupBy: [],
        labelValues: {}
      }
      setPromqlBuilder(next, activeTabId)
      const generated = buildPromql(next, histogramKind)
      if (generated) setSql(generated, activeTabId)
      return
    }
    if (builderTable && relationIdentity(builderTable) === relationIdentity(relation)) {
      if (relation.columnsStatus !== 'loaded') void loadRelationColumns(relation)
      return
    }
    selectBuilderRelation({ schema: relation.schema, name: relation.name })
    void loadRelationColumns(relation)
  }

  return <aside className={styles.sidebar} aria-label="Connections and database objects">
    <h3>Connections</h3>
    {profiles.map((profile) => {
      const isConnecting = activeId === profile.id && connecting
      const isSelected = activeTabConnectionId === profile.id
      const isLive = activeId === profile.id && connected
      return <div key={profile.id} className={cx(styles.connItem, isLive && styles.active, isConnecting && styles.connecting)} data-connection-item data-connection-live={isLive || undefined}
        onClick={() => { if (!connecting) void connect(profile) }} aria-busy={isConnecting} aria-current={isSelected ? 'true' : undefined}>
        <span className={isConnecting ? styles.spinner : styles.dot} aria-label={isConnecting ? 'Connecting' : undefined} />
        <span className={styles.name} data-connection-name>{profile.name}</span>
        <span className={styles.kind}>{connectionKindLabel(profile.kind)}</span>
        {isConnecting && <span className={styles.connectingLabel}>Connecting…</span>}
        {isSelected && !isLive && !isConnecting && <span className={styles.connectingLabel}>connect on run</span>}
        <button className={styles.del} aria-label={`Edit connection ${profile.name}`} disabled={connecting} onClick={(event) => { event.stopPropagation(); setEditing(profile); setShowModal(true) }}>✎</button>
        <button className={styles.del} aria-label={`Delete connection ${profile.name}`} disabled={connecting} onClick={(event) => { event.stopPropagation(); deleteOrigin.current = event.currentTarget; setPendingDelete(profile) }}>✕</button>
      </div>
    })}
    <button className={styles.btnAdd} disabled={connecting} onClick={() => { setEditing(null); setShowModal(true) }}>+ new connection</button>
    {!tabConnected && connectionError && activeId === activeTabConnectionId && <div className={styles.objectError} role="alert">
      {connectionError}
      <button onClick={() => void ensureConnectionForTab(activeTabId)} disabled={connecting}>{connecting ? 'Reconnecting…' : 'Reconnect'}</button>
    </div>}

    {(tabConnected || schemas.length > 0) && <section className={styles.objectsSection}>
      <h3>Objects</h3>
      {!tabConnected && schemas.length > 0 && <div className={styles.objectStatus} role="status">Cached metadata — reconnects when needed.</div>}
      {metadataStatus === 'loading' && <div className={styles.objectStatus} role="status"><span className={styles.spinner} aria-label="Loading database objects" /> Loading database objects…</div>}
      {metadataStatus === 'error' && <div className={styles.objectError} role="alert">Could not load objects.<small>{metadataError}</small><button onClick={() => void retryObjects()}>Retry</button></div>}
      {metadataStatus === 'loaded' && <>
        <input className={styles.objectFilter} value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Filter objects…" aria-label="Filter database objects" />
        {schemas.length === 0 ? <div className={styles.objectStatus}>No database objects</div> :
        <div className={styles.objectTree} role="tree" aria-label="Database objects">
          {visibleSchemas.map((schema) => {
            const schemaId = `schema:${schema.name}`
            const schemaOpen = filtering || expanded.has(schemaId)
            return <div key={schemaId} role="treeitem" aria-expanded={schemaOpen}>
              <button className={cx(styles.treeRow, styles.schemaRow)} onClick={() => toggle(schemaId)} title={schema.name}><span className={styles.chevron}>{schemaOpen ? '▾' : '▸'}</span><span className={styles.truncate}>{schema.name}</span>{schema.isSystem && <span className={styles.badge}>system</span>}</button>
              {schemaOpen && <div role="group">{schema.relations.map((relation) => {
                const relationId = `relation:${relation.qualifiedName}`
                const leaf = relation.kind === 'service'
                const relationOpen = relation.kind === 'metric' ? expanded.has(relationId) : leaf ? false : filtering || expanded.has(relationId)
                const current = relation.kind === 'metric'
                  ? promqlBuilder.metric === relation.name
                  : relation.kind === 'service'
                    ? currentSql === traceqlForService(relation)
                    : builderTable?.schema === relation.schema && builderTable.name === relation.name
                return <div key={relationId} role="treeitem" aria-expanded={leaf ? undefined : relationOpen}>
                  <div className={cx(styles.treeRow, styles.relationRow)}>
                    {relation.kind === 'service'
                      ? <span className={styles.chevronButton} aria-hidden="true" />
                      : <button className={styles.chevronButton} aria-label={`${relationOpen ? 'Collapse' : 'Expand'} ${relation.name}`} onClick={() => void expandRelation(relation)}>{relationOpen ? '▾' : '▸'}</button>}
                    <RelationName relation={relation} current={current} onClick={() => selectForBuilder(relation)} />
                    {(relation.details?.kind !== 'metric' || relation.details.type) && <span className={cx(styles.kind, styles.relationKind)}>{relation.details?.kind === 'metric' ? relation.details.type : typeLabel(relation.kind)}</span>}
                  </div>
                  {relationOpen && <div role="group" className={styles.columns}>
                    {relation.details?.kind === 'metric' && <MetricDetails connectionId={activeTabConnectionId} relation={relation} />}
                    {relation.columnsStatus === 'loading' && <div className={styles.columnStatus} role="status">Loading columns…</div>}
                    {relation.columnsStatus === 'error' && <button className={cx(styles.columnStatus, styles.error)} onClick={() => void loadRelationColumns({ ...relation, columnsStatus: 'idle' })}>Could not load columns — retry</button>}
                    {relation.columns?.map((column) => <div className={cx(styles.treeRow, styles.columnRow)} role="treeitem" key={column.name} title={`${relation.qualifiedName}.${column.name} — ${column.dataTypeName}`} aria-label={`${relation.qualifiedName}.${column.name}, ${column.dataTypeName}`}><span className={styles.truncate}>{column.name}</span><span className={cx(styles.columnType, styles.truncate)}>{column.dataTypeName}</span></div>)}
                  </div>}
                </div>
              })}</div>}
            </div>
          })}
        </div>}
      </>}
    </section>}
    {showModal && <ConnectionModal existing={editing} onClose={() => setShowModal(false)} onSaved={() => void loadProfiles()} />}
    {pendingDelete && <DeleteConnectionDialog profile={pendingDelete} onCancel={cancelDelete} onConfirm={() => void confirmDelete()} />}
  </aside>
}
