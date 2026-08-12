import React, { useEffect, useMemo, useRef, useState } from 'react'
void React
import type { BigQueryProfile, ConnectionProfile, DataSourceProfile, LocalFilesProfile, SqliteFileProfile } from '../../../shared/types'
import { parseConnectionString, buildConnectionString, DEFAULT_PORT } from '../../../shared/connString'
import { api } from '../lib/api'
import { Combobox } from './ui/combobox'
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

function PostgresConnectionModal({ existing, onClose, onSaved }: Props & { existing: ConnectionProfile | null }) {
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
      // Import semantics are replacement semantics: an omitted password deliberately clears it.
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
      if (res?.ok === true) {
        setTestState({ status: 'success', message: `Connected — server ${res.serverVersion || 'unknown'}` })
      } else {
        setTestState({ status: 'error', message: failureMessage(res) })
      }
    } catch (error) {
      if (revision === requestRevision.current) {
        setTestState({ status: 'error', message: failureMessage(error) })
      }
    }
  }

  const cancelTest = () => {
    if (testState.status !== 'testing') return
    // The IPC bridge cannot abort an in-flight backend call. Invalidating its revision
    // guarantees that its eventual response cannot change this modal's state.
    requestRevision.current += 1
    setTestState({ status: 'cancelled', message: 'Connection test cancelled.' })
  }

  const save = async () => {
    const built = buildConnectionProfileDraft(draft, { requireName: true })
    if (!built.ok) return showValidation(built.errors)
    setErrors({})
    setSaving(true)
    try {
      const saved = await api.connections.upsert(built.profile)
      onSaved(saved)
      onClose()
    } catch (error) {
      setTestState({ status: 'error', message: failureMessage(error) })
    } finally {
      setSaving(false)
    }
  }

  const normalized = useMemo(() => buildConnectionProfileDraft(draft), [draft])
  const preview = normalized.ok ? buildConnectionString(normalized.profile, { maskPassword: true }) : ''
  const inputProps = (field: ConnectionDraftField) => ({
    ref: (node: HTMLInputElement | null) => { fieldRefs.current[field] = node },
    'aria-invalid': errors[field] ? true : undefined,
    'aria-describedby': errors[field] ? `${field}-error` : undefined
  })
  const errorFor = (field: ConnectionDraftField) => errors[field]
    ? <div id={`${field}-error`} className="field-error" role="alert">{errors[field]}</div> : null

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="connection-modal-title" onClick={(e) => e.stopPropagation()}>
        <h2 id="connection-modal-title">{existing ? 'Edit connection' : 'New Postgres connection'}</h2>
        <div className="field">
          <label htmlFor="connection-string">Paste a connection string</label>
          <textarea id="connection-string" className="conn-paste" value={pasted} spellCheck={false} autoComplete="off"
            placeholder={EXAMPLE} onChange={(e) => applyConnectionString(e.target.value)} rows={2}
            aria-invalid={parseError ? true : undefined} aria-describedby={parseError ? 'connection-string-error' : 'connection-string-hint'} />
          <div id="connection-string-hint" className="paste-hint">Accepts <code>postgres://…</code>, <code>postgresql://…</code>, a <code>jdbc:</code> prefix, or libpq <code>host=… dbname=…</code> form. Fills in the fields below.</div>
          {parseError && <div id="connection-string-error" className="test-msg err" role="alert">{parseError}</div>}
          {parsedOk && <div className="test-msg ok">Parsed{parseWarnings.length ? ' with notes' : ''} — check the fields below.</div>}
          {parseWarnings.map((w) => <div key={w} className="test-msg warn">{w}</div>)}
        </div>
        <div className="modal-divider"><span>or enter details manually</span></div>
        <div className="field"><label htmlFor="profile-name">Profile name</label><input id="profile-name" {...inputProps('name')} value={draft.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. staging analytics" />{errorFor('name')}</div>
        <div className="row">
          <div className="field"><label htmlFor="connection-host">Host</label><input id="connection-host" {...inputProps('host')} value={draft.host} onChange={(e) => set({ host: e.target.value })} />{errorFor('host')}</div>
          <div className="field"><label htmlFor="connection-port">Port</label><input id="connection-port" {...inputProps('port')} inputMode="numeric" value={draft.port} onChange={(e) => set({ port: e.target.value })} />{errorFor('port')}</div>
        </div>
        <div className="row">
          <div className="field"><label htmlFor="connection-database">Database</label><input id="connection-database" {...inputProps('database')} value={draft.database} onChange={(e) => set({ database: e.target.value })} />{errorFor('database')}</div>
          <div className="field"><label htmlFor="connection-user">User</label><input id="connection-user" {...inputProps('user')} value={draft.user} onChange={(e) => set({ user: e.target.value })} />{errorFor('user')}</div>
        </div>
        <div className="field"><label htmlFor="connection-password">Password <span className="opt">— leave empty for proxy / IAM / .pgpass auth</span></label><input id="connection-password" type="password" value={draft.password} onChange={(e) => set({ password: e.target.value })} /></div>
        <div className="row">
          <label className="checkbox"><input type="checkbox" checked={draft.ssl} onChange={(e) => set({ ssl: e.target.checked })} />Use SSL</label>
          <label className="checkbox"><input type="checkbox" checked={draft.readonly} onChange={(e) => set({ readonly: e.target.checked })} />Read-only (blocks writes)</label>
        </div>
        {preview && <div className="field"><label>Will connect as</label><div className="conn-preview">{preview}</div></div>}
        <div aria-live="polite" aria-atomic="true">
          {testState.status === 'testing' && <div className="test-msg testing-status" role="status"><span className="loading-spinner" aria-hidden="true" />Testing connection…</div>}
          {testState.status !== 'idle' && testState.status !== 'testing' && (
            <div className={`test-msg connection-test-result ${testState.status === 'success' ? 'ok' : testState.status === 'error' ? 'err' : 'info'}`} role={testState.status === 'error' ? 'alert' : 'status'}>
              {testState.message}
            </div>
          )}
        </div>
        <div className="actions">
          <button type="button" className="btn ghost test-button" onClick={test} disabled={testState.status === 'testing'} aria-busy={testState.status === 'testing'}>
            {testState.status === 'testing' && <span className="loading-spinner" aria-hidden="true" />}{testState.status === 'testing' ? 'Testing…' : 'Test'}
          </button>
          {testState.status === 'testing' && <button type="button" className="btn ghost" onClick={cancelTest}>Cancel test</button>}
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          <button type="button" className="btn primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </div>
  )
}

