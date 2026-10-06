import { useEffect, useRef, useState } from 'react'
import { api } from '@lib/api'
import { selectActiveSession, useStore } from '@store/useStore'
import {
  isAiConfigured,
  type AiErrorCode,
  type AiQueryProposal,
} from '@shared/ai'
import {
  captureAiQuerySnapshot,
  expandAiQueryContext,
  matchesAiQuerySnapshot,
  noAiMetadataMatchMessage,
  prepareAiQueryContext,
  secondAiContextRequestMessage,
  type AiPreparedContext,
} from './workflow'

interface RepairInput extends AiPreparedContext {
  error: string
}
interface RepairReview {
  input: RepairInput
  proposal: AiQueryProposal
  stale: boolean
}
interface Flight {
  id: string
  input: {
    query: string
    error: string
    tabId: string
    profileId: string | null
  }
  sent: boolean
  stale: boolean
}
const repairErrorMessage = (code: AiErrorCode, message: string) =>
  code === 'invalid-response'
    ? "AI couldn't produce a usable repair this time.\nYour query was not changed. Try again or edit it manually."
    : message

const captureFailure = () => {
  const session = selectActiveSession(useStore.getState())
  const failure = session.repairableQueryError
  return failure
    ? {
        query: failure.query,
        error: failure.error,
        tabId: session.id,
        profileId: session.connectionProfileId,
      }
    : null
}
const failureMatches = (expected: Flight['input']) => {
  const current = captureFailure()
  return (
    !!current &&
    current.query === expected.query &&
    current.error === expected.error &&
    current.tabId === expected.tabId &&
    current.profileId === expected.profileId &&
    matchesAiQuerySnapshot(
      {
        tabId: expected.tabId,
        profileId: expected.profileId,
        query: expected.query,
      },
      captureAiQuerySnapshot(),
    )
  )
}

export function useAiQueryRepair() {
  const [configured, setConfigured] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [review, setReview] = useState<RepairReview | null>(null)
  const [sent, setSent] = useState<RepairInput | null>(null)
  const flight = useRef<Flight | null>(null)
  const reviewRef = useRef<RepairReview | null>(null)
  const mounted = useRef(true)
  const session = useStore(selectActiveSession)
  const datasourceKind = useStore(
    (state) =>
      state.profiles.find(
        (profile) => profile.id === session.connectionProfileId,
      )?.kind,
  )
  const updateReview = (next: RepairReview | null) => {
    reviewRef.current = next
    setReview(next)
  }
  const cancel = () => {
    const active = flight.current
    flight.current = null
    if (active?.sent) void api.ai.cancel(active.id)
    setBusy(false)
    setSent(null)
  }
  useEffect(() => {
    let active = true
    const refresh = () =>
      void api.ai.settings.get().then((result) => {
        if (active && result.ok) setConfigured(isAiConfigured(result.value))
      })
    refresh()
    window.addEventListener('datakoala:ai-settings-changed', refresh)
    return () => {
      active = false
      window.removeEventListener('datakoala:ai-settings-changed', refresh)
    }
  }, [])
  useEffect(() => {
    mounted.current = true
    const unsubscribe = useStore.subscribe(() => {
      const active = flight.current
      if (active && !failureMatches(active.input)) {
        active.stale = true
        cancel()
      }
      const shown = reviewRef.current
      if (
        shown &&
        !shown.stale &&
        !failureMatches({
          query: shown.input.snapshot.query,
          error: shown.input.error,
          tabId: shown.input.snapshot.tabId,
          profileId: shown.input.snapshot.profileId,
        })
      )
        updateReview({ ...shown, stale: true })
    })
    return () => {
      mounted.current = false
      unsubscribe()
      cancel()
    }
  }, [])

  const repair = async () => {
    const failure = captureFailure()
    if (!failure || flight.current || !configured) return
    const active: Flight = {
      id: crypto.randomUUID(),
      input: failure,
      sent: false,
      stale: false,
    }
    flight.current = active
    setBusy(true)
    setError('')
    setSent(null)
    try {
      const prepared = await prepareAiQueryContext(
        {
          tabId: failure.tabId,
          profileId: failure.profileId,
          query: failure.query,
        },
        failure.error,
      )
      let input: RepairInput = { ...prepared, error: failure.error }
      const callProvider = async () => {
        if (!mounted.current || flight.current !== active || active.stale)
          return null
        active.sent = true
        setSent(input)
        return api.ai.proposeQuery({
          requestId: active.id,
          intent: 'repair',
          currentQuery: failure.query,
          error: failure.error,
          context: input.context,
        })
      }
      let response = await callProvider()
      if (!response || flight.current !== active || !failureMatches(failure))
        return
      if (!response.ok) {
        if (response.code !== 'cancelled')
          setError(repairErrorMessage(response.code, response.message))
        return
      }
      if (response.value.kind === 'context-request') {
        const contextRequest = response.value.request
        const expanded = await expandAiQueryContext(input, contextRequest)
        if (!mounted.current || flight.current !== active || active.stale)
          return
        input = {
          ...expanded,
          error: failure.error,
        }
        setSent(input)
        if (!input.discovery?.addedRelations.length) {
          setError(
            noAiMetadataMatchMessage(
              contextRequest,
              'Refresh metadata or edit the query to reference the relevant relation.',
            ),
          )
          return
        }
        response = await callProvider()
        if (!response || flight.current !== active || !failureMatches(failure))
          return
        if (!response.ok) {
          if (response.code !== 'cancelled')
            setError(repairErrorMessage(response.code, response.message))
          return
        }
        if (response.value.kind === 'context-request') {
          setError(secondAiContextRequestMessage(response.value.request))
          return
        }
      }
      updateReview({ input, proposal: response.value.proposal, stale: false })
    } catch {
      if (mounted.current && flight.current === active)
        setError(
          'Could not prepare or generate a query repair. Refresh metadata and try again.',
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
    if (
      flight.current ||
      !current ||
      current.stale ||
      !failureMatches({
        query: current.input.snapshot.query,
        error: current.input.error,
        tabId: current.input.snapshot.tabId,
        profileId: current.input.snapshot.profileId,
      })
    )
      return false
    useStore
      .getState()
      .setSql(current.proposal.query, current.input.snapshot.tabId)
    updateReview(null)
    return true
  }
  const failure = session.repairableQueryError
  return {
    configured,
    visible:
      configured === true &&
      datasourceKind === 'postgres' &&
      session.queryMode === 'sql' &&
      !!failure &&
      failure.query === session.sql,
    busy,
    error,
    review,
    sent,
    repair,
    cancel,
    apply,
    reject: () => updateReview(null),
  }
}
