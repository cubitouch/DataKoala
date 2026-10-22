import { useConnectionOperation } from './useConnectionOperation'
import { Modal } from '@components/ui/Modal'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ConnectionProfile, PostgresTlsMode } from '@shared/types'
import {
  parseConnectionString,
  buildConnectionString,
  DEFAULT_PORT,
} from '@shared/connString'
import { formatProxyDbCommand } from '@shared/teleport'
import { api } from '@lib/api'
import { Checkbox } from '@components/ui/Checkbox'
import { Combobox } from '@components/ui/combobox'
import { TextInput } from '@components/ui/TextInput'
import {
  buildConnectionProfileDraft,
  draftFromProfile,
  DEFAULT_TUNNEL_PORT,
  type ConnectionDraft,
  type ConnectionDraftErrors,
  type ConnectionDraftField,
} from '@lib/connectionDraft'
import { ConnectionFormHeader } from './ConnectionFormHeader'
import type { ConnectionFormProps } from './connectionFormTypes'
import { failureMessage } from './connectionFormTypes'
import styles from './ConnectionModal.module.css'

const blank: ConnectionProfile = {
  kind: 'postgres',
  version: 2,
  id: '',
  name: '',
  host: 'localhost',
  port: DEFAULT_PORT,
  database: '',
  user: 'postgres',
  password: '',
  hasPassword: false,
  credentialState: 'none',
  tlsMode: 'disable',
  tlsCa: '',
  readonly: true,
}
const EXAMPLE = 'postgres://user@localhost:5432/mydb'
/** Shown as the effective host while a tunnel is on (the tunnel binds loopback). */
const TUNNEL_HOST_LABEL = 'localhost'
const connectionFields = new Set<keyof ConnectionDraft>([
  'host',
  'port',
  'database',
  'user',
  'password',
  'tlsMode',
  'tlsCa',
  'teleportEnabled',
  'teleportDbService',
  'teleportTunnelPort',
  'teleportTshPath',
])
const fieldOrder: ConnectionDraftField[] = [
  'name',
  'host',
  'port',
  'database',
  'user',
  'teleportDbService',
  'teleportTunnelPort',
]

const TLS_MODE_OPTIONS = [
  { value: 'disable', label: 'Disabled', subtitle: 'No TLS' },
  {
    value: 'require',
    label: 'Require TLS',
    subtitle: 'Encrypted, certificate not verified',
  },
  {
    value: 'verify-ca',
    label: 'Verify CA',
    subtitle: 'Verify certificate authority',
  },
  {
    value: 'verify-full',
    label: 'Verify server identity',
    subtitle: 'Verify CA + hostname — recommended',
  },
]
type TestState =
  | { status: 'idle' }
  | { status: 'testing' }
  | { status: 'success' | 'error' | 'cancelled'; message: string }
type Tab = 'connection' | 'advanced'

