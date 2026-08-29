import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import type { BigQueryProfile, ConnectionProfile, DataSourceKind, DataSourceProfile, LocalFilesProfile, LokiProfile, PrometheusProfile, SqliteFileProfile, TempoProfile } from '../../../shared/types'
import type { LokiDatasourceOption } from '../../../shared/loki'
import type { PrometheusDatasourceOption } from '../../../shared/prometheus'
import { parseConnectionString, buildConnectionString, DEFAULT_PORT } from '../../../shared/connString'
import { api } from '../lib/api'
import { Combobox } from './ui/combobox'
import { Checkbox } from './ui/Checkbox'
import { TextInput } from './ui/TextInput'
import { CollapsibleSection } from './ui/CollapsibleSection'
import styles from './ConnectionModal.module.css'
import { parseBigQueryReference, type BigQueryDatasetOption, type BigQueryProjectOption } from '../../../shared/bigqueryDiscovery'
import {
  buildConnectionProfileDraft,
  draftFromProfile,
  type ConnectionDraft,
  type ConnectionDraftErrors,
  type ConnectionDraftField
} from '../lib/connectionDraft'

interface Props {
  existing: DataSourceProfile | null
  onClose: () => void
  onSaved: (p: DataSourceProfile) => void
}

type FormProps = Props & { onBack?: () => void; active?: boolean }
type PickerKind = DataSourceKind | 'excel'
export interface ConnectionSourceDescriptor {
  kind: PickerKind
  label: string
  description: string
  hint: string
  icon: 'postgresql' | 'duckdb' | 'sqlite' | 'bigquery' | 'prometheus' | 'tempo' | 'loki' | 'excel'
  status: 'available' | 'coming-soon'
  supportsCreate: boolean
}

export const CONNECTION_SOURCE_DESCRIPTORS: readonly ConnectionSourceDescriptor[] = [
  { kind: 'postgres', label: 'PostgreSQL', description: 'Connect with host, port, database and credentials.', hint: 'Postgres database', icon: 'postgresql', status: 'available', supportsCreate: true },
  { kind: 'local-files', label: 'Local files', description: 'Query CSV, Parquet and JSON files through DuckDB.', hint: 'One or more files', icon: 'duckdb', status: 'available', supportsCreate: true },
  { kind: 'sqlite-file', label: 'SQLite', description: 'Open a SQLite database file through DuckDB.', hint: '.sqlite or .db file', icon: 'sqlite', status: 'available', supportsCreate: true },
  { kind: 'bigquery', label: 'BigQuery', description: 'Use Google ADC credentials to browse and query datasets.', hint: 'Cloud data warehouse', icon: 'bigquery', status: 'available', supportsCreate: true },
  { kind: 'prometheus', label: 'Prometheus', description: 'Discover Grafana Cloud metrics through your existing gcx login.', hint: 'Metrics via gcx', icon: 'prometheus', status: 'available', supportsCreate: true },
  { kind: 'tempo', label: 'Tempo', description: 'Search and inspect distributed traces through your existing gcx login.', hint: 'Traces via gcx', icon: 'tempo', status: 'available', supportsCreate: true },
  { kind: 'loki', label: 'Loki', description: 'Explore Grafana Loki logs through your existing gcx login.', hint: 'Logs via gcx', icon: 'loki', status: 'available', supportsCreate: true },
  { kind: 'excel', label: 'Excel', description: 'Explore workbook sheets as tables.', hint: 'Coming soon', icon: 'excel', status: 'coming-soon', supportsCreate: false }
]

function SourceIcon({ type }: { type: ConnectionSourceDescriptor['icon'] }) {
  const common = { width: 28, height: 28, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.65, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true }
  // Locally-owned, single-colour marks: recognizable silhouettes without bundling brand artwork.
  if (type === 'postgresql') return <svg {...common}><path d="M7.2 14.7C4.7 13.6 4 10.5 4.7 7.5 5.4 4.6 8 3.1 11 4.2c2.8-1.5 6-.2 7 2.7.8 2.3.3 5.6-1.7 7.1"/><path d="M9.2 8.2c.2 3.6.8 6.5 2 8.6.8 1.7 2.8 2.6 4.3 1.5.8-.6.6-1.6-.2-2.1-1.1-.6-2.7-.1-3.5.6M14.8 8.2c-.2 3.6-.8 6.5-2 8.6M8 7.5h.1M15.9 7.5h.1"/></svg>
  if (type === 'duckdb') return <svg {...common}><circle cx="11.5" cy="12" r="7.5"/><circle cx="11.5" cy="12" r="3.8"/><path d="M15.3 10.8H20l2 1.5-2 1.5h-4.7"/><path d="M10.4 10.8h.1"/></svg>
  if (type === 'sqlite') return <svg {...common}><path d="M5 20c2.2-6.2 5.5-11.4 11.6-16.4 1.2-1 2.8-.3 2.6 1.3-.8 6.2-4.4 11.4-10 14.4"/><path d="M7.5 17.4c3.2-2.7 5.9-5.6 8.2-9M10.5 14.4l-1.3-3.1M13.2 11.2l2.9-.5"/></svg>
  if (type === 'bigquery') return <svg {...common}><circle cx="10.8" cy="10.8" r="7.2"/><path d="m16.1 16.1 4.3 4.3M7.6 13.8v-3M10.8 13.8V7.5M14 13.8V9.4"/></svg>
  if (type === 'prometheus') return <svg {...common}><path d="M12 3v4M6.3 5.3l2.8 2.8M17.7 5.3l-2.8 2.8M4 11h4M16 11h4"/><path d="M7 13a5 5 0 0 0 10 0M9 18h6M10 21h4"/></svg>
  if (type === 'tempo') return <svg {...common}><path d="M4 6h5M4 12h8M4 18h4"/><circle cx="12" cy="6" r="2"/><circle cx="15" cy="12" r="2"/><circle cx="11" cy="18" r="2"/><path d="m13.5 7.5 1 2.5M14 13.7l-2 2.6"/></svg>
  if (type === 'loki') return <svg {...common}><path d="M5 5h14M5 10h14M5 15h14M5 20h9"/><circle cx="8" cy="5" r="1"/><circle cx="16" cy="10" r="1"/></svg>
  return <svg {...common}><path d="M8 4h11v16H8M8 8h11M8 12h11M8 16h11M13 8v12"/><path d="M3 7h7v10H3Z" fill="currentColor" stroke="none"/><path d="m5 10 3 4M8 10l-3 4" stroke="var(--bg-3)"/></svg>
}

