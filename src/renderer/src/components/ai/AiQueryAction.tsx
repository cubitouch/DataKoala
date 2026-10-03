import { useRef, useState } from 'react'
import { AiQueryCopilotModal } from './AiQueryCopilotModal'
export function AiQueryAction() {
  const trigger = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  return (
    <>
      <button className="btn ghost" ref={trigger} onClick={() => setOpen(true)}>
        Ask AI
      </button>
      {open && (
        <AiQueryCopilotModal
          returnFocusRef={trigger}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}