function LocalFilesConnectionModal({ existing, onClose, onSaved }: Props & { existing: LocalFilesProfile | null }) {
  const [name, setName] = useState(existing?.name ?? 'Local files')
  const [files, setFiles] = useState(existing?.files ?? [])
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const profile = (): LocalFilesProfile => ({ kind: 'local-files', version: 1, id: existing?.id ?? '', name: name.trim(), files, readonly: true })
  const choose = async () => {
    try {
      const paths = await api.connections.chooseFiles()
      setFiles((current) => {
        const known = new Set(current.map((file) => file.path))
        const aliases = new Set(current.map((file) => file.alias.toLocaleLowerCase()))
        const additions = paths.filter((path: string) => !known.has(path)).map((path: string) => {
          const base = defaultFileAlias(path); let alias = base; let suffix = 2
          while (aliases.has(alias.toLocaleLowerCase())) alias = `${base}_${suffix++}`
          aliases.add(alias.toLocaleLowerCase()); return { path, alias }
        })
        return [...current, ...additions]
      })
      setMessage(null)
    } catch (error) {
      setMessage({ ok: false, text: failureMessage(error) })
    }
  }
  const test = async () => {
    if (!name.trim() || !files.length) return setMessage({ ok: false, text: 'Enter a name and choose at least one file.' })
    setBusy(true)
    try {
      const result = await api.connections.test(profile())
      setMessage(result.ok ? { ok: true, text: 'Files loaded successfully with DuckDB.' } : { ok: false, text: result.error })
    } catch (error) {
      setMessage({ ok: false, text: failureMessage(error) })
    } finally {
      setBusy(false)
    }
  }
  const save = async () => {
    if (!name.trim() || !files.length) return setMessage({ ok: false, text: 'Enter a name and choose at least one file.' })
    setBusy(true)
    try { onSaved(await api.connections.upsert(profile())); onClose() }
    catch (error) { setMessage({ ok: false, text: error instanceof Error ? error.message : String(error) }) }
    finally { setBusy(false) }
  }
  return <div className="modal-overlay" onClick={onClose}><div className="modal" role="dialog" aria-modal="true" aria-labelledby="local-files-title" onClick={(event) => event.stopPropagation()}>
    <h2 id="local-files-title">{existing ? 'Edit local files' : 'New local file connection'}</h2>
    <div className="field"><label htmlFor="local-profile-name">Connection name</label><input id="local-profile-name" value={name} onChange={(event) => setName(event.target.value)} /></div>
    <div className="field"><label>Data files</label><button type="button" className="btn ghost" onClick={() => void choose()}>Choose files…</button><div className="paste-hint">CSV, TSV, Parquet, JSON, JSONL, and NDJSON. Each file is exposed as a read-only SQL view.</div></div>
    {files.map((file, index) => <div className="row file-connection-row" key={file.path}>
      <div className="field"><label title={file.path}>{file.path.split(/[\\/]/).pop()}</label><input aria-label={`Table alias for ${file.path}`} value={file.alias} onChange={(event) => setFiles((current) => current.map((item, i) => i === index ? { ...item, alias: event.target.value } : item))} /></div>
      <button type="button" className="btn ghost" aria-label={`Remove ${file.path}`} onClick={() => setFiles((current) => current.filter((_, i) => i !== index))}>Remove</button>
    </div>)}
    {message && <div className={`test-msg ${message.ok ? 'ok' : 'err'}`} role={message.ok ? 'status' : 'alert'}>{message.text}</div>}
    <div className="actions"><button type="button" className="btn ghost" onClick={() => void test()} disabled={busy}>Test</button><button type="button" className="btn ghost" onClick={onClose}>Cancel</button><button type="button" className="btn primary" onClick={() => void save()} disabled={busy}>{busy ? 'Working…' : 'Save'}</button></div>
  </div></div>
}

