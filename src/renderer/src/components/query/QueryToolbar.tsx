import type { HTMLAttributes, ReactNode } from 'react'
import styles from './QueryToolbar.module.css'

export interface QueryToolbarProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  mode?: ReactNode
  options?: ReactNode
  utilities?: ReactNode
  editorActions?: ReactNode
  execution?: ReactNode
}

/** The shared structure for editable-query toolbars. Datasource behavior stays in the slots. */
export function QueryToolbar({ mode, options, utilities, editorActions, execution, className, ...props }: QueryToolbarProps) {
  return <div className={`editor-head ${styles.toolbar}${className ? ` ${className}` : ''}`} data-query-toolbar {...props}>
    {mode != null && <div className={`query-toolbar-group query-mode-group ${styles.group}`}>{mode}</div>}
    {options != null && <div className={`query-toolbar-group query-time-group ${styles.group}`}>{options}</div>}
    <div className={`spacer ${styles.spacer}`} aria-hidden="true" />
    {utilities != null && <div className={`query-toolbar-group query-utility-actions ${styles.group}`}>{utilities}</div>}
    {editorActions != null && <div className={`query-toolbar-group query-editor-actions ${styles.group}`}>{editorActions}</div>}
    {execution != null && <div className={`query-toolbar-group execution-group ${styles.group}`}>{execution}</div>}
  </div>
}
