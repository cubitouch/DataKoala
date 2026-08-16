import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { copyTextToClipboard } from '../../lib/clipboardText'
import { normalizeJsonCellValue } from '../../lib/jsonCell'
import { Popover, usePopover } from '../ui/Popover'
import styles from './JsonCellExplorer.module.css'

function JsonCellExplorerContent({ columnLabel, value, onClose }: { columnLabel: string; value: unknown; onClose: () => void }) {
  const titleId = useId()
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
      <h2 id={titleId}>JSON · {columnLabel}</h2>
      <button type="button" className="btn ghost" onClick={copy}>{copyState === 'copied' ? 'Copied' : 'Copy JSON'}</button>
      <button type="button" className={styles.close} aria-label="Close JSON explorer" onClick={onClose}>×</button>
    </div>
    {normalized.status === 'invalid' && <p className={styles.message} role="alert">{normalized.message}</p>}
    <pre ref={contentRef} tabIndex={0} className={styles.content}><code>{display}</code></pre>
    <span className="sr-only" role="status">{copyState === 'copied' ? 'JSON copied to clipboard' : copyState === 'error' ? 'Could not copy JSON' : ''}</span>
    {copyState === 'error' && <small className={styles.error} role="alert">Could not copy JSON</small>}
  </section>
}

function ContentWithClose({ columnLabel, value }: { columnLabel: string; value: unknown }) {
  const popover = usePopover()
  return <JsonCellExplorerContent columnLabel={columnLabel} value={value} onClose={() => popover?.close()} />
}

export function JsonCellExplorer({ columnLabel, rowNumber, value, open, onOpenChange, invalidationKey }: { columnLabel: string; rowNumber: number; value: unknown; open: boolean; onOpenChange: (open: boolean) => void; invalidationKey: unknown }) {
  return <Popover
    className={styles.popover}
    contentClassName={styles.popoverContent}
    contentRole="dialog"
    popupType="dialog"
    ariaLabel={`Explore JSON in ${columnLabel}, row ${rowNumber}`}
    trigger={<span aria-hidden="true">⌕</span>}
    open={open}
    onOpenChange={(next) => onOpenChange(next)}
    invalidationKey={invalidationKey}
    maxHeight={720}
    focusOptionsOnKeyboardOpen={false}
  ><ContentWithClose columnLabel={columnLabel} value={value} /></Popover>
}
