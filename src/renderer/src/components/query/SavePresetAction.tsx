import { useId, useRef, useState, type FormEvent } from 'react'
import { selectActiveSession, useStore, type QuerySession } from '@store/useStore'
import type { DataSourceProfile } from '@shared/types'
import { createPresetFromSession, type SavedExplorationPreset } from '@lib/explorationPresets'
import { explorationPresetRepository } from '@lib/explorationPresetRepository'
import { notify } from '@components/ui/feedback/NotificationArea'
import { Modal } from '@components/ui/Modal'
import { TextInput } from '@components/ui/TextInput'
import styles from './SavePresetAction.module.css'

interface PresetWriter { create(preset: SavedExplorationPreset): unknown }

interface SavePresetActionProps {
  /** Injection point for focused tests; production uses the localStorage repository. */
  repository?: PresetWriter
  session?: QuerySession
  profile?: DataSourceProfile
}

/** Captures and persists the active tab without updating any query workspace state. */
export function SavePresetAction({ repository, session: suppliedSession, profile: suppliedProfile }: SavePresetActionProps = {}) {
  const activeSession = useStore(selectActiveSession)
  const profiles = useStore((state) => state.profiles)
  const session = suppliedSession ?? activeSession
  const profile = suppliedProfile ?? profiles.find((candidate) => candidate.id === session.connectionProfileId)
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const buttonRef = useRef<HTMLButtonElement>(null)
  const titleId = useId()
  const normalizedName = name.trim()
  const canSave = Boolean(profile && profile.id === session.connectionProfileId)

  const close = () => { setOpen(false); setName('') }
  const save = (event: FormEvent) => {
    event.preventDefault()
    if (!normalizedName || !profile || profile.id !== session.connectionProfileId) return
    try {
      const preset = createPresetFromSession({ name: normalizedName, profile, session })
      ;(repository ?? explorationPresetRepository()).create(preset)
      notify({ message: `Saved preset “${preset.name}”.` })
      close()
    } catch (error) {
      const detail = error instanceof Error && error.message ? `: ${error.message}` : ''
      notify({ message: `Could not save preset${detail}`, tone: 'error' })
    }
  }

  return <>
    <button ref={buttonRef} type="button" className="btn ghost" disabled={!canSave} aria-label="Save preset" title={canSave ? 'Save the current exploration as a preset.' : 'Attach this tab to a connection before saving a preset.'} onClick={() => setOpen(true)}>Save preset</button>
    <Modal open={open} onClose={close} labelledBy={titleId} returnFocusRef={buttonRef} dialogClassName={styles.dialog}>
      <form className={styles.form} onSubmit={save}>
        <h2 className={styles.title} id={titleId}>Save preset</h2>
        <TextInput label="Preset name" value={name} onValueChange={setName} autoFocus autoComplete="off" />
        <div className={styles.actions}>
          <button type="button" className="btn ghost" onClick={close}>Cancel</button>
          <button type="submit" className="btn primary" disabled={!normalizedName}>Save</button>
        </div>
      </form>
    </Modal>
  </>
}
