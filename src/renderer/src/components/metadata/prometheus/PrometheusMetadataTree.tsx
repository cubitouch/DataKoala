import { useRef, useState } from 'react'
import type { DatabaseRelationNode, DatabaseSchemaNode } from '@shared/types'
import { api } from '../../../lib/api'
import { TextInput } from '../../ui/TextInput'
import { MetadataTree, type MetadataTreeNode } from '../MetadataTree'
import styles from './PrometheusMetadataTree.module.css'

const VALUE_LIMIT = 200

type Props = {
  connectionId: string
  schemas: DatabaseSchemaNode[]
  expanded: ReadonlySet<string>
  filter: string
  selectedMetric?: string | null
  onToggleSchema: (id: string) => void
  onToggleMetric: (relation: DatabaseRelationNode) => void
  onActivateMetric: (relation: DatabaseRelationNode) => void
}

type Load<T> = { data?: T; loading?: boolean; error?: string }
const message = (error: unknown) => error instanceof Error ? error.message : String(error)

export function PrometheusMetadataTree(props: Props) {
  const [labels, setLabels] = useState<Record<string, Load<string[]>>>({})
  const [values, setValues] = useState<Record<string, Load<string[]>>>({})
  const [openLabels, setOpenLabels] = useState<Set<string>>(new Set())
  const [filters, setFilters] = useState<Record<string, string>>({})
  const labelRequests = useRef(new Set<string>())
  const valueRequests = useRef(new Set<string>())
  const metrics = new Map<string, DatabaseRelationNode>()
  const labelsById = new Map<string, { metric: DatabaseRelationNode; label: string }>()

  const loadLabels = async (metric: DatabaseRelationNode, retry = false) => {
    const key = metric.qualifiedName
    if (labelRequests.current.has(key) || (!retry && labels[key]?.data)) return
    labelRequests.current.add(key)
    setLabels((old) => ({ ...old, [key]: { loading: true } }))
    try {
      const data = await api.connections.prometheus.labelsForMetric(props.connectionId, metric.name)
      setLabels((old) => ({ ...old, [key]: { data } }))
    } catch (error) {
      setLabels((old) => ({ ...old, [key]: { error: message(error) } }))
    } finally { labelRequests.current.delete(key) }
  }

  const loadValues = async (metric: DatabaseRelationNode, label: string, retry = false) => {
    const key = `${metric.qualifiedName}\0${label}`
    if (valueRequests.current.has(key) || (!retry && values[key]?.data)) return
    valueRequests.current.add(key)
    setValues((old) => ({ ...old, [key]: { loading: true } }))
    try {
      const data = await api.connections.prometheus.labelValues(props.connectionId, metric.name, label)
      setValues((old) => ({ ...old, [key]: { data } }))
    } catch (error) {
      setValues((old) => ({ ...old, [key]: { error: message(error) } }))
    } finally { valueRequests.current.delete(key) }
  }

  const needle = props.filter.trim().toLocaleLowerCase()
  const visibleSchemas = props.schemas.flatMap((schema) => {
    const schemaMatches = schema.name.toLocaleLowerCase().includes(needle)
    const relations = needle && !schemaMatches
      ? schema.relations.filter((metric) => metric.name.toLocaleLowerCase().includes(needle))
      : schema.relations
    return relations.length || schemaMatches ? [{ ...schema, relations }] : []
  })

  const nodes: MetadataTreeNode[] = visibleSchemas.map((schema) => ({
    id: `schema:${schema.name}`, label: schema.name, tooltip: schema.name, badge: schema.isSystem ? 'system' : undefined,
    expandable: true, expanded: Boolean(needle) || props.expanded.has(`schema:${schema.name}`),
    children: schema.relations.map((metric) => {
      const id = `relation:${metric.qualifiedName}`
      metrics.set(id, metric)
      const state = labels[metric.qualifiedName]
      const detail = metric.details?.kind === 'metric' ? metric.details : undefined
      const children = state?.data?.map((label): MetadataTreeNode => {
        const labelId = `${id}:label:${label}`
        labelsById.set(labelId, { metric, label })
        const key = `${metric.qualifiedName}\0${label}`
        const valueState = values[key]
        const filter = filters[key]?.toLocaleLowerCase() ?? ''
        const matching = valueState?.data?.filter((value) => value.toLocaleLowerCase().includes(filter)) ?? []
        const shown = matching.slice(0, VALUE_LIMIT)
        return {
          id: labelId, label, expandable: true, expanded: openLabels.has(key),
          groupAriaLabel: `${label} values`,
          status: valueState?.loading ? 'loading' : valueState?.error ? 'error' : 'idle',
          statusText: valueState?.loading ? 'Loading values…' : valueState?.error ? 'Could not load values — retry' : undefined,
          beforeChildren: valueState?.data && <>
            {valueState.data.length > VALUE_LIMIT && <div className={styles.valueFilter}><TextInput label={`Filter values for ${label}`} placeholder="Filter values…" value={filters[key] ?? ''} onValueChange={(text) => setFilters((old) => ({ ...old, [key]: text }))} /></div>}
            {valueState.data.length === 0 && <div className={styles.status}>No values</div>}
          </>,
          children: shown.map((value) => ({ id: `${labelId}:value:${value}`, label: value, tooltip: value })),
          afterChildren: matching.length > shown.length ? <div className={styles.limit}>Showing {shown.length} of {matching.length} matching values. Refine the filter to see more.</div> : undefined
        }
      }) ?? []
      if (state?.data && state.data.length === 0) children.push({ id: `${id}:empty`, label: 'No labels' })
      return {
        id, label: metric.name, secondaryText: detail?.type, description: detail?.help,
        ariaLabel: `Select ${metric.name} for Builder`, activatable: true, selected: props.selectedMetric === metric.name,
        expandable: true, expanded: props.expanded.has(id),
        groupAriaLabel: `${metric.name} metric metadata`,
        status: state?.loading ? 'loading' : state?.error ? 'error' : 'idle',
        statusText: state?.loading ? 'Loading labels…' : state?.error ? 'Could not load labels — retry' : undefined,
        beforeChildren: <>
          {detail?.unit && <div className={styles.unit}><strong>Unit</strong><span>{detail.unit}</span></div>}
          <div className={styles.heading}>Labels</div>
        </>,
        children
      }
    })
  }))

  return <MetadataTree ariaLabel="Database objects" nodes={nodes}
    onToggle={(node) => {
      const metric = metrics.get(node.id)
      if (metric) {
        if (!props.expanded.has(node.id)) void loadLabels(metric)
        props.onToggleMetric(metric)
        return
      }
      const label = labelsById.get(node.id)
      if (label) {
        const key = `${label.metric.qualifiedName}\0${label.label}`
        setOpenLabels((old) => { const next = new Set(old); next.has(key) ? next.delete(key) : next.add(key); return next })
        if (!openLabels.has(key)) void loadValues(label.metric, label.label)
        return
      }
      props.onToggleSchema(node.id)
    }}
    onActivate={(node) => { const metric = metrics.get(node.id); if (metric) props.onActivateMetric(metric) }}
    onRetry={(node) => {
      const metric = metrics.get(node.id)
      if (metric) { void loadLabels(metric, true); return }
      const label = labelsById.get(node.id)
      if (label) void loadValues(label.metric, label.label, true)
    }} />
}
