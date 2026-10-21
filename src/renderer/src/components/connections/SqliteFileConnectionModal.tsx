import { useConnectionOperation } from './useConnectionOperation'
import { Modal } from '@components/ui/Modal'
import { useEffect, useState } from 'react'
import type { SqliteFileProfile } from '@shared/types'
import { api } from '@lib/api'
import { TextInput } from '@components/ui/TextInput'
import { ConnectionFormHeader } from './ConnectionFormHeader'
import type { ConnectionFormProps } from './connectionFormTypes'
import { failureMessage } from './connectionFormTypes'
import styles from './ConnectionModal.module.css'

export function SqliteFileConnectionModal({
  existing,
  onClose,
  onSaved,
  onBack,
  active = true,
}: ConnectionFormProps & { existing: SqliteFileProfile | null }) {
  const operation = useConnectionOperation(active)
  const [name, setName] = useState(existing?.name ?? 'SQLite database')
  const [path, setPath] = useState(existing?.path ?? '')
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
    null,
  )
  const [busy, setBusy] = useState(false)
  const profile = (): SqliteFileProfile => ({
    kind: 'sqlite-file',
    version: 1,
    id: existing?.id ?? '',
    name: name.trim(),
    path,
    readonly: true,
  })
  const choose = async () => {
    const token = operation.begin()
    if (!token) return
    try {
      const selected = await api.connections.chooseSqliteFile()
      if (!operation.current(token)) return
      if (selected) {
        setPath(selected)
        setMessage(null)
      }
    } catch (error) {
      if (!operation.current(token)) return
      setMessage({ ok: false, text: failureMessage(error) })
    } finally {
      operation.finish(token)
    }
  }
  const validate = () =>
    name.trim() && path
      ? null
      : 'Enter a connection name and choose one SQLite database file.'
  useEffect(() => {
    if (!active) {
      setBusy(false)
    }
  }, [active])
  const test = async () => {
    const token = operation.begin()
    if (!token) return
    try {
      const error = validate()
      if (error) return setMessage({ ok: false, text: error })
      setBusy(true)
      try {
        const result = await api.connections.test(profile())
        if (!operation.current(token)) return
        setMessage(
          result.ok
            ? {
                ok: true,
                text: 'SQLite database opened directly in read-only mode.',
              }
            : { ok: false, text: result.error },
        )
      } catch (caught) {
        if (!operation.current(token)) return
        setMessage({ ok: false, text: failureMessage(caught) })
      } finally {
        if (operation.current(token)) setBusy(false)
      }
    } finally {
      operation.finish(token)
    }
  }
  const save = async () => {
    const token = operation.begin()
    if (!token) return
    try {
      const error = validate()
      if (error) return setMessage({ ok: false, text: error })
      setMessage(null)
      setBusy(true)
      try {
        const savedProfile = await api.connections.upsert(profile())
        if (!operation.current(token)) return
        onSaved(savedProfile)
        onClose()
      } catch (caught) {
        if (!operation.current(token)) return
        setMessage({ ok: false, text: failureMessage(caught) })
      } finally {
        if (operation.current(token)) setBusy(false)
      }
    } finally {
      operation.finish(token)
    }
  }
  return (
    <Modal
      open={active}
      onClose={onClose}
      labelledBy="sqlite-file-connection-title"
      restoreFocus={!onBack}
      dialogClassName={styles.modal}
    >
      <ConnectionFormHeader
        kind="sqlite-file"
        editing={!!existing}
        onBack={onBack}
      />
      <div className={[styles.field].join(' ')}>
        <TextInput
          label="Connection name"
          id="sqlite-profile-name"
          value={name}
          onValueChange={setName}
        />
      </div>
      <div className={[styles.field].join(' ')}>
        <label>Database file</label>
        <button
          type="button"
          className={['btn', 'ghost'].join(' ')}
          onClick={() => void choose()}
        >
          Choose database…
        </button>
        {path && (
          <div className={[styles.connPreview].join(' ')} title={path}>
            {path}
          </div>
        )}
        <div className={[styles.pasteHint].join(' ')}>
          Select exactly one database file. Its SQLite contents are validated,
          so the filename extension does not matter. The database is attached
          directly in read-only mode.
        </div>
      </div>
      {message && (
        <div
          className={[styles.testMsg, message.ok ? styles.ok : styles.err].join(
            ' ',
          )}
          role={message.ok ? 'status' : 'alert'}
        >
          {message.text}
        </div>
      )}
      <div className={[styles.actions].join(' ')}>
        <button
          type="button"
          className={['btn', 'ghost'].join(' ')}
          onClick={() => void test()}
          disabled={busy}
        >
          Test
        </button>
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
          onClick={() => void save()}
          disabled={busy}
        >
          {busy ? 'Working…' : 'Save'}
        </button>
      </div>
    </Modal>
  )
}
