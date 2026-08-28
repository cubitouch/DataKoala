import { useState } from 'react'
import type { ReactNode, SyntheticEvent } from 'react'
import styles from './CollapsibleSection.module.css'

interface Props {
  title: ReactNode
  children: ReactNode
  actions?: ReactNode
  defaultOpen?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
  contentPadding?: 'normal' | 'none'
}

export function CollapsibleSection({ title, children, actions, defaultOpen = false, open, onOpenChange, contentPadding = 'normal' }: Props) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen)
  const isControlled = open !== undefined
  const expanded = isControlled ? open : internalOpen
  const toggle = (event: SyntheticEvent<HTMLDetailsElement>) => {
    const next = event.currentTarget.open
    setInternalOpen(next)
    onOpenChange?.(next)
  }
  return <details className={styles.root} open={expanded} onToggle={isControlled ? undefined : toggle} data-collapsible-section="" data-collapsible-title={typeof title === 'string' ? title : undefined}>
    <summary className={styles.summary} onClick={isControlled ? (event) => { event.preventDefault(); onOpenChange?.(!expanded) } : undefined}>
      <span className={styles.title}>{title}</span>
      {actions && <span className={styles.actions} onClick={(event) => { event.preventDefault(); event.stopPropagation() }}>{actions}</span>}
    </summary>
    <div className={`${styles.content} ${styles[`${contentPadding}Padding`]}`}>{children}</div>
  </details>
}