function ConnectionFormHeader({ kind, editing, onBack }: { kind: DataSourceKind; editing: boolean; onBack?: () => void }) {
  const descriptor = CONNECTION_SOURCE_DESCRIPTORS.find((item) => item.kind === kind)!
  return <header className={[styles.connectionFormHeader].join(' ')}>
    {onBack && <button type="button" className={['btn', 'ghost', styles.connectionBack].join(' ')} onClick={onBack} aria-label="Back to connection types">← Back</button>}
    <span className={[styles.sourceIcon].join(' ')}><SourceIcon type={descriptor.icon} /></span>
    <div><div className={[styles.wizardSteps].join(' ')}>{editing ? 'Connection type' : 'Step 2 of 2 · Details'}</div><h2 id={`${kind}-connection-title`}>{editing ? `Edit ${descriptor.label} connection` : descriptor.label}</h2></div>
    {editing && <span className={[styles.sourceKindBadge].join(' ')}>Fixed type</span>}
  </header>
}

const blank: ConnectionProfile = {
  kind: 'postgres', version: 1,
  id: '', name: '', host: 'localhost', port: DEFAULT_PORT, database: '', user: 'postgres',
  password: '', ssl: false, readonly: true
}
const EXAMPLE = 'postgres://user@localhost:5432/mydb'
const defaultFileAlias = (path: string) => (path.split(/[\\/]/).pop() ?? 'data').replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_]+/g, '_').replace(/^\d/, '_$&') || 'data'
const connectionFields = new Set<keyof ConnectionDraft>(['host', 'port', 'database', 'user', 'password', 'ssl'])
const fieldOrder: ConnectionDraftField[] = ['name', 'host', 'port', 'database', 'user']
type TestState =
  | { status: 'idle' }
  | { status: 'testing' }
  | { status: 'success' | 'error' | 'cancelled'; message: string }

const failureMessage = (value: unknown): string => {
  if (value instanceof Error && value.message.trim()) return value.message
  if (typeof value === 'string' && value.trim()) return value
  if (value && typeof value === 'object' && 'error' in value) {
    const error = (value as { error?: unknown }).error
    if (typeof error === 'string' && error.trim()) return error
  }
  return 'Connection test failed. The server did not provide an error message.'
}

