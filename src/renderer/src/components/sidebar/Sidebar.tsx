import { TextInput } from '@components/ui/TextInput'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { DataSourceProfile, DatabaseColumnNode, DatabaseRelationNode } from '@shared/types'
import { api } from '@lib/api'
import { ensureRelationColumns } from '@lib/relationColumns'
import { loadConnectionMetadata } from '@lib/connectionMetadata'
import { matchesSearch } from '@lib/matchesSearch'
import { relationIdentity, selectionPatchForColumns } from '@lib/builderRelations'
import { isBuilderTemporalDataType } from '@lib/builderSql'
import { buildPromql, reconcilePromqlBuilderForMetric } from '@lib/promqlBuilder'
import { bindTabConnection, ensureConnectionForTab } from '@lib/tabConnection'
import { selectActiveSession, selectSession, useStore } from '@store/useStore'
import { ConnectionModal } from '@components/connections/ConnectionModal'
import { connectionKindLabel } from '@lib/connectionKind'
import { DeleteConnectionDialog } from '@components/connections/DeleteConnectionDialog'
import { LokiSidebarTree } from './LokiSidebarTree'
import { SqlMetadataTree } from '@components/metadata/sql/SqlMetadataTree'
import { PrometheusMetadataTree } from '@components/metadata/prometheus/PrometheusMetadataTree'
import styles from './Sidebar.module.css'

const cx = (...classes: Array<string | false | undefined>) => classes.filter(Boolean).join(' ')

const typeLabel = (kind: DatabaseRelationNode['kind']) => kind === 'service' ? 'service' : kind === 'v' ? 'view' : kind === 'm' ? 'matview' : 'table'
function traceqlForService(relation: DatabaseRelationNode): string {
  const namespace = relation.details?.kind === 'service' ? relation.details.serviceNamespace : undefined
  const service = `resource.service.name = ${JSON.stringify(relation.name)}`
  return namespace
    ? `{ resource.service.namespace = ${JSON.stringify(namespace)} && ${service} }`
    : `{ ${service} }`
}

