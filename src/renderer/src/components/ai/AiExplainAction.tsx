import { useAiConfigured } from '@lib/ai/useAiConfigured'
import { selectActiveSession, useStore } from '@store/useStore'
import { AI_LIMITS } from '@shared/ai'

export function AiExplainAction({ disabled }: { disabled: boolean }) {
  const configured = useAiConfigured()
  const session = useStore(selectActiveSession)
  if (!configured) return null
  return (
    <button
      className="btn ghost"
      disabled={
        disabled || !session.sql.trim() || session.sql.length > AI_LIMITS.query
      }
      title="Open an AI query diagram without executing SQL"
      onClick={() => {
        useStore.getState().setExplain(null, session.id, {
          query: session.sql,
          mode: 'semantic',
        })
        useStore.getState().setShowExplain(true, session.id)
      }}
    >
      Explain Query with AI
    </button>
  )
}
