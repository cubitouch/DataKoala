import type { CSSProperties } from 'react'
import styles from './MetadataTree.module.css'

export type MetadataTreeNode = {
  id: string
  label: string
  secondaryText?: string
  badge?: string
  tooltip?: string
  ariaLabel?: string
  selected?: boolean
  activatable?: boolean
  expandable?: boolean
  expanded?: boolean
  children?: MetadataTreeNode[]
  status?: 'idle' | 'loading' | 'error'
  statusText?: string
}

type Props = {
  ariaLabel: string
  nodes: MetadataTreeNode[]
  filter?: string
  onToggle?: (node: MetadataTreeNode) => void
  onActivate?: (node: MetadataTreeNode) => void
  onRetry?: (node: MetadataTreeNode) => void
}

function filteredNodes(nodes: MetadataTreeNode[], needle: string): MetadataTreeNode[] {
  return nodes.flatMap((node) => {
    const ownMatch = `${node.label} ${node.secondaryText ?? ''}`.toLocaleLowerCase().includes(needle)
    const children = ownMatch ? (node.children ?? []) : filteredNodes(node.children ?? [], needle)
    return ownMatch || children.length ? [{ ...node, children }] : []
  })
}

export function MetadataTree({ ariaLabel, nodes, filter = '', onToggle, onActivate, onRetry }: Props) {
  const needle = filter.trim().toLocaleLowerCase()
  const visible = needle ? filteredNodes(nodes, needle) : nodes

  const renderNodes = (items: MetadataTreeNode[], depth: number) => items.map((node) => {
    const expandable = Boolean(node.expandable || node.children?.length || node.status === 'loading' || node.status === 'error')
    const expanded = expandable && (Boolean(needle) || Boolean(node.expanded))
    return <div key={node.id} role="treeitem" aria-label={!node.activatable ? node.ariaLabel : undefined} aria-expanded={expandable ? expanded : undefined}>
      <div className={styles.treeRow} style={{ '--tree-depth': depth } as CSSProperties}>
        {expandable
          ? <button className={styles.chevronButton} aria-label={`${expanded ? 'Collapse' : 'Expand'} ${node.label}`} onClick={() => onToggle?.(node)}>{expanded ? '▾' : '▸'}</button>
          : null}
        {node.activatable && onActivate
          ? <button className={styles.nodeName} title={node.tooltip} aria-label={node.ariaLabel} aria-current={node.selected ? 'true' : undefined} onClick={() => onActivate(node)}>{node.label}</button>
          : <span className={styles.nodeName} title={node.tooltip}>{node.label}</span>}
        {node.badge && <span className={styles.badge}>{node.badge}</span>}
        {node.secondaryText && <span className={styles.secondaryText}>{node.secondaryText}</span>}
      </div>
      {expanded && <div role="group">
        {node.status === 'loading' && <div className={styles.status} style={{ '--tree-depth': depth + 1 } as CSSProperties} role="status">{node.statusText ?? 'Loading…'}</div>}
        {node.status === 'error' && <button className={`${styles.status} ${styles.error}`} style={{ '--tree-depth': depth + 1 } as CSSProperties} onClick={() => onRetry?.(node)}>{node.statusText ?? 'Could not load — retry'}</button>}
        {renderNodes(node.children ?? [], depth + 1)}
      </div>}
    </div>
  })

  return <div className={styles.objectTree} role="tree" aria-label={ariaLabel}>{renderNodes(visible, 0)}</div>
}