function RelationName({ relation, current, onClick }: { relation: DatabaseRelationNode; current: boolean; onClick: () => void }) {
  const isService = relation.kind === 'service'
  const ariaLabel = isService ? `Explore traces for ${relation.name}` : `Select ${relation.qualifiedName} for Builder`
  return <>
    <button
      className={cx(styles.relationName, styles.truncate)}
      title={isService ? relation.name : relation.qualifiedName}
      aria-label={ariaLabel}
      aria-current={current ? 'true' : undefined}
      onClick={onClick}
    >{relation.name}</button>
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
  const connectionStateByProfileId = useStore((s) => s.connectionStateByProfileId)
  const activeTabId = useStore((s) => s.activeTabId)
  const activeTabConnectionId = useStore((s) => selectActiveSession(s).connectionProfileId)
  const activeTabSourceKind = useStore((s) => s.profiles.find((profile) => profile.id === selectActiveSession(s).connectionProfileId)?.kind)
  const currentSql = useStore((s) => selectActiveSession(s).sql)
  const metadataByProfileId = useStore((s) => s.metadataByProfileId)
  const metadata = activeTabConnectionId ? metadataByProfileId[activeTabConnectionId] : undefined
  const schemas = metadata?.schemas ?? []
  const metadataStatus = metadata?.status ?? 'idle'
  const metadataError = metadata?.error ?? null
  const metadataRevision = metadata?.revision ?? 0
  const metadataRefreshing = metadata?.refreshing ?? false
  const metadataRefreshError = metadata?.refreshError ?? null
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

  const loadProfiles = async () => {
    setProfiles(await api.connections.list())
    const live = await api.connections.listLive?.()
    if (live?.length) useStore.setState((state) => ({
      connectionStateByProfileId: {
        ...state.connectionStateByProfileId,
        ...Object.fromEntries(live.map((session) => [session.id, { status: 'connected' as const, generation: session.generation, error: null, serverVersion: session.serverVersion ?? null }]))
      }
    }))
  }
  useEffect(() => { void loadProfiles() }, [])

  useEffect(() => {
    if (metadataStatus !== 'loaded' || expanded.size || !schemas.length) return
    const initial = schemas.find((schema) => schema.name === 'public' && !schema.isSystem) ?? schemas.find((schema) => !schema.isSystem)
    if (initial) setExpanded(new Set([`schema:${initial.name}`]))
  }, [metadataStatus, schemas, expanded.size])

  const loadObjects = async (id: string) => {
    setMetadata([], 'loading', null, id)
    try {
      const nodes = await loadConnectionMetadata(id)
      setMetadata(nodes, 'loaded', null, id)
    } catch (error) {
      setMetadata([], 'error', error instanceof Error ? error.message : String(error), id)
    }
  }

  const connect = async (profile: DataSourceProfile) => {
    const state = useStore.getState()
    const profileStatus = state.connectionStateByProfileId[profile.id]?.status
    if (profileStatus === 'connecting' || profileStatus === 'reconnecting') return
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
    if (expanded.has(treeId) || relation.columnsStatus !== 'idle') return
    await loadRelationColumns(relation)
  }

  useEffect(() => {
    if (!metadataRevision || !activeTabConnectionId || activeTabSourceKind === 'prometheus' || activeTabSourceKind === 'tempo' || activeTabSourceKind === 'loki') return
    const selected = builderTable ? `${builderTable.schema}.${builderTable.name}` : null
    for (const schema of schemas) for (const relation of schema.relations) {
      if (expanded.has(`relation:${relation.qualifiedName}`) || relation.qualifiedName === selected) void loadRelationColumns(relation)
    }
  // A revision denotes a successful replacement; expansion and selection intentionally survive it.
  }, [metadataRevision])

  const visibleSchemas = useMemo(() => {
    if (!filter.trim()) return schemas
    return schemas.map((schema) => ({ ...schema, relations: schema.relations.filter((relation) =>
      matchesSearch(schema.name, filter) || matchesSearch(relation.name, filter) ||
      relation.columns?.some((column) => matchesSearch(`${column.name} ${column.dataTypeName}`, filter)))
    })).filter((schema) => schema.relations.length || matchesSearch(schema.name, filter))
  }, [filter, schemas])
  const filtering = Boolean(filter.trim())
  const isSqlSource = activeTabSourceKind !== 'prometheus' && activeTabSourceKind !== 'tempo' && activeTabSourceKind !== 'loki'
  const isPrometheusMetadata = activeTabSourceKind === 'prometheus' && schemas.some((schema) => schema.relations.some((relation) => relation.kind === 'metric'))

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
      const { builder: next, histogramKind } = reconcilePromqlBuilderForMetric(promqlBuilder, relation.name, metadataType)
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

  const objectFilterLabel = activeTabSourceKind === 'prometheus'
    ? 'Filter metrics'
    : activeTabSourceKind === 'tempo'
      ? 'Filter services'
      : 'Filter database objects'

  return <aside className={styles.sidebar} aria-label="Connections and objects">
    <h3>Connections</h3>
    {profiles.map((profile) => {
      const profileConnection = connectionStateByProfileId[profile.id]
      const isConnecting = profileConnection?.status === 'connecting' || profileConnection?.status === 'reconnecting'
      const isSelected = activeTabConnectionId === profile.id
      const isLive = profileConnection?.status === 'connected' || profileConnection?.status === 'idle' || (activeId === profile.id && connected)
      const isCurrentLive = isLive && isSelected
      const isBackgroundLive = isLive && !isSelected
      const stateLabel = isConnecting ? 'connecting' : isCurrentLive ? 'live, current tab' : isBackgroundLive ? 'live, background' : profileConnection?.status === 'error' ? 'connection error' : 'disconnected'
      const isRefreshing = metadataByProfileId[profile.id]?.refreshing ?? false
      return <div key={profile.id} className={cx(styles.connItem, isSelected && styles.selected, isCurrentLive && styles.currentLive, isBackgroundLive && styles.backgroundLive, isConnecting && styles.connecting, profileConnection?.status === 'error' && styles.connectionError)} data-connection-item data-connection-live={isLive || undefined} data-connection-state={stateLabel} title={`${profile.name}: ${stateLabel}`}
        onClick={() => { if (!isConnecting) void connect(profile) }} aria-busy={isConnecting} aria-current={isSelected ? 'true' : undefined} aria-label={`${profile.name}, ${stateLabel}`}>
        <span className={isConnecting ? styles.spinner : styles.dot} aria-label={isConnecting ? 'Connecting' : undefined} />
        <span className={styles.name} data-connection-name>{profile.name}</span>
        <span className={styles.trailing} data-connection-trailing>
          <span className={styles.kind}>{connectionKindLabel(profile.kind)}</span>
          {isConnecting && <span className={styles.connectingLabel}>Connecting…</span>}
          <span className={styles.actions} data-connection-actions>
            {isLive && <button className={styles.action} type="button" title="Refresh metadata" aria-label={`Refresh metadata for ${profile.name}`}
              disabled={isRefreshing} aria-busy={isRefreshing || undefined}
              onClick={(event) => { event.stopPropagation(); void useStore.getState().refreshMetadata(profile.id) }}>
              <span aria-hidden="true">↻</span>
            </button>}
            <button className={styles.action} type="button" title="Edit connection" aria-label={`Edit connection ${profile.name}`} disabled={connecting} onClick={(event) => { event.stopPropagation(); setEditing(profile); setShowModal(true) }}>✎</button>
            <button className={styles.action} type="button" title="Delete connection" aria-label={`Delete connection ${profile.name}`} disabled={connecting} onClick={(event) => { event.stopPropagation(); deleteOrigin.current = event.currentTarget; setPendingDelete(profile) }}>✕</button>
          </span>
        </span>
      </div>
    })}
    <button className={styles.btnAdd} disabled={connecting} onClick={() => { setEditing(null); setShowModal(true) }}>+ new connection</button>
    {!tabConnected && connectionError && activeId === activeTabConnectionId && <div className={styles.objectError} role="alert">
      {connectionError}
      <button onClick={() => void ensureConnectionForTab(activeTabId)} disabled={connecting}>{connecting ? 'Reconnecting…' : 'Reconnect'}</button>
    </div>}
    {activeTabSourceKind === 'loki' && activeTabConnectionId && <LokiSidebarTree connectionId={activeTabConnectionId} />}
    {activeTabSourceKind !== 'loki' && (tabConnected || schemas.length > 0) && <section className={styles.objectsSection}>
      <h3>Objects</h3>
      {!tabConnected && schemas.length > 0 && <div className={styles.objectStatus} role="status">Cached metadata — reconnects when needed.</div>}
      {!metadataRefreshing && metadataStatus === 'loading' && <div className={styles.objectStatus} role="status"><span className={styles.spinner} aria-label="Loading database objects" /> Loading database objects…</div>}
      {!metadataRefreshing && metadataStatus === 'error' && <div className={styles.objectError} role="alert">Could not load objects.<small>{metadataError}</small><button onClick={() => void retryObjects()}>Retry</button></div>}
      {metadataStatus === 'loaded' && <>
        <div className={styles.objectFilter}><TextInput value={filter} onValueChange={setFilter} placeholder="Filter objects…" label={objectFilterLabel} labelVisibility="sr-only" /></div>
        {metadataRefreshing && <div className={styles.objectStatus} role="status"><span className={styles.spinner} aria-hidden="true" /> Refreshing metadata…</div>}
        {!metadataRefreshing && metadataRefreshError && <div className={styles.objectError} role="alert">Could not refresh metadata.<small>{metadataRefreshError}</small></div>}
        <div className={styles.objectTreeViewport} hidden={metadataRefreshing} data-object-tree-viewport>
        {schemas.length === 0 ? <div className={styles.objectStatus}>No database objects</div> :
        isPrometheusMetadata && activeTabConnectionId ? <PrometheusMetadataTree connectionId={activeTabConnectionId} revision={metadataRevision} schemas={schemas} expanded={expanded} filter={filter} selectedMetric={promqlBuilder.metric}
          onToggleMetric={(relation) => toggle(`relation:${relation.qualifiedName}`)} onActivateMetric={selectForBuilder} /> :
        isSqlSource ? <SqlMetadataTree schemas={schemas} expanded={expanded} filter={filter} selectedRelation={builderTable}
          onToggleSchema={toggle}
          onToggleRelation={(relation) => void expandRelation(relation)}
          onActivateRelation={selectForBuilder}
          onRetryRelation={(relation) => void loadRelationColumns({ ...relation, columnsStatus: 'idle' })} /> :
        <div className={styles.objectTree} role="tree" aria-label="Database objects">
          {visibleSchemas.map((schema) => {
            const schemaId = `schema:${schema.name}`
            const schemaOpen = filtering || expanded.has(schemaId)
            return <div key={schemaId} role="treeitem" aria-expanded={schemaOpen}>
              <button className={cx(styles.treeRow, styles.schemaRow)} onClick={() => toggle(schemaId)} title={schema.name}><span className={styles.chevron}>{schemaOpen ? '▾' : '▸'}</span><span className={styles.truncate}>{schema.name}</span>{schema.isSystem && <span className={styles.badge}>system</span>}</button>
              {schemaOpen && <div role="group">{schema.relations.map((relation) => {
                const relationId = `relation:${relation.qualifiedName}`
                const leaf = relation.kind === 'service'
                const relationOpen = leaf ? false : filtering || expanded.has(relationId)
                const current = relation.kind === 'service'
                    ? currentSql === traceqlForService(relation)
                    : builderTable?.schema === relation.schema && builderTable.name === relation.name
                return <div key={relationId} role="treeitem" aria-expanded={leaf ? undefined : relationOpen}>
                  <div className={cx(styles.treeRow, styles.relationRow)}>
                    {relation.kind === 'service'
                      ? <span className={styles.chevronButton} aria-hidden="true" />
                      : <button className={styles.chevronButton} aria-label={`${relationOpen ? 'Collapse' : 'Expand'} ${relation.name}`} onClick={() => void expandRelation(relation)}>{relationOpen ? '▾' : '▸'}</button>}
                    <RelationName relation={relation} current={current} onClick={() => selectForBuilder(relation)} />
                    <span className={cx(styles.kind, styles.relationKind)}>{typeLabel(relation.kind)}</span>
                  </div>
                  {relationOpen && <div role="group" className={styles.columns}>
                    {relation.columnsStatus === 'loading' && <div className={styles.columnStatus} role="status">Loading columns…</div>}
                    {relation.columnsStatus === 'error' && <button className={cx(styles.columnStatus, styles.error)} onClick={() => void loadRelationColumns({ ...relation, columnsStatus: 'idle' })}>Could not load columns — retry</button>}
                    {relation.columns?.map((column) => <div className={cx(styles.treeRow, styles.columnRow)} role="treeitem" key={column.name} title={`${relation.qualifiedName}.${column.name} — ${column.dataTypeName}`} aria-label={`${relation.qualifiedName}.${column.name}, ${column.dataTypeName}`}><span className={styles.truncate}>{column.name}</span><span className={cx(styles.columnType, styles.truncate)}>{column.dataTypeName}</span></div>)}
                  </div>}
                </div>
              })}</div>}
            </div>
          })}
        </div>}
        </div>
      </>}
    </section>}
    {showModal && <ConnectionModal existing={editing} onClose={() => setShowModal(false)} onSaved={() => void loadProfiles()} />}
    {pendingDelete && <DeleteConnectionDialog profile={pendingDelete} onCancel={cancelDelete} onConfirm={() => void confirmDelete()} />}
  </aside>
}
