import { useEffect, useId, useRef, useState, type RefObject } from 'react'
import { sql as sqlExtension, PostgreSQL } from '@codemirror/lang-sql'
import { Modal } from '@components/ui/Modal'
import { QueryCodeEditor } from '@components/query/QueryCodeEditor'
import { api } from '@lib/api'
import { buildAiContext, selectAiRelations } from '@lib/ai/context'
import { ensureRelationColumns } from '@lib/relationColumns'
import { selectActiveSession, useStore } from '@store/useStore'
import {
  AI_LIMITS,
  AI_PRIVACY_NOTICE,
  type AiQueryContext,
  type AiQueryProposal,
} from '@shared/ai'
import { AiSettingsModal } from './AiSettingsModal'
import styles from './Ai.module.css'
const extensions = [sqlExtension({ dialect: PostgreSQL })]
const noChange = () => {}
interface Snapshot {
  tabId: string
  profileId: string | null
  query: string
}
const capture = (): Snapshot => {
  const state = useStore.getState(),
    tab = selectActiveSession(state)
  return { tabId: tab.id, profileId: tab.connectionProfileId, query: tab.sql }
}
const matches = (a: Snapshot, b: Snapshot) =>
  a.tabId === b.tabId && a.profileId === b.profileId && a.query === b.query
