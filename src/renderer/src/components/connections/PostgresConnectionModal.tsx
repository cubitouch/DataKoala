import { useEffect, useMemo, useRef, useState } from 'react'
import type { ConnectionProfile } from '@shared/types'
import { parseConnectionString, buildConnectionString, DEFAULT_PORT } from '@shared/connString'
import { api } from '@lib/api'
import { Checkbox } from '@components/ui/Checkbox'
import { TextInput } from '@components/ui/TextInput'
import { buildConnectionProfileDraft, draftFromProfile, type ConnectionDraft, type ConnectionDraftErrors, type ConnectionDraftField } from '@lib/connectionDraft'
import { ConnectionFormHeader } from './ConnectionFormHeader'
import type { ConnectionFormProps } from './connectionFormTypes'
import { failureMessage } from './connectionFormTypes'
import styles from './ConnectionModal.module.css'

const blank: ConnectionProfile = {
  kind: 'postgres', version: 1,
  id: '', name: '', host: 'localhost', port: DEFAULT_PORT, database: '', user: 'postgres',
  password: '', ssl: false, readonly: true
}
const EXAMPLE = 'postgres://user@localhost:5432/mydb'
const connectionFields = new Set<keyof ConnectionDraft>(['host', 'port', 'database', 'user', 'password', 'ssl'])
const fieldOrder: ConnectionDraftField[] = ['name', 'host', 'port', 'database', 'user']
type TestState =
  | { status: 'idle' }
  | { status: 'testing' }
  | { status: 'success' | 'error' | 'cancelled'; message: string }

