import type { ReactNode } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { oneDark } from '@codemirror/theme-one-dark'
import { PromQLExtension } from '@prometheus-io/codemirror-promql'
import { traceql as traceqlSupport } from '../../lib/traceqlLanguage'
import { logql } from '../../lib/logqlLanguage'
import { CopySqlButton } from '../CopySqlButton'
import styles from './GeneratedQueryPanel.module.css'

export type GeneratedQueryLanguage = 'SQL' | 'PromQL' | 'TraceQL' | 'LogQL'

interface GeneratedQueryPanelProps {
  language: GeneratedQueryLanguage
  value?: string | null
  onOpenInEditor?: () => void
  openActionLabel?: string
  openActionClassName?: string
  emptyState?: ReactNode
  validation?: ReactNode
  supplementary?: ReactNode
  editorHeight?: string
  lineNumbers?: boolean
  copyValue?: string
  className?: string
}

function languageExtensions(language: GeneratedQueryLanguage) {
  if (language === 'PromQL') return [new PromQLExtension().asExtension()]
  if (language === 'TraceQL') return [traceqlSupport()]
  if (language === 'LogQL') return [logql()]
  return []
}

export function GeneratedQueryPanel({
  language,
  value,
  onOpenInEditor,
  openActionLabel = `Open in ${language} mode`,
  openActionClassName,
  emptyState,
  validation,
  supplementary,
  editorHeight = '150px',
  lineNumbers = true,
  copyValue,
  className
}: GeneratedQueryPanelProps) {
  const query = value ?? ''
  const hasQuery = query.trim().length > 0
  const canOpen = hasQuery && !validation

  return <details className={[styles.root, className].filter(Boolean).join(' ')}>
    <summary>
      <span className={styles.title}>Generated {language}</span>
      {onOpenInEditor && <button
        className={['btn ghost', styles.openAction, openActionClassName].filter(Boolean).join(' ')}
        type="button"
        disabled={!canOpen}
        onClick={(event) => {
          event.preventDefault()
          event.stopPropagation()
          if (canOpen) onOpenInEditor()
        }}
      >{openActionLabel}</button>}
    </summary>
    {validation ? <div className={`${styles.feedback} inline-error`} role="status">{validation}</div> : hasQuery ? <>
      <CodeMirror
        value={query}
        height={editorHeight}
        theme={oneDark}
        extensions={languageExtensions(language)}
        editable={false}
        aria-label={`Generated ${language} query`}
        basicSetup={{ lineNumbers, foldGutter: false }}
      />
      {supplementary && <div className={styles.supplementary}>{supplementary}</div>}
      <div className={styles.actions}><CopySqlButton sql={copyValue ?? query} language={language} /></div>
    </> : <div className={styles.feedback}>{emptyState}</div>}
  </details>
}