function PostgresConnectionModal({ existing, onClose, onSaved, onBack, active = true }: FormProps & { existing: ConnectionProfile | null }) {
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

function LocalFilesConnectionModal({ existing, onClose, onSaved, onBack }: FormProps & { existing: LocalFilesProfile | null }) {
  const [name, setName] = useState(existing?.name ?? 'Local files')
  const [files, setFiles] = useState(existing?.files ?? [])
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const profile = (): LocalFilesProfile => ({ kind: 'local-files', version: 1, id: existing?.id ?? '', name: name.trim(), files, readonly: true })
  const choose = async () => { try { const paths = await api.connections.chooseFiles(); setFiles((current) => { const known = new Set(current.map((file) => file.path)); const aliases = new Set(current.map((file) => file.alias.toLocaleLowerCase())); const additions = paths.filter((path: string) => !known.has(path)).map((path: string) => { const base = defaultFileAlias(path); let alias = base; let suffix = 2; while (aliases.has(alias.toLocaleLowerCase())) alias = `${base}_${suffix++}`; aliases.add(alias.toLocaleLowerCase()); return { path, alias } }); return [...current, ...additions] }); setMessage(null) } catch (error) { setMessage({ ok: false, text: failureMessage(error) }) } }
  const test = async () => { if (!name.trim() || !files.length) return setMessage({ ok: false, text: 'Enter a name and choose at least one file.' }); setBusy(true); try { const result = await api.connections.test(profile()); setMessage(result.ok ? { ok: true, text: 'Files loaded successfully with DuckDB.' } : { ok: false, text: result.error }) } catch (error) { setMessage({ ok: false, text: failureMessage(error) }) } finally { setBusy(false) } }
  const save = async () => { if (!name.trim() || !files.length) return setMessage({ ok: false, text: 'Enter a name and choose at least one file.' }); setBusy(true); try { onSaved(await api.connections.upsert(profile())); onClose() } catch (error) { setMessage({ ok: false, text: error instanceof Error ? error.message : String(error) }) } finally { setBusy(false) } }
  return <div className={[styles.modalOverlay].join(' ')} onClick={onClose}><div className={[styles.modal].join(' ')} role="dialog" aria-modal="true" aria-labelledby="local-files-connection-title" onClick={(event) => event.stopPropagation()}><ConnectionFormHeader kind="local-files" editing={!!existing} onBack={onBack} /><div className={[styles.field].join(' ')}><TextInput label="Connection name" id="local-profile-name" value={name} onValueChange={setName} /></div><div className={[styles.field].join(' ')}><label>Data files</label><button type="button" className={['btn', 'ghost'].join(' ')} onClick={() => void choose()}>Choose files…</button><div className={[styles.pasteHint].join(' ')}>CSV, TSV, Parquet, JSON, JSONL, and NDJSON. Each file is exposed as a read-only SQL view.</div></div>{files.map((file, index) => <div className={[styles.row, styles.fileConnectionRow].join(' ')} key={file.path}><div className={[styles.field].join(' ')}><TextInput label={`Table alias for ${file.path}`} value={file.alias} onValueChange={(text) => setFiles((current) => current.map((item, i) => i === index ? { ...item, alias: text } : item))} /></div><button type="button" className={['btn', 'ghost'].join(' ')} aria-label={`Remove ${file.path}`} onClick={() => setFiles((current) => current.filter((_, i) => i !== index))}>Remove</button></div>)}{message && <div className={[styles.testMsg, message.ok ? styles.ok : styles.err].join(' ')} role={message.ok ? 'status' : 'alert'}>{message.text}</div>}<div className={[styles.actions].join(' ')}><button type="button" className={['btn', 'ghost'].join(' ')} onClick={() => void test()} disabled={busy}>Test</button><button type="button" className={['btn', 'ghost'].join(' ')} onClick={onClose}>Cancel</button><button type="button" className={['btn', 'primary'].join(' ')} onClick={() => void save()} disabled={busy}>{busy ? 'Working…' : 'Save'}</button></div></div></div>
}

function SqliteFileConnectionModal({ existing, onClose, onSaved, onBack }: FormProps & { existing: SqliteFileProfile | null }) {
  const [name, setName] = useState(existing?.name ?? 'SQLite database'); const [path, setPath] = useState(existing?.path ?? ''); const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null); const [busy, setBusy] = useState(false)
  const profile = (): SqliteFileProfile => ({ kind: 'sqlite-file', version: 1, id: existing?.id ?? '', name: name.trim(), path, readonly: true })
  const choose = async () => { try { const selected = await api.connections.chooseSqliteFile(); if (selected) { setPath(selected); setMessage(null) } } catch (error) { setMessage({ ok: false, text: failureMessage(error) }) } }
  const validate = () => name.trim() && path ? null : 'Enter a connection name and choose one SQLite database file.'
  const test = async () => { const error = validate(); if (error) return setMessage({ ok: false, text: error }); setBusy(true); try { const result = await api.connections.test(profile()); setMessage(result.ok ? { ok: true, text: 'SQLite database opened directly in read-only mode.' } : { ok: false, text: result.error }) } catch (caught) { setMessage({ ok: false, text: failureMessage(caught) }) } finally { setBusy(false) } }
  const save = async () => { const error = validate(); if (error) return setMessage({ ok: false, text: error }); setBusy(true); try { onSaved(await api.connections.upsert(profile())); onClose() } catch (caught) { setMessage({ ok: false, text: failureMessage(caught) }) } finally { setBusy(false) } }
  return <div className={[styles.modalOverlay].join(' ')} onClick={onClose}><div className={[styles.modal].join(' ')} role="dialog" aria-modal="true" aria-labelledby="sqlite-file-connection-title" onClick={(event) => event.stopPropagation()}><ConnectionFormHeader kind="sqlite-file" editing={!!existing} onBack={onBack} /><div className={[styles.field].join(' ')}><TextInput label="Connection name" id="sqlite-profile-name" value={name} onValueChange={setName} /></div><div className={[styles.field].join(' ')}><label>Database file</label><button type="button" className={['btn', 'ghost'].join(' ')} onClick={() => void choose()}>Choose database…</button>{path && <div className={[styles.connPreview].join(' ')} title={path}>{path}</div>}<div className={[styles.pasteHint].join(' ')}>Select exactly one database file. Its SQLite contents are validated, so the filename extension does not matter. The database is attached directly in read-only mode.</div></div>{message && <div className={[styles.testMsg, message.ok ? styles.ok : styles.err].join(' ')} role={message.ok ? 'status' : 'alert'}>{message.text}</div>}<div className={[styles.actions].join(' ')}><button type="button" className={['btn', 'ghost'].join(' ')} onClick={() => void test()} disabled={busy}>Test</button><button type="button" className={['btn', 'ghost'].join(' ')} onClick={onClose}>Cancel</button><button type="button" className={['btn', 'primary'].join(' ')} onClick={() => void save()} disabled={busy}>{busy ? 'Working…' : 'Save'}</button></div></div></div>
}

