import type { ReactNode } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { sql as sqlExtension } from '@codemirror/lang-sql'
import { oneDark } from '@codemirror/theme-one-dark'
import { PromQLExtension } from '@prometheus-io/codemirror-promql'
import { traceql as traceqlSupport } from '../../lib/traceqlLanguage'
import { logql } from '../../lib/logqlLanguage'
import { CopySqlButton } from '../CopySqlButton'
import { CollapsibleSection } from '../ui/CollapsibleSection'
import styles from './GeneratedQueryPanel.module.css'

export type GeneratedQueryLanguage = 'SQL' | 'PromQL' | 'TraceQL' | 'LogQL'

interface GeneratedQueryPanelProps {
  language: GeneratedQueryLanguage
  value?: string | null
  onOpenInEditor?: () => void
  emptyState?: ReactNode
  validation?: ReactNode
  supplementary?: ReactNode
  className?: string
}

function languageExtensions(language: GeneratedQueryLanguage) {
  if (language === 'SQL') return [sqlExtension()]
  if (language === 'PromQL') return [new PromQLExtension().asExtension()]
  if (language === 'TraceQL') return [traceqlSupport()]
  if (language === 'LogQL') return [logql()]
  return []
}

export function GeneratedQueryPanel({ language, value, onOpenInEditor, emptyState, validation, supplementary, className }: GeneratedQueryPanelProps) {
  const query = value ?? ''
  const hasQuery = query.trim().length > 0
  const canOpen = hasQuery && !validation

  const section = <CollapsibleSection title={`Generated ${language}`} actions={<>
        <CopySqlButton sql={query} language={language} />
        {onOpenInEditor && <button
          className="btn ghost"
          type="button"
          disabled={!canOpen}
          onClick={() => { if (canOpen) onOpenInEditor() }}
        >Open in {language} mode</button>}
      </>}>
    {validation ? <div className={`${styles.feedback} inline-error`} role="status">{validation}</div> : hasQuery ? <>
      <CodeMirror
        value={query}
        height="150px"
        theme={oneDark}
        extensions={languageExtensions(language)}
        editable={false}
        aria-label={`Generated ${language} query`}
        basicSetup={{ lineNumbers: true, foldGutter: false }}
      />
      {supplementary && <div className={styles.supplementary}>{supplementary}</div>}
    </> : <div className={styles.feedback}>{emptyState}</div>}
  </CollapsibleSection>
  return <div className={className} data-generated-query-panel>{section}</div>
}
