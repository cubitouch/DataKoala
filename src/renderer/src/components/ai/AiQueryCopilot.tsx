import { Spinner } from '@components/ui/Spinner'
import { TextInput } from '@components/ui/TextInput'
import { useAiQueryCopilot } from '@lib/ai/useAiQueryCopilot'
import { AI_LIMITS } from '@shared/ai'
import { AiContextPopover } from './AiContextPopover'
import { AiQueryDiff } from './AiQueryDiff'
import styles from './Ai.module.css'

export function AiQueryCopilot() {
  const ai = useAiQueryCopilot()

  // AI features are product-gated by saved provider configuration. Keep this
  // entry point (and future ones) out of the normal workflow until the user has
  // both a persisted key and model configured in Settings.
  if (ai.configured !== true) return null

  const disabled =
    ai.busy || !ai.prompt.trim() || ai.queryTooLong || !!ai.review

  return (
    <section
      className={styles.copilot}
      aria-label="SQL AI copilot"
      onKeyDown={(event) => {
        if (event.key !== 'Escape' && event.key !== 'Tab')
          event.stopPropagation()
      }}
    >
      <form
        className={styles.composer}
        onSubmit={(event) => {
          event.preventDefault()
          if (!disabled) void ai.generate()
        }}
      >
        <div
          className={styles.promptSlot}
          data-covered={ai.busy || !!ai.review}
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
          {(ai.busy || ai.review) && (
            <div className={styles.composerOverlay}>
              <div className={styles.overlayHeading}>
                {ai.busy ? (
                  <span role="status">
                    <Spinner /> Generating query…
                  </span>
                ) : (
                  <strong>Proposed changes</strong>
                )}
              </div>
              <div className={styles.actions}>
                {ai.busy && (
                  <button
                    type="button"
                    className="btn ghost"
                    onClick={ai.cancel}
                  >
                    Cancel
                  </button>
                )}
                {ai.review && (
                  <>
                    <button
                      type="button"
                      className="btn ghost"
                      disabled={ai.busy || ai.queryTooLong}
                      onClick={() => void ai.generate(true)}
                    >
                      Try again
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
                      className="btn primary"
                      disabled={ai.busy || ai.review.stale}
                      onClick={ai.apply}
                    >
                      Apply
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
        <AiContextPopover
          prompt={ai.contextInput?.prompt ?? ai.prompt}
          query={ai.contextInput?.snapshot.query ?? ai.query}
          context={ai.contextInput?.context ?? null}
          preparing={ai.busy ? !ai.contextInput : ai.preparing && !ai.review}
          sent={ai.contextSent}
          proposal={ai.review?.proposal ?? null}
        />
        {!ai.busy && !ai.review && (
          <button
            type="submit"
            className="btn ghost"
            aria-label="Ask"
            title="Generate query with AI (Enter)"
            disabled={disabled}
          >
            Ask
          </button>
        )}
      </form>
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
            <AiQueryDiff
              before={ai.review.input.snapshot.query}
              after={ai.review.proposal.query}
            />
            {ai.review.stale && (
              <div role="status" className={styles.warning}>
                The SQL or active connection changed while this proposal was
                being generated. Generate again against the latest query.
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
