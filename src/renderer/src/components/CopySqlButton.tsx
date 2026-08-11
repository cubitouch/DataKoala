import React, { useEffect, useRef, useState } from 'react'
void React
import { copyTextToClipboard } from '../lib/clipboardText'

export type CopyState = 'idle' | 'copied' | 'error'

interface CopySqlButtonProps {
  sql: string
  className?: string
  resetMs?: number
}

export function CopySqlButton({ sql, className = 'btn ghost', resetMs = 2000 }: CopySqlButtonProps) {
  const [copyState, setCopyState] = useState<CopyState>('idle')
  const resetTimer = useRef<number | null>(null)
  const hasSql = sql.trim().length > 0

  useEffect(() => () => {
    if (resetTimer.current !== null) window.clearTimeout(resetTimer.current)
  }, [])

  const scheduleReset = () => {
    if (resetTimer.current !== null) window.clearTimeout(resetTimer.current)
    resetTimer.current = window.setTimeout(() => {
      setCopyState('idle')
      resetTimer.current = null
    }, resetMs)
  }

  const handleCopySql = async () => {
    if (!hasSql) return

    try {
      await copyTextToClipboard(sql)
      setCopyState('copied')
      scheduleReset()
    } catch {
      setCopyState('error')
    }
  }

  return (
    <>
      <button
        type="button"
        className={className}
        onClick={handleCopySql}
        disabled={!hasSql}
        aria-label="Copy SQL to clipboard"
      >
        {copyState === 'copied' ? '✓ ' : ''}
        {copyState === 'copied' ? 'Copied' : 'Copy'}
      </button>
      <span aria-live="polite" className="sr-only">
        {copyState === 'copied' && 'SQL copied to clipboard'}
        {copyState === 'error' && 'Could not copy SQL'}
      </span>
      {copyState === 'error' && <span className="inline-error" role="status">Could not copy SQL</span>}
    </>
  )
}
