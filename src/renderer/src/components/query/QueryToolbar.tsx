import type { ReactNode } from 'react'
import styles from './QueryToolbar.module.css'

export interface QueryToolbarProps {
  modeControl: ReactNode
  queryOptions?: ReactNode
  utilityActions?: ReactNode
  editorActions?: ReactNode
  executionAction: ReactNode
  className?: string
  queryOptionsClassName?: string
  queryOptionsAriaLabel?: string
  editorActionsClassName?: string
  groupClassName?: string
}

/** The standard query action ordering. Datasource behavior is supplied through composition slots. */
export function QueryToolbar({ modeControl, queryOptions, queryOptionsAriaLabel, utilityActions, editorActions, executionAction, className = '', queryOptionsClassName = '', editorActionsClassName = '', groupClassName = '' }: QueryToolbarProps) {
  const group = `${styles.group} query-toolbar-group ${groupClassName}`.trim()
  return <div className={`${styles.toolbar} editor-head data-query-toolbar ${className}`.trim()} data-query-toolbar>
    <div className={`${group} query-mode-group`}>{modeControl}</div>
    {queryOptions && <div className={`${group} query-time-group ${queryOptionsClassName}`.trim()} aria-label={queryOptionsAriaLabel}>{queryOptions}</div>}
    <div className={`${styles.spacer} spacer`} />
    {utilityActions && <div className={group}>{utilityActions}</div>}
    {editorActions && <div className={`${group} query-editor-actions ${editorActionsClassName}`.trim()}>{editorActions}</div>}
    <div className={`${group} execution-group`}>{executionAction}</div>
  </div>
}
