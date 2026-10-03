import { useRef, useState } from 'react'
import { Popover } from '@components/ui/Popover'
import { AiSettingsModal } from './AiSettingsModal'
export function AiSettingsAction() {
  const trigger = useRef<HTMLButtonElement>(null)
  const [menu, setMenu] = useState(false),
    [settings, setSettings] = useState(false)
  return (
    <>
      <Popover
        trigger="⋯"
        ariaLabel="App settings"
        triggerRef={trigger}
        open={menu}
        onOpenChange={setMenu}
      >
        <button
          className="btn ghost"
          onClick={() => {
            setMenu(false)
            setSettings(true)
          }}
        >
          AI settings…
        </button>
      </Popover>
      {settings && (
        <AiSettingsModal
          returnFocusRef={trigger}
          onClose={() => setSettings(false)}
        />
      )}
    </>
  )
}
