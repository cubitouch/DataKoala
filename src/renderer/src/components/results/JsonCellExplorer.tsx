import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { copyTextToClipboard } from '../../lib/clipboardText'
import { normalizeJsonCellValue } from '../../lib/jsonCell'
import { Modal } from '../ui/Modal'
import styles from './JsonCellExplorer.module.css'

function JsonCellExplorerContent({ titleId, columnLabel, rowNumber, value, onClose }: { titleId: string; columnLabel: string; rowNumber: number; value: unknown; onClose: () => void }) {
  const contentRef = useRef<HTMLPreElement>(null)
  const normalized = useMemo(() => normalizeJsonCellValue(value), [value])
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle')
  const display = normalized.status === 'valid' ? normalized.formatted : normalized.raw
  useEffect(() => { contentRef.current?.focus() }, [])
  useEffect(() => { if (copyState === 'idle') return; const timer = window.setTimeout(() => setCopyState('idle'), 1600); return () => window.clearTimeout(timer) }, [copyState])
  const copy = async () => {
    setCopyState('idle')
    try { await copyTextToClipboard(display); setCopyState('copied') } catch { setCopyState('error') }
  }
  return <section className={styles.explorer} aria-labelledby={titleId}>
    <div className={styles.header}>
      <div className={styles.title}><h2 id={titleId}>JSON · {columnLabel}</h2><span>Row {rowNumber}</span></div>
      <button type="button" className="btn ghost" onClick={copy}>{copyState === 'copied' ? 'Copied' : 'Copy JSON'}</button>
      <button type="button" className={styles.close} aria-label="Close JSON explorer" onClick={onClose}>×</button>
    </div>
    {normalized.status === 'invalid' && <p className={styles.message} role="alert">{normalized.message}</p>}
    <pre ref={contentRef} tabIndex={0} className={styles.content}><code>{display}</code></pre>
    <span className="sr-only" role="status">{copyState === 'copied' ? 'JSON copied to clipboard' : copyState === 'error' ? 'Could not copy JSON' : ''}</span>
    {copyState === 'error' && <small className={styles.error} role="alert">Could not copy JSON</small>}
  </section>
}

export function JsonCellExplorer({ columnLabel, rowNumber, value, open, onOpenChange, invalidationKey }: { columnLabel: string; rowNumber: number; value: unknown; open: boolean; onOpenChange: (open: boolean) => void; invalidationKey: unknown }) {
  const titleId = useId(), trigger = useRef<HTMLButtonElement>(null)
  useEffect(() => { if (open) onOpenChange(false) }, [invalidationKey])
  return <><button ref={trigger} type="button" className={styles.trigger} aria-label={`Explore JSON in ${columnLabel}, row ${rowNumber}`} aria-expanded={open} onClick={() => onOpenChange(!open)}><span aria-hidden="true">⌕</span></button>
    <Modal open={open} onClose={() => onOpenChange(false)} labelledBy={titleId} returnFocusRef={trigger}><JsonCellExplorerContent titleId={titleId} columnLabel={columnLabel} rowNumber={rowNumber} value={value} onClose={() => onOpenChange(false)} /></Modal></>
}