interface Prepared {
  snapshot: Snapshot
  prompt: string
  context: AiQueryContext
}
export function AiQueryCopilotModal({
  onClose,
  returnFocusRef,
}: {
  onClose: () => void
  returnFocusRef: RefObject<HTMLElement | null>
}) {
  const titleId = useId()
  const [prompt, setPrompt] = useState(''),
    [configured, setConfigured] = useState<boolean | null>(null)
  const [settings, setSettings] = useState(false),
    [error, setError] = useState('')
  const [prepared, setPrepared] = useState<Prepared | null>(null),
    [preparing, setPreparing] = useState(false)
  const [busy, setBusy] = useState(false),
    [proposal, setProposal] = useState<AiQueryProposal | null>(null)
  const [stale, setStale] = useState(false)
  const request = useRef<string | null>(null),
    baseline = useRef<Snapshot | null>(null),
    invalidated = useRef(false)
  const mounted = useRef(true)
  const tabId = useStore((s) => s.activeTabId)
  const profileId = useStore((s) => selectActiveSession(s).connectionProfileId)
  const query = useStore((s) => selectActiveSession(s).sql)
  const kind = useStore((s) => s.profiles.find((p) => p.id === profileId)?.kind)
  const cancel = () => {
    const id = request.current
    request.current = null
    if (id) void api.ai.cancel(id)
    setBusy(false)
  }
  useEffect(() => {
    mounted.current = true
    const unsubscribe = useStore.subscribe(() => {
      if (baseline.current && !matches(baseline.current, capture())) {
        invalidated.current = true
        setStale(true)
      }
    })
    return () => {
      mounted.current = false
      unsubscribe()
      if (request.current) void api.ai.cancel(request.current)
      request.current = null
    }
  }, [])
  useEffect(() => {
    let active = true
    if (!settings)
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
    return () => {
      active = false
    }
  }, [settings])
  useEffect(() => {
    if (busy || proposal || settings) return
    let active = true
    setPrepared(null)
    if (!configured || !profileId || kind !== 'postgres') return
    setPreparing(true)
    const timer = setTimeout(() => {
      const snapshot = capture()
      const schemas =
        useStore.getState().metadataByProfileId[profileId]?.schemas ?? []
      const relations = selectAiRelations(schemas, prompt, query)
      void buildAiContext(relations, (relation) =>
        ensureRelationColumns(profileId, relation),
      )
        .then((context) => {
          if (active && matches(snapshot, capture()))
            setPrepared({ snapshot, prompt, context })
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
    busy,
    proposal,
    settings,
    configured,
    profileId,
    tabId,
    query,
    prompt,
    kind,
  ])
  const generate = async () => {
    if (
      request.current ||
      !prepared ||
      !prompt.trim() ||
      !matches(prepared.snapshot, capture()) ||
      prompt !== prepared.prompt
    )
      return
    const id = crypto.randomUUID()
    request.current = id
    baseline.current = prepared.snapshot
    invalidated.current = false
    setStale(false)
    setBusy(true)
    setError('')
    setProposal(null)
    try {
      const result = await api.ai.proposeQuery({
        requestId: id,
        prompt,
        ...(prepared.snapshot.query.trim()
          ? { currentQuery: prepared.snapshot.query }
          : {}),
        context: prepared.context,
      })
      if (!mounted.current || request.current !== id) return
      if (!result.ok) {
        if (result.code !== 'cancelled') setError(result.message)
      } else setProposal(result.value)
      if (!matches(prepared.snapshot, capture())) {
        invalidated.current = true
        setStale(true)
      }
    } catch {
      if (mounted.current && request.current === id)
        setError('Could not generate a proposal. Try again.')
    } finally {
      if (mounted.current && request.current === id) {
        request.current = null
        setBusy(false)
      }
    }
  }
  const useQuery = () => {
    if (
      !proposal ||
      !baseline.current ||
      invalidated.current ||
      !matches(baseline.current, capture())
    ) {
      setStale(true)
      return
    }
    useStore.getState().setSql(proposal.query, baseline.current.tabId)
    onClose()
  }
  const close = () => {
    cancel()
    onClose()
  }
  const columnCount =
    prepared?.context.relations.reduce((n, r) => n + r.columns.length, 0) ?? 0
  if (settings)
    return (
      <AiSettingsModal
        returnFocusRef={returnFocusRef}
        onClose={() => setSettings(false)}
      />
    )
  return (
    <Modal
      open
      onClose={close}
      labelledBy={titleId}
      returnFocusRef={returnFocusRef}
      dialogClassName={styles.dialog}
    >
      <h2 id={titleId}>Ask AI</h2>
      {configured === false ? (
        <>
          <p>Configure OpenRouter to use Ask AI.</p>
          <button className="btn" onClick={() => setSettings(true)}>
            Open AI settings
          </button>
        </>
      ) : (
        <>
          <label className={styles.prompt}>
            Prompt
            <textarea
              value={prompt}
              maxLength={AI_LIMITS.prompt}
              disabled={busy || !!proposal}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="revenue by country over the last 30 days"
            />
          </label>
          {(prepared?.snapshot.query ?? query).trim() && (
            <div>
              Current query included — the full SQL text, including any
              sensitive literals, will be sent.
            </div>
          )}
          <p className={styles.notice}>{AI_PRIVACY_NOTICE}</p>
          {prepared && (
            <>
              <div>
                Context: PostgreSQL · {prepared.context.relations.length}{' '}
                relations · {columnCount} columns
              </div>
              <details>
                <summary>What will be sent</summary>
                <div className={styles.context}>
                  <p>Prompt: {prepared.prompt || '(enter a prompt)'}</p>
                  <p>
                    Current SQL:{' '}
                    {prepared.snapshot.query.trim()
                      ? prepared.snapshot.query
                      : '(not included)'}
                  </p>
                  <p>
                    Schema selection is bounded; some relations or columns may
                    be omitted.
                  </p>
                  {prepared.context.relations.map((r) => (
                    <pre
                      key={`${r.schema}.${r.name}`}
                    >{`${r.schema}.${r.name}\n${r.columns.map((c) => `  ${c.name} ${c.dataType}`).join('\n')}`}</pre>
                  ))}
                </div>
              </details>
              {!prepared.context.relations.length && (
                <p>
                  No schema metadata is loaded. Refresh the connection metadata
                  before generating queries that reference tables.
                </p>
              )}
            </>
          )}
          {preparing && !busy && !proposal && (
            <div role="status">Preparing schema context…</div>
          )}
          {proposal && (
            <>
              <QueryCodeEditor
                aria-label="Proposed SQL"
                value={proposal.query}
                onChange={noChange}
                extensions={extensions}
                editable={false}
                maxHeight="260px"
              />
              <p>{proposal.explanation}</p>
              {!!proposal.assumptions.length && (
                <div>
                  Assumptions
                  <ul>
                    {proposal.assumptions.map((a, i) => (
                      <li key={i}>{a}</li>
                    ))}
                  </ul>
                </div>
              )}
              <p className={styles.notice}>
                Review generated SQL before running it. Use query only replaces
                editor text; it never executes a query.
              </p>
            </>
          )}
          {stale && (
            <div role="status">
              The query or active connection changed while this proposal was
              being generated. Generate again to apply against the latest
              version.
            </div>
          )}
          <div className={styles.actions}>
            {proposal ? (
              <>
                <button className="btn" disabled={stale} onClick={useQuery}>
                  Use query
                </button>
                <button
                  className="btn ghost"
                  onClick={() => {
                    setProposal(null)
                    baseline.current = null
                    setStale(false)
                  }}
                >
                  Try again
                </button>
              </>
            ) : (
              <button
                className="btn"
                disabled={
                  busy ||
                  !prepared ||
                  !prompt.trim() ||
                  query.length > AI_LIMITS.query ||
                  kind !== 'postgres'
                }
                onClick={() => void generate()}
              >
                {busy ? 'Generating…' : 'Generate'}
              </button>
            )}
            {busy && (
              <button className="btn ghost" onClick={cancel}>
                Cancel generation
              </button>
            )}
          </div>
        </>
      )}
      {error && <div role="alert">{error}</div>}
      <div className={styles.actions}>
        <button className="btn ghost" onClick={close}>
          Cancel
        </button>
      </div>
    </Modal>
  )
}