function BigQueryConnectionModal({ existing, onClose, onSaved, onBack, active = true }: FormProps & { existing: BigQueryProfile | null }) {
  const [draft, setDraft] = useState(() => ({ name: existing?.name ?? '', billingProject: existing?.billingProject ?? '', defaultProject: existing?.defaultProject ?? '', defaultDataset: existing?.defaultDataset ?? '', location: existing?.location ?? '', maximumBytesBilled: existing?.maximumBytesBilled ?? '' })); const [limitBytesBilled, setLimitBytesBilled] = useState(Boolean(existing?.maximumBytesBilled?.trim())); const previousMaximumBytesBilled = useRef(existing?.maximumBytesBilled?.trim() || ''); const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null); const [busy, setBusy] = useState(false); const revision = useRef(0); const [projects, setProjects] = useState<BigQueryProjectOption[]>([]); const [projectLoading, setProjectLoading] = useState(true); const [projectError, setProjectError] = useState<string | null>(null); const [datasets, setDatasets] = useState<BigQueryDatasetOption[]>([]); const [datasetLoading, setDatasetLoading] = useState(false); const [datasetError, setDatasetError] = useState<string | null>(null); const [reference, setReference] = useState(''); const [referenceError, setReferenceError] = useState<string | null>(null); const datasetRevision = useRef(0); const untouched = useRef(!existing)
  const loadDatasets = (projectId: string) => { const current = ++datasetRevision.current; setDatasets([]); setDatasetError(null); if (!projectId.trim()) { setDatasetLoading(false); return } setDatasetLoading(true); void api.connections.bigquery.listDatasets(projectId.trim()).then((values: BigQueryDatasetOption[]) => { if (current === datasetRevision.current) setDatasets(values) }).catch(() => { if (current === datasetRevision.current) setDatasetError('Could not discover datasets. You can still enter a dataset ID manually.') }).finally(() => { if (current === datasetRevision.current) setDatasetLoading(false) }) }
  useEffect(() => { let activeNow = true; void api.connections.bigquery.discoverProjects().then((values: BigQueryProjectOption[]) => { if (activeNow) setProjects(values) }).catch(() => { if (activeNow) setProjectError('Could not discover projects. You can still enter a project ID manually.') }).finally(() => { if (activeNow) setProjectLoading(false) }); if (!existing) void api.connections.bigquery.discoverDefaults().then(({ projectId }: { projectId?: string }) => { if (activeNow && untouched.current && projectId) { setDraft((current) => ({ ...current, billingProject: projectId, defaultProject: projectId })); loadDatasets(projectId) } }).catch(() => undefined); return () => { activeNow = false; revision.current++; datasetRevision.current++ } }, [existing])
  useEffect(() => { if (!active) { revision.current++; datasetRevision.current++ } }, [active]); useEffect(() => { const projectId = existing?.defaultProject || existing?.billingProject; if (projectId) loadDatasets(projectId) }, [existing])
  const makeProfile = (): BigQueryProfile => ({ kind: 'bigquery', version: 1, id: existing?.id ?? '', name: draft.name.trim(), billingProject: draft.billingProject.trim(), defaultProject: draft.defaultProject.trim() || draft.billingProject.trim(), defaultDataset: draft.defaultDataset.trim() || undefined, location: draft.location.trim() || undefined, maximumBytesBilled: limitBytesBilled ? draft.maximumBytesBilled.trim() : '', readonly: true })
  const validate = () => !draft.name.trim() ? 'Enter a connection name.' : !draft.billingProject.trim() ? 'Enter a billing project.' : limitBytesBilled && (!/^\d+$/.test(draft.maximumBytesBilled.trim()) || BigInt(draft.maximumBytesBilled.trim() || '0') <= 0n) ? 'Maximum bytes billed must be a positive decimal integer.' : null
  const test = async () => { const error = validate(); if (error) return setMessage({ ok: false, text: error }); const current = ++revision.current; setBusy(true); setMessage(null); try { const result = await api.connections.test(makeProfile()); if (current === revision.current) setMessage(result.ok ? { ok: true, text: 'Credentials and metadata access verified.' } : { ok: false, text: result.error }) } catch (caught) { if (current === revision.current) setMessage({ ok: false, text: failureMessage(caught) }) } finally { if (current === revision.current) setBusy(false) } }
  const save = async () => { const error = validate(); if (error) return setMessage({ ok: false, text: error }); setBusy(true); try { onSaved(await api.connections.upsert(makeProfile())); onClose() } catch (caught) { setMessage({ ok: false, text: failureMessage(caught) }) } finally { setBusy(false) } }
  const set = (field: keyof typeof draft, value: string) => { untouched.current = false; revision.current++; setBusy(false); setMessage(null); setDraft((valueNow) => ({ ...valueNow, [field]: value })) }
  const toggleLimit = (enabled: boolean) => { revision.current++; setBusy(false); setMessage(null); setLimitBytesBilled(enabled); setDraft((current) => { if (!enabled) { if (current.maximumBytesBilled.trim()) previousMaximumBytesBilled.current = current.maximumBytesBilled; return { ...current, maximumBytesBilled: '' } } return { ...current, maximumBytesBilled: previousMaximumBytesBilled.current } }) }
  const setDataProject = (value: string, dataset = '') => { untouched.current = false; revision.current++; setBusy(false); setMessage(null); setDraft((current) => ({ ...current, defaultProject: value, defaultDataset: dataset })); loadDatasets(value) }
  const applyReference = (value: string) => { setReference(value); if (!value.trim()) return setReferenceError(null); const parsed = parseBigQueryReference(value); if (!parsed) return setReferenceError('Enter a valid BigQuery project and dataset reference.'); setReferenceError(null); setDataProject(parsed.projectId, parsed.datasetId ?? '') }
  const projectOptions = useMemo(() => projects.map((project) => ({ value: project.projectId, label: project.friendlyName || project.projectId, subtitle: project.friendlyName ? project.projectId : undefined })), [projects]); const datasetOptions = useMemo(() => [{ value: '', label: 'All datasets', subtitle: 'No default dataset' }, ...datasets.map((dataset) => ({ value: dataset.datasetId, label: dataset.datasetId, subtitle: [dataset.friendlyName, dataset.location].filter(Boolean).join(' · ') || undefined }))], [datasets]); const selectedDataset = datasets.find((dataset) => dataset.datasetId === draft.defaultDataset)
  return <div className={[styles.modalOverlay].join(' ')} onClick={onClose}><div className={[styles.modal].join(' ')} role="dialog" aria-modal="true" aria-labelledby="bigquery-connection-title" onClick={(event) => event.stopPropagation()}><ConnectionFormHeader kind="bigquery" editing={!!existing} onBack={onBack} /><div className={[styles.field].join(' ')}><TextInput label="Connection name" id="bq-name" value={draft.name} onValueChange={(text) => set('name', text)} /></div><div className={[styles.field].join(' ')}><TextInput label="Paste BigQuery reference" id="bq-reference" placeholder="project.dataset or projects/project/datasets/dataset" value={reference} onValueChange={applyReference} error={referenceError || undefined} /></div><div className={[styles.row].join(' ')}><div className={[styles.field].join(' ')}><Combobox label="Billing project" value={draft.billingProject} options={projectOptions} onChange={(value) => set('billingProject', value)} searchable allowCustomValue loading={projectLoading} error={projectError} emptyMessage="No accessible projects. Enter a project ID manually." /></div><div className={[styles.field].join(' ')}><Combobox label="Data project" value={draft.defaultProject} options={projectOptions} onChange={setDataProject} searchable allowCustomValue loading={projectLoading} error={projectError} emptyMessage="No accessible projects. Enter a project ID manually." /></div></div><div className={[styles.field].join(' ')}><Combobox label="Dataset" value={draft.defaultDataset} options={datasetOptions} onChange={(value) => set('defaultDataset', value)} searchable allowCustomValue disabled={!draft.defaultProject.trim()} loading={datasetLoading} error={datasetError} placeholder="All datasets" emptyMessage="No datasets found. Enter a dataset ID manually." invalidationKey={draft.defaultProject} />{selectedDataset?.location && <div className={[styles.pasteHint].join(' ')} role="status">Dataset location: <strong>{selectedDataset.location}</strong></div>}<div className={[styles.pasteHint].join(' ')}>All accessible datasets remain visible in the object tree. A selection only provides the default SQL context.</div></div><div className={styles.bqAdvanced}><CollapsibleSection title="Advanced"><div className={styles.advancedFields}><TextInput label="Location override (optional)" id="bq-location" placeholder="e.g. US or europe-west1" value={draft.location} onValueChange={(text) => set('location', text)} hint="Normally leave blank so BigQuery infers the query location from referenced datasets." /><Checkbox checked={limitBytesBilled} onCheckedChange={toggleLimit} label="Limit bytes billed per query" /><TextInput label="Maximum bytes billed" id="bq-max" inputMode="numeric" placeholder="Positive decimal bytes" value={draft.maximumBytesBilled} onValueChange={(text) => set('maximumBytesBilled', text)} disabled={!limitBytesBilled} hint={limitBytesBilled ? 'BigQuery rejects jobs whose billed bytes exceed this value.' : 'No maximumBytesBilled job option will be supplied.'} /></div></CollapsibleSection></div><div className={[styles.testMsg, styles.info].join(' ')}>Authentication uses Google Application Default Credentials (ADC). DataKoala does not import or store service-account JSON, tokens, or credentials.</div>{message && <div className={[styles.testMsg, message.ok ? styles.ok : styles.err].join(' ')} role={message.ok ? 'status' : 'alert'}>{message.text}</div>}<div className={[styles.actions].join(' ')}><button type="button" className={['btn', 'ghost'].join(' ')} onClick={() => void test()} disabled={busy}>{busy ? 'Testing…' : 'Test'}</button><button type="button" className={['btn', 'ghost'].join(' ')} onClick={onClose}>Cancel</button><button type="button" className={['btn', 'primary'].join(' ')} onClick={() => void save()} disabled={busy}>Save</button></div></div></div>
}

