import { Spinner } from '@components/ui/Spinner'
import { TextInput } from '@components/ui/TextInput'
import { useAiBuilderCopilot } from '@lib/ai/useAiBuilderCopilot'
import { AI_LIMITS } from '@shared/ai'
import { AiBuilderContextPopover } from './AiBuilderContextPopover'
import { AiBuilderDiff, aiBuilderChanges } from './AiBuilderDiff'
import styles from './Ai.module.css'

export function AiBuilderCopilot() {
  const ai = useAiBuilderCopilot()

  if (ai.configured !== true || !ai.eligible) return null

  const disabled =
    ai.busy || !ai.prompt.trim() || ai.promptTooLong || !!ai.review
  const hasChanges = ai.review
    ? aiBuilderChanges(ai.review.input.snapshot.state, ai.review.target).length >
      0
    : false

  return (
    <section
      className={styles.copilot}
      aria-label="SQL Builder AI copilot"
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
            label="Builder AI prompt"
            labelVisibility="sr-only"
            placeholder="Ask AI to change this Builder…"
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
                    <Spinner /> Updating Builder…
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
                      disabled={ai.busy}
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
                      disabled={ai.busy || ai.review.stale || !hasChanges}
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
        <AiBuilderContextPopover
          prompt={ai.contextInput?.prompt ?? ai.prompt}
          input={ai.contextInput}
          sent={ai.contextSent}
          proposal={ai.review?.proposal ?? null}
        />
        {!ai.busy && !ai.review && (
          <button
            type="submit"
            className="btn ghost"
            aria-label="Ask"
            title="Ask AI to change Builder controls (Enter)"
            disabled={disabled}
          >
            Ask
          </button>
        )}
      </form>

      {ai.error && (
        <div role="alert" className={`inline-error ${styles.copilotMessage}`}>
          {ai.error}
        </div>
      )}
      {ai.unsupported && (
        <div role="status" className={styles.builderUnsupported}>
          {ai.unsupported}
        </div>
      )}
      {ai.promptTooLong && (
        <div role="status">
          The prompt exceeds the AI input limit. Shorten it before asking.
        </div>
      )}
      {ai.review && (
        <div className={styles.review} aria-label="AI Builder proposal review">
          <div className={styles.reviewBody}>
            <AiBuilderDiff
              before={ai.review.input.snapshot.state}
              after={ai.review.target}
            />
            {ai.review.stale && (
              <div role="status" className={styles.warning}>
                The tab, connection, relation, or Builder controls changed.
                Generate again against the current Builder before applying.
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