function SqliteFileConnectionModal({ existing, onClose, onSaved }: Props & { existing: SqliteFileProfile | null }) {
  const [name, setName] = useState(existing?.name ?? 'SQLite database')
  const [path, setPath] = useState(existing?.path ?? '')
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const profile = (): SqliteFileProfile => ({ kind: 'sqlite-file', version: 1, id: existing?.id ?? '', name: name.trim(), path, readonly: true })
  const choose = async () => {
    try { const selected = await api.connections.chooseSqliteFile(); if (selected) { setPath(selected); setMessage(null) } }
    catch (error) { setMessage({ ok: false, text: failureMessage(error) }) }
  }
  const validate = () => name.trim() && path ? null : 'Enter a connection name and choose one SQLite database file.'
  const test = async () => {
    const error = validate(); if (error) return setMessage({ ok: false, text: error })
    setBusy(true)
    try { const result = await api.connections.test(profile()); setMessage(result.ok ? { ok: true, text: 'SQLite database opened directly in read-only mode.' } : { ok: false, text: result.error }) }
    catch (caught) { setMessage({ ok: false, text: failureMessage(caught) }) } finally { setBusy(false) }
  }
  const save = async () => {
    const error = validate(); if (error) return setMessage({ ok: false, text: error })
    setBusy(true)
    try { onSaved(await api.connections.upsert(profile())); onClose() }
    catch (caught) { setMessage({ ok: false, text: failureMessage(caught) }) } finally { setBusy(false) }
  }
  return <div className="modal-overlay" onClick={onClose}><div className="modal" role="dialog" aria-modal="true" aria-labelledby="sqlite-file-title" onClick={(event) => event.stopPropagation()}>
    <h2 id="sqlite-file-title">{existing ? 'Edit SQLite database' : 'New SQLite database connection'}</h2>
    <div className="field"><label htmlFor="sqlite-profile-name">Connection name</label><input id="sqlite-profile-name" value={name} onChange={(event) => setName(event.target.value)} /></div>
    <div className="field"><label>Database file</label><button type="button" className="btn ghost" onClick={() => void choose()}>Choose database…</button>{path && <div className="conn-preview" title={path}>{path}</div>}<div className="paste-hint">Select exactly one database file. Its SQLite contents are validated, so the filename extension does not matter. The database is attached directly in read-only mode.</div></div>
    {message && <div className={`test-msg ${message.ok ? 'ok' : 'err'}`} role={message.ok ? 'status' : 'alert'}>{message.text}</div>}
    <div className="actions"><button type="button" className="btn ghost" onClick={() => void test()} disabled={busy}>Test</button><button type="button" className="btn ghost" onClick={onClose}>Cancel</button><button type="button" className="btn primary" onClick={() => void save()} disabled={busy}>{busy ? 'Working…' : 'Save'}</button></div>
  </div></div>
}