function PrometheusConnectionModal({ existing, onClose, onSaved, onBack }: FormProps & { existing: PrometheusProfile | null }) {
  const [name, setName] = useState(existing?.name ?? 'Prometheus'); const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null); const [gcxVersion, setGcxVersion] = useState<string | null>(null); const [datasources, setDatasources] = useState<PrometheusDatasourceOption[]>([]); const [datasourceUid, setDatasourceUid] = useState(existing?.transport.datasourceUid ?? ''); const [datasourceError, setDatasourceError] = useState<string | null>(null); const [loadingDatasources, setLoadingDatasources] = useState(true); const [busy, setBusy] = useState(false)
  const baseTransport = () => ({ kind: 'gcx' as const, ...(existing?.transport.context ? { context: existing.transport.context } : {}) }); const transport = () => ({ ...baseTransport(), ...(datasourceUid ? { datasourceUid } : {}) }); const profile = (): PrometheusProfile => ({ kind: 'prometheus', version: 1, id: existing?.id ?? '', name: name.trim(), readonly: true, transport: transport() })
  useEffect(() => { let active = true; setLoadingDatasources(true); api.connections.prometheus.discoverDatasources(baseTransport()).then((found: PrometheusDatasourceOption[]) => { if (!active) return; setDatasources(found); setDatasourceUid((current) => current || (found.length === 1 ? found[0].uid : '')); setDatasourceError(found.length ? null : 'No compatible Prometheus or Mimir datasources were found.') }).catch((error: unknown) => { if (active) setDatasourceError(failureMessage(error)) }).finally(() => { if (active) setLoadingDatasources(false) }); return () => { active = false } }, [])
  const test = async () => { if (!datasourceUid) return setMessage({ ok: false, text: 'Select a Prometheus datasource first.' }); setBusy(true); setMessage(null); try { const result = await api.connections.prometheus.discover(transport()); setGcxVersion(result.gcx?.version ?? null); setMessage({ ok: true, text: `Connected — discovered ${result.metricNames.length} metrics${result.metadataAvailable ? ' with metadata' : ''}.` }) } catch (error) { setMessage({ ok: false, text: failureMessage(error) }) } finally { setBusy(false) } }
  const save = async () => { if (!name.trim()) return setMessage({ ok: false, text: 'Connection name is required.' }); if (!datasourceUid) return setMessage({ ok: false, text: 'Select a Prometheus datasource first.' }); setBusy(true); try { const saved = await api.connections.upsert(profile()); onSaved(saved); onClose() } catch (error) { setMessage({ ok: false, text: failureMessage(error) }); setBusy(false) } }
  return <div className={[styles.modalOverlay].join(' ')} onClick={onClose}><div className={[styles.modal].join(' ')} role="dialog" aria-modal="true" aria-labelledby="prometheus-connection-title" onClick={(e) => e.stopPropagation()}><ConnectionFormHeader kind="prometheus" editing={!!existing} onBack={onBack} /><div className={[styles.field].join(' ')}><TextInput label="Connection name" id="prom-name" value={name} onValueChange={setName} /></div><div className={[styles.field].join(' ')}><label>Connection method</label><div className={[styles.connPreview].join(' ')}>Grafana Cloud via gcx</div></div><div className={[styles.field].join(' ')}><Combobox id="prom-datasource" label="Prometheus datasource" value={datasourceUid} onChange={setDatasourceUid} disabled={loadingDatasources} loading={loadingDatasources} placeholder="Select a datasource" options={datasources.map((datasource) => ({ value: datasource.uid, label: datasource.name }))} />{datasourceError && <div className={[styles.pasteHint].join(' ')} role="alert">{datasourceError}</div>}</div><div className={[styles.testMsg, styles.info].join(' ')}>Uses your existing authenticated gcx context. DataKoala never reads, copies, or stores gcx OAuth credentials.{gcxVersion && <> Detected <strong>gcx {gcxVersion}</strong>.</>}</div>{message && <div className={[styles.testMsg, message.ok ? styles.ok : styles.err].join(' ')} role={message.ok ? 'status' : 'alert'}>{message.text}</div>}<div className={[styles.actions].join(' ')}><button type="button" className={['btn', 'ghost'].join(' ')} onClick={() => void test()} disabled={busy}>{busy ? 'Working…' : 'Test & discover metrics'}</button><button type="button" className={['btn', 'ghost'].join(' ')} onClick={onClose}>Cancel</button><button type="button" className={['btn', 'primary'].join(' ')} onClick={() => void save()} disabled={busy}>Save</button></div></div></div>
}

