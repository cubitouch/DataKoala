import { useEffect, useRef, useState } from 'react'
import { api } from '@lib/api'
import {
  AI_LIMITS,
  isAiConfigured,
  type AiBuilderProposal,
  type AiErrorCode,
} from '@shared/ai'
import { selectActiveSession, useStore } from '@store/useStore'
import {
  captureAiBuilderSnapshot as capture,
  materializeEffectiveAiBuilderTarget,
  matchesAiBuilderSnapshot as matches,
  prepareAiBuilderContext as prepare,
  type AiBuilderSnapshot as Snapshot,
  type AiPreparedBuilderContext as Prepared,
} from './builderWorkflow'

const builderErrorMessage = (code: AiErrorCode, message: string) =>
  code === 'invalid-response'
    ? "AI couldn't produce a usable Builder change from that request. Try adding a little more detail."
    : message

const UNSUPPORTED_MESSAGE =
  "That request can't be represented by the current Builder yet. You can use the raw SQL editor for this query."

interface Review {
  input: Prepared
  proposal: AiBuilderProposal
  target: Snapshot['state']
  stale: boolean
}
interface Flight {
  id: string
  snapshot: Snapshot
  stale: boolean
  sent: boolean
}

export function useAiBuilderCopilot() {
  const [prompt, setPrompt] = useState('')
  const [configured, setConfigured] = useState<boolean | null>(null)
  const [review, setReview] = useState<Review | null>(null)
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState<Prepared | null>(null)
  const [error, setError] = useState('')
  const [unsupported, setUnsupported] = useState('')
  const flight = useRef<Flight | null>(null)
  const mounted = useRef(true)
  const reviewRef = useRef<Review | null>(null)

  const tabId = useStore((state) => state.activeTabId)
  const profileId = useStore(
    (state) => selectActiveSession(state).connectionProfileId,
  )
  const queryMode = useStore((state) => selectActiveSession(state).queryMode)
  const table = useStore((state) => selectActiveSession(state).builder.table)
  const profileKind = useStore(
    (state) =>
      state.profiles.find(
        (profile) =>
          profile.id === selectActiveSession(state).connectionProfileId,
      )?.kind,
  )
  const columnsStatus = useStore((state) => {
    const session = selectActiveSession(state)
    if (!session.connectionProfileId || !session.builder.table) return undefined
    const schemas =
      state.metadataByProfileId[session.connectionProfileId]?.schemas ?? []
    return schemas
      .flatMap((schema) => schema.relations)
      .find(
        (relation) =>
          relation.schema === session.builder.table?.schema &&
          relation.name === session.builder.table?.name,
      )?.columnsStatus
  })

  const eligible =
    profileKind === 'postgres' &&
    queryMode === 'builder' &&
    Boolean(table) &&
    columnsStatus === 'loaded'

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
      const current = capture()
      const pending = flight.current
      const shown = reviewRef.current
      if (pending && !matches(pending.snapshot, current)) pending.stale = true
      if (shown && !shown.stale && !matches(shown.input.snapshot, current)) {
        const stale = { ...shown, stale: true }
        reviewRef.current = stale
        setReview(stale)
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
    if (!eligible || !api.ai?.settings) {
      setConfigured(false)
      return () => {
        active = false
      }
    }
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
  }, [eligible])

  useEffect(() => {
    if (!eligible) {
      setUnsupported('')
      setError('')
    }
  }, [eligible, tabId, profileId, queryMode])

  const generate = async (retry = false) => {
    const previous = reviewRef.current
    const requestPrompt = retry && previous ? previous.input.prompt : prompt
    const snapshot = capture()
    if (
      flight.current ||
      !configured ||
      !eligible ||
      !snapshot ||
      !requestPrompt.trim() ||
      requestPrompt.length > AI_LIMITS.prompt
    )
      return

    const active: Flight = {
      id: crypto.randomUUID(),
      snapshot,
      stale: false,
      sent: false,
    }
    flight.current = active
    setBusy(true)
    setSent(null)
    setError('')
    setUnsupported('')

    try {
      const input = prepare(snapshot, requestPrompt)
      if (!mounted.current || flight.current !== active) return
      setSent(input)
      active.sent = true
      const result = await api.ai.proposeBuilder({
        requestId: active.id,
        prompt: input.prompt,
        state: input.snapshot.state,
        columns: input.columns,
      })
      if (!mounted.current || flight.current !== active || active.stale) return
      if (!matches(input.snapshot, capture())) return

      if (!result.ok) {
        if (result.code !== 'cancelled')
          setError(builderErrorMessage(result.code, result.message))
        return
      }
      if (result.value.kind === 'unsupported') {
        updateReview(null)
        setUnsupported(UNSUPPORTED_MESSAGE)
        return
      }

      const target = materializeEffectiveAiBuilderTarget(
        input,
        result.value.proposal.patch,
      )
      updateReview({
        input,
        proposal: result.value.proposal,
        target,
        stale: false,
      })
    } catch {
      if (mounted.current && flight.current === active)
        setError(
          'Could not prepare or validate the Builder proposal. Refresh metadata and try again.',
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
    const applied = useStore.getState().applyAiBuilderTarget(
      {
        profileId: current.input.snapshot.profileId,
        state: current.input.snapshot.state,
      },
      current.target,
      current.input.snapshot.tabId,
    )
    if (!applied) {
      updateReview({ ...current, stale: true })
      return
    }
    updateReview(null)
    setPrompt('')
    setUnsupported('')
  }

  let preview: Prepared | null = null
  if (eligible && prompt.trim()) {
    const snapshot = capture()
    if (snapshot)
      try {
        preview = prepare(snapshot, prompt)
      } catch {
        preview = null
      }
  }

  return {
    prompt,
    setPrompt: (value: string) => {
      setPrompt(value)
      setUnsupported('')
      setError('')
    },
    configured,
    eligible,
    busy,
    review,
    error,
    unsupported,
    generate,
    cancel,
    apply,
    reject: () => updateReview(null),
    contextInput: busy ? sent : (review?.input ?? preview),
    contextSent: Boolean(busy ? sent : review),
    promptTooLong: prompt.length > AI_LIMITS.prompt,
  }
}