function BigQueryConnectionModal({ existing, onClose, onSaved }: Props & { existing: BigQueryProfile | null }) {
  const [draft, setDraft] = useState(() => ({ name: existing?.name ?? '', billingProject: existing?.billingProject ?? '', defaultProject: existing?.defaultProject ?? '', defaultDataset: existing?.defaultDataset ?? '', location: existing?.location ?? '', maximumBytesBilled: existing?.maximumBytesBilled ?? '1073741824' }))
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null); const [busy, setBusy] = useState(false); const revision = useRef(0)
  const [projects, setProjects] = useState<BigQueryProjectOption[]>([])
  const [projectLoading, setProjectLoading] = useState(true); const [projectError, setProjectError] = useState<string | null>(null)
  const [datasets, setDatasets] = useState<BigQueryDatasetOption[]>([])
  const [datasetLoading, setDatasetLoading] = useState(false); const [datasetError, setDatasetError] = useState<string | null>(null)
  const [reference, setReference] = useState(''); const [referenceError, setReferenceError] = useState<string | null>(null)
  const datasetRevision = useRef(0); const untouched = useRef(!existing)
  useEffect(() => {
    let active = true
    void api.connections.bigquery.discoverProjects().then((values: BigQueryProjectOption[]) => { if (active) setProjects(values) }).catch(() => { if (active) setProjectError('Could not discover projects. You can still enter a project ID manually.') }).finally(() => { if (active) setProjectLoading(false) })
    if (!existing) void api.connections.bigquery.discoverDefaults().then(({ projectId }: { projectId?: string }) => { if (active && untouched.current && projectId) { setDraft((current) => ({ ...current, billingProject: projectId, defaultProject: projectId })); loadDatasets(projectId) } }).catch(() => undefined)
    return () => { active = false; revision.current++; datasetRevision.current++ }
  }, [existing])
  const loadDatasets = (projectId: string) => {
    const current = ++datasetRevision.current; setDatasets([]); setDatasetError(null)
    if (!projectId.trim()) { setDatasetLoading(false); return }
    setDatasetLoading(true)
    void api.connections.bigquery.listDatasets(projectId.trim()).then((values: BigQueryDatasetOption[]) => { if (current === datasetRevision.current) setDatasets(values) }).catch(() => { if (current === datasetRevision.current) setDatasetError('Could not discover datasets. You can still enter a dataset ID manually.') }).finally(() => { if (current === datasetRevision.current) setDatasetLoading(false) })
  }
  useEffect(() => { const projectId = existing?.defaultProject || existing?.billingProject; if (projectId) loadDatasets(projectId) }, [existing])
  const makeProfile = (): BigQueryProfile => ({ kind: 'bigquery', version: 1, id: existing?.id ?? '', name: draft.name.trim(), billingProject: draft.billingProject.trim(), defaultProject: draft.defaultProject.trim() || draft.billingProject.trim(), defaultDataset: draft.defaultDataset.trim() || undefined, location: draft.location.trim() || undefined, maximumBytesBilled: draft.maximumBytesBilled.trim(), readonly: true })
  const validate = () => !draft.name.trim() ? 'Enter a connection name.' : !draft.billingProject.trim() ? 'Enter a billing project.' : !/^\d+$/.test(draft.maximumBytesBilled) || BigInt(draft.maximumBytesBilled) <= 0n ? 'Maximum bytes billed must be a positive decimal integer.' : null
  const test = async () => { const error = validate(); if (error) return setMessage({ ok: false, text: error }); const current = ++revision.current; setBusy(true); setMessage(null); try { const result = await api.connections.test(makeProfile()); if (current === revision.current) setMessage(result.ok ? { ok: true, text: 'Credentials and metadata access verified.' } : { ok: false, text: result.error }) } catch (caught) { if (current === revision.current) setMessage({ ok: false, text: failureMessage(caught) }) } finally { if (current === revision.current) setBusy(false) } }
  const save = async () => { const error = validate(); if (error) return setMessage({ ok: false, text: error }); setBusy(true); try { onSaved(await api.connections.upsert(makeProfile())); onClose() } catch (caught) { setMessage({ ok: false, text: failureMessage(caught) }) } finally { setBusy(false) } }
  const set = (field: keyof typeof draft, value: string) => { untouched.current = false; revision.current++; setBusy(false); setMessage(null); setDraft((valueNow) => ({ ...valueNow, [field]: value })) }
  const setDataProject = (value: string, dataset = '') => { untouched.current = false; revision.current++; setBusy(false); setMessage(null); setDraft((current) => ({ ...current, defaultProject: value, defaultDataset: dataset })); loadDatasets(value) }
  const applyReference = (value: string) => {
    setReference(value); if (!value.trim()) return setReferenceError(null)
    const parsed = parseBigQueryReference(value)
    if (!parsed) return setReferenceError('Enter a valid BigQuery project and dataset reference.')
    setReferenceError(null); setDataProject(parsed.projectId, parsed.datasetId ?? '')
  }
  const projectOptions = useMemo(() => projects.map((project) => ({ value: project.projectId, label: project.friendlyName || project.projectId, subtitle: project.friendlyName ? project.projectId : undefined })), [projects])
  const datasetOptions = useMemo(() => [
    { value: '', label: 'All datasets', subtitle: 'No default dataset' },
    ...datasets.map((dataset) => ({ value: dataset.datasetId, label: dataset.datasetId, subtitle: [dataset.friendlyName, dataset.location].filter(Boolean).join(' · ') || undefined }))
  ], [datasets])
  const selectedDataset = datasets.find((dataset) => dataset.datasetId === draft.defaultDataset)
  return <div className="modal-overlay" onClick={onClose}><div className="modal" role="dialog" aria-modal="true" aria-labelledby="bigquery-title" onClick={(event) => event.stopPropagation()}>
    <h2 id="bigquery-title">{existing ? 'Edit BigQuery connection' : 'New BigQuery connection'}</h2>
    <div className="test-msg info">Authentication uses Google Application Default Credentials (ADC). DataKoala does not import or store service-account JSON, tokens, or credentials.</div>
    <div className="field"><label htmlFor="bq-name">Connection name</label><input id="bq-name" value={draft.name} onChange={(e) => set('name', e.target.value)} /></div>
    <div className="field"><label htmlFor="bq-reference">Paste BigQuery reference <span className="opt">— optional</span></label><input id="bq-reference" placeholder="project.dataset or projects/project/datasets/dataset" value={reference} onChange={(event) => applyReference(event.target.value)} aria-invalid={!!referenceError} />{referenceError && <div className="field-error" role="alert">{referenceError}</div>}</div>
    <div className="row"><div className="field"><label>Billing project</label><Combobox label="Billing project" value={draft.billingProject} options={projectOptions} onChange={(value) => set('billingProject', value)} searchable allowCustomValue loading={projectLoading} error={projectError} emptyMessage="No accessible projects. Enter a project ID manually." /></div><div className="field"><label>Data project <span className="opt">— defaults to billing project</span></label><Combobox label="Data project" value={draft.defaultProject} options={projectOptions} onChange={setDataProject} searchable allowCustomValue loading={projectLoading} error={projectError} emptyMessage="No accessible projects. Enter a project ID manually." /></div></div>
    <div className="field"><label>Dataset <span className="opt">— optional default</span></label><Combobox label="Dataset" value={draft.defaultDataset} options={datasetOptions} onChange={(value) => set('defaultDataset', value)} searchable allowCustomValue disabled={!draft.defaultProject.trim()} loading={datasetLoading} error={datasetError} placeholder="All datasets" emptyMessage="No datasets found. Enter a dataset ID manually." invalidationKey={draft.defaultProject} />{selectedDataset?.location && <div className="paste-hint" role="status">Dataset location: <strong>{selectedDataset.location}</strong></div>}<div className="paste-hint">All accessible datasets remain visible in the object tree. A selection only provides the default SQL context.</div></div>
    <details className="bq-advanced"><summary>Advanced</summary><div className="field"><label htmlFor="bq-location">Location override <span className="opt">— optional</span></label><input id="bq-location" placeholder="e.g. US or europe-west1" value={draft.location} onChange={(e) => set('location', e.target.value)} /><div className="paste-hint">Normally leave blank so BigQuery infers the query location from referenced datasets.</div></div><div className="field"><label htmlFor="bq-max">Maximum bytes billed <span className="opt">— decimal bytes</span></label><input id="bq-max" inputMode="numeric" value={draft.maximumBytesBilled} onChange={(e) => set('maximumBytesBilled', e.target.value)} /><div className="paste-hint">Applied to dry runs and every query. New connections default to 1 GiB.</div></div></details>
    {message && <div className={`test-msg ${message.ok ? 'ok' : 'err'}`} role={message.ok ? 'status' : 'alert'}>{message.text}</div>}
    <div className="actions"><button type="button" className="btn ghost" onClick={() => void test()} disabled={busy}>{busy ? 'Testing…' : 'Test'}</button><button type="button" className="btn ghost" onClick={onClose}>Cancel</button><button type="button" className="btn primary" onClick={() => void save()} disabled={busy}>Save</button></div>
  </div></div>
}

