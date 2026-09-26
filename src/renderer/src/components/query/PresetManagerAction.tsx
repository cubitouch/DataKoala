import { useId, useRef, useState, type FormEvent } from 'react'
import { selectActiveSession, useStore, type QuerySession } from '@store/useStore'
import type { DataSourceProfile } from '@shared/types'
import { createPresetFromSession, type ExplorationPresetRepository, type SavedExplorationPreset } from '@lib/explorationPresets'
import { explorationPresetRepository } from '@lib/explorationPresetRepository'
import { notify } from '@components/ui/feedback/NotificationArea'
import { Modal } from '@components/ui/Modal'
import { TextInput } from '@components/ui/TextInput'
import styles from './PresetManagerAction.module.css'

export type PresetManagerRepository = Pick<ExplorationPresetRepository, 'create' | 'listForConnection' | 'rename' | 'delete'>

interface PresetManagerActionProps {
  /** Injection point for focused tests; production uses the localStorage repository. */
  repository?: PresetManagerRepository
  session?: QuerySession
  profile?: DataSourceProfile
}

function errorDetail(error: unknown): string {
  return error instanceof Error && error.message ? `: ${error.message}` : ''
}

/** Manages presets for the active tab without updating any query workspace state. */
export function PresetManagerAction({ repository: suppliedRepository, session: suppliedSession, profile: suppliedProfile }: PresetManagerActionProps = {}) {
  const activeSession = useStore(selectActiveSession)
  const profiles = useStore((state) => state.profiles)
  const session = suppliedSession ?? activeSession
  const profile = suppliedProfile ?? profiles.find((candidate) => candidate.id === session.connectionProfileId)
  const repository = suppliedRepository ?? explorationPresetRepository()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [presets, setPresets] = useState<SavedExplorationPreset[]>([])
  const [readError, setReadError] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const buttonRef = useRef<HTMLButtonElement>(null)
  const nameInputRef = useRef<HTMLInputElement>(null)
  const titleId = useId()
  const normalizedName = name.trim()
  const normalizedEditingName = editingName.trim()
  const canSave = Boolean(profile && profile.id === session.connectionProfileId)

  const refresh = (): boolean => {
    if (!session.connectionProfileId) return false
    try {
      const listed = repository.listForConnection(session.connectionProfileId)
      setPresets([...listed].sort((left, right) => right.updatedAt - left.updatedAt || left.name.localeCompare(right.name) || left.id.localeCompare(right.id)))
      setReadError(false)
      return true
    } catch (error) {
      setReadError(true)
      notify({ message: `Could not read saved presets${errorDetail(error)}`, tone: 'error' })
      return false
    }
  }
  const openManager = () => {
    setOpen(true)
    setEditingId(null)
    refresh()
  }
  const close = () => {
    setOpen(false)
    setName('')
    setEditingId(null)
    setEditingName('')
  }
  const refocusName = () => requestAnimationFrame(() => nameInputRef.current?.focus())

  const save = (event: FormEvent) => {
    event.preventDefault()
    if (!normalizedName || !profile || profile.id !== session.connectionProfileId) return
    try {
      const preset = createPresetFromSession({ name: normalizedName, profile, session })
      repository.create(preset)
      notify({ message: `Saved preset “${preset.name}”.` })
      setName('')
      refresh()
      refocusName()
    } catch (error) {
      notify({ message: `Could not save preset${errorDetail(error)}`, tone: 'error' })
    }
  }
  const startRename = (preset: SavedExplorationPreset) => {
    setEditingId(preset.id)
    setEditingName(preset.name)
  }
  const cancelRename = () => {
    setEditingId(null)
    setEditingName('')
  }
  const rename = (event: FormEvent, preset: SavedExplorationPreset) => {
    event.preventDefault()
    if (!normalizedEditingName) return
    try {
      const renamed = repository.rename(preset.id, normalizedEditingName)
      if (renamed) notify({ message: `Renamed preset to “${renamed.name}”.` })
      setEditingId(null)
      setEditingName('')
      refresh()
      refocusName()
    } catch (error) {
      notify({ message: `Could not rename preset${errorDetail(error)}`, tone: 'error' })
    }
  }
  const remove = (preset: SavedExplorationPreset) => {
    if (!window.confirm(`Delete preset “${preset.name}”?`)) return
    try {
      const deleted = repository.delete(preset.id)
      if (deleted) notify({ message: `Deleted preset “${preset.name}”.` })
      refresh()
      refocusName()
    } catch (error) {
      notify({ message: `Could not delete preset${errorDetail(error)}`, tone: 'error' })
    }
  }

  return <>
    <button ref={buttonRef} type="button" className="btn ghost" disabled={!canSave} aria-label="Manage saved presets" title={canSave ? 'Save and manage exploration presets.' : 'Attach this tab to a connection before managing presets.'} onClick={openManager}>Save</button>
    <Modal open={open} onClose={close} labelledBy={titleId} returnFocusRef={buttonRef} dialogClassName={styles.dialog}>
      <div className={styles.content}>
        <h2 className={styles.title} id={titleId}>Saved presets</h2>
        <form className={styles.saveForm} onSubmit={save}>
          <h3 className={styles.sectionTitle}>Save current exploration</h3>
          <div className={styles.formRow}>
            <TextInput ref={nameInputRef} label="Preset name" value={name} onValueChange={setName} autoFocus autoComplete="off" />
            <button type="submit" className="btn primary" disabled={!normalizedName}>Save</button>
          </div>
        </form>
        <section aria-labelledby={`${titleId}-existing`}>
          <h3 className={styles.sectionTitle} id={`${titleId}-existing`}>Existing presets</h3>
          {readError ? <p className={styles.state} role="alert">Could not read saved presets. Close and reopen this dialog to try again.</p>
            : presets.length === 0 ? <p className={styles.state}>No saved presets for this connection yet.</p>
              : <ul className={styles.list}>{presets.map((preset) => <li className={styles.row} key={preset.id}>
                {editingId === preset.id
                  ? <form className={styles.renameForm} onSubmit={(event) => rename(event, preset)}>
                    <TextInput label={`Rename ${preset.name}`} value={editingName} onValueChange={setEditingName} autoFocus autoComplete="off" />
                    <div className={styles.rowActions}>
                      <button type="submit" className="btn primary" disabled={!normalizedEditingName}>Save</button>
                      <button type="button" className="btn ghost" onClick={cancelRename}>Cancel</button>
                    </div>
                  </form>
                  : <><span className={styles.presetName}>{preset.name}</span><div className={styles.rowActions}>
                    <button type="button" className="btn ghost" aria-label={`Rename preset ${preset.name}`} onClick={() => startRename(preset)}>Rename</button>
                    <button type="button" className="btn ghost" aria-label={`Delete preset ${preset.name}`} onClick={() => remove(preset)}>Delete</button>
                  </div></>}
              </li>)}</ul>}
        </section>
        <div className={styles.footer}><button type="button" className="btn ghost" onClick={close}>Close</button></div>
      </div>
    </Modal>
  </>
}
