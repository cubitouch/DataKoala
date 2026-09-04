import { MetadataTree, type MetadataTreeNode } from '../MetadataTree'

export type LokiValueStatus = 'loading' | 'error'

type Props = {
  labels: string[]
  expanded: ReadonlySet<string>
  values: Readonly<Record<string, string[]>>
  valueStatus: Readonly<Record<string, LokiValueStatus>>
  filter: string
  disabled?: boolean
  onToggle: (label: string) => void
  onActivate: (label: string, value?: string) => void
  onRetry: (label: string) => void
}

export const visibleLokiMetadata = (items: string[]) => [...new Set(items)]
  .filter((item) => item && !item.startsWith('__'))
  .sort()

export function LokiMetadataTree(props: Props) {
  const labelsById = new Map<string, string>()
  const valuesById = new Map<string, { label: string; value: string }>()
  const needle = props.filter.trim().toLocaleLowerCase()
  const nodes = props.labels.flatMap((label, index): MetadataTreeNode[] => {
    const loadedValues = props.values[label] ?? []
    const labelMatches = !needle || label.toLocaleLowerCase().includes(needle)
    const matchingValues = labelMatches ? loadedValues : loadedValues.filter((value) => value.toLocaleLowerCase().includes(needle))
    if (!labelMatches && matchingValues.length === 0) return []
    const id = `loki-label:${index}`
    labelsById.set(id, label)
    return [{
      id, label, tooltip: label, activatable: true, expandable: true,
      expanded: props.expanded.has(label), disabled: props.disabled,
      groupAriaLabel: `${label} values`,
      status: props.valueStatus[label] ?? 'idle',
      statusText: props.valueStatus[label] === 'loading' ? 'Loading values…' : props.valueStatus[label] === 'error' ? 'Could not load values — retry' : undefined,
      children: matchingValues.map((value, valueIndex) => {
        const valueId = `${id}:value:${valueIndex}`
        valuesById.set(valueId, { label, value })
        return { id: valueId, label: value, tooltip: `${label}=${value}`, ariaLabel: value, activatable: true, disabled: props.disabled }
      })
    }]
  })

  return <MetadataTree ariaLabel="Loki labels" nodes={nodes}
    onToggle={(node) => { const label = labelsById.get(node.id); if (label) props.onToggle(label) }}
    onActivate={(node) => {
      const value = valuesById.get(node.id)
      if (value) props.onActivate(value.label, value.value)
      else { const label = labelsById.get(node.id); if (label) props.onActivate(label) }
    }}
    onRetry={(node) => { const label = labelsById.get(node.id); if (label) props.onRetry(label) }} />
}
