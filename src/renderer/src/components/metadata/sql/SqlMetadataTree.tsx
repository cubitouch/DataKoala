import type { DatabaseRelationNode, DatabaseSchemaNode } from '@shared/types'
import { MetadataTree, type MetadataTreeNode } from '../MetadataTree'

const typeLabel = (kind: DatabaseRelationNode['kind']) => kind === 'v' ? 'view' : kind === 'm' ? 'matview' : 'table'

type Props = {
  schemas: DatabaseSchemaNode[]
  expanded: ReadonlySet<string>
  filter: string
  selectedRelation?: { schema: string; name: string } | null
  onToggleSchema: (schemaId: string) => void
  onToggleRelation: (relation: DatabaseRelationNode) => void
  onActivateRelation: (relation: DatabaseRelationNode) => void
  onRetryRelation: (relation: DatabaseRelationNode) => void
}

export function SqlMetadataTree(props: Props) {
  const relations = new Map<string, DatabaseRelationNode>()
  const nodes: MetadataTreeNode[] = props.schemas.map((schema) => ({
    id: `schema:${schema.name}`,
    label: schema.name,
    tooltip: schema.name,
    badge: schema.isSystem ? 'system' : undefined,
    expandable: true,
    expanded: props.expanded.has(`schema:${schema.name}`),
    children: schema.relations.map((relation) => {
      const id = `relation:${relation.qualifiedName}`
      relations.set(id, relation)
      return {
        id,
        label: relation.name,
        secondaryText: typeLabel(relation.kind),
        tooltip: relation.qualifiedName,
        ariaLabel: `Select ${relation.qualifiedName} for Builder`,
        activatable: true,
        selected: props.selectedRelation?.schema === relation.schema && props.selectedRelation.name === relation.name,
        expandable: true,
        expanded: props.expanded.has(id),
        status: relation.columnsStatus === 'loaded' ? 'idle' : relation.columnsStatus,
        statusText: relation.columnsStatus === 'loading' ? 'Loading columns…' : relation.columnsStatus === 'error' ? 'Could not load columns — retry' : undefined,
        children: relation.columns?.map((column) => ({
          id: `${id}:column:${column.name}`,
          label: column.name,
          secondaryText: column.dataTypeName,
          tooltip: `${relation.qualifiedName}.${column.name} — ${column.dataTypeName}`,
          ariaLabel: `${relation.qualifiedName}.${column.name}, ${column.dataTypeName}`
        }))
      }
    })
  }))
  return <MetadataTree ariaLabel="Database objects" nodes={nodes} filter={props.filter}
    onToggle={(node) => { const relation = relations.get(node.id); relation ? props.onToggleRelation(relation) : props.onToggleSchema(node.id) }}
    onActivate={(node) => { const relation = relations.get(node.id); if (relation) props.onActivateRelation(relation) }}
    onRetry={(node) => { const relation = relations.get(node.id); if (relation) props.onRetryRelation(relation) }} />
}
