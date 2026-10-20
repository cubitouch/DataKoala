import { clipboardFailure } from '@lib/clipboardFeedback'
import { copyTextToClipboard } from '@lib/clipboardText'
import { notify } from '@components/ui/feedback/NotificationArea'

interface CopySqlButtonProps {
  sql: string
  className?: string
  language?: string
}

export function CopySqlButton({
  sql,
  className = 'btn ghost',
  language = 'SQL',
}: CopySqlButtonProps) {
  const hasSql = sql.trim().length > 0

  const handleCopySql = async () => {
    if (!hasSql) return

    try {
      await copyTextToClipboard(sql)
      notify({ message: 'Copied to clipboard' })
    } catch (error) {
      notify(clipboardFailure(error))
    }
  }

  return (
    <button
      type="button"
      className={className}
      onClick={handleCopySql}
      disabled={!hasSql}
      aria-label={`Copy ${language} to clipboard`}
    >
      Copy
    </button>
  )
}
