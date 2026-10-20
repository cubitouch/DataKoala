import { useLayoutEffect, useRef } from 'react'

/** Own Test/Save delivery locally; invalidation does not cancel provider work. */
export function useConnectionOperation(active: boolean) {
  const owner = useRef<{ active: boolean; pending: symbol | null }>({
    active,
    pending: null,
  })
  useLayoutEffect(() => {
    const state = owner.current
    state.active = active
    state.pending = null
    return () => {
      state.active = false
      state.pending = null
    }
  }, [active])
  return {
    cancel() {
      owner.current.pending = null
    },
    begin() {
      if (!owner.current.active || owner.current.pending) return null
      const token = Symbol()
      owner.current.pending = token
      return token
    },
    current(token: symbol) {
      return owner.current.active && owner.current.pending === token
    },
    finish(token: symbol) {
      if (owner.current.pending === token) owner.current.pending = null
    },
  }
}