export function ConnectionModal(props: Props) {
  const [kind, setKind] = useState<DataSourceProfile['kind']>(props.existing?.kind ?? 'postgres')
  if (!props.existing) {
    const modal = kind === 'postgres'
      ? <PostgresConnectionModal {...props} existing={null} />
      : kind === 'local-files' ? <LocalFilesConnectionModal {...props} existing={null} /> : kind === 'sqlite-file' ? <SqliteFileConnectionModal {...props} existing={null} /> : <BigQueryConnectionModal {...props} existing={null} />
    return <>{<div className="connection-kind-switch" role="group" aria-label="Connection type">
      <button type="button" className={kind === 'postgres' ? 'active' : ''} onClick={() => setKind('postgres')}>PostgreSQL</button>
      <button type="button" className={kind === 'local-files' ? 'active' : ''} onClick={() => setKind('local-files')}>Local files</button>
      <button type="button" className={kind === 'sqlite-file' ? 'active' : ''} onClick={() => setKind('sqlite-file')}>SQLite database</button>
      <button type="button" className={kind === 'bigquery' ? 'active' : ''} onClick={() => setKind('bigquery')}>BigQuery</button>
    </div>}{modal}</>
  }
  return props.existing.kind === 'local-files' ? <LocalFilesConnectionModal {...props} existing={props.existing} />
    : props.existing.kind === 'sqlite-file' ? <SqliteFileConnectionModal {...props} existing={props.existing} />
    : props.existing.kind === 'bigquery' ? <BigQueryConnectionModal {...props} existing={props.existing} />
    : <PostgresConnectionModal {...props} existing={props.existing as ConnectionProfile} />
}