function TempoConnectionModal({ existing, onClose, onSaved, onBack }: FormProps & { existing: TempoProfile | null }) {
  const [name, setName] = useState(existing?.name ?? 'Tempo'); const [context, setContext] = useState(existing?.transport.context ?? ''); const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null); const [busy, setBusy] = useState(false)
  const profile = (): TempoProfile => ({ kind: 'tempo', version: 1, id: existing?.id ?? '', name: name.trim(), readonly: true, transport: { kind: 'gcx', ...(context.trim() ? { context: context.trim() } : {}) } })
  const test = async () => { if (!name.trim()) return setMessage({ ok: false, text: 'Connection name is required.' }); setBusy(true); setMessage(null); try { const result = await api.connections.test(profile()); setMessage(result.ok ? { ok: true, text: 'Connected — Tempo trace access verified through gcx.' } : { ok: false, text: result.error }) } catch (error) { setMessage({ ok: false, text: failureMessage(error) }) } finally { setBusy(false) } }
  const save = async () => { if (!name.trim()) return setMessage({ ok: false, text: 'Connection name is required.' }); setBusy(true); try { onSaved(await api.connections.upsert(profile())); onClose() } catch (error) { setMessage({ ok: false, text: failureMessage(error) }) } finally { setBusy(false) } }
  return <div className={[styles.modalOverlay].join(' ')} onClick={onClose}><div className={[styles.modal].join(' ')} role="dialog" aria-modal="true" aria-labelledby="tempo-connection-title" onClick={(event) => event.stopPropagation()}><ConnectionFormHeader kind="tempo" editing={!!existing} onBack={onBack} /><div className={[styles.field].join(' ')}><TextInput label="Connection name" id="tempo-name" value={name} onValueChange={setName} /></div><div className={[styles.field].join(' ')}><label>Connection method</label><div className={[styles.connPreview].join(' ')}>Grafana Tempo via gcx</div></div><div className={[styles.field].join(' ')}><TextInput label="gcx context" id="tempo-context" value={context} onValueChange={setContext} placeholder="Current gcx context" /><div className={[styles.pasteHint].join(' ')}>Leave blank to use the current authenticated gcx context. Set a context when you keep multiple Grafana stacks configured.</div></div><div className={[styles.testMsg, styles.info].join(' ')}>Tempo remains a separate DataKoala datasource from Prometheus even when both reuse the same gcx authentication. This lets tabs stay independently attached to metrics or traces.</div>{message && <div className={[styles.testMsg, message.ok ? styles.ok : styles.err].join(' ')} role={message.ok ? 'status' : 'alert'}>{message.text}</div>}<div className={[styles.actions].join(' ')}><button type="button" className={['btn', 'ghost'].join(' ')} onClick={() => void test()} disabled={busy}>{busy ? 'Testing…' : 'Test trace access'}</button><button type="button" className={['btn', 'ghost'].join(' ')} onClick={onClose}>Cancel</button><button type="button" className={['btn', 'primary'].join(' ')} onClick={() => void save()} disabled={busy}>{busy ? 'Working…' : 'Save'}</button></div></div></div>
}


