import { TextInput } from './ui/TextInput'
import { useEffect, useState } from 'react'
import type { DatabaseRelationNode } from '@shared/types'
import { api } from '../lib/api'
import styles from './MetricDetails.module.css'

const LABEL_VALUE_DISPLAY_LIMIT = 200

export function MetricDetails({ connectionId, relation }: { connectionId: string | null; relation: DatabaseRelationNode }) {
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

  return <div className={styles.root} role="group" aria-label={`${relation.name} metric metadata`}>
    {relation.details?.kind === 'metric' && relation.details.unit && <div><strong>Unit</strong><span>{relation.details.unit}</span></div>}
    <div className={styles.labelHeading}><strong>Labels</strong></div>
    {!labels && !labelsError && <div className={styles.status} role="status">Loading labels…</div>}
    {labelsError && <button className={`${styles.status} ${styles.error}`} onClick={() => void loadLabels()}>Could not load labels — retry</button>}
    {labels?.length === 0 && <div className={styles.status}>No labels</div>}
    {labels?.map((label) => {
      const open = openLabels.has(label)
      const filter = valueFilters[label]?.toLocaleLowerCase() ?? ''
      const allValues = values[label]
      const filtered = allValues?.filter((value) => value.toLocaleLowerCase().includes(filter)) ?? []
      const shown = filtered.slice(0, LABEL_VALUE_DISPLAY_LIMIT)
      return <div className={styles.label} key={label}>
        <button className={styles.labelRow} aria-expanded={open} onClick={() => void toggleLabel(label)}><span className={styles.chevron}>{open ? '▾' : '▸'}</span><span>{label}</span></button>
        {open && <div className={styles.labelValues} role="group" aria-label={`${label} values`}>
          {loadingValues.has(label) && <div className={styles.status} role="status">Loading values…</div>}
          {valueErrors[label] && <button className={`${styles.status} ${styles.error}`} onClick={() => void toggleLabel(label)}>Could not load values — retry</button>}
          {allValues && allValues.length > LABEL_VALUE_DISPLAY_LIMIT && <TextInput aria-label={`Filter values for ${label}`} placeholder="Filter values…" value={valueFilters[label] ?? ''} onValueChange={(text) => setValueFilters((old) => ({ ...old, [label]: text }))} />}
          {allValues?.length === 0 && <div className={styles.status}>No values</div>}
          {shown.map((value) => <div className={`${styles.labelValue} ${styles.truncate}`} role="treeitem" key={value} title={value}>{value}</div>)}
          {allValues && filtered.length > shown.length && <div className={styles.limit}>Showing {shown.length} of {filtered.length} matching values. Refine the filter to see more.</div>}
        </div>}
      </div>
    })}
  </div>
}
