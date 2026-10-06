import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { useAiQueryRepair } from '@lib/ai/useAiQueryRepair'

type RepairController = ReturnType<typeof useAiQueryRepair>

export type AiQueryRepairController = RepairController & {
  draft: string
  setDraft: (value: string) => void
  activeReview: RepairController['review']
  blocked: boolean
  applyDraft: () => boolean
  rejectDraft: () => void
}

const AiQueryRepairContext = createContext<AiQueryRepairController | null>(null)

export function AiQueryRepairProvider({
  children,
  enabled = true,
}: {
  children: ReactNode
  enabled?: boolean
}) {
  if (!enabled) return <>{children}</>
  return <ActiveAiQueryRepairProvider>{children}</ActiveAiQueryRepairProvider>
}

function ActiveAiQueryRepairProvider({ children }: { children: ReactNode }) {
  const ai = useAiQueryRepair()
  const [draft, setDraft] = useState('')

  useEffect(() => {
    if (ai.review?.proposal) setDraft(ai.review.proposal.query)
    else setDraft('')
  }, [ai.review?.proposal])

  const activeReview = ai.review?.stale ? null : ai.review
  const applyDraft = () => {
    if (!activeReview || ai.busy) return false
    const applied = ai.apply(draft)
    if (applied) setDraft('')
    return applied
  }
  const rejectDraft = () => {
    setDraft('')
    ai.reject()
  }

  return (
    <AiQueryRepairContext.Provider
      value={{
        ...ai,
        draft,
        setDraft,
        activeReview,
        blocked: ai.busy || !!activeReview,
        applyDraft,
        rejectDraft,
      }}
    >
      {children}
    </AiQueryRepairContext.Provider>
  )
}

export function useAiQueryRepairController() {
  return useContext(AiQueryRepairContext)
}
