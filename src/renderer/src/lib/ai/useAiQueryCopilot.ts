import { useEffect, useRef, useState } from 'react'
import { api } from '@lib/api'
import {
  appendAiContext,
  buildAiContext,
  expandAiRelations,
  selectAiRelations,
} from './context'
import { ensureRelationColumns } from '@lib/relationColumns'
import { selectActiveSession, useStore } from '@store/useStore'
import {
  AI_LIMITS,
  isAiConfigured,
  type AiContextRequest,
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
interface AiDiscoveryDetails {
  initialContext: AiQueryContext
  request: AiContextRequest
  addedRelations: string[]
}
interface Prepared {
  snapshot: Snapshot
  prompt: string
  context: AiQueryContext
  discovery?: AiDiscoveryDetails
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
async function expand(
  input: Prepared,
  request: AiContextRequest,
): Promise<Prepared> {
  if (!input.snapshot.profileId)
    throw new Error('No PostgreSQL connection selected.')
  const schemas =
    useStore.getState().metadataByProfileId[input.snapshot.profileId]?.schemas ??
    []
  const candidates = expandAiRelations(
    schemas,
    request.searchTerms,
    input.snapshot.query,
    input.context.relations,
  )
  const requested: Prepared = {
    ...input,
    discovery: {
      initialContext: input.context,
      request,
      addedRelations: [],
    },
  }
  if (!candidates.length) return requested
  const context = await appendAiContext(
    input.context,
    candidates,
    (relation) => ensureRelationColumns(input.snapshot.profileId!, relation),
  )
  const before = new Set(
    input.context.relations.map(
      (relation) => `${relation.schema}.${relation.name}`,
    ),
  )
  return {
    ...input,
    context,
    discovery: {
      ...requested.discovery!,
      addedRelations: context.relations
        .filter(
          (relation) => !before.has(`${relation.schema}.${relation.name}`),
        )
        .map((relation) => `${relation.schema}.${relation.name}`),
    },
  }
}
const requestedConcepts = (request: AiContextRequest) =>
  request.searchTerms.map((term) => `“${term}”`).join(', ')
const noMatchMessage = (request: AiContextRequest) =>
  `AI requested more metadata for ${requestedConcepts(request)} (${request.reason}), but DataKoala found no undisclosed matching relation within the metadata budget. Make the prompt more specific or mention the relevant table.`
const secondRequestMessage = (request: AiContextRequest) =>
  `AI still needs more metadata for ${requestedConcepts(request)} (${request.reason}) after one discovery step. DataKoala stops after one expansion. Make the prompt more specific or mention the relevant table or columns.`

export function useAiQueryCopilot() {
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
          if (result.ok) setConfigured(isAiConfigured(result.value))
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
  }, [])
  useEffect(() => {
    if (busy) return
    let active = true
    setPrepared(null)
    if (!configured || !profileId || !prompt.trim()) {
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
      const callProvider = async (requestInput: Prepared) => {
        if (!mounted.current || flight.current !== active) return null
        setSent(requestInput)
        active.sent = true
        return api.ai.proposeQuery({
          requestId: active.id,
          prompt: requestInput.prompt,
          ...(requestInput.snapshot.query.trim()
            ? { currentQuery: requestInput.snapshot.query }
            : {}),
          context: requestInput.context,
        })
      }
      const first = await callProvider(input)
      if (!first || !mounted.current || flight.current !== active) return
      if (!first.ok) {
        if (first.code !== 'cancelled') setError(first.message)
        return
      }
      if (first.value.kind === 'proposal') {
        updateReview({
          input,
          proposal: first.value.proposal,
          stale: active.stale || !matches(input.snapshot, capture()),
        })
        return
      }

      const expanded = await expand(input, first.value.request)
      if (!mounted.current || flight.current !== active) return
      setSent(expanded)
      if (!expanded.discovery?.addedRelations.length) {
        setError(noMatchMessage(first.value.request))
        return
      }

      // Exactly one local expansion is allowed. Cancellation during discovery
      // clears flight.current, so this guard prevents the second provider call.
      if (!mounted.current || flight.current !== active) return
      const second = await callProvider(expanded)
      if (!second || !mounted.current || flight.current !== active) return
      if (!second.ok) {
        if (second.code !== 'cancelled') setError(second.message)
        return
      }
      if (second.value.kind === 'context-request') {
        setError(secondRequestMessage(second.value.request))
        return
      }
      updateReview({
        input: expanded,
        proposal: second.value.proposal,
        stale: active.stale || !matches(expanded.snapshot, capture()),
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
    setPrompt('')
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
