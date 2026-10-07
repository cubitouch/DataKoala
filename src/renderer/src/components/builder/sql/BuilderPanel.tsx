import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  isNumericType,
  sqlDialectForSourceKind,
  type DatabaseColumnNode,
  type DatabaseSchemaNode,
  type QueryResult,
} from '@shared/types'
import { api } from '@lib/api'
import {
  BUILDER_AGGREGATIONS,
  generateBuilderQuery,
  isBuilderTemporalDataType,
  isBuilderTimeBucketSupported,
  materializeSqlParameters,
  TIME_BUCKETS,
} from '@lib/builderSql'
import {
  canLoadRelationColumns,
  relationIdentity,
  relationsForSchema,
  selectionPatchForColumns,
} from '@lib/builderRelations'
import {
  selectActiveSession,
  selectSession,
  useStore,
  type TimeBucket,
} from '@store/useStore'
import { ensureConnectionForTab } from '@lib/tabConnection'
import {
  CHART_SERIES_HARD_LIMIT,
  type CardinalityProbePredicate,
} from '@shared/chartLimits'
import {
  isSeriesColumnRemoval,
  SeriesCardinalityProbeGuard,
  seriesProbeFingerprint,
} from '@lib/seriesCardinalityGuard'
import { ModeSwitch } from '@components/query/ModeSwitch'
import { CopySqlButton } from '@components/query/CopySqlButton'
import {
  Combobox,
  MultiCombobox,
  type ComboboxOption,
} from '@components/ui/combobox'
import {
  isMinuteBucketAvailable,
  SEVEN_DAYS,
  timeRangeProbePredicates,
  validateBuilderTimeRange,
} from '@lib/builderTimeRange'
import { TimeRangeField } from '@components/query/time-range/TimeRangeField'
import { formatSqlOrOriginal } from '@lib/formatSql'
import type { Aggregation } from '@lib/resultVisualization'
import styles from './BuilderPanel.module.css'
import { formatterDialect as formatterDialectForSql } from '@lib/sqlDialect'
import { ensureRelationColumns } from '@lib/relationColumns'
import { QueryUtilityActions } from '@components/query/QueryUtilityActions'
import { QueryToolbar } from '@components/query/QueryToolbar'
import { GeneratedQueryPanel } from '@components/query/GeneratedQueryPanel'
import { BuilderForm } from '@components/builder/BuilderForm'
import { BuilderRow } from '@components/builder/BuilderRow'
import { FormField } from '@components/builder/FormField'
import { AiBuilderCopilot } from '@components/ai/AiBuilderCopilot'

const isTimeColumn = (column: DatabaseColumnNode) =>
  isBuilderTemporalDataType(column.dataTypeName)
const aggregationLabel = (aggregation: Aggregation) =>
  aggregation === 'average'
    ? 'Average'
    : aggregation === 'minimum'
      ? 'Minimum'
      : aggregation === 'maximum'
        ? 'Maximum'
        : aggregation === 'count'
          ? 'Count'
          : 'Sum'

const aggregationOptions: ComboboxOption[] = BUILDER_AGGREGATIONS.map(
  (aggregation) => ({
    value: aggregation,
    label: aggregationLabel(aggregation),
  }),
)
const EMPTY_SCHEMAS: DatabaseSchemaNode[] = []