export function PostgresConnectionModal({ existing, onClose, onSaved, onBack, active = true }: ConnectionFormProps & { existing: ConnectionProfile | null }) {
  const [draft, setDraft] = useState(() => draftFromProfile(existing ?? blank))
  const [errors, setErrors] = useState<ConnectionDraftErrors>({})
  const [testState, setTestState] = useState<TestState>({ status: 'idle' })
  const [saving, setSaving] = useState(false)
  const [pasted, setPasted] = useState('')
  const [parseError, setParseError] = useState<string | null>(null)
  const [parseWarnings, setParseWarnings] = useState<string[]>([])
  const [parsedOk, setParsedOk] = useState(false)
  const requestRevision = useRef(0)
  const fieldRefs = useRef<Partial<Record<ConnectionDraftField, HTMLInputElement | null>>>({})

  useEffect(() => { if (!active) requestRevision.current += 1 }, [active])
  useEffect(() => () => { requestRevision.current += 1 }, [])

  const updateDraft = (patch: Partial<ConnectionDraft>, affectsConnection = false) => {
    setDraft((current) => {
      const next = { ...current, ...patch }
      setErrors((currentErrors) => {
        if (!Object.keys(currentErrors).length) return currentErrors
        const result = buildConnectionProfileDraft(next, { requireName: true })
        const nextErrors = { ...currentErrors }
        for (const key of Object.keys(patch) as ConnectionDraftField[]) {
          if (result.ok || !result.errors[key]) delete nextErrors[key]
        }
        return nextErrors
      })
      return next
    })
    if (affectsConnection) {
      requestRevision.current += 1
      setTestState({ status: 'idle' })
    }
  }

  const set = (patch: Partial<ConnectionDraft>) => {
    const affectsConnection = Object.keys(patch).some((key) => connectionFields.has(key as keyof ConnectionDraft))
    updateDraft(patch, affectsConnection)
  }

  /** The textarea imports into the draft; it never becomes a second connection source. */
  const applyConnectionString = (raw: string) => {
    setPasted(raw)
    setParsedOk(false)
    setParseError(null)
    setParseWarnings([])
    if (!raw.trim()) return
    const res = parseConnectionString(raw)
    if (!res.ok) {
      setParseError(res.error)
      return
    }
    const v = res.value
    updateDraft({
      host: v.host, port: String(v.port), database: v.database, user: v.user,
      password: v.password, ssl: v.ssl,
      name: draft.name || (v.database ? `${v.database} @ ${v.host}` : v.host)
    }, true)
    setParseWarnings(res.warnings)
    setParsedOk(true)
  }

  const showValidation = (nextErrors: ConnectionDraftErrors) => {
    setErrors(nextErrors)
    setTestState({ status: 'error', message: 'Check the highlighted connection details.' })
    const first = fieldOrder.find((field) => nextErrors[field])
    if (first) requestAnimationFrame(() => fieldRefs.current[first]?.focus())
  }

  const test = async () => {
    const built = buildConnectionProfileDraft(draft)
    if (!built.ok) return showValidation(built.errors)
    setErrors({})
    const revision = ++requestRevision.current
    setTestState({ status: 'testing' })
    try {
      const res = await api.connections.test(built.profile)
      if (revision !== requestRevision.current) return
      if (res?.ok === true) setTestState({ status: 'success', message: `Connected — server ${res.serverVersion || 'unknown'}` })
      else setTestState({ status: 'error', message: failureMessage(res) })
    } catch (error) {
      if (revision === requestRevision.current) setTestState({ status: 'error', message: failureMessage(error) })
    }
  }

  const cancelTest = () => {
    if (testState.status !== 'testing') return
    requestRevision.current += 1
    setTestState({ status: 'cancelled', message: 'Connection test cancelled.' })
  }

  const save = async () => {
    const built = buildConnectionProfileDraft(draft, { requireName: true })
    if (!built.ok) return showValidation(built.errors)
    setErrors({})
    setSaving(true)
    try { const saved = await api.connections.upsert(built.profile); onSaved(saved); onClose() }
    catch (error) { setTestState({ status: 'error', message: failureMessage(error) }) }
    finally { setSaving(false) }
  }

  const normalized = useMemo(() => buildConnectionProfileDraft(draft), [draft])
  const preview = normalized.ok ? buildConnectionString(normalized.profile, { maskPassword: true }) : ''
  const inputProps = (field: ConnectionDraftField) => ({
    ref: (node: HTMLInputElement | null) => { fieldRefs.current[field] = node },
    error: errors[field]
  })

  return <div className={[styles.modalOverlay].join(' ')} onClick={onClose}><div className={[styles.modal].join(' ')} role="dialog" aria-modal="true" aria-labelledby="postgres-connection-title" onClick={(e) => e.stopPropagation()}>
    <ConnectionFormHeader kind="postgres" editing={!!existing} onBack={onBack} />
    <div className={[styles.field].join(' ')}><label htmlFor="connection-string">Paste a connection string</label><textarea id="connection-string" className={[styles.connPaste].join(' ')} value={pasted} spellCheck={false} autoComplete="off" placeholder={EXAMPLE} onChange={(e) => applyConnectionString(e.target.value)} rows={2} aria-invalid={parseError ? true : undefined} aria-describedby={parseError ? 'connection-string-error' : 'connection-string-hint'} /><div id="connection-string-hint" className={[styles.pasteHint].join(' ')}>Accepts <code>postgres://…</code>, <code>postgresql://…</code>, a <code>jdbc:</code> prefix, or libpq <code>host=… dbname=…</code> form. Fills in the fields below.</div>{parseError && <div id="connection-string-error" className={[styles.testMsg, styles.err].join(' ')} role="alert">{parseError}</div>}{parsedOk && <div className={[styles.testMsg, styles.ok].join(' ')}>Parsed{parseWarnings.length ? ' with notes' : ''} — check the fields below.</div>}{parseWarnings.map((w) => <div key={w} className={[styles.testMsg, styles.warn].join(' ')}>{w}</div>)}</div>
    <div className={[styles.modalDivider].join(' ')}><span>or enter details manually</span></div>
    <div className={[styles.field].join(' ')}><TextInput label="Profile name" id="profile-name" {...inputProps('name')} value={draft.name} onValueChange={(text) => set({ name: text })} placeholder="e.g. staging analytics" /></div>
    <div className={[styles.row].join(' ')}><div className={[styles.field].join(' ')}><TextInput label="Host" id="connection-host" {...inputProps('host')} value={draft.host} onValueChange={(text) => set({ host: text })} /></div><div className={[styles.field].join(' ')}><TextInput label="Port" id="connection-port" {...inputProps('port')} inputMode="numeric" value={draft.port} onValueChange={(text) => set({ port: text })} /></div></div>
    <div className={[styles.row].join(' ')}><div className={[styles.field].join(' ')}><TextInput label="Database" id="connection-database" {...inputProps('database')} value={draft.database} onValueChange={(text) => set({ database: text })} /></div><div className={[styles.field].join(' ')}><TextInput label="User" id="connection-user" {...inputProps('user')} value={draft.user} onValueChange={(text) => set({ user: text })} /></div></div>
    <div className={[styles.field].join(' ')}><TextInput label="Password" id="connection-password" type="password" value={draft.password} onValueChange={(text) => set({ password: text })} /></div>
    <div className={[styles.row].join(' ')}><Checkbox className={styles.checkbox} checked={draft.ssl} onCheckedChange={(checked) => set({ ssl: checked })} label="Use SSL" /><Checkbox className={styles.checkbox} checked={draft.readonly} onCheckedChange={(checked) => set({ readonly: checked })} label="Read-only (blocks writes)" /></div>
    {preview && <div className={[styles.field, styles.connectionPreviewField].join(' ')}><label>Will connect as</label><div className={[styles.connPreview].join(' ')}>{preview}</div></div>}
    <div aria-live="polite" aria-atomic="true">{testState.status === 'testing' && <div className={[styles.testMsg, styles.testingStatus].join(' ')} role="status"><span className={[styles.loadingSpinner].join(' ')} aria-hidden="true" />Testing connection…</div>}{testState.status !== 'idle' && testState.status !== 'testing' && <div className={[styles.testMsg, styles.connectionTestResult, testState.status === 'success' ? styles.ok : testState.status === 'error' ? styles.err : styles.info].join(' ')} role={testState.status === 'error' ? 'alert' : 'status'}>{testState.message}</div>}</div>
    <div className={[styles.actions].join(' ')}><button type="button" className={['btn', 'ghost', styles.testButton].join(' ')} onClick={test} disabled={testState.status === 'testing'} aria-busy={testState.status === 'testing'}>{testState.status === 'testing' && <span className={[styles.loadingSpinner].join(' ')} aria-hidden="true" />}{testState.status === 'testing' ? 'Testing…' : 'Test'}</button>{testState.status === 'testing' && <button type="button" className={['btn', 'ghost'].join(' ')} onClick={cancelTest}>Cancel test</button>}<button type="button" className={['btn', 'ghost'].join(' ')} onClick={onClose}>Cancel</button><button type="button" className={['btn', 'primary'].join(' ')} onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button></div>
  </div></div>
}
