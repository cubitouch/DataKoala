import { SEVEN_DAYS } from './builderTimeRange.ts'
import type { Aggregation } from './resultVisualization.ts'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

/** Convert the single-draft v1 envelope before applying the v2 schema validator. */
export function migrateWorkspaceV1(raw: string | null): string | null {
  if (!raw) return null
  try {
    const envelope: unknown = JSON.parse(raw)
    if (
      !isRecord(envelope) ||
      envelope.version !== 1 ||
      !isRecord(envelope.draft)
    )
      return null
    const draft = envelope.draft
    const builder = isRecord(draft.builder)
      ? {
          ...draft.builder,
          timeRange:
            draft.builder.timeRange === undefined
              ? SEVEN_DAYS
              : draft.builder.timeRange,
        }
      : draft.builder
    const id = 'migrated-query-1'
    return JSON.stringify({
      version: 2,
      activeTabId: id,
      tabs: [
        {
          id,
          title: 'Query 1',
          connectionProfileId: null,
          queryMode: draft.queryMode,
          sql: draft.sql,
          builder,
          sqlVisualization: draft.sqlVisualization,
          builderVisualization: draft.builderVisualization,
        },
      ],
    })
  } catch {
    return null
  }
}

/** Early axis-first v2 drafts omitted the independent temporal source. */
export function legacyBuilderTimeColumn(
  explicitTimeColumn: string | null,
  persistedX: string | null,
  hasRange: boolean,
): string | null {
  return explicitTimeColumn ?? (persistedX && hasRange ? persistedX : null)
}

/** Time-first Builder aliases refer to generated output, not source columns. */
export function legacyBuilderAxes(
  timeColumn: string | null,
  xColumn: string | null,
  valueColumn: string | null,
  aggregation: Aggregation,
) {
  const legacyCount = valueColumn === 'count' && aggregation === 'sum'
  return {
    xColumn: xColumn === 'time_bucket' ? timeColumn : xColumn,
    valueColumn: legacyCount ? null : valueColumn,
    aggregation: legacyCount ? ('count' as const) : aggregation,
  }
}

export function legacyLokiGroupBy(value: unknown): string[] {
  return typeof value === 'string' && value && !value.startsWith('__')
    ? [value]
    : []
}

export function legacyPromqlFilters(
  value: unknown,
): { label: string; values: string[] }[] {
  return Array.isArray(value)
    ? value.flatMap((filter) => {
        if (
          !isRecord(filter) ||
          typeof filter.label !== 'string' ||
          !filter.label
        )
          return []
        if (
          Array.isArray(filter.values) &&
          filter.values.every((item) => typeof item === 'string')
        )
          return [
            {
              label: filter.label,
              values: [...new Set(filter.values as string[])],
            },
          ]
        // Only inclusive equality in the unreleased row-matcher shape is representable.
        if (
          filter.operator === '=' &&
          typeof filter.value === 'string' &&
          filter.value
        )
          return [{ label: filter.label, values: [filter.value] }]
        return []
      })
    : []
}

export function legacyPromqlAggregation(
  value: unknown,
): 'sum' | 'avg' | 'min' | 'max' | undefined {
  return value === 'sum' ||
    value === 'avg' ||
    value === 'min' ||
    value === 'max'
    ? value
    : undefined
}

export function legacyLokiResultView(value: unknown): unknown {
  return value === 'chart' ? 'line' : value
}
