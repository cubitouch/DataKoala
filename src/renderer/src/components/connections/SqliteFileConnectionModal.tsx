import { useState } from 'react'
import type { SqliteFileProfile } from '@shared/types'
import { api } from '@lib/api'
import { TextInput } from '@components/ui/TextInput'
import { ConnectionFormHeader } from './ConnectionFormHeader'
import type { ConnectionFormProps } from './connectionFormTypes'
import { failureMessage } from './connectionFormTypes'
import styles from './ConnectionModal.module.css'

export function SqliteFileConnectionModal({ existing, onClose, onSaved, onBack }: ConnectionFormProps & { existing: SqliteFileProfile | null }) {
  const [name, setName] = useState(existing?.name ?? 'SQLite database'); const [path, setPath] = useState(existing?.path ?? ''); const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null); const [busy, setBusy] = useState(false)
  const profile = (): SqliteFileProfile => ({ kind: 'sqlite-file', version: 1, id: existing?.id ?? '', name: name.trim(), path, readonly: true })
  const choose = async () => { try { const selected = await api.connections.chooseSqliteFile(); if (selected) { setPath(selected); setMessage(null) } } catch (error) { setMessage({ ok: false, text: failureMessage(error) }) } }
  const validate = () => name.trim() && path ? null : 'Enter a connection name and choose one SQLite database file.'
  const test = async () => { const error = validate(); if (error) return setMessage({ ok: false, text: error }); setBusy(true); try { const result = await api.connections.test(profile()); setMessage(result.ok ? { ok: true, text: 'SQLite database opened directly in read-only mode.' } : { ok: false, text: result.error }) } catch (caught) { setMessage({ ok: false, text: failureMessage(caught) }) } finally { setBusy(false) } }
  const save = async () => { const error = validate(); if (error) return setMessage({ ok: false, text: error }); setBusy(true); try { onSaved(await api.connections.upsert(profile())); onClose() } catch (caught) { setMessage({ ok: false, text: failureMessage(caught) }) } finally { setBusy(false) } }
  return <div className={[styles.modalOverlay].join(' ')} onClick={onClose}><div className={[styles.modal].join(' ')} role="dialog" aria-modal="true" aria-labelledby="sqlite-file-connection-title" onClick={(event) => event.stopPropagation()}><ConnectionFormHeader kind="sqlite-file" editing={!!existing} onBack={onBack} /><div className={[styles.field].join(' ')}><TextInput label="Connection name" id="sqlite-profile-name" value={name} onValueChange={setName} /></div><div className={[styles.field].join(' ')}><label>Database file</label><button type="button" className={['btn', 'ghost'].join(' ')} onClick={() => void choose()}>Choose database…</button>{path && <div className={[styles.connPreview].join(' ')} title={path}>{path}</div>}<div className={[styles.pasteHint].join(' ')}>Select exactly one database file. Its SQLite contents are validated, so the filename extension does not matter. The database is attached directly in read-only mode.</div></div>{message && <div className={[styles.testMsg, message.ok ? styles.ok : styles.err].join(' ')} role={message.ok ? 'status' : 'alert'}>{message.text}</div>}<div className={[styles.actions].join(' ')}><button type="button" className={['btn', 'ghost'].join(' ')} onClick={() => void test()} disabled={busy}>Test</button><button type="button" className={['btn', 'ghost'].join(' ')} onClick={onClose}>Cancel</button><button type="button" className={['btn', 'primary'].join(' ')} onClick={() => void save()} disabled={busy}>{busy ? 'Working…' : 'Save'}</button></div></div></div>
}
