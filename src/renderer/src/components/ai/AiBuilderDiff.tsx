import type { AiBuilderState } from '@shared/ai'
import { builderTimeRangeSummary } from '@lib/builderTimeRange'
import styles from './Ai.module.css'

const display = (value: string | null | undefined) => value || '—'
const titleCase = (value: string) =>
  value ? value[0].toUpperCase() + value.slice(1) : value
const range = (state: AiBuilderState) =>
  state.timeColumn && state.timeRange
    ? builderTimeRangeSummary(state.timeRange)
    : '—'

export interface AiBuilderChange {
  label: string
  before: string
  after: string
}

export function aiBuilderChanges(
  before: AiBuilderState,
  after: AiBuilderState,
): AiBuilderChange[] {
  const values: Array<[string, string, string]> = [
    ['X axis', display(before.xColumn), display(after.xColumn)],
    ['Y axis', display(before.valueColumn), display(after.valueColumn)],
    [
      'Aggregation',
      titleCase(before.aggregation),
      titleCase(after.aggregation),
    ],
    ['Time column', display(before.timeColumn), display(after.timeColumn)],
    ['Time bucket', titleCase(before.timeBucket), titleCase(after.timeBucket)],
    ['Time range', range(before), range(after)],
  ]
  return values
    .filter(([, previous, next]) => previous !== next)
    .map(([label, previous, next]) => ({
      label,
      before: previous,
      after: next,
    }))
}

export function AiBuilderDiff({
  before,
  after,
}: {
  before: AiBuilderState
  after: AiBuilderState
}) {
  const changes = aiBuilderChanges(before, after)
  return (
    <div
      className={styles.builderDiff}
      role="region"
      aria-label="AI Builder proposal"
    >
      {changes.length ? (
        changes.map((change) => (
          <div
            className={styles.builderDiffRow}
            key={change.label}
            data-builder-ai-change={change.label}
          >
            <strong>{change.label}</strong>
            <span className={styles.builderDiffBefore}>{change.before}</span>
            <span aria-hidden="true" className={styles.builderDiffArrow}>
              →
            </span>
            <span className={styles.builderDiffAfter}>{change.after}</span>
          </div>
        ))
      ) : (
        <div className={styles.noDiff}>
          <strong>No Builder changes proposed</strong>
          <span>
            Try a more specific request describing the axis, aggregation, or
            time controls you want to change.
          </span>
        </div>
      )}
    </div>
  )
}
