import { createContext, useContext, type ReactNode } from 'react'
import { useAiQueryRepair } from '@lib/ai/useAiQueryRepair'

type RepairController = ReturnType<typeof useAiQueryRepair>

type AiQueryRepairController = RepairController & {
  blocked: boolean
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

  return (
    <AiQueryRepairContext.Provider
      value={{
        ...ai,
        blocked: ai.busy || !!ai.review,
      }}
    >
      {children}
    </AiQueryRepairContext.Provider>
  )
}

export function useAiQueryRepairController() {
  return useContext(AiQueryRepairContext)
}
