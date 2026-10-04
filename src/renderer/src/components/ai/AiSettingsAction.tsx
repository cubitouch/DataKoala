import { useRef, useState } from 'react'
import styles from './Ai.module.css'
import { AiSettingsModal } from './AiSettingsModal'
export function AiSettingsAction() {
  const trigger = useRef<HTMLButtonElement>(null)
  const [settings, setSettings] = useState(false)
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className={`btn ghost ${styles.settingsAction}`}
        onClick={() => setSettings(true)}
      >
        Settings
      </button>
      {settings && (
        <AiSettingsModal
          returnFocusRef={trigger}
          onClose={() => setSettings(false)}
        />
      )}
    </>
  )
}
