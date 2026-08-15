import React from 'react'
void React
import { copyTextToClipboard } from '../lib/clipboardText'
import { notify } from './NotificationArea'

interface CopySqlButtonProps {
  sql: string
  className?: string
}

export function CopySqlButton({ sql, className = 'btn ghost' }: CopySqlButtonProps) {
  const hasSql = sql.trim().length > 0

  const handleCopySql = async () => {
    if (!hasSql) return

    try {
      await copyTextToClipboard(sql)
      notify({ message: 'Copied to clipboard' })
    } catch (error) {
      notify({ message: error instanceof Error && error.message ? `Could not copy: ${error.message}` : 'Could not copy to clipboard', tone: 'error' })
    }
  }

  return (
      <button
        type="button"
        className={className}
        onClick={handleCopySql}
        disabled={!hasSql}
        aria-label="Copy SQL to clipboard"
      >
        Copy
      </button>
  )
}