export function LokiConnectionModal({ existing, onClose, onSaved, onBack, active = true }: FormProps & { existing: LokiProfile | null }) {
  type DiscoveryState = 'idle' | 'discovering' | 'ready' | 'empty' | 'error'
  const savedUid = existing?.transport.datasourceUid ?? ''
  const [name, setName] = useState(existing?.name ?? 'Loki')
  const [context, setContext] = useState(existing?.transport.context ?? '')
  const [selectedUid, setSelectedUid] = useState(savedUid)
  const [manualUid, setManualUid] = useState('')
  const [manualOpen, setManualOpen] = useState(false)
  const [datasources, setDatasources] = useState<LokiDatasourceOption[]>([])
  const [discoveryState, setDiscoveryState] = useState<DiscoveryState>('idle')
  const [discoveryError, setDiscoveryError] = useState<string | null>(null)
  const [savedDatasourceMissing, setSavedDatasourceMissing] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const discoveryRevision = useRef(0)
  const discoveredContext = useRef<string | null>(null)
  const manualUidRef = useRef('')
  const savedFallbackRef = useRef(false)
  const effectiveUid = selectedUid.trim() || manualUid.trim()
  const selectedDatasource = datasources.find((source) => source.uid === selectedUid)
  const contextLabel = context.trim() || 'Current gcx context'
  const transport = () => ({ kind: 'gcx' as const, ...(context.trim() ? { context: context.trim() } : {}), ...(effectiveUid ? { datasourceUid: effectiveUid } : {}) })
  const profile = (): LokiProfile => ({ kind: 'loki', version: 1, id: existing?.id ?? '', name: name.trim(), readonly: true, transport: transport() })

  const discover = async (nextContext = context.trim(), preserveSaved = false) => {
    const revision = ++discoveryRevision.current
    const previousContext = discoveredContext.current
    const contextChanged = previousContext !== null && previousContext !== nextContext
    const manualForRequest = contextChanged ? '' : manualUidRef.current.trim()
    const protectSaved = !contextChanged && Boolean(savedUid) && (preserveSaved || savedFallbackRef.current)
    discoveredContext.current = nextContext
    setDiscoveryState('discovering'); setDiscoveryError(null); setSavedDatasourceMissing(false); setDatasources([]); setSelectedUid(''); setMessage(null)
    if (contextChanged) { manualUidRef.current = ''; savedFallbackRef.current = false; setManualUid(''); setManualOpen(false) }
    try {
      const found = await api.connections.loki.discover({ kind: 'gcx', ...(nextContext ? { context: nextContext } : {}) })
      if (revision !== discoveryRevision.current) return
      setDatasources(found)
      const savedFound = protectSaved && found.some((source) => source.uid === savedUid)
      if (savedFound) {
        setSelectedUid(savedUid); setManualUid(''); manualUidRef.current = ''; savedFallbackRef.current = false; setManualOpen(false)
      } else if (protectSaved) {
        setManualUid(savedUid); manualUidRef.current = savedUid; savedFallbackRef.current = true; setSavedDatasourceMissing(true); setManualOpen(true)
      } else if (manualForRequest) {
        setManualUid(manualForRequest); manualUidRef.current = manualForRequest; setManualOpen(true)
      } else {
        setSelectedUid(found.length === 1 ? found[0].uid : '')
        if (found.length > 0) setManualOpen(false)
      }
      if (found.length === 0) { setDiscoveryState('empty'); setManualOpen(true) } else setDiscoveryState('ready')
    } catch (caught) {
      if (revision !== discoveryRevision.current) return
      if (protectSaved) { setManualUid(savedUid); manualUidRef.current = savedUid; savedFallbackRef.current = true; setSavedDatasourceMissing(true) }
      else if (manualForRequest) { setManualUid(manualForRequest); manualUidRef.current = manualForRequest }
      setDiscoveryState('error'); setDiscoveryError(failureMessage(caught)); setManualOpen(true)
    }
  }

  useEffect(() => { if (active) void discover(context.trim(), true); return () => { discoveryRevision.current += 1 } }, [active])
  const refreshForContext = () => { if (active && discoveredContext.current !== context.trim()) void discover(context.trim()) }
  const chooseDatasource = (uid: string) => { setSelectedUid(uid); if (uid) { setManualUid(''); manualUidRef.current = ''; savedFallbackRef.current = false; setSavedDatasourceMissing(false); setManualOpen(false) } setMessage(null) }
  const enterManualUid = (uid: string) => { setManualUid(uid); manualUidRef.current = uid; savedFallbackRef.current = uid.trim() === savedUid && Boolean(savedUid); if (uid.trim()) setSelectedUid(''); setMessage(null) }
  const missingDatasourceMessage = datasources.length > 1 ? 'Choose one of the discovered Loki datasources before continuing.' : 'Choose a Loki datasource before continuing.'
  const test = async () => {
    if (!effectiveUid) return setMessage({ ok: false, text: missingDatasourceMessage })
    setBusy(true); setMessage(null)
    try {
      const result = await api.connections.test(profile())
      const datasourceName = selectedDatasource?.name ?? 'the manually configured Loki datasource'
      setMessage(result.ok ? { ok: true, text: `Connected — ${datasourceName} is available through ${contextLabel}.` } : { ok: false, text: result.error })
    } catch (caught) { setMessage({ ok: false, text: failureMessage(caught) }) } finally { setBusy(false) }
  }
  const save = async () => {
    if (!name.trim()) return setMessage({ ok: false, text: 'Connection name is required.' })
    if (!effectiveUid) return setMessage({ ok: false, text: missingDatasourceMessage })
    setBusy(true)
    try { onSaved(await api.connections.upsert(profile())); onClose() } catch (caught) { setMessage({ ok: false, text: failureMessage(caught) }); setBusy(false) }
  }
  const datasourceOptions = datasources.map((source) => ({ value: source.uid, label: source.name, subtitle: `${source.type} · ID ${source.uid}` }))
  const discoveryMessage = discoveryState === 'discovering' ? 'Discovering Loki datasources…'
    : discoveryState === 'ready' && datasources.length === 1 ? `One Loki datasource found in ${contextLabel} and selected automatically.`
      : discoveryState === 'ready' ? `${datasources.length} Loki datasources found in ${contextLabel}. Choose the one you want to explore.`
        : discoveryState === 'empty' ? `No Loki datasource found in ${contextLabel}.`
          : null
  const canUseDatasource = Boolean(effectiveUid) && discoveryState !== 'discovering'

  return <div className={styles.modalOverlay} onClick={onClose}><div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="loki-connection-title" onClick={(event) => event.stopPropagation()}>
    <ConnectionFormHeader kind="loki" editing={!!existing} onBack={onBack} />
    <div className={styles.field}><TextInput label="Connection name" id="loki-name" value={name} onValueChange={setName} /></div>
    <div className={styles.field}><TextInput label="gcx context" id="loki-context" value={context} onValueChange={setContext} onBlur={refreshForContext} placeholder="Current gcx context" /><div className={styles.pasteHint}>Discovering from: <strong>{contextLabel}</strong>. Change the context, then leave this field or use Discover again.</div></div>
    <div className={styles.field}><div className={styles.discoveryHeading}><button type="button" className="btn ghost" onClick={() => void discover(context.trim())} disabled={discoveryState === 'discovering'}>{discoveryState === 'idle' ? 'Discover' : 'Discover again'}</button></div><Combobox label="Loki datasource" value={selectedUid} options={datasourceOptions} onChange={chooseDatasource} searchable disabled={discoveryState === 'discovering' || datasources.length === 0} loading={discoveryState === 'discovering'} placeholder={datasources.length > 1 ? 'Choose a Loki datasource' : 'No datasource selected'} emptyMessage="No Loki datasources discovered" />
      {discoveryMessage && <div className={styles.discoveryStatus} role="status">{discoveryMessage}</div>}
      {discoveryState === 'error' && <div className={[styles.testMsg, styles.err].join(' ')} role="alert"><strong>Datasource discovery failed.</strong> {discoveryError}<br />Check that gcx is installed. Run <code>gcx login</code>, or re-authenticate {context.trim() ? `the ${context.trim()} context` : 'your current gcx context'}.</div>}
      {savedDatasourceMissing && <div className={styles.fieldError} role="status">The saved Loki datasource was not found in {contextLabel}. Its saved ID remains available under Advanced, or choose a different discovered datasource deliberately.</div>}
      {datasources.length > 1 && !selectedUid && !manualUid.trim() && <div className={styles.fieldError}>Selection required: choose one of the discovered Loki datasources.</div>}
    </div>
    <div className={styles.bqAdvanced}><CollapsibleSection title="Advanced — enter a datasource UID manually" open={manualOpen} onOpenChange={setManualOpen}><div className={styles.advancedFields}><TextInput label="Datasource UID" id="loki-uid" value={manualUid} onValueChange={enterManualUid} placeholder="Enter a datasource UID" /><div className={styles.pasteHint}>Use this only when authenticated discovery cannot list the datasource.</div></div></CollapsibleSection></div>
    <div className={[styles.testMsg, styles.info].join(' ')}>Uses your existing gcx authentication. DataKoala never reads, copies, or stores Grafana credentials.</div>
    {message && <div className={[styles.testMsg, message.ok ? styles.ok : styles.err].join(' ')} role={message.ok ? 'status' : 'alert'}>{message.text}</div>}
    <div className={styles.actions}><button type="button" className="btn ghost" onClick={() => void test()} disabled={busy || !canUseDatasource}>{busy ? 'Testing…' : 'Test datasource'}</button><button type="button" className="btn ghost" onClick={onClose}>Cancel</button><button type="button" className="btn primary" onClick={() => void save()} disabled={busy || !canUseDatasource}>{busy ? 'Working…' : 'Save'}</button></div>
  </div></div>
}

