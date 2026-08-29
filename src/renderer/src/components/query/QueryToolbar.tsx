import type { ReactNode } from 'react'

export interface QueryToolbarProps {
  modeControl: ReactNode
  queryOptions?: ReactNode
  utilityActions?: ReactNode
  editorActions?: ReactNode
  executionAction: ReactNode
  className?: string
  queryOptionsClassName?: string
  editorActionsClassName?: string
  groupClassName?: string
}

/** The standard query action ordering. Datasource behavior is supplied through composition slots. */
export function QueryToolbar({ modeControl, queryOptions, utilityActions, editorActions, executionAction, className = '', queryOptionsClassName = '', editorActionsClassName = '', groupClassName = '' }: QueryToolbarProps) {
  const group = `query-toolbar-group ${groupClassName}`.trim()
  return <div className={`editor-head data-query-toolbar ${className}`.trim()} data-query-toolbar>
    <div className={`${group} query-mode-group`}>{modeControl}</div>
    {queryOptions && <div className={`${group} query-time-group ${queryOptionsClassName}`.trim()}>{queryOptions}</div>}
    <div className="spacer" />
    {utilityActions && <div className={group}>{utilityActions}</div>}
    {editorActions && <div className={`${group} query-editor-actions ${editorActionsClassName}`.trim()}>{editorActions}</div>}
    <div className={`${group} execution-group`}>{executionAction}</div>
  </div>
}
