import { useRef, useState } from 'react'
import { Spinner } from '@components/ui/Spinner'
import { TextInput } from '@components/ui/TextInput'
import { useAiQueryCopilot } from '@lib/ai/useAiQueryCopilot'
import { AI_LIMITS } from '@shared/ai'
import { AiSettingsModal } from './AiSettingsModal'
import { AiContextPopover } from './AiContextPopover'
import { AiQueryDiff } from './AiQueryDiff'
import styles from './Ai.module.css'
export function AiQueryCopilot() {
  const [settings, setSettings] = useState(false)
  const settingsTrigger = useRef<HTMLButtonElement>(null)
  const ai = useAiQueryCopilot(settings)
  const disabled =
    ai.busy ||
    !ai.configured ||
    !ai.prompt.trim() ||
    ai.queryTooLong ||
    !!ai.review
  return (
    <section
      className={styles.copilot}
      aria-label="SQL AI copilot"
      onKeyDown={(event) => event.stopPropagation()}
    >
      <form
        className={styles.composer}
        onSubmit={(event) => {
          event.preventDefault()
          if (!disabled) void ai.generate()
        }}
      >
        <TextInput
          label="AI prompt"
          labelVisibility="sr-only"
          placeholder="Ask AI to generate or change this query…"
          value={ai.prompt}
          onValueChange={ai.setPrompt}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
              event.preventDefault()
              if (!disabled) void ai.generate()
            }
          }}
          maxLength={AI_LIMITS.prompt}
          disabled={ai.busy || !!ai.review}
        />
        <AiContextPopover
          prompt={ai.contextInput?.prompt ?? ai.prompt}
          query={ai.contextInput?.snapshot.query ?? ai.query}
          context={ai.contextInput?.context ?? null}
          preparing={ai.busy ? !ai.contextInput : ai.preparing && !ai.review}
          sent={ai.contextSent}
        />
        <button
          type="submit"
          className="btn ghost"
          aria-label="Generate query with AI"
          title="Generate query with AI (Enter)"
          disabled={disabled}
        >
          <span aria-hidden="true">↵</span>
        </button>
      </form>
      {ai.configured === false && (
        <div className={styles.status}>
          Configure OpenRouter to use Ask AI.
          <button
            ref={settingsTrigger}
            type="button"
            className="btn ghost"
            onClick={() => setSettings(true)}
          >
            Open AI settings
          </button>
        </div>
      )}
      {ai.busy && (
        <div className={styles.status}>
          <span role="status">
            <Spinner /> Generating query…
          </span>
          <button type="button" className="btn ghost" onClick={ai.cancel}>
            Cancel
          </button>
        </div>
      )}
      {ai.error && (
        <div role="alert" className="inline-error">
          {ai.error}
        </div>
      )}
      {ai.queryTooLong && (
        <div role="status">
          Current SQL exceeds the AI context limit. Shorten it before
          generating.
        </div>
      )}
      {ai.review && (
        <div className={styles.review} aria-label="AI query proposal">
          <div className={styles.reviewBody}>
            <div className={styles.reviewHead}>
              <strong>Proposed changes</strong>
              <span className={styles.notice}>
                Review, then apply. Run remains a separate action.
              </span>
            </div>
            <AiQueryDiff
              before={ai.review.input.snapshot.query}
              after={ai.review.proposal.query}
            />
            <div className={styles.explanation}>
              <strong>AI explanation</strong>
              <p>{ai.review.proposal.explanation}</p>
              {!!ai.review.proposal.assumptions.length && (
                <>
                  <strong>Assumptions</strong>
                  <ul>
                    {ai.review.proposal.assumptions.map((a, i) => (
                      <li key={i}>{a}</li>
                    ))}
                  </ul>
                </>
              )}
            </div>
            {ai.review.stale && (
              <div role="status" className={styles.warning}>
                The SQL or active connection changed while this proposal was
                being generated. Generate again against the latest query.
              </div>
            )}
          </div>
          <div className={styles.actions}>
            <button
              type="button"
              className="btn primary"
              disabled={ai.busy || ai.review.stale}
              onClick={ai.apply}
            >
              Apply
            </button>
            <button
              type="button"
              className="btn ghost"
              disabled={ai.busy}
              onClick={ai.reject}
            >
              Reject
            </button>
            <button
              type="button"
              className="btn ghost"
              disabled={ai.busy || !ai.configured || ai.queryTooLong}
              onClick={() => void ai.generate(true)}
            >
              Try again
            </button>
          </div>
        </div>
      )}
      {settings && (
        <AiSettingsModal
          returnFocusRef={settingsTrigger}
          onClose={() => setSettings(false)}
        />
      )}
    </section>
  )
}