export function PostgresConnectionModal({
  existing,
  onClose,
  onSaved,
  onBack,
  active = true,
}: ConnectionFormProps & { existing: ConnectionProfile | null }) {
  const operation = useConnectionOperation(active)
  const [draft, setDraft] = useState(() => draftFromProfile(existing ?? blank))
  const [errors, setErrors] = useState<ConnectionDraftErrors>({})
  const [testState, setTestState] = useState<TestState>({ status: 'idle' })
  const [saving, setSaving] = useState(false)
  const [pasted, setPasted] = useState('')
  const [parseError, setParseError] = useState<string | null>(null)
  const [parseWarnings, setParseWarnings] = useState<string[]>([])
  const [parsedOk, setParsedOk] = useState(false)
  const [tab, setTab] = useState<Tab>('connection')
  const [serviceOptions, setServiceOptions] = useState<string[]>([])
  const [serviceLoading, setServiceLoading] = useState(false)
  const [serviceError, setServiceError] = useState<string | null>(null)
  const [serviceLoaded, setServiceLoaded] = useState(false)
  const requestRevision = useRef(0)
  const fieldRefs = useRef<
    Partial<Record<ConnectionDraftField, HTMLInputElement | null>>
  >({})

  useEffect(() => {
    if (!active) requestRevision.current += 1
  }, [active])
  useEffect(
    () => () => {
      requestRevision.current += 1
    },
    [],
  )

  const updateDraft = (
    patch: Partial<ConnectionDraft>,
    affectsConnection = false,
  ) => {
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
      // Edits invalidate Test delivery, but Save still owns its captured draft.
      if (testState.status === 'testing') operation.cancel()
      requestRevision.current += 1
      setTestState({ status: 'idle' })
    }
  }

  const set = (patch: Partial<ConnectionDraft>) => {
    const affectsConnection = Object.keys(patch).some((key) =>
      connectionFields.has(key as keyof ConnectionDraft),
    )
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
    updateDraft(
      {
        host: v.host,
        port: String(v.port),
        database: v.database,
        user: v.user,
        password: v.password,
        tlsMode: v.tlsMode,
        name: draft.name || (v.database ? `${v.database} @ ${v.host}` : v.host),
      },
      true,
    )
    setParseWarnings(res.warnings)
    setParsedOk(true)
  }

  const showValidation = (nextErrors: ConnectionDraftErrors) => {
    setErrors(nextErrors)
    setTestState({
      status: 'error',
      message: 'Check the highlighted connection details.',
    })
    const first = fieldOrder.find((field) => nextErrors[field])
    if (!first) return
    // The offending field may live on the other tab, so surface that tab before
    // focusing it; otherwise the message points at nothing visible.
    setTab(first.startsWith('teleport') ? 'advanced' : 'connection')
    requestAnimationFrame(() => fieldRefs.current[first]?.focus())
  }

  /**
   * Discovery runs in the background, once, the first time the service dropdown
   * is opened. It never assumes `tsh` is installed; failures show inline and the
   * field stays free-text.
   */
  const loadServices = async () => {
    if (serviceLoaded || serviceLoading) return
    setServiceLoading(true)
    setServiceError(null)
    try {
      const tshPath = draft.teleportTshPath.trim()
      const res = await api.connections.teleport.discover(
        tshPath ? { tshPath } : undefined,
      )
      if (!res.ok) {
        setServiceError(res.error)
        return
      }
      setServiceOptions(res.databases.map((database) => database.name))
      setServiceLoaded(true)
    } catch (error) {
      setServiceError(failureMessage(error))
    } finally {
      setServiceLoading(false)
    }
  }

  useEffect(() => {
    setServiceOptions([])
    setServiceLoaded(false)
    setServiceError(null)
  }, [draft.teleportTshPath])

  useEffect(() => {
    if (!active) {
      setSaving(false)
      setTestState({ status: 'idle' })
    }
  }, [active])
  const test = async () => {
    const token = operation.begin()
    if (!token) return
    try {
      const built = buildConnectionProfileDraft(draft)
      if (!built.ok) return showValidation(built.errors)
      setErrors({})
      const revision = ++requestRevision.current
      setTestState({ status: 'testing' })
      try {
        const res = await api.connections.test(built.profile)
        if (!operation.current(token)) return
        if (revision !== requestRevision.current) return
        if (res?.ok === true)
          setTestState({
            status: 'success',
            message: `Connected — server ${res.serverVersion || 'unknown'}`,
          })
        else setTestState({ status: 'error', message: failureMessage(res) })
      } catch (error) {
        if (!operation.current(token)) return
        if (revision === requestRevision.current)
          setTestState({ status: 'error', message: failureMessage(error) })
      }
    } finally {
      operation.finish(token)
    }
  }

  const cancelTest = () => {
    if (testState.status !== 'testing') return
    operation.cancel()
    requestRevision.current += 1
    setTestState({ status: 'cancelled', message: 'Connection test cancelled.' })
  }

  const save = async () => {
    const token = operation.begin()
    if (!token) return
    try {
      const built = buildConnectionProfileDraft(draft, { requireName: true })
      if (!built.ok) return showValidation(built.errors)
      setErrors({})
      setSaving(true)
      try {
        const saved = await api.connections.upsert(built.profile)
        if (!operation.current(token)) return
        onSaved(saved)
        onClose()
      } catch (error) {
        if (!operation.current(token)) return
        setTestState({ status: 'error', message: failureMessage(error) })
      } finally {
        if (operation.current(token)) setSaving(false)
      }
    } finally {
      operation.finish(token)
    }
  }

  const tunnel = draft.teleportEnabled
  // What a tunnel overrides, shown in the disabled fields; the draft keeps the
  // original values so turning the tunnel off restores them.
  const effective = tunnel
    ? {
        host: TUNNEL_HOST_LABEL,
        port: draft.teleportTunnelPort,
        password: '',
        tlsMode: 'disable',
      }
    : {
        host: draft.host,
        port: draft.port,
        password: draft.password,
        tlsMode: draft.tlsMode,
      }
  const normalized = useMemo(() => buildConnectionProfileDraft(draft), [draft])
  const preview = normalized.ok
    ? buildConnectionString(normalized.profile, { maskPassword: true })
    : ''
  const teleportCommand = useMemo(() => {
    if (!tunnel || !draft.teleportDbService.trim()) return ''
    return formatProxyDbCommand({
      mode: 'teleport',
      dbService: draft.teleportDbService.trim(),
      ...(draft.user.trim() ? { dbUser: draft.user.trim() } : {}),
      ...(draft.database.trim() ? { dbName: draft.database.trim() } : {}),
      ...(draft.teleportTshPath.trim()
        ? { tshPath: draft.teleportTshPath.trim() }
        : {}),
      tunnelPort:
        Number(draft.teleportTunnelPort.trim()) || DEFAULT_TUNNEL_PORT,
    })
  }, [draft, tunnel])

  const inputProps = (field: ConnectionDraftField) => ({
    ref: (node: HTMLInputElement | null) => {
      fieldRefs.current[field] = node
    },
    error: errors[field],
  })

  return (
    <Modal
      open={active}
      onClose={onClose}
      labelledBy="postgres-connection-title"
      restoreFocus={!onBack}
      dialogClassName={styles.modal}
    >
      <ConnectionFormHeader
        kind="postgres"
        editing={!!existing}
        onBack={onBack}
      />
      <div
        className={styles.tabs}
        role="tablist"
        aria-label="Connection settings"
      >
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'connection'}
          className={[styles.tab, tab === 'connection' && styles.tabActive]
            .filter(Boolean)
            .join(' ')}
          onClick={() => setTab('connection')}
        >
          Connection
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'advanced'}
          className={[styles.tab, tab === 'advanced' && styles.tabActive]
            .filter(Boolean)
            .join(' ')}
          onClick={() => setTab('advanced')}
        >
          Advanced
        </button>
      </div>

      {tab === 'connection' && (
        <div role="tabpanel" aria-label="Connection">
          {tunnel && (
            <div className={styles.tunnelNote} role="note">
              A Teleport tunnel is enabled on the Advanced tab. The greyed-out
              fields below are ignored: Database and User are the Teleport
              database name and user.
            </div>
          )}
          <div className={[styles.field].join(' ')}>
            <label htmlFor="connection-string">Paste a connection string</label>
            <textarea
              id="connection-string"
              className={[styles.connPaste].join(' ')}
              value={pasted}
              spellCheck={false}
              autoComplete="off"
              placeholder={EXAMPLE}
              disabled={tunnel}
              onChange={(e) => applyConnectionString(e.target.value)}
              rows={2}
              aria-invalid={parseError ? true : undefined}
              aria-describedby={
                parseError
                  ? 'connection-string-error'
                  : 'connection-string-hint'
              }
            />
            <div
              id="connection-string-hint"
              className={[styles.pasteHint].join(' ')}
            >
              Accepts <code>postgres://…</code>, <code>postgresql://…</code>, a{' '}
              <code>jdbc:</code> prefix, or libpq <code>host=… dbname=…</code>{' '}
              form. Fills in the fields below.
            </div>
            {parseError && (
              <div
                id="connection-string-error"
                className={[styles.testMsg, styles.err].join(' ')}
                role="alert"
              >
                {parseError}
              </div>
            )}
            {parsedOk && (
              <div className={[styles.testMsg, styles.ok].join(' ')}>
                Parsed{parseWarnings.length ? ' with notes' : ''} — check the
                fields below.
              </div>
            )}
            {parseWarnings.map((w) => (
              <div key={w} className={[styles.testMsg, styles.warn].join(' ')}>
                {w}
              </div>
            ))}
          </div>
          <div className={[styles.modalDivider].join(' ')}>
            <span>or enter details manually</span>
          </div>
          <div className={[styles.field].join(' ')}>
            <TextInput
              label="Profile name"
              id="profile-name"
              {...inputProps('name')}
              value={draft.name}
              onValueChange={(text) => set({ name: text })}
              placeholder="e.g. staging analytics"
            />
          </div>
          <div className={[styles.row].join(' ')}>
            <div className={[styles.field].join(' ')}>
              <TextInput
                label="Host"
                id="connection-host"
                {...inputProps('host')}
                value={effective.host}
                disabled={tunnel}
                onValueChange={(text) => set({ host: text })}
              />
            </div>
            <div className={[styles.field].join(' ')}>
              <TextInput
                label="Port"
                id="connection-port"
                {...inputProps('port')}
                inputMode="numeric"
                value={effective.port}
                disabled={tunnel}
                onValueChange={(text) => set({ port: text })}
              />
            </div>
          </div>
          <div className={[styles.row].join(' ')}>
            <div className={[styles.field].join(' ')}>
              <TextInput
                label="Database"
                id="connection-database"
                {...inputProps('database')}
                value={draft.database}
                onValueChange={(text) => set({ database: text })}
              />
            </div>
            <div className={[styles.field].join(' ')}>
              <TextInput
                label="User"
                id="connection-user"
                {...inputProps('user')}
                value={draft.user}
                onValueChange={(text) => set({ user: text })}
              />
            </div>
          </div>
          <div className={[styles.field].join(' ')}>
            <TextInput
              label="Password"
              id="connection-password"
              type="password"
              value={effective.password}
              disabled={tunnel}
              onValueChange={(text) =>
                set({
                  password: text,
                  hasPassword: text ? true : draft.hasPassword,
                })
              }
              placeholder={
                draft.hasPassword && !tunnel
                  ? 'Saved securely — leave blank to keep'
                  : ''
              }
            />
            {draft.hasPassword && !tunnel && (
              <button
                type="button"
                className={['btn', 'ghost', styles.savedPasswordAction].join(
                  ' ',
                )}
                onClick={() =>
                  set({
                    password: '',
                    hasPassword: false,
                    credentialState: 'none',
                  })
                }
              >
                Remove saved password
              </button>
            )}
            {draft.credentialState === 'legacy-plaintext' && !tunnel && (
              <div
                className={[styles.credentialWarning].join(' ')}
                role="alert"
              >
                This saved password is still stored using the legacy plaintext
                format because secure OS credential storage is unavailable. You
                can continue using it for this session, remove it, or retry
                secure storage.
                <button
                  type="button"
                  className={['btn', 'ghost'].join(' ')}
                  onClick={async () => {
                    try {
                      const updated =
                        await api.connections.retryCredentialMigration(draft.id)
                      if (updated.kind === 'postgres')
                        setDraft(draftFromProfile(updated))
                    } catch (error) {
                      setTestState({
                        status: 'error',
                        message: failureMessage(error),
                      })
                    }
                  }}
                >
                  Retry secure storage
                </button>
              </div>
            )}
          </div>
          <div className={[styles.field].join(' ')}>
            <Combobox
              id="connection-tls-mode"
              label="TLS mode"
              value={effective.tlsMode}
              options={TLS_MODE_OPTIONS}
              disabled={tunnel}
              onChange={(value) => set({ tlsMode: value as PostgresTlsMode })}
            />
            {!tunnel && draft.tlsMode === 'require' && (
              <div className={[styles.tlsWarning].join(' ')} role="alert">
                The connection is encrypted, but the server certificate is not
                verified. This compatibility mode does not protect against an
                active man-in-the-middle attack.
              </div>
            )}
          </div>
          {!tunnel &&
            (draft.tlsMode === 'verify-ca' ||
              draft.tlsMode === 'verify-full') && (
              <div className={[styles.field].join(' ')}>
                <label htmlFor="connection-tls-ca">
                  CA certificate (optional)
                </label>
                <textarea
                  id="connection-tls-ca"
                  className={[styles.connPaste, styles.caInput].join(' ')}
                  value={draft.tlsCa ?? ''}
                  spellCheck={false}
                  autoComplete="off"
                  rows={5}
                  onChange={(e) => set({ tlsCa: e.target.value })}
                  aria-describedby="connection-tls-ca-hint"
                />
                <div
                  id="connection-tls-ca-hint"
                  className={[styles.pasteHint].join(' ')}
                >
                  Leave blank to use system trusted certificate authorities.
                  Paste a PEM CA certificate or CA bundle for
                  private/self-signed servers.
                </div>
              </div>
            )}
          <div className={[styles.checkboxField].join(' ')}>
            <Checkbox
              className={styles.checkbox}
              checked={draft.readonly}
              onCheckedChange={(checked) => set({ readonly: checked })}
              label="Read-only (blocks writes)"
            />
          </div>
          {!tunnel && preview && (
            <div
              className={[styles.field, styles.connectionPreviewField].join(
                ' ',
              )}
            >
              <label>Will connect as</label>
              <div className={[styles.connPreview].join(' ')}>{preview}</div>
            </div>
          )}
        </div>
      )}

      {tab === 'advanced' && (
        <div role="tabpanel" aria-label="Advanced">
          <div className={styles.teleportSection}>
            <Checkbox
              className={styles.checkbox}
              checked={tunnel}
              onCheckedChange={(checked) => set({ teleportEnabled: checked })}
              label="Open a Teleport tunnel"
            />
            {tunnel && (
              <div className={styles.advancedFields}>
                <div className={[styles.field].join(' ')}>
                  <Combobox
                    id="teleport-db-service"
                    label="Teleport database service"
                    value={draft.teleportDbService}
                    options={serviceOptions.map((name) => ({
                      value: name,
                      label: name,
                    }))}
                    onChange={(name) => set({ teleportDbService: name })}
                    onOpenChange={(open) => {
                      if (open) void loadServices()
                    }}
                    placeholder="Search or type a service…"
                    searchable
                    allowCustomValue
                    loading={serviceLoading}
                    error={errors.teleportDbService ?? null}
                    loadingMessage="Discovering databases from tsh…"
                    emptyMessage="No databases found — type a service name"
                  />
                  {serviceError && (
                    <div
                      className={[styles.testMsg, styles.err].join(' ')}
                      role="alert"
                    >
                      {serviceError}
                    </div>
                  )}
                </div>
                <div className={[styles.row].join(' ')}>
                  <div className={[styles.field].join(' ')}>
                    <TextInput
                      label="Tunnel port"
                      id="teleport-tunnel-port"
                      {...inputProps('teleportTunnelPort')}
                      inputMode="numeric"
                      value={draft.teleportTunnelPort}
                      onValueChange={(text) =>
                        set({ teleportTunnelPort: text })
                      }
                    />
                  </div>
                  <div className={[styles.field].join(' ')}>
                    <TextInput
                      label="tsh path (optional)"
                      id="teleport-tsh-path"
                      value={draft.teleportTshPath}
                      onValueChange={(text) => set({ teleportTshPath: text })}
                      placeholder="tsh"
                    />
                  </div>
                </div>
                <div className={[styles.pasteHint].join(' ')}>
                  Requires an active <code>tsh login</code>. DataKoala runs{' '}
                  <code>tsh proxy db --tunnel</code> with the Database and User
                  from the Connection tab; host, port, TLS and password are
                  managed by Teleport.
                </div>
                {teleportCommand && (
                  <div className={[styles.field].join(' ')}>
                    <label>Command</label>
                    <div className={[styles.connPreview].join(' ')}>
                      {teleportCommand}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <div aria-live="polite" aria-atomic="true">
        {testState.status === 'testing' && (
          <div
            className={[styles.testMsg, styles.testingStatus].join(' ')}
            role="status"
          >
            <span
              className={[styles.loadingSpinner].join(' ')}
              aria-hidden="true"
            />
            Testing connection…
          </div>
        )}
        {testState.status !== 'idle' && testState.status !== 'testing' && (
          <div
            className={[
              styles.testMsg,
              styles.connectionTestResult,
              testState.status === 'success'
                ? styles.ok
                : testState.status === 'error'
                  ? styles.err
                  : styles.info,
            ].join(' ')}
            role={testState.status === 'error' ? 'alert' : 'status'}
          >
            {testState.message}
          </div>
        )}
      </div>
      <div className={[styles.actions].join(' ')}>
        <button
          type="button"
          className={['btn', 'ghost', styles.testButton].join(' ')}
          onClick={test}
          disabled={saving || testState.status === 'testing'}
          aria-busy={testState.status === 'testing'}
        >
          {testState.status === 'testing' && (
            <span
              className={[styles.loadingSpinner].join(' ')}
              aria-hidden="true"
            />
          )}
          {testState.status === 'testing' ? 'Testing…' : 'Test'}
        </button>
        {testState.status === 'testing' && (
          <button
            type="button"
            className={['btn', 'ghost'].join(' ')}
            onClick={cancelTest}
          >
            Cancel test
          </button>
        )}
        <button
          type="button"
          className={['btn', 'ghost'].join(' ')}
          onClick={onClose}
        >
          Cancel
        </button>
        <button
          type="button"
          className={['btn', 'primary'].join(' ')}
          onClick={save}
          disabled={saving || testState.status === 'testing'}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </Modal>
  )
}
