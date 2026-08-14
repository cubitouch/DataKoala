import { useEffect, useMemo, useState } from 'react'
import type { DataSourceProfile, DatabaseColumnNode, DatabaseRelationNode } from '@shared/types'
import { api } from '../lib/api'
import { ensureRelationColumns } from '../lib/relationColumns'
import { normalizeDatabaseObjects } from '../lib/databaseObjects'
import { relationIdentity, selectionPatchForColumns } from '../lib/builderRelations'
import { isBuilderTemporalDataType } from '../lib/builderSql'
import { bindTabConnection, ensureConnectionForTab } from '../lib/tabConnection'
import { selectActiveSession, selectSession, useStore } from '../store/useStore'
import { ConnectionModal } from './ConnectionModal'
import { connectionKindLabel } from '../lib/connectionKind'

const typeLabel = (kind: DatabaseRelationNode['kind']) => kind === 'metric' ? 'metric' : kind === 'v' ? 'view' : kind === 'm' ? 'matview' : 'table'
const LABEL_VALUE_DISPLAY_LIMIT = 200

function MetricDetails({ connectionId, relation }: { connectionId: string | null; relation: DatabaseRelationNode }) {
  const [labels, setLabels] = useState<string[] | null>(null)
  const [labelsError, setLabelsError] = useState<string | null>(null)
  const [values, setValues] = useState<Record<string, string[]>>({})
  const [valueErrors, setValueErrors] = useState<Record<string, string>>({})
  const [loadingValues, setLoadingValues] = useState<Set<string>>(new Set())
  const [openLabels, setOpenLabels] = useState<Set<string>>(new Set())
  const [valueFilters, setValueFilters] = useState<Record<string, string>>({})

  const loadLabels = async () => {
    if (!connectionId || labels) return
    setLabelsError(null)
    try { setLabels(await api.connections.prometheus.labelsForMetric(connectionId, relation.name)) }
    catch (error) { setLabelsError(error instanceof Error ? error.message : String(error)) }
  }
  useEffect(() => { void loadLabels() }, [connectionId, relation.name])

  const toggleLabel = async (label: string) => {
    setOpenLabels((old) => { const next = new Set(old); next.has(label) ? next.delete(label) : next.add(label); return next })
    if (values[label] || loadingValues.has(label)) return
    setLoadingValues((old) => new Set(old).add(label))
    setValueErrors((old) => { const next = { ...old }; delete next[label]; return next })
    try {
      const discovered = await api.connections.prometheus.labelValues(connectionId!, relation.name, label)
      setValues((old) => ({ ...old, [label]: discovered }))
    }
    catch (error) { setValueErrors((old) => ({ ...old, [label]: error instanceof Error ? error.message : String(error) })) }
    finally { setLoadingValues((old) => { const next = new Set(old); next.delete(label); return next }) }
  }

  return <div className="metric-details">
    <div><strong>Name</strong><span>{relation.name}</span></div>
    <div><strong>Type</strong><span>{relation.details?.kind === 'metric' ? relation.details.type || 'unknown' : 'unknown'}</span></div>
    {relation.details?.kind === 'metric' && relation.details.unit && <div><strong>Unit</strong><span>{relation.details.unit}</span></div>}
    {relation.details?.kind === 'metric' && relation.details.help && <div><strong>Help</strong><span>{relation.details.help}</span></div>}
    <div className="metric-label-heading"><strong>Labels</strong></div>
    {!labels && !labelsError && <div className="label-status" role="status">Loading labels…</div>}
    {labelsError && <button className="label-status error" onClick={() => void loadLabels()}>Could not load labels — retry</button>}
    {labels?.length === 0 && <div className="label-status">No labels</div>}
    {labels?.map((label) => {
      const open = openLabels.has(label)
      const filter = valueFilters[label]?.toLocaleLowerCase() ?? ''
      const allValues = values[label]
      const filtered = allValues?.filter((value) => value.toLocaleLowerCase().includes(filter)) ?? []
      const shown = filtered.slice(0, LABEL_VALUE_DISPLAY_LIMIT)
      return <div className="metric-label" key={label}>
        <button className="tree-row label-row" aria-expanded={open} onClick={() => void toggleLabel(label)}><span className="chevron">{open ? '▾' : '▸'}</span><span>{label}</span></button>
        {open && <div className="label-values">
          {loadingValues.has(label) && <div className="label-status" role="status">Loading values…</div>}
          {valueErrors[label] && <button className="label-status error" onClick={() => void toggleLabel(label)}>Could not load values — retry</button>}
          {allValues && allValues.length > LABEL_VALUE_DISPLAY_LIMIT && <input aria-label={`Filter values for ${label}`} placeholder="Filter values…" value={valueFilters[label] ?? ''} onChange={(event) => setValueFilters((old) => ({ ...old, [label]: event.target.value }))} />}
          {allValues?.length === 0 && <div className="label-status">No values</div>}
          {shown.map((value) => <div className="label-value truncate" key={value} title={value}>{value}</div>)}
          {allValues && filtered.length > shown.length && <div className="label-limit">Showing {shown.length} of {filtered.length} matching values. Refine the filter to see more.</div>}
        </div>}
      </div>
    })}
  </div>
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
  const metadata = useStore((s) => activeTabConnectionId ? s.metadataByProfileId[activeTabConnectionId] : undefined)
  const schemas = metadata?.schemas ?? []
  const metadataStatus = metadata?.status ?? 'idle'
  const metadataError = metadata?.error ?? null
  const setMetadata = useStore((s) => s.setMetadata)
  const builderTable = useStore((s) => selectActiveSession(s).builder.table)
  const selectBuilderRelation = useStore((s) => s.selectBuilderRelation)
  const [editing, setEditing] = useState<DataSourceProfile | null>(null)
  const [showModal, setShowModal] = useState(false)
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
    const treeId = `relation:${relation.qualifiedName}`
    toggle(treeId)
    if (relation.kind === 'metric') return
    if (expanded.has(treeId) || relation.columnsStatus !== 'idle') return
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
    if (relation.kind === 'metric') { toggle(`relation:${relation.qualifiedName}`); return }
    if (builderTable && relationIdentity(builderTable) === relationIdentity(relation)) {
      if (relation.columnsStatus !== 'loaded') void loadRelationColumns(relation)
      return
    }
    selectBuilderRelation({ schema: relation.schema, name: relation.name })
    void loadRelationColumns(relation)
  }

  return <div className="sidebar">
    <h3>Connections</h3>
    {profiles.map((profile) => {
      const isConnecting = activeId === profile.id && connecting
      const isSelected = activeTabConnectionId === profile.id
      const isLive = activeId === profile.id && connected
      return <div key={profile.id} className={`conn-item ${isLive ? 'active' : ''} ${isConnecting ? 'connecting' : ''}`}
        onClick={() => { if (!connecting) void connect(profile) }} aria-busy={isConnecting} aria-current={isSelected ? 'true' : undefined}>
        <span className={isConnecting ? 'spinner' : 'dot'} aria-label={isConnecting ? 'Connecting' : undefined} />
        <span className="name">{profile.name}</span>
        <span className="kind">{connectionKindLabel(profile.kind)}</span>
        {isConnecting && <span className="connecting-label">Connecting…</span>}
        {isSelected && !isLive && !isConnecting && <span className="connecting-label">connect on run</span>}
        <button className="del" disabled={connecting} onClick={(event) => { event.stopPropagation(); setEditing(profile); setShowModal(true) }}>✎</button>
        <button className="del" disabled={connecting} onClick={(event) => { event.stopPropagation(); void remove(profile.id) }}>✕</button>
      </div>
    })}
    <button className="btn-add" disabled={connecting} onClick={() => { setEditing(null); setShowModal(true) }}>+ new connection</button>
    {!tabConnected && connectionError && activeId === activeTabConnectionId && <div className="object-error" role="alert">
      {connectionError}
      <button onClick={() => void ensureConnectionForTab(activeTabId)} disabled={connecting}>{connecting ? 'Reconnecting…' : 'Reconnect'}</button>
    </div>}

    {(tabConnected || schemas.length > 0) && <section className="objects-section">
      <h3>Objects</h3>
      {!tabConnected && schemas.length > 0 && <div className="object-status" role="status">Cached metadata — reconnects when needed.</div>}
      {metadataStatus === 'loading' && <div className="object-status" role="status"><span className="spinner" aria-label="Loading database objects" /> Loading database objects…</div>}
      {metadataStatus === 'error' && <div className="object-error" role="alert">Could not load objects.<small>{metadataError}</small><button onClick={() => void retryObjects()}>Retry</button></div>}
      {metadataStatus === 'loaded' && <>
        <input className="object-filter" value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Filter objects…" aria-label="Filter database objects" />
        {schemas.length === 0 ? <div className="object-status">No database objects</div> :
        <div className="object-tree" role="tree" aria-label="Database objects">
          {visibleSchemas.map((schema) => {
            const schemaId = `schema:${schema.name}`
            const schemaOpen = filtering || expanded.has(schemaId)
            return <div key={schemaId} role="treeitem" aria-expanded={schemaOpen}>
              <button className="tree-row schema-row" onClick={() => toggle(schemaId)} title={schema.name}><span className="chevron">{schemaOpen ? '▾' : '▸'}</span><span className="truncate">{schema.name}</span>{schema.isSystem && <span className="badge">system</span>}</button>
              {schemaOpen && <div role="group">{schema.relations.map((relation) => {
                const relationId = `relation:${relation.qualifiedName}`
                const relationOpen = relation.kind === 'metric' ? expanded.has(relationId) : filtering || expanded.has(relationId)
                return <div key={relationId} role="treeitem" aria-expanded={relationOpen}>
                  <div className="tree-row relation-row">
                    <button className="chevron-button" aria-label={`${relationOpen ? 'Collapse' : 'Expand'} ${relation.name}`} onClick={() => void expandRelation(relation)}>{relationOpen ? '▾' : '▸'}</button>
                    <button className="relation-name truncate" title={relation.qualifiedName} aria-label={relation.kind === 'metric' ? `View details for ${relation.name}` : `Select ${relation.qualifiedName} for Builder`} aria-current={builderTable?.schema === relation.schema && builderTable.name === relation.name ? 'true' : undefined} onClick={() => selectForBuilder(relation)}>{relation.name}</button>
                    <span className="kind">{typeLabel(relation.kind)}</span>
                  </div>
                  {relationOpen && <div role="group" className="columns">
                    {relation.details?.kind === 'metric' && <MetricDetails connectionId={activeTabConnectionId} relation={relation} />}
                    {relation.columnsStatus === 'loading' && <div className="column-status" role="status">Loading columns…</div>}
                    {relation.columnsStatus === 'error' && <button className="column-status error" onClick={() => void loadRelationColumns({ ...relation, columnsStatus: 'idle' })}>Could not load columns — retry</button>}
                    {relation.columns?.map((column) => <div className="tree-row column-row" role="treeitem" key={column.name} title={`${relation.qualifiedName}.${column.name} — ${column.dataTypeName}`} aria-label={`${relation.qualifiedName}.${column.name}, ${column.dataTypeName}`}><span className="truncate">{column.name}</span><span className="column-type truncate">{column.dataTypeName}</span></div>)}
                  </div>}
                </div>
              })}</div>}
            </div>
          })}
        </div>}
      </>}
    </section>}
    {showModal && <ConnectionModal existing={editing} onClose={() => setShowModal(false)} onSaved={() => void loadProfiles()} />}
  </div>
}
