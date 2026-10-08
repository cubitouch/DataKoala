import { TextInput } from '@components/ui/TextInput'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  LokiBuilderState,
  LokiLabelMatcher,
  LokiLabelOperator,
  LokiParserKind,
} from '@shared/loki'
import type { LokiMetadataRequest } from '@shared/loki'
import { lokiLabelValues } from '@lib/lokiMetadata'
import {
  resolveIndexedSeverityLabel,
  selectorWithoutMatcher,
} from '@shared/loki-builder'
import { Combobox, MultiCombobox } from '@components/ui/combobox'
import { CollapsibleSection } from '@components/ui/CollapsibleSection'
import { GeneratedQueryPanel } from '@components/query/GeneratedQueryPanel'
import { BuilderForm } from '@components/builder/BuilderForm'
import { BuilderRow } from '@components/builder/BuilderRow'
import { FormField } from '@components/builder/FormField'
import styles from './LokiBuilderPanel.module.css'

const internal = (label: string) => label.startsWith('__')
const editable = (matcher: LokiLabelMatcher) =>
  matcher.values !== undefined || matcher.operator === '='
function ValueControl({
  matcher,
  matchers,
  connectionId,
  connectionGeneration,
  canLoadMetadata,
  bounds,
  onChange,
}: {
  matcher: LokiLabelMatcher
  matchers: LokiLabelMatcher[]
  connectionId: string
  connectionGeneration: number
  canLoadMetadata: boolean
  bounds: Omit<LokiMetadataRequest, 'selector'>
  onChange: (values: string[]) => void
}) {
  const [values, setValues] = useState<string[]>([]),
    [loading, setLoading] = useState(false),
    [error, setError] = useState<string | null>(null)
  const request = useRef(0),
    available = useRef(canLoadMetadata)
  available.current = canLoadMetadata
  const selected = [
    ...new Set(matcher.values ?? (matcher.value ? [matcher.value] : [])),
  ]
  const { start, end } = bounds
  const selector = useMemo(
    () => selectorWithoutMatcher(matchers, matcher.label),
    [matchers, matcher.label],
  )
  const invalidateRequest = useCallback(() => {
    request.current += 1
  }, [])
  const load = useCallback(async () => {
    if (!canLoadMetadata) return
    const current = ++request.current
    setLoading(true)
    setError(null)
    try {
      const found = [
        ...new Set(
          await lokiLabelValues(connectionId, matcher.label, {
            start,
            end,
            ...(selector ? { selector } : {}),
          }),
        ),
      ].sort()
      if (available.current && current === request.current) setValues(found)
    } catch (e) {
      if (available.current && current === request.current)
        setError(e instanceof Error ? e.message : String(e))
    } finally {
      if (available.current && current === request.current) setLoading(false)
    }
  }, [canLoadMetadata, connectionId, matcher.label, selector, start, end])
  useEffect(() => {
    if (canLoadMetadata) void load()
    else {
      invalidateRequest()
      setLoading(false)
      setError(null)
    }
    return invalidateRequest
  }, [load, canLoadMetadata, connectionGeneration, invalidateRequest])
  const options = [...new Set([...selected, ...values])].map((value) => ({
    value,
    label: value,
  }))
  return (
    <FormField>
      <MultiCombobox
        label={`${matcher.label} values`}
        values={selected}
        options={options}
        onChange={onChange}
        searchable
        showChips
        allowCustomValue
        loading={canLoadMetadata && loading}
        error={canLoadMetadata ? error : null}
        disabled={!canLoadMetadata}
        placeholder={
          canLoadMetadata ? 'Choose one or more values' : 'Metadata unavailable'
        }
        emptyMessage="No values found. Enter a custom value."
        invalidationKey={matcher.label}
      />
    </FormField>
  )
}
export function LokiBuilderPanel({
  value,
  generated,
  labels,
  indexedLabels,
  connectionId,
  connectionGeneration,
  canLoadMetadata,
  bounds,
  groupBy,
  metadataStatus,
  metadataError,
  onChange,
  onGroupByChange,
  onOpenLogql,
}: {
  value: LokiBuilderState
  generated: string
  labels: string[]
  indexedLabels: string[]
  connectionId: string
  connectionGeneration: number
  canLoadMetadata: boolean
  bounds: Omit<LokiMetadataRequest, 'selector'>
  groupBy: string[]
  metadataStatus: 'loading' | 'loaded' | 'error'
  metadataError: string | null
  onChange: (value: LokiBuilderState) => void
  onGroupByChange: (value: string[]) => void
  onOpenLogql: () => void
}) {
  const severityLabel =
    metadataStatus === 'loaded'
      ? resolveIndexedSeverityLabel(indexedLabels)
      : null
  const visibleLabels = [...new Set(labels)]
    .filter((label) => !internal(label) && label !== severityLabel)
    .sort()
  const preserved = value.labelMatchers.filter((matcher) => !editable(matcher))
  const matchers = [
    ...new Map(
      value.labelMatchers
        .filter((matcher) => editable(matcher) && !internal(matcher.label))
        .map((matcher) => [matcher.label, matcher]),
    ).values(),
  ]
  const selected = matchers
    .filter((matcher) => matcher.label !== severityLabel)
    .map(({ label }) => label)
  const severityMatcher = severityLabel
    ? matchers.find((matcher) => matcher.label === severityLabel)
    : undefined
  const selectedLevels = severityMatcher
    ? [
        ...new Set(
          severityMatcher.values ??
            (severityMatcher.value ? [severityMatcher.value] : []),
        ),
      ]
    : []
  const selectLabels = (next: string[]) =>
    onChange({
      ...value,
      labelMatchers: [
        ...preserved,
        ...(severityMatcher ? [severityMatcher] : []),
        ...[...new Set(next)]
          .filter((label) => !internal(label))
          .map(
            (label) =>
              matchers.find((item) => item.label === label) ?? {
                label,
                operator: '=' as const,
                value: '',
                values: [],
              },
          ),
      ],
    })
  const patchValues = (label: string, values: string[]) =>
    onChange({
      ...value,
      labelMatchers: [
        ...preserved,
        ...matchers.map((matcher) =>
          matcher.label === label
            ? {
                ...matcher,
                operator: '=' as const,
                value: values[0] ?? '',
                values: [...new Set(values)],
              }
            : matcher,
        ),
      ],
    })
  const parserKinds: LokiParserKind[] = ['json', 'logfmt', 'pattern', 'regexp']
  const operators: LokiLabelOperator[] = ['=', '!=', '=~', '!~']
  return (
    <BuilderForm as="section" className={styles.root} data-loki-builder>
      <BuilderRow className={styles.primaryRow}>
        <FormField>
          <MultiCombobox
            label="Filter by"
            values={selected}
            options={visibleLabels.map((label) => ({ value: label, label }))}
            onChange={selectLabels}
            searchable
            showChips
            disabled={!canLoadMetadata}
            loading={canLoadMetadata && metadataStatus === 'loading'}
            error={
              canLoadMetadata && metadataStatus === 'error'
                ? metadataError
                : null
            }
            loadingMessage="Loading indexed labels…"
            emptyMessage="No indexed labels in this range"
            placeholder={
              canLoadMetadata ? 'Select indexed labels' : 'Metadata unavailable'
            }
          />
        </FormField>
        <FormField>
          <TextInput
            label="Line contains"
            value={value.lineFilters[0]?.value ?? ''}
            onValueChange={(text) =>
              onChange({
                ...value,
                lineFilters: text ? [{ operator: '|=', value: text }] : [],
              })
            }
            placeholder="timeout"
          />
        </FormField>
        <FormField>
          <MultiCombobox
            label="Level"
            values={selectedLevels}
            options={['FATAL', 'ERROR', 'WARN', 'INFO', 'DEBUG', 'TRACE'].map(
              (level) => ({ value: level, label: level }),
            )}
            onChange={(levels) =>
              onChange({
                ...value,
                labelMatchers: [
                  ...value.labelMatchers.filter(
                    (matcher) => matcher.label !== severityLabel,
                  ),
                  ...(severityLabel && levels.length
                    ? [
                        {
                          label: severityLabel,
                          operator: '=~' as const,
                          value: '',
                          values: [...new Set(levels)],
                        },
                      ]
                    : []),
                ],
              })
            }
            searchable
            showChips
            disabled={!canLoadMetadata || !severityLabel}
            hint={
              !canLoadMetadata
                ? 'Loki metadata is unavailable.'
                : !severityLabel && metadataStatus === 'loaded'
                  ? 'No indexed severity label is available.'
                  : undefined
            }
            placeholder={severityLabel ? 'All levels' : 'Unavailable'}
            emptyMessage="No levels found"
          />
        </FormField>
        <FormField>
          <MultiCombobox
            label="Group by"
            values={groupBy}
            options={visibleLabels.map((label) => ({ value: label, label }))}
            onChange={(next) =>
              onGroupByChange(
                [...new Set(next)].filter((label) => !internal(label)),
              )
            }
            searchable
            showChips
            disabled={!canLoadMetadata}
            loading={canLoadMetadata && metadataStatus === 'loading'}
            error={
              canLoadMetadata && metadataStatus === 'error'
                ? metadataError
                : null
            }
            loadingMessage="Loading indexed labels…"
            emptyMessage="No indexed labels in this range"
            placeholder={
              canLoadMetadata ? 'No grouping' : 'Metadata unavailable'
            }
          />
        </FormField>
      </BuilderRow>
      {matchers.length > 0 && (
        <BuilderRow className={styles.valuesGrid}>
          {matchers
            .filter((matcher) => matcher.label !== severityLabel)
            .map((matcher) => (
              <ValueControl
                key={matcher.label}
                matcher={matcher}
                matchers={value.labelMatchers}
                connectionId={connectionId}
                connectionGeneration={connectionGeneration}
                canLoadMetadata={canLoadMetadata}
                bounds={bounds}
                onChange={(next) => patchValues(matcher.label, next)}
              />
            ))}
        </BuilderRow>
      )}
      {preserved.length > 0 && (
        <p className={styles.preserved}>
          Unsupported saved matcher expressions are preserved. Open in LogQL
          mode to edit them.
        </p>
      )}
      <CollapsibleSection
        title="Advanced filters"
        actions={
          value.parsers.length + value.fieldFilters.length > 0 ? (
            <span className={styles.activeCount}>
              {value.parsers.length + value.fieldFilters.length} active
            </span>
          ) : undefined
        }
      >
        <div className={styles.advancedContent}>
          {value.parsers.length === 0 && value.fieldFilters.length === 0 && (
            <p className={styles.preserved}>
              No parser stages or pipeline field filters.
            </p>
          )}
          {value.parsers.map((stage, index) => (
            <BuilderRow className={styles.advancedRow} key={`parser-${index}`}>
              <FormField>
                <Combobox
                  label={`Parser ${index + 1}`}
                  value={stage.kind}
                  options={parserKinds.map((kind) => ({
                    value: kind,
                    label: kind,
                  }))}
                  onChange={(kind) =>
                    onChange({
                      ...value,
                      parsers: value.parsers.map((item, itemIndex) =>
                        itemIndex === index
                          ? { ...item, kind: kind as LokiParserKind }
                          : item,
                      ),
                    })
                  }
                />
              </FormField>
              <FormField>
                <TextInput
                  label={`Parser ${index + 1} expression`}
                  value={stage.expression ?? ''}
                  onValueChange={(expression) =>
                    onChange({
                      ...value,
                      parsers: value.parsers.map((item, itemIndex) =>
                        itemIndex === index
                          ? { ...item, expression: expression || undefined }
                          : item,
                      ),
                    })
                  }
                  placeholder={
                    stage.kind === 'pattern' || stage.kind === 'regexp'
                      ? 'Parser expression'
                      : 'Optional expression'
                  }
                />
              </FormField>
              <button
                type="button"
                className="btn ghost"
                aria-label={`Remove parser ${index + 1}`}
                onClick={() =>
                  onChange({
                    ...value,
                    parsers: value.parsers.filter(
                      (_, itemIndex) => itemIndex !== index,
                    ),
                  })
                }
              >
                Remove
              </button>
            </BuilderRow>
          ))}
          {value.fieldFilters.map((filter, index) => (
            <BuilderRow className={styles.advancedRow} key={`field-${index}`}>
              <FormField>
                <TextInput
                  label={`Field ${index + 1} name`}
                  value={filter.field}
                  onValueChange={(field) =>
                    onChange({
                      ...value,
                      fieldFilters: value.fieldFilters.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, field } : item,
                      ),
                    })
                  }
                  placeholder="field_name"
                />
              </FormField>
              <FormField>
                <Combobox
                  label={`Field ${index + 1} operator`}
                  value={filter.operator}
                  options={operators.map((operator) => ({
                    value: operator,
                    label: operator,
                  }))}
                  onChange={(operator) =>
                    onChange({
                      ...value,
                      fieldFilters: value.fieldFilters.map((item, itemIndex) =>
                        itemIndex === index
                          ? { ...item, operator: operator as LokiLabelOperator }
                          : item,
                      ),
                    })
                  }
                />
              </FormField>
              <FormField>
                <TextInput
                  label={`Field ${index + 1} value`}
                  value={filter.value}
                  onValueChange={(filterValue) =>
                    onChange({
                      ...value,
                      fieldFilters: value.fieldFilters.map((item, itemIndex) =>
                        itemIndex === index
                          ? { ...item, value: filterValue }
                          : item,
                      ),
                    })
                  }
                />
              </FormField>
              <button
                type="button"
                className="btn ghost"
                aria-label={`Remove field filter ${index + 1}`}
                onClick={() =>
                  onChange({
                    ...value,
                    fieldFilters: value.fieldFilters.filter(
                      (_, itemIndex) => itemIndex !== index,
                    ),
                  })
                }
              >
                Remove
              </button>
            </BuilderRow>
          ))}
        </div>
      </CollapsibleSection>
      <GeneratedQueryPanel
        language="LogQL"
        value={generated}
        onOpenInEditor={onOpenLogql}
      />
    </BuilderForm>
  )
}