export function ConnectionModal(props: Props) {
  const [kind, setKind] = useState<DataSourceProfile['kind'] | null>(props.existing?.kind ?? null)
  const [visited, setVisited] = useState<DataSourceKind[]>([])
  if (!props.existing) {
    const select = (next: DataSourceKind) => { setVisited((current) => current.includes(next) ? current : [...current, next]); setKind(next) }
    const onPickerKeyDown = (event: KeyboardEvent<HTMLDivElement>) => { if (!['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'].includes(event.key)) return; event.preventDefault(); const cards = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')); const index = Math.max(0, cards.indexOf(document.activeElement as HTMLButtonElement)); cards[(index + (event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : cards.length - 1)) % cards.length]?.focus() }
    return <>{!kind && <div className={[styles.modalOverlay].join(' ')} onClick={props.onClose}><div className={[styles.modal, styles.connectionPicker].join(' ')} role="dialog" aria-modal="true" aria-labelledby="connection-picker-title" onClick={(event) => event.stopPropagation()}><div className={[styles.wizardSteps].join(' ')}>Step 1 of 2 · Source</div><h2 id="connection-picker-title">Choose a connection type</h2><p className={[styles.connectionPickerIntro].join(' ')}>Select where your data lives. You can return here before saving.</p><div className={[styles.connectionSourceGrid].join(' ')} role="radiogroup" aria-label="Connection types" onKeyDown={onPickerKeyDown}>{CONNECTION_SOURCE_DESCRIPTORS.map((source, index) => { const disabled = !source.supportsCreate; return <button key={source.kind} type="button" role="radio" aria-checked="false" aria-disabled={disabled} disabled={disabled} tabIndex={disabled ? -1 : index === 0 ? 0 : -1} className={[styles.connectionSourceCard].join(' ')} onClick={() => !disabled && select(source.kind as DataSourceKind)}><span className={[styles.sourceIcon].join(' ')}><SourceIcon type={source.icon} /></span><span className={[styles.sourceCardCopy].join(' ')}><strong>{source.label}</strong><span>{source.description}</span><small>{source.hint}</small></span></button> })}</div><div className={[styles.actions].join(' ')}><button type="button" className={['btn', 'ghost'].join(' ')} onClick={props.onClose}>Cancel</button></div></div></div>}{visited.map((item) => <div key={item} className={kind === item ? undefined : styles.wizardFormHidden} aria-hidden={kind !== item}>{item === 'postgres' ? <PostgresConnectionModal {...props} existing={null} active={kind === item} onBack={() => setKind(null)} /> : item === 'local-files' ? <LocalFilesConnectionModal {...props} existing={null} active={kind === item} onBack={() => setKind(null)} /> : item === 'sqlite-file' ? <SqliteFileConnectionModal {...props} existing={null} active={kind === item} onBack={() => setKind(null)} /> : item === 'bigquery' ? <BigQueryConnectionModal {...props} existing={null} active={kind === item} onBack={() => setKind(null)} /> : item === 'tempo' ? <TempoConnectionModal {...props} existing={null} active={kind === item} onBack={() => setKind(null)} /> : item === 'loki' ? <LokiConnectionModal {...props} existing={null} active={kind === item} onBack={() => setKind(null)} /> : <PrometheusConnectionModal {...props} existing={null} active={kind === item} onBack={() => setKind(null)} />}</div>)}</>
  }
  return props.existing.kind === 'local-files' ? <LocalFilesConnectionModal {...props} existing={props.existing} /> : props.existing.kind === 'sqlite-file' ? <SqliteFileConnectionModal {...props} existing={props.existing} /> : props.existing.kind === 'bigquery' ? <BigQueryConnectionModal {...props} existing={props.existing} /> : props.existing.kind === 'prometheus' ? <PrometheusConnectionModal {...props} existing={props.existing} /> : props.existing.kind === 'tempo' ? <TempoConnectionModal {...props} existing={props.existing} /> : props.existing.kind === 'loki' ? <LokiConnectionModal {...props} existing={props.existing} /> : <PostgresConnectionModal {...props} existing={props.existing as ConnectionProfile} />
}
