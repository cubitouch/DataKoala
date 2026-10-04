import { useEffect, useRef, useState } from 'react'
import { api } from '@lib/api'
import { buildAiContext, selectAiRelations } from './context'
import { ensureRelationColumns } from '@lib/relationColumns'
import { selectActiveSession, useStore } from '@store/useStore'
import {
  AI_LIMITS,
  type AiQueryContext,
  type AiQueryProposal,
} from '@shared/ai'
interface Snapshot {
  tabId: string
  profileId: string | null
  query: string
}
const capture = (): Snapshot => {
  const tab = selectActiveSession(useStore.getState())
  return { tabId: tab.id, profileId: tab.connectionProfileId, query: tab.sql }
}
const matches = (a: Snapshot, b: Snapshot) =>
  a.tabId === b.tabId && a.profileId === b.profileId && a.query === b.query
interface Prepared {
  snapshot: Snapshot
  prompt: string
  context: AiQueryContext
}
interface Review {
  input: Prepared
  proposal: AiQueryProposal
  stale: boolean
}
interface Flight {
  id: string
  snapshot: Snapshot
  stale: boolean
  sent: boolean
}
async function prepare(snapshot: Snapshot, prompt: string): Promise<Prepared> {
  if (!snapshot.profileId) throw new Error('No PostgreSQL connection selected.')
  const schemas =
    useStore.getState().metadataByProfileId[snapshot.profileId]?.schemas ?? []
  const context = await buildAiContext(
    selectAiRelations(schemas, prompt, snapshot.query),
    (relation) => ensureRelationColumns(snapshot.profileId!, relation),
  )
  return { snapshot, prompt, context }
}
export function useAiQueryCopilot(settingsOpen: boolean) {
  const [prompt, setPrompt] = useState(''),
    [configured, setConfigured] = useState<boolean | null>(null)
  const [prepared, setPrepared] = useState<Prepared | null>(null),
    [preparing, setPreparing] = useState(false)
  const [review, setReview] = useState<Review | null>(null),
    [busy, setBusy] = useState(false)
  const [sent, setSent] = useState<Prepared | null>(null),
    [error, setError] = useState('')
  const flight = useRef<Flight | null>(null),
    mounted = useRef(true),
    reviewRef = useRef<Review | null>(null)
  const tabId = useStore((s) => s.activeTabId),
    profileId = useStore((s) => selectActiveSession(s).connectionProfileId),
    query = useStore((s) => selectActiveSession(s).sql)
  const metadataRevision = useStore((s) =>
    profileId ? s.metadataByProfileId[profileId]?.revision : undefined,
  )
  const metadataStatus = useStore((s) =>
    profileId ? s.metadataByProfileId[profileId]?.status : undefined,
  )
  const updateReview = (value: Review | null) => {
    reviewRef.current = value
    setReview(value)
  }
  const cancel = () => {
    const active = flight.current
    flight.current = null
    if (active?.sent) void api.ai.cancel(active.id)
    setBusy(false)
    setSent(null)
  }
  useEffect(() => {
    mounted.current = true
    const unsubscribe = useStore.subscribe(() => {
      const now = capture(),
        pending = flight.current,
        shown = reviewRef.current
      if (pending && !matches(pending.snapshot, now)) pending.stale = true
      if (shown && !shown.stale && !matches(shown.input.snapshot, now)) {
        const staleReview = { ...shown, stale: true }
        reviewRef.current = staleReview
        setReview(staleReview)
      }
    })
    return () => {
      mounted.current = false
      unsubscribe()
      const active = flight.current
      flight.current = null
      if (active?.sent) void api.ai.cancel(active.id)
    }
  }, [])
  useEffect(() => {
    let active = true
    const refresh = () => {
      void api.ai.settings
        .get()
        .then((result) => {
          if (!active) return
          if (result.ok)
            setConfigured(result.value.hasApiKey && !!result.value.model)
          else setError(result.message)
        })
        .catch(() => {
          if (active) setError('Could not load AI settings.')
        })
    }
    refresh()
    window.addEventListener('datakoala:ai-settings-changed', refresh)
    return () => {
      active = false
      window.removeEventListener('datakoala:ai-settings-changed', refresh)
    }
  }, [settingsOpen])
  useEffect(() => {
    if (busy || settingsOpen) return
    let active = true
    setPrepared(null)
    if (!configured || !profileId) {
      setPreparing(false)
      return
    }
    setPreparing(true)
    const snapshot = capture()
    const timer = setTimeout(() => {
      void prepare(snapshot, prompt)
        .then((value) => {
          if (active && matches(snapshot, capture())) setPrepared(value)
        })
        .catch(() => {
          if (active)
            setError(
              'Could not prepare schema context. Refresh connection metadata and try again.',
            )
        })
        .finally(() => {
          if (active) setPreparing(false)
        })
    }, 250)
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [
    prompt,
    query,
    tabId,
    profileId,
    configured,
    busy,
    settingsOpen,
    metadataRevision,
    metadataStatus,
  ])
  const generate = async (retry = false) => {
    const requestPrompt =
      retry && reviewRef.current ? reviewRef.current.input.prompt : prompt
    if (
      flight.current ||
      !configured ||
      !requestPrompt.trim() ||
      query.length > AI_LIMITS.query
    )
      return
    const active: Flight = {
      id: crypto.randomUUID(),
      snapshot: capture(),
      stale: false,
      sent: false,
    }
    flight.current = active
    setBusy(true)
    setSent(null)
    setError('')
    try {
      // Retry always rebuilds from the current SQL/metadata; the old review stays visible.
      const input =
        !retry &&
        prepared &&
        prepared.prompt === requestPrompt &&
        matches(prepared.snapshot, active.snapshot)
          ? prepared
          : await prepare(active.snapshot, requestPrompt)
      if (!mounted.current || flight.current !== active) return
      const now = capture()
      if (
        now.tabId !== active.snapshot.tabId ||
        now.profileId !== active.snapshot.profileId
      ) {
        cancel()
        return
      }
      setSent(input)
      active.sent = true
      const result = await api.ai.proposeQuery({
        requestId: active.id,
        prompt: input.prompt,
        ...(input.snapshot.query.trim()
          ? { currentQuery: input.snapshot.query }
          : {}),
        context: input.context,
      })
      if (!mounted.current || flight.current !== active) return
      if (!result.ok) {
        if (result.code !== 'cancelled') setError(result.message)
      } else
        updateReview({
          input,
          proposal: result.value,
          stale: active.stale || !matches(input.snapshot, capture()),
        })
    } catch {
      if (mounted.current && flight.current === active)
        setError(
          'Could not generate a proposal. Check schema metadata and AI settings, then try again.',
        )
    } finally {
      if (mounted.current && flight.current === active) {
        flight.current = null
        setBusy(false)
        setSent(null)
      }
    }
  }
  const apply = () => {
    const current = reviewRef.current
    if (flight.current || !current) return
    if (current.stale || !matches(current.input.snapshot, capture())) {
      updateReview({ ...current, stale: true })
      return
    }
    updateReview(null)
    useStore
      .getState()
      .setSql(current.proposal.query, current.input.snapshot.tabId)
  }
  const contextInput = busy ? sent : (review?.input ?? prepared)
  return {
    prompt,
    setPrompt,
    configured,
    preparing,
    busy,
    review,
    error,
    generate,
    cancel,
    apply,
    reject: () => updateReview(null),
    query,
    contextInput,
    contextSent: busy ? !!sent : !!review,
    queryTooLong: query.length > AI_LIMITS.query,
  }
}
