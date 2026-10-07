import { useEffect, useState } from 'react'
import { api } from '@lib/api'
import { isAiConfigured } from '@shared/ai'

export function useAiConfigured() {
  const [configured, setConfigured] = useState(false)
  useEffect(() => {
    let live = true
    const refresh = () =>
      void api.ai.settings
        .get()
        .then((result) => {
          if (live) setConfigured(result.ok && isAiConfigured(result.value))
        })
        .catch(() => {
          if (live) setConfigured(false)
        })
    refresh()
    window.addEventListener('datakoala:ai-settings-changed', refresh)
    return () => {
      live = false
      window.removeEventListener('datakoala:ai-settings-changed', refresh)
    }
  }, [])
  return configured
}