export function BuilderPanel() {
  const tabId = useStore((state) => state.activeTabId)
  const activeId = useStore((state) => state.activeProfileId)
  const connected = useStore((state) => state.connected)
  const connecting = useStore((state) => state.connecting)
  const tabConnectionId = useStore(
    (state) => selectActiveSession(state).connectionProfileId,
  )
  const scopedConnection = useStore((state) =>
    tabConnectionId
      ? state.connectionStateByProfileId[tabConnectionId]
      : undefined,
  )
  const connectionKind = useStore(
    (state) =>
      state.profiles.find(
        (profile) =>
          profile.id === selectActiveSession(state).connectionProfileId,
      )?.kind,
  )
  const builder = useStore((state) => selectActiveSession(state).builder)
  const builderVisualization = useStore(
    (state) => selectActiveSession(state).builderVisualization,
  )
  const setBuilder = useStore((state) => state.setBuilder)
  const setVisualization = useStore((state) => state.setVisualization)
  const setSql = useStore((state) => state.setSql)
  const setMode = useStore((state) => state.setQueryMode)
  const running = useStore((state) => selectActiveSession(state).running)
  const startQuery = useStore((state) => state.startQuery)
  const completeQuery = useStore((state) => state.completeQuery)
  const setHasRun = useStore((state) => state.setBuilderHasRun)
  const metadata = useStore((state) =>
    tabConnectionId ? state.metadataByProfileId[tabConnectionId] : undefined,
  )
  const metadataRefreshing = metadata?.refreshing ?? false
  const schemas = metadata?.schemas ?? EMPTY_SCHEMAS
  const metadataStatus = metadata?.status ?? 'idle'
  const storeMetadataError = metadata?.error ?? null
  const setRelationColumns = useStore((state) => state.setRelationColumns)
  const [metadataError, setMetadataError] = useState<string | null>(null)
  const [selectedSchema, setSelectedSchema] = useState(
    builder.table?.schema ?? '',
  )
  const filterNotice = useStore(
    (state) => selectActiveSession(state).builderFilterNotice,
  )
  const filters = useStore(
    (state) => selectActiveSession(state).builderResultFilters,
  )
  const removeResultFilter = useStore((state) => state.removeResultFilter)
  const clearFilterNotice = useStore((state) => state.clearBuilderFilterNotice)
  const previousExecution = useRef(new Map<string, string>())
  const queryRevisions = useRef(new Map<string, number>())
  const probeGuard = useRef(new SeriesCardinalityProbeGuard())
  const [seriesProbe, setSeriesProbe] = useState<{
    status: 'checking' | 'error'
    message?: string
    retry?: () => void
  } | null>(null)
  const [axisNotice, setAxisNotice] = useState<string | null>(null)
  const tabConnected = Boolean(
    tabConnectionId &&
    (scopedConnection?.status === 'connected' ||
      scopedConnection?.status === 'idle' ||
      (connected && activeId === tabConnectionId)),
  )
  const documentationCapture = Boolean(
    window.datakoala?.smokeMode &&
    (window as unknown as Record<string, unknown>)
      .__datakoalaDocumentationCapture,
  )
  const stillBoundTo = useCallback(
    (requestTabId: string, profileId: string) =>
      selectSession(useStore.getState(), requestTabId)?.connectionProfileId ===
      profileId,
    [],
  )

  useEffect(() => {
    // Documentation capture deliberately demonstrates Sum(count). The legacy
    // migration remains unchanged for real workspaces and regression previews.
    if (documentationCapture) return
    const legacyX = builderVisualization.xColumn === 'time_bucket'
    const legacyCount =
      builderVisualization.valueColumn === 'count' &&
      builderVisualization.aggregation === 'sum'
    if (!legacyX && !legacyCount) return
    setVisualization(
      'builder',
      {
        ...(legacyX ? { xColumn: builder.timeColumn } : {}),
        ...(legacyCount
          ? { valueColumn: null, aggregation: 'count' as const }
          : {}),
      },
      tabId,
    )
  }, [
    tabId,
    builder.timeColumn,
    builderVisualization.xColumn,
    builderVisualization.valueColumn,
    builderVisualization.aggregation,
    setVisualization,
    documentationCapture,
  ])

  const selectedRelation = useMemo(
    () =>
      builder.table
        ? relationsForSchema(schemas, builder.table.schema).find(
            (relation) =>
              relationIdentity(relation) === relationIdentity(builder.table!),
          )
        : undefined,
    [schemas, builder.table],
  )
  const columns = selectedRelation?.columns ?? []
  const temporalColumns = columns.filter(isTimeColumn)
  const selectedX =
    builderVisualization.xColumn === 'time_bucket'
      ? builder.timeColumn
      : builderVisualization.xColumn
  const xColumn = selectedX
    ? columns.find((column) => column.name === selectedX)
    : undefined
  const xTemporal = Boolean(xColumn && isTimeColumn(xColumn))
  const timeFilterColumn = builder.timeColumn
    ? columns.find(
        (column) => column.name === builder.timeColumn && isTimeColumn(column),
      )
    : undefined
  const aggregation: Aggregation =
    !documentationCapture &&
    builderVisualization.valueColumn === 'count' &&
    builderVisualization.aggregation === 'sum'
      ? 'count'
      : builderVisualization.aggregation
  const selectedY =
    aggregation === 'count' ? null : builderVisualization.valueColumn
  const yColumn = selectedY
    ? columns.find(
        (column) =>
          column.name === selectedY && isNumericType(column.dataTypeName),
      )
    : undefined
  const effectiveTimeRange = timeFilterColumn
    ? (builder.timeRange ?? SEVEN_DAYS)
    : undefined
  const rangeError = effectiveTimeRange
    ? validateBuilderTimeRange(effectiveTimeRange)
    : null
  const minuteBucketAvailable = effectiveTimeRange
    ? isMinuteBucketAvailable(effectiveTimeRange)
    : false
  const yRequired = aggregation !== 'count'
  const configurationComplete = Boolean(
    builder.table && xColumn && (!yRequired || yColumn) && !rangeError,
  )

  useEffect(() => {
    if (
      !selectedRelation ||
      selectedRelation.columnsStatus !== 'loaded' ||
      !selectedRelation.columns
    )
      return
    const state = useStore.getState()
    let session = selectSession(state, tabId)
    if (
      !session ||
      !session.builder.table ||
      relationIdentity(session.builder.table) !==
        relationIdentity(selectedRelation)
    )
      return
    const next = selectedRelation.columns
    const requested = {
      schema: selectedRelation.schema,
      name: selectedRelation.name,
    }
    const patch = selectionPatchForColumns(
      requested,
      session.builder.table,
      session.builder,
      next,
      isTimeColumn,
    )
    if (patch) state.setBuilder(patch, tabId)
    session = selectSession(useStore.getState(), tabId)
    if (!session) return
    const sourceX =
      session.builderVisualization.xColumn === 'time_bucket'
        ? session.builder.timeColumn
        : session.builderVisualization.xColumn
    const sourceY =
      session.builderVisualization.aggregation === 'count'
        ? null
        : session.builderVisualization.valueColumn
    const nextX =
      sourceX && next.some((column) => column.name === sourceX) ? sourceX : null
    const nextY =
      sourceY &&
      next.some(
        (column) =>
          column.name === sourceY && isNumericType(column.dataTypeName),
      )
        ? sourceY
        : null
    if (nextX !== sourceX || nextY !== sourceY) {
      useStore.getState().setVisualization(
        'builder',
        {
          xColumn: nextX,
          valueColumn: nextY,
          ...(sourceY && !nextY ? { aggregation: 'count' as const } : {}),
        },
        tabId,
      )
    }
  }, [tabId, selectedRelation])

  const loadColumns = useCallback(
    async (relation: typeof selectedRelation, explicitRetry = false) => {
      if (
        !relation ||
        relation.columnsStatus === 'loaded' ||
        !canLoadRelationColumns(relation.columnsStatus, explicitRetry)
      )
        return
      const requestTabId = tabId
      const requestProfileId = await ensureConnectionForTab(requestTabId)
      if (!requestProfileId || !stillBoundTo(requestTabId, requestProfileId))
        return
      const requested = { schema: relation.schema, name: relation.name }
      const qualifiedName = relation.qualifiedName
      setMetadataError(null)
      try {
        const next = await ensureRelationColumns(
          requestProfileId,
          relation,
          explicitRetry,
        )
        if (!next) return
        let state = useStore.getState()
        let session = selectSession(state, requestTabId)
        if (!session || session.connectionProfileId !== requestProfileId) return
        const patch = selectionPatchForColumns(
          requested,
          session.builder.table,
          session.builder,
          next,
          isTimeColumn,
        )
        if (patch) state.setBuilder(patch, requestTabId)
        state = useStore.getState()
        session = selectSession(state, requestTabId)
        if (!session) return
        const sourceX =
          session.builderVisualization.xColumn === 'time_bucket'
            ? session.builder.timeColumn
            : session.builderVisualization.xColumn
        const sourceY =
          session.builderVisualization.aggregation === 'count'
            ? null
            : session.builderVisualization.valueColumn
        const nextX =
          sourceX && next.some((column) => column.name === sourceX)
            ? sourceX
            : null
        const nextY =
          sourceY &&
          next.some(
            (column) =>
              column.name === sourceY && isNumericType(column.dataTypeName),
          )
            ? sourceY
            : null
        if (nextX !== sourceX || nextY !== sourceY) {
          state.setVisualization(
            'builder',
            {
              xColumn: nextX,
              valueColumn: nextY,
              ...(sourceY && !nextY ? { aggregation: 'count' as const } : {}),
            },
            requestTabId,
          )
        }
      } catch (error) {
        setRelationColumns(
          qualifiedName,
          undefined,
          'error',
          String(error),
          requestProfileId,
        )
        const session = selectSession(useStore.getState(), requestTabId)
        if (
          session?.connectionProfileId === requestProfileId &&
          relationIdentity(
            session.builder.table ?? { schema: '', name: '' },
          ) === relationIdentity(requested)
        )
          setMetadataError(String(error))
      }
    },
    [tabId, stillBoundTo, setRelationColumns],
  )
  useEffect(() => {
    if (
      metadataStatus !== 'loaded' ||
      !tabConnected ||
      !selectedRelation ||
      selectedRelation.columnsStatus !== 'idle'
    )
      return
    void loadColumns(selectedRelation)
  }, [metadataStatus, tabConnected, selectedRelation, loadColumns])

  const generatedQuery = useMemo(
    () =>
      configurationComplete && builder.table && selectedX
        ? generateBuilderQuery({
            dialect: sqlDialectForSourceKind(connectionKind ?? 'postgres'),
            table: builder.table,
            xColumn: selectedX,
            xColumnDataType: xColumn?.dataTypeName,
            timeColumn: builder.timeColumn,
            timeColumnDataType: timeFilterColumn?.dataTypeName,
            timeBucket: builder.timeBucket,
            valueColumn: selectedY,
            aggregation,
            seriesColumns: builder.seriesColumns,
            timeRange: effectiveTimeRange,
            filters,
          })
        : null,
    [
      configurationComplete,
      builder,
      connectionKind,
      selectedX,
      xColumn?.dataTypeName,
      timeFilterColumn?.dataTypeName,
      selectedY,
      aggregation,
      effectiveTimeRange,
      filters,
    ],
  )
  const generatedSql = generatedQuery?.sql ?? ''
  const formatterDialect = formatterDialectForSql(
    sqlDialectForSourceKind(connectionKind ?? 'postgres'),
  )
  const formattedGeneratedSql = useMemo(
    () =>
      generatedSql ? formatSqlOrOriginal(generatedSql, formatterDialect) : '',
    [generatedSql, formatterDialect],
  )

  const effectiveTimeRangeKey = JSON.stringify(effectiveTimeRange)
  useEffect(() => {
    if (builder.table?.schema) setSelectedSchema(builder.table.schema)
    else setSelectedSchema('')
  }, [builder.table?.schema])
  useEffect(() => {
    if (!axisNotice) return
    const timer = window.setTimeout(() => setAxisNotice(null), 3600)
    return () => window.clearTimeout(timer)
  }, [axisNotice])

  const relations = relationsForSchema(schemas, selectedSchema)
  const schemaOptions: ComboboxOption[] = schemas.map((schema) => ({
    value: schema.name,
    label: schema.name,
    subtitle: schema.isSystem ? 'schema · system' : 'schema',
    keywords: [schema.name, schema.isSystem ? 'system' : 'user'],
  }))
  const relationTypeLabel = (kind: (typeof relations)[number]['kind']) =>
    kind === 'r' ? 'table' : kind === 'v' ? 'view' : 'materialized view'
  const relationOptions: ComboboxOption[] = relations.map((relation) => {
    const typeLabel = relationTypeLabel(relation.kind)
    return {
      value: relationIdentity(relation),
      label: relation.name,
      subtitle: `${typeLabel} · ${relation.schema}`,
      keywords: [
        relation.name,
        relation.schema,
        typeLabel,
        relation.qualifiedName,
      ],
    }
  })
  const relationInvalidationKey = `${builder.table?.schema ?? ''}\0${builder.table?.name ?? ''}`
  const timeColumnOptions: ComboboxOption[] = temporalColumns.map((column) => ({
    value: column.name,
    label: column.name,
    subtitle: column.dataTypeName,
    keywords: [column.name, column.dataTypeName],
  }))
  const xAxisOptions: ComboboxOption[] = columns.map((column) => ({
    value: column.name,
    label: column.name,
    subtitle: column.dataTypeName,
    keywords: [column.name, column.dataTypeName],
  }))
  const yAxisOptions: ComboboxOption[] = columns
    .filter(
      (column) =>
        isNumericType(column.dataTypeName) &&
        column.name !== selectedX &&
        !builder.seriesColumns.includes(column.name),
    )
    .map((column) => ({
      value: column.name,
      label: column.name,
      subtitle: column.dataTypeName,
      keywords: [column.name, column.dataTypeName],
    }))
  const timeBucketOptions: ComboboxOption[] = TIME_BUCKETS.map((bucket) => ({
    value: bucket,
    label: bucket[0].toUpperCase() + bucket.slice(1),
    disabled:
      (bucket === 'minute' && !minuteBucketAvailable) ||
      !isBuilderTimeBucketSupported(
        xColumn?.dataTypeName,
        bucket,
        connectionKind === 'bigquery' ? 'google-sql' : undefined,
      ),
    subtitle: !isBuilderTimeBucketSupported(
      xColumn?.dataTypeName,
      bucket,
      connectionKind === 'bigquery' ? 'google-sql' : undefined,
    )
      ? 'BigQuery DATE supports day or larger buckets'
      : bucket === 'minute' && !minuteBucketAvailable
        ? 'Available for ranges up to 24 hours'
        : undefined,
  }))
  const seriesColumnOptions: ComboboxOption[] = columns
    .filter((column) => column.name !== selectedX && column.name !== selectedY)
    .map((column) => ({
      value: column.name,
      label: column.name,
      subtitle: column.dataTypeName,
      keywords: [column.name, column.dataTypeName],
    }))

  const clearMetricFilters = () => {
    const removed = filters.filter(
      (filter) => filter.column === 'count' || filter.column === 'value',
    )
    for (const filter of removed)
      removeResultFilter('builder', filter.id, tabId)
    return removed.length
  }
  const clearXAxisFilters = () => {
    if (!selectedX) return 0
    const removed = filters.filter(
      (filter) =>
        filter.column === 'time_bucket' ||
        filter.column === selectedX ||
        filter.provenance?.sourceColumn === selectedX,
    )
    for (const filter of removed)
      removeResultFilter('builder', filter.id, tabId)
    return removed.length
  }
  const resetAxisModel = () => {
    setVisualization(
      'builder',
      {
        xColumn: null,
        valueColumn: null,
        aggregation: 'count',
        seriesColumn: null,
        seriesColumns: [],
      },
      tabId,
    )
  }
  const chooseSchema = (schema: string) => {
    probeGuard.current.invalidate()
    setSeriesProbe(null)
    setAxisNotice(null)
    setSelectedSchema(schema)
    setBuilder(
      {
        table: null,
        timeColumn: null,
        timeBucket: 'day',
        timeRange: undefined,
        seriesColumns: [],
      },
      tabId,
    )
    resetAxisModel()
    setHasRun(false, tabId)
  }
  const chooseTable = (value: string) => {
    probeGuard.current.invalidate()
    setSeriesProbe(null)
    setAxisNotice(null)
    const table =
      relations.find((relation) => relationIdentity(relation) === value) ?? null
    setBuilder(
      {
        table,
        timeColumn: null,
        timeBucket: 'day',
        timeRange: undefined,
        seriesColumns: [],
      },
      tabId,
    )
    resetAxisModel()
    setHasRun(false, tabId)
    if (table) void loadColumns(table)
  }
  const chooseTimeColumn = (value: string) => {
    probeGuard.current.invalidate()
    setSeriesProbe(null)
    const nextTimeColumn = value || null
    setBuilder(
      {
        timeColumn: nextTimeColumn,
        timeRange: nextTimeColumn
          ? (builder.timeRange ?? SEVEN_DAYS)
          : undefined,
      },
      tabId,
    )
  }
  const chooseXAxis = (value: string) => {
    probeGuard.current.invalidate()
    setSeriesProbe(null)
    const nextX = value || null
    const nextMetadata = nextX
      ? columns.find((column) => column.name === nextX)
      : undefined
    const nextTemporal = Boolean(nextMetadata && isTimeColumn(nextMetadata))
    const nextSeries = builder.seriesColumns.filter(
      (column) => column !== nextX,
    )
    const yConflict = Boolean(nextX && selectedY === nextX)
    const nextY = yConflict ? null : selectedY
    const nextAggregation = yConflict ? ('count' as const) : aggregation
    const firstSelection = !selectedX
    const adoptXAsTimeFilter = Boolean(
      nextTemporal && nextX && !builder.timeColumn,
    )
    const dateBucketFallback =
      connectionKind === 'bigquery' &&
      nextMetadata?.dataTypeName.toLowerCase() === 'date' &&
      (builder.timeBucket === 'minute' || builder.timeBucket === 'hour')
    const notices: string[] = []
    if (yConflict)
      notices.push(`Cleared Y axis ${selectedY} because it is now the X axis.`)
    if (nextSeries.length !== builder.seriesColumns.length)
      notices.push(`Removed ${nextX} from Series because it is now the X axis.`)
    if (xTemporal && !nextTemporal)
      notices.push(
        builder.timeColumn
          ? 'Time bucket was cleared because the new X axis is not temporal. Time range is still applied to the dataset.'
          : 'Time bucket was cleared because the new X axis is not temporal.',
      )
    if (dateBucketFallback)
      notices.push(
        'Changed Time bucket to Day because BigQuery DATE does not support minute or hour buckets.',
      )
    if (clearXAxisFilters())
      notices.push('Cleared filters tied to the previous X axis.')
    if (clearMetricFilters())
      notices.push(
        'Cleared result filters tied to the previous aggregated Y axis.',
      )
    setBuilder(
      {
        timeColumn: adoptXAsTimeFilter ? nextX : builder.timeColumn,
        timeBucket: nextTemporal
          ? dateBucketFallback
            ? 'day'
            : xTemporal
              ? builder.timeBucket
              : 'day'
          : 'day',
        timeRange: adoptXAsTimeFilter
          ? (builder.timeRange ?? SEVEN_DAYS)
          : builder.timeRange,
        seriesColumns: nextSeries,
      },
      tabId,
    )
    setVisualization(
      'builder',
      {
        xColumn: nextX,
        valueColumn: nextY,
        aggregation: nextAggregation,
        seriesColumn: null,
        seriesColumns: nextSeries,
        ...(firstSelection && nextX
          ? { view: nextTemporal ? ('line' as const) : ('bar' as const) }
          : {}),
      },
      tabId,
    )
    setAxisNotice(notices.join(' ') || null)
  }
  const chooseY = (value: string) => {
    const nextY = value || null
    const notices: string[] = []
    let nextAggregation = aggregation
    if (nextY && aggregation === 'count') {
      nextAggregation = 'sum'
      notices.push(
        'Changed Aggregation to Sum because a Y axis column was selected.',
      )
    } else if (!nextY && aggregation !== 'count') {
      nextAggregation = 'count'
      notices.push('Changed Aggregation to Count because Y axis was cleared.')
    }
    const nextSeries = builder.seriesColumns.filter(
      (column) => column !== nextY,
    )
    if (nextSeries.length !== builder.seriesColumns.length)
      notices.push(`Removed ${nextY} from Series because it is now the Y axis.`)
    if (clearMetricFilters())
      notices.push(
        'Cleared result filters tied to the previous aggregated Y axis.',
      )
    if (nextSeries.length !== builder.seriesColumns.length)
      setBuilder({ seriesColumns: nextSeries }, tabId)
    setVisualization(
      'builder',
      {
        valueColumn: nextY,
        aggregation: nextAggregation,
        seriesColumn: null,
        seriesColumns: nextSeries,
      },
      tabId,
    )
    setAxisNotice(notices.join(' ') || null)
  }
  const chooseAggregation = (value: string) => {
    const nextAggregation = value as Aggregation
    const notices: string[] = []
    const nextY = nextAggregation === 'count' ? null : selectedY
    if (nextAggregation === 'count' && selectedY)
      notices.push(
        `Cleared Y axis ${selectedY} because Count operates on rows.`,
      )
    if (clearMetricFilters())
      notices.push('Cleared result filters tied to the previous aggregation.')
    setVisualization(
      'builder',
      { aggregation: nextAggregation, valueColumn: nextY },
      tabId,
    )
    setAxisNotice(notices.join(' ') || null)
  }
  const applySeries = (nextSeriesColumns: string[], requestTabId = tabId) => {
    setBuilder({ seriesColumns: nextSeriesColumns }, requestTabId)
    setVisualization(
      'builder',
      { seriesColumn: null, seriesColumns: nextSeriesColumns },
      requestTabId,
    )
  }
  const probePredicates = (): CardinalityProbePredicate[] =>
    builder.timeColumn && effectiveTimeRange
      ? timeRangeProbePredicates(
          effectiveTimeRange,
          builder.timeColumn,
          timeFilterColumn?.dataTypeName,
        )
      : []
  const selectSeries = async (requestedSeriesColumns: string[]) => {
    const nextSeriesColumns = requestedSeriesColumns.filter(
      (column) => column !== selectedX && column !== selectedY,
    )
    const canOnlyDecrease = isSeriesColumnRemoval(
      builder.seriesColumns,
      nextSeriesColumns,
    )
    if (canOnlyDecrease) {
      probeGuard.current.invalidate()
      setSeriesProbe(null)
      applySeries(nextSeriesColumns)
      return
    }
    if (!tabConnectionId || !builder.table) return
    const requestTabId = tabId
    const requestProfileId = tabConnectionId
    const fingerprint = seriesProbeFingerprint({
      profileId: requestProfileId,
      builder: { ...builder, timeRange: effectiveTimeRange },
      seriesColumns: nextSeriesColumns,
    })
    const operation = probeGuard.current.begin(fingerprint)
    const retry = () => void selectSeries(nextSeriesColumns)
    setSeriesProbe({ status: 'checking' })
    const isCurrent = () => {
      const current = useStore.getState()
      const session = selectSession(current, requestTabId)
      const currentFingerprint = session?.connectionProfileId
        ? seriesProbeFingerprint({
            profileId: session.connectionProfileId,
            builder: session.builder,
            seriesColumns: nextSeriesColumns,
          })
        : null
      return (
        currentFingerprint === fingerprint &&
        probeGuard.current.isCurrent(operation.revision, fingerprint)
      )
    }
    try {
      const connectedProfileId = await ensureConnectionForTab(requestTabId)
      if (!isCurrent()) return
      if (connectedProfileId !== requestProfileId)
        throw new Error('Connection changed before cardinality probe.')
      const response = await api.query.probeSeriesCardinality(
        requestProfileId,
        {
          schema: builder.table.schema,
          table: builder.table.name,
          seriesColumns: nextSeriesColumns,
          predicates: probePredicates(),
        },
      )
      if (!isCurrent()) return
      if (response.exceedsHardLimit) {
        setSeriesProbe({
          status: 'error',
          message: response.estimated
            ? `PostgreSQL estimates approximately ${Math.round(response.distinctCount).toLocaleString()} distinct combinations, above the supported chart limit of ${CHART_SERIES_HARD_LIMIT}. Narrow the time range or choose lower-cardinality dimensions.`
            : `This Series selection has more than ${CHART_SERIES_HARD_LIMIT} distinct combinations and cannot be charted safely. Filter the data first or choose lower-cardinality dimensions.`,
          retry,
        })
        return
      }
      if (probeGuard.current.approve(operation.revision, fingerprint)) {
        setSeriesProbe(null)
        applySeries(nextSeriesColumns, requestTabId)
      }
    } catch {
      if (isCurrent())
        setSeriesProbe({
          status: 'error',
          message: 'Could not check Series cardinality.',
          retry,
        })
    }
  }
  useEffect(() => {
    probeGuard.current.invalidate()
    setSeriesProbe(null)
  }, [
    tabConnectionId,
    builder.table?.schema,
    builder.table?.name,
    builder.timeColumn,
    selectedX,
    builder.timeBucket,
    effectiveTimeRangeKey,
  ])
  useEffect(() => () => probeGuard.current.invalidate(), [])
  const run = useCallback(async () => {
    if (!generatedSql || !tabConnectionId || connecting || metadataRefreshing)
      return
    const requestTabId = tabId
    const requestQuery = generatedQuery
    const requestSql = generatedSql
    const requestProfileId = await ensureConnectionForTab(requestTabId)
    if (!requestProfileId || !stillBoundTo(requestTabId, requestProfileId))
      return
    const revision = (queryRevisions.current.get(requestTabId) ?? 0) + 1
    queryRevisions.current.set(requestTabId, revision)
    startQuery(requestTabId)
    setHasRun(true, requestTabId)
    try {
      const result: QueryResult = await api.query.run(
        requestProfileId,
        requestSql,
        requestQuery?.parameters ?? [],
      )
      if (
        queryRevisions.current.get(requestTabId) === revision &&
        stillBoundTo(requestTabId, requestProfileId)
      )
        completeQuery(result, null, requestTabId)
    } catch (error) {
      if (
        queryRevisions.current.get(requestTabId) === revision &&
        stillBoundTo(requestTabId, requestProfileId)
      )
        completeQuery(
          null,
          error instanceof Error ? error.message : String(error),
          requestTabId,
        )
    }
  }, [
    generatedSql,
    tabConnectionId,
    connecting,
    metadataRefreshing,
    tabId,
    generatedQuery,
    stillBoundTo,
    startQuery,
    setHasRun,
    completeQuery,
  ])
  const executionKey = generatedQuery
    ? JSON.stringify([generatedQuery.sql, generatedQuery.parameters])
    : null
  useEffect(() => {
    const previous = previousExecution.current.get(tabId)
    const session = selectSession(useStore.getState(), tabId)
    if (
      previous !== undefined &&
      executionKey !== previous &&
      session?.builderHasRun &&
      executionKey
    )
      void run()
    if (executionKey) previousExecution.current.set(tabId, executionKey)
  }, [tabId, executionKey, run])
  useEffect(() => {
    if (!filterNotice) return
    const timer = window.setTimeout(
      () => clearFilterNotice(filterNotice.id, tabId),
      3000,
    )
    return () => window.clearTimeout(timer)
  }, [filterNotice, clearFilterNotice, tabId])
  const openGeneratedSqlMode = () => {
    if (!generatedQuery) return
    const materialized = materializeSqlParameters(
      generatedQuery.sql,
      generatedQuery.parameters,
    )
    setSql(formatSqlOrOriginal(materialized, formatterDialect), tabId)
    setMode('sql', tabId)
  }
  const onKeyDown = (event: React.KeyboardEvent) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault()
      run()
    }
  }

  return (
    <div
      className="editor-pane builder-pane"
      data-builder-panel=""
      onKeyDown={onKeyDown}
    >
      <QueryToolbar
        mode={<ModeSwitch />}
        utilities={<QueryUtilityActions />}
        editorActions={<CopySqlButton sql={formattedGeneratedSql} />}
        execution={
          <button
            className="btn primary"
            onClick={run}
            disabled={
              metadataRefreshing ||
              !generatedSql ||
              !tabConnectionId ||
              connecting ||
              running ||
              Boolean(rangeError)
            }
          >
            {running ? 'Running…' : connecting ? 'Connecting…' : 'Run'}
          </button>
        }
      />
      <AiBuilderCopilot key={`${tabId}:${tabConnectionId}`} />
      <div className={styles.content} data-builder-content="">
        <BuilderForm className={styles.form} data-builder-form="">
          <BuilderRow
            className={`${styles.row} ${styles.contextRow}`}
            data-builder-control-row="context"
          >
            <FormField data-builder-field="">
              <Combobox
                label="Schema"
                value={selectedSchema}
                options={schemaOptions}
                onChange={chooseSchema}
                placeholder="Select a schema…"
                searchable
                emptyMessage="No matching schemas"
                loading={metadataStatus === 'loading'}
                error={
                  metadataStatus === 'error'
                    ? (storeMetadataError ?? 'Could not load schemas')
                    : null
                }
                disabled={!tabConnectionId || metadataStatus === 'loading'}
              />
            </FormField>
            <FormField data-builder-field="">
              <Combobox
                label="Table or view"
                value={
                  selectedRelation ? relationIdentity(selectedRelation) : ''
                }
                options={relationOptions}
                onChange={chooseTable}
                placeholder="Select a table or view…"
                searchable
                disabled={!selectedSchema}
                emptyMessage="No matching tables or views"
                invalidationKey={selectedSchema}
              />
            </FormField>
            <FormField data-builder-field="">
              <Combobox
                label="Time column"
                value={builder.timeColumn ?? ''}
                options={timeColumnOptions}
                onChange={chooseTimeColumn}
                placeholder={
                  temporalColumns.length
                    ? 'Select a time column…'
                    : 'No date/time columns'
                }
                searchable
                disabled={!builder.table || temporalColumns.length === 0}
                emptyMessage="No matching date/time columns"
                invalidationKey={relationInvalidationKey}
              />
            </FormField>
            {effectiveTimeRange && timeFilterColumn ? (
              <FormField data-builder-field="">
                <TimeRangeField
                  value={effectiveTimeRange}
                  onChange={(timeRange) => setBuilder({ timeRange }, tabId)}
                  error={rangeError}
                  columnName={timeFilterColumn.name}
                />
              </FormField>
            ) : (
              <FormField data-builder-field="">
                <span className={styles.fieldLabel}>Time range</span>
                <div className={styles.unavailable} aria-disabled="true">
                  {!builder.table
                    ? 'Select a table'
                    : temporalColumns.length
                      ? 'Select a time column'
                      : 'No date/time columns'}
                </div>
              </FormField>
            )}
          </BuilderRow>
          <BuilderRow
            className={styles.row}
            data-builder-control-row="dimensions"
          >
            <FormField data-builder-field="">
              <Combobox
                label="X axis"
                value={selectedX ?? ''}
                options={xAxisOptions}
                onChange={chooseXAxis}
                placeholder="Select an X axis…"
                searchable
                disabled={!builder.table}
                emptyMessage="No matching columns"
                invalidationKey={relationInvalidationKey}
              />
            </FormField>
            <FormField data-builder-field="">
              <Combobox
                label="Y axis"
                hint="Optional for Count"
                value={selectedY ?? ''}
                options={yAxisOptions}
                onChange={chooseY}
                placeholder={
                  aggregation === 'count'
                    ? 'Count rows (no Y axis)'
                    : 'Select a numeric Y axis…'
                }
                searchable
                disabled={!builder.table}
                emptyMessage="No matching numeric columns"
                invalidationKey={`${relationInvalidationKey}\0${selectedX ?? ''}\0${builder.seriesColumns.join('\0')}`}
              />
              {yRequired && !selectedY && (
                <small className="inline-error" role="status">
                  {aggregationLabel(aggregation)} requires a numeric Y axis
                  column.
                </small>
              )}
            </FormField>
            <FormField data-builder-field="">
              <MultiCombobox
                label="Series"
                values={builder.seriesColumns}
                options={seriesColumnOptions}
                onChange={(nextSeriesColumns) =>
                  void selectSeries(nextSeriesColumns)
                }
                placeholder="No breakdown"
                searchable
                showChips
                disabled={!builder.table || seriesProbe?.status === 'checking'}
                invalidationKey={`${relationInvalidationKey}\0${selectedX ?? ''}\0${selectedY ?? ''}`}
              />
              {seriesProbe?.status === 'checking' && (
                <small role="status">Checking cardinality…</small>
              )}
              {seriesProbe?.status === 'error' && (
                <small className="inline-error" role="alert">
                  {seriesProbe.message}{' '}
                  <button className="btn ghost" onClick={seriesProbe.retry}>
                    Retry
                  </button>
                </small>
              )}
            </FormField>
          </BuilderRow>
          <BuilderRow
            className={`${styles.row} ${styles.transformationsRow}`}
            data-builder-control-row="transformations"
          >
            {xTemporal ? (
              <FormField data-builder-field="">
                <Combobox
                  label="Time bucket"
                  value={builder.timeBucket}
                  options={timeBucketOptions}
                  onChange={(value) => {
                    probeGuard.current.invalidate()
                    setSeriesProbe(null)
                    setBuilder({ timeBucket: value as TimeBucket }, tabId)
                  }}
                />
              </FormField>
            ) : (
              <div className={styles.slotEmpty} aria-hidden="true" />
            )}
            <FormField data-builder-field="">
              <Combobox
                label="Aggregation"
                value={aggregation}
                options={aggregationOptions}
                onChange={chooseAggregation}
                disabled={!builder.table}
              />
            </FormField>
          </BuilderRow>
        </BuilderForm>
        {selectedRelation?.columnsStatus === 'error' && (
          <div className="inline-error" role="alert">
            Could not load columns.{' '}
            {metadataError || selectedRelation.columnsError}
            <button
              className="btn ghost"
              type="button"
              onClick={() => void loadColumns(selectedRelation, true)}
            >
              Retry column metadata
            </button>
          </div>
        )}
        {(axisNotice || filterNotice) && (
          <div className="toast" role="status">
            {[axisNotice, filterNotice?.message].filter(Boolean).join(' ')}
          </div>
        )}
        <GeneratedQueryPanel
          className={styles.generatedSql}
          language="SQL"
          value={formattedGeneratedSql}
          onOpenInEditor={openGeneratedSqlMode}
          emptyState={
            builder.table && selectedX && yRequired && !selectedY
              ? `Select a numeric Y axis for ${aggregationLabel(aggregation)}.`
              : 'Select a table and X axis to preview SQL.'
          }
          supplementary={
            generatedQuery?.parameters.length ? (
              <>
                <strong>Parameters:</strong>{' '}
                <code>{JSON.stringify(generatedQuery.parameters)}</code>
              </>
            ) : undefined
          }
        />
      </div>
    </div>
  )
}
