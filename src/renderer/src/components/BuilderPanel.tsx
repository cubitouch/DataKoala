import { useEffect, useMemo, useRef, useState } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { oneDark } from '@codemirror/theme-one-dark'
import { isNumericType, sqlDialectForSourceKind, type DatabaseColumnNode, type QueryResult } from '@shared/types'
import { api } from '../lib/api'
import { BUILDER_AGGREGATIONS, generateBuilderQuery, isBuilderTemporalDataType, isBuilderTimeBucketSupported, materializeSqlParameters, TIME_BUCKETS } from '../lib/builderSql'
import { canLoadRelationColumns, relationIdentity, relationsForSchema, selectionPatchForColumns } from '../lib/builderRelations'
import { selectActiveSession, selectSession, useStore, type TimeBucket } from '../store/useStore'
import { ensureConnectionForTab } from '../lib/tabConnection'
import { CHART_SERIES_HARD_LIMIT, type CardinalityProbePredicate, type SeriesStatisticsResult } from '@shared/chartLimits'
import { decideFromSeriesStatistics, isSeriesColumnRemoval, SeriesCardinalityProbeGuard, seriesProbeFingerprint, seriesStatisticsFingerprint } from '../lib/seriesCardinalityGuard'
import { ModeSwitch } from './ModeSwitch'
import { CopySqlButton } from './CopySqlButton'
import { Combobox, MultiCombobox, type ComboboxOption } from './ui/combobox'
import { isMinuteBucketAvailable, SEVEN_DAYS, timeRangeProbePredicates, validateBuilderTimeRange } from '../lib/builderTimeRange'
import { TimeRangeField } from './time-range/TimeRangeField'
import { formatSqlOrOriginal } from '../lib/formatSql'
import type { Aggregation } from '../lib/resultVisualization'
import '../axisBuilder.css'
import { formatterDialect as formatterDialectForSql } from '../lib/sqlDialect'
import { ensureRelationColumns } from '../lib/relationColumns'

const isTimeColumn = (column: DatabaseColumnNode) => isBuilderTemporalDataType(column.dataTypeName)
const aggregationLabel = (aggregation: Aggregation) => aggregation === 'average' ? 'Average' : aggregation === 'minimum' ? 'Minimum' : aggregation === 'maximum' ? 'Maximum' : aggregation === 'count' ? 'Count' : 'Sum'

const aggregationOptions: ComboboxOption[] = BUILDER_AGGREGATIONS.map((aggregation) => ({ value: aggregation, label: aggregationLabel(aggregation) }))

export function BuilderPanel() {
  const tabId = useStore((state) => state.activeTabId)
  const activeId = useStore((state) => state.activeProfileId)
  const connected = useStore((state) => state.connected)
  const connecting = useStore((state) => state.connecting)
  const tabConnectionId = useStore((state) => selectActiveSession(state).connectionProfileId)
  const connectionKind = useStore((state) => state.profiles.find((profile) => profile.id === selectActiveSession(state).connectionProfileId)?.kind)
  const builder = useStore((state) => selectActiveSession(state).builder)
  const builderVisualization = useStore((state) => selectActiveSession(state).builderVisualization)
  const setBuilder = useStore((state) => state.setBuilder)
  const setVisualization = useStore((state) => state.setVisualization)
  const setSql = useStore((state) => state.setSql)
  const setMode = useStore((state) => state.setQueryMode)
  const running = useStore((state) => selectActiveSession(state).running)
  const startQuery = useStore((state) => state.startQuery)
  const completeQuery = useStore((state) => state.completeQuery)
  const setHasRun = useStore((state) => state.setBuilderHasRun)
  const metadata = useStore((state) => tabConnectionId ? state.metadataByProfileId[tabConnectionId] : undefined)
  const schemas = metadata?.schemas ?? []
  const metadataStatus = metadata?.status ?? 'idle'
  const storeMetadataError = metadata?.error ?? null
  const setRelationColumns = useStore((state) => state.setRelationColumns)
  const [metadataError, setMetadataError] = useState<string | null>(null)
  const [selectedSchema, setSelectedSchema] = useState(builder.table?.schema ?? '')
  const filterNotice = useStore((state) => selectActiveSession(state).builderFilterNotice)
  const filters = useStore((state) => selectActiveSession(state).builderResultFilters)
  const removeResultFilter = useStore((state) => state.removeResultFilter)
  const clearFilterNotice = useStore((state) => state.clearBuilderFilterNotice)
  const previousExecution = useRef(new Map<string, string>())
  const queryRevisions = useRef(new Map<string, number>())
  const previousMetadataStatus = useRef(metadataStatus)
  const probeGuard = useRef(new SeriesCardinalityProbeGuard())
  const statisticsCache = useRef(new Map<string, SeriesStatisticsResult>())
  const [seriesProbe, setSeriesProbe] = useState<{ status: 'checking' | 'error'; message?: string; retry?: () => void } | null>(null)
  const [axisNotice, setAxisNotice] = useState<string | null>(null)
  const tabConnected = Boolean(tabConnectionId && connected && activeId === tabConnectionId)
  const stillBoundTo = (requestTabId: string, profileId: string) => selectSession(useStore.getState(), requestTabId)?.connectionProfileId === profileId

  useEffect(() => {
    const legacyX = builderVisualization.xColumn === 'time_bucket'
    const legacyCount = builderVisualization.valueColumn === 'count' && builderVisualization.aggregation === 'sum'
    if (!legacyX && !legacyCount) return
    setVisualization('builder', {
      ...(legacyX ? { xColumn: builder.timeColumn } : {}),
      ...(legacyCount ? { valueColumn: null, aggregation: 'count' as const } : {})
    }, tabId)
  }, [tabId, builder.timeColumn, builderVisualization.xColumn, builderVisualization.valueColumn, builderVisualization.aggregation, setVisualization])

  const selectedRelation = builder.table ? relationsForSchema(schemas, builder.table.schema)
    .find((relation) => relationIdentity(relation) === relationIdentity(builder.table!)) : undefined
  const columns = selectedRelation?.columns ?? []
  const temporalColumns = columns.filter(isTimeColumn)
  const selectedX = builderVisualization.xColumn === 'time_bucket' ? builder.timeColumn : builderVisualization.xColumn
  const xColumn = selectedX ? columns.find((column) => column.name === selectedX) : undefined
  const xTemporal = Boolean(xColumn && isTimeColumn(xColumn))
  const timeFilterColumn = builder.timeColumn ? columns.find((column) => column.name === builder.timeColumn && isTimeColumn(column)) : undefined
  const aggregation: Aggregation = builderVisualization.valueColumn === 'count' && builderVisualization.aggregation === 'sum' ? 'count' : builderVisualization.aggregation
  const selectedY = aggregation === 'count' ? null : builderVisualization.valueColumn
  const yColumn = selectedY ? columns.find((column) => column.name === selectedY && isNumericType(column.dataTypeName)) : undefined
  const effectiveTimeRange = timeFilterColumn ? (builder.timeRange ?? SEVEN_DAYS) : undefined
  const rangeError = effectiveTimeRange ? validateBuilderTimeRange(effectiveTimeRange) : null
  const minuteBucketAvailable = effectiveTimeRange ? isMinuteBucketAvailable(effectiveTimeRange) : false
  const yRequired = aggregation !== 'count'
  const configurationComplete = Boolean(builder.table && xColumn && (!yRequired || yColumn) && !rangeError)

  useEffect(() => {
    if (!selectedRelation || selectedRelation.columnsStatus !== 'loaded' || !selectedRelation.columns) return
    const state = useStore.getState()
    let session = selectSession(state, tabId)
    if (!session || !session.builder.table || relationIdentity(session.builder.table) !== relationIdentity(selectedRelation)) return
    const next = selectedRelation.columns
    const requested = { schema: selectedRelation.schema, name: selectedRelation.name }
    const patch = selectionPatchForColumns(requested, session.builder.table, session.builder, next, isTimeColumn)
    if (patch) state.setBuilder(patch, tabId)
    session = selectSession(useStore.getState(), tabId)
    if (!session) return
    const sourceX = session.builderVisualization.xColumn === 'time_bucket' ? session.builder.timeColumn : session.builderVisualization.xColumn
    const sourceY = session.builderVisualization.aggregation === 'count' ? null : session.builderVisualization.valueColumn
    const nextX = sourceX && next.some((column) => column.name === sourceX) ? sourceX : null
    const nextY = sourceY && next.some((column) => column.name === sourceY && isNumericType(column.dataTypeName)) ? sourceY : null
    if (nextX !== sourceX || nextY !== sourceY) {
      useStore.getState().setVisualization('builder', {
        xColumn: nextX,
        valueColumn: nextY,
        ...(sourceY && !nextY ? { aggregation: 'count' as const } : {})
      }, tabId)
    }
  }, [tabId, selectedRelation?.qualifiedName, selectedRelation?.columnsStatus, selectedRelation?.columns])

  const loadColumns = async (relation: typeof selectedRelation, explicitRetry = false) => {
    if (!relation || relation.columnsStatus === 'loaded' || !canLoadRelationColumns(relation.columnsStatus, explicitRetry)) return
    const requestTabId = tabId
    const requestProfileId = await ensureConnectionForTab(requestTabId)
    if (!requestProfileId || !stillBoundTo(requestTabId, requestProfileId)) return
    const requested = { schema: relation.schema, name: relation.name }
    const qualifiedName = relation.qualifiedName
    setMetadataError(null)
    try {
      const next = await ensureRelationColumns(requestProfileId, relation, explicitRetry)
      if (!next) return
      let state = useStore.getState()
      let session = selectSession(state, requestTabId)
      if (!session || session.connectionProfileId !== requestProfileId) return
      const patch = selectionPatchForColumns(requested, session.builder.table, session.builder, next, isTimeColumn)
      if (patch) state.setBuilder(patch, requestTabId)
      state = useStore.getState()
      session = selectSession(state, requestTabId)
      if (!session) return
      const sourceX = session.builderVisualization.xColumn === 'time_bucket' ? session.builder.timeColumn : session.builderVisualization.xColumn
      const sourceY = session.builderVisualization.aggregation === 'count' ? null : session.builderVisualization.valueColumn
      const nextX = sourceX && next.some((column) => column.name === sourceX) ? sourceX : null
      const nextY = sourceY && next.some((column) => column.name === sourceY && isNumericType(column.dataTypeName)) ? sourceY : null
      if (nextX !== sourceX || nextY !== sourceY) {
        state.setVisualization('builder', {
          xColumn: nextX,
          valueColumn: nextY,
          ...(sourceY && !nextY ? { aggregation: 'count' as const } : {})
        }, requestTabId)
      }
    } catch (error) {
      setRelationColumns(qualifiedName, undefined, 'error', String(error), requestProfileId)
      const session = selectSession(useStore.getState(), requestTabId)
      if (session?.connectionProfileId === requestProfileId && relationIdentity(session.builder.table ?? { schema: '', name: '' }) === relationIdentity(requested)) setMetadataError(String(error))
    }
  }
  useEffect(() => {
    const previous = previousMetadataStatus.current
    previousMetadataStatus.current = metadataStatus
    if (previous !== 'loading' || metadataStatus !== 'loaded' || !tabConnected || !selectedRelation || selectedRelation.columnsStatus !== 'idle') return
    void loadColumns(selectedRelation)
  }, [metadataStatus, tabConnected, selectedRelation?.qualifiedName, selectedRelation?.columnsStatus])

  const generatedQuery = useMemo(() => configurationComplete && builder.table && selectedX ? generateBuilderQuery({
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
    filters
  }) : null, [configurationComplete, builder, connectionKind, selectedX, xColumn?.dataTypeName, timeFilterColumn?.dataTypeName, selectedY, aggregation, effectiveTimeRange, filters])
  const generatedSql = generatedQuery?.sql ?? ''
  const formatterDialect = formatterDialectForSql(sqlDialectForSourceKind(connectionKind ?? 'postgres'))
  const formattedGeneratedSql = useMemo(() => generatedSql ? formatSqlOrOriginal(generatedSql, formatterDialect) : '', [generatedSql, formatterDialect])

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
  const schemaOptions: ComboboxOption[] = schemas.map((schema) => ({ value: schema.name, label: schema.name, subtitle: schema.isSystem ? 'schema · system' : 'schema', keywords: [schema.name, schema.isSystem ? 'system' : 'user'] }))
  const relationTypeLabel = (kind: typeof relations[number]['kind']) => kind === 'r' ? 'table' : kind === 'v' ? 'view' : 'materialized view'
  const relationOptions: ComboboxOption[] = relations.map((relation) => {
    const typeLabel = relationTypeLabel(relation.kind)
    return { value: relationIdentity(relation), label: relation.name, subtitle: `${typeLabel} · ${relation.schema}`, keywords: [relation.name, relation.schema, typeLabel, relation.qualifiedName] }
  })
  const relationInvalidationKey = `${builder.table?.schema ?? ''}\0${builder.table?.name ?? ''}`
  const timeColumnOptions: ComboboxOption[] = temporalColumns.map((column) => ({ value: column.name, label: column.name, subtitle: column.dataTypeName, keywords: [column.name, column.dataTypeName] }))
  const xAxisOptions: ComboboxOption[] = columns.map((column) => ({ value: column.name, label: column.name, subtitle: column.dataTypeName, keywords: [column.name, column.dataTypeName] }))
  const yAxisOptions: ComboboxOption[] = columns
    .filter((column) => isNumericType(column.dataTypeName) && column.name !== selectedX && !builder.seriesColumns.includes(column.name))
    .map((column) => ({ value: column.name, label: column.name, subtitle: column.dataTypeName, keywords: [column.name, column.dataTypeName] }))
  const timeBucketOptions: ComboboxOption[] = TIME_BUCKETS.map((bucket) => ({
    value: bucket,
    label: bucket[0].toUpperCase() + bucket.slice(1),
    disabled: (bucket === 'minute' && !minuteBucketAvailable) || !isBuilderTimeBucketSupported(xColumn?.dataTypeName, bucket, connectionKind === 'bigquery' ? 'google-sql' : undefined),
    subtitle: !isBuilderTimeBucketSupported(xColumn?.dataTypeName, bucket, connectionKind === 'bigquery' ? 'google-sql' : undefined) ? 'BigQuery DATE supports day or larger buckets' : bucket === 'minute' && !minuteBucketAvailable ? 'Available for ranges up to 24 hours' : undefined
  }))
  const seriesColumnOptions: ComboboxOption[] = columns
    .filter((column) => column.name !== selectedX && column.name !== selectedY)
    .map((column) => ({ value: column.name, label: column.name, subtitle: column.dataTypeName, keywords: [column.name, column.dataTypeName] }))

  const clearMetricFilters = () => {
    const removed = filters.filter((filter) => filter.column === 'count' || filter.column === 'value')
    for (const filter of removed) removeResultFilter('builder', filter.id, tabId)
    return removed.length
  }
  const clearXAxisFilters = () => {
    if (!selectedX) return 0
    const removed = filters.filter((filter) => filter.column === 'time_bucket' || filter.column === selectedX || filter.provenance?.sourceColumn === selectedX)
    for (const filter of removed) removeResultFilter('builder', filter.id, tabId)
    return removed.length
  }
  const resetAxisModel = () => {
    setVisualization('builder', { xColumn: null, valueColumn: null, aggregation: 'count', seriesColumn: null, seriesColumns: [] }, tabId)
  }
  const chooseSchema = (schema: string) => {
    probeGuard.current.invalidate(); setSeriesProbe(null); setAxisNotice(null)
    setSelectedSchema(schema)
    setBuilder({ table: null, timeColumn: null, timeBucket: 'day', timeRange: undefined, seriesColumns: [] }, tabId)
    resetAxisModel()
    setHasRun(false, tabId)
  }
  const chooseTable = (value: string) => {
    probeGuard.current.invalidate(); setSeriesProbe(null); setAxisNotice(null)
    const table = relations.find((relation) => relationIdentity(relation) === value) ?? null
    setBuilder({ table, timeColumn: null, timeBucket: 'day', timeRange: undefined, seriesColumns: [] }, tabId)
    resetAxisModel()
    setHasRun(false, tabId)
    if (table) void loadColumns(table)
  }
  const chooseTimeColumn = (value: string) => {
    probeGuard.current.invalidate(); setSeriesProbe(null)
    const nextTimeColumn = value || null
    setBuilder({
      timeColumn: nextTimeColumn,
      timeRange: nextTimeColumn ? (builder.timeRange ?? SEVEN_DAYS) : undefined
    }, tabId)
  }
  const chooseXAxis = (value: string) => {
    probeGuard.current.invalidate(); setSeriesProbe(null)
    const nextX = value || null
    const nextMetadata = nextX ? columns.find((column) => column.name === nextX) : undefined
    const nextTemporal = Boolean(nextMetadata && isTimeColumn(nextMetadata))
    const nextSeries = builder.seriesColumns.filter((column) => column !== nextX)
    const yConflict = Boolean(nextX && selectedY === nextX)
    const nextY = yConflict ? null : selectedY
    const nextAggregation = yConflict ? 'count' as const : aggregation
    const firstSelection = !selectedX
    const adoptXAsTimeFilter = Boolean(nextTemporal && nextX && !builder.timeColumn)
    const dateBucketFallback = connectionKind === 'bigquery' && nextMetadata?.dataTypeName.toLowerCase() === 'date' && (builder.timeBucket === 'minute' || builder.timeBucket === 'hour')
    const notices: string[] = []
    if (yConflict) notices.push(`Cleared Y axis ${selectedY} because it is now the X axis.`)
    if (nextSeries.length !== builder.seriesColumns.length) notices.push(`Removed ${nextX} from Series because it is now the X axis.`)
    if (xTemporal && !nextTemporal) notices.push(builder.timeColumn ? 'Time bucket was cleared because the new X axis is not temporal. Time range is still applied to the dataset.' : 'Time bucket was cleared because the new X axis is not temporal.')
    if (dateBucketFallback) notices.push('Changed Time bucket to Day because BigQuery DATE does not support minute or hour buckets.')
    if (clearXAxisFilters()) notices.push('Cleared filters tied to the previous X axis.')
    if (clearMetricFilters()) notices.push('Cleared result filters tied to the previous aggregated Y axis.')
    setBuilder({
      timeColumn: adoptXAsTimeFilter ? nextX : builder.timeColumn,
      timeBucket: nextTemporal ? (dateBucketFallback ? 'day' : xTemporal ? builder.timeBucket : 'day') : 'day',
      timeRange: adoptXAsTimeFilter ? (builder.timeRange ?? SEVEN_DAYS) : builder.timeRange,
      seriesColumns: nextSeries
    }, tabId)
    setVisualization('builder', {
      xColumn: nextX,
      valueColumn: nextY,
      aggregation: nextAggregation,
      seriesColumn: null,
      seriesColumns: nextSeries,
      ...(firstSelection && nextX ? { view: nextTemporal ? 'line' as const : 'bar' as const } : {})
    }, tabId)
    setAxisNotice(notices.join(' ') || null)
  }
  const chooseY = (value: string) => {
    const nextY = value || null
    const notices: string[] = []
    let nextAggregation = aggregation
    if (nextY && aggregation === 'count') {
      nextAggregation = 'sum'
      notices.push('Changed Aggregation to Sum because a Y axis column was selected.')
    } else if (!nextY && aggregation !== 'count') {
      nextAggregation = 'count'
      notices.push('Changed Aggregation to Count because Y axis was cleared.')
    }
    const nextSeries = builder.seriesColumns.filter((column) => column !== nextY)
    if (nextSeries.length !== builder.seriesColumns.length) notices.push(`Removed ${nextY} from Series because it is now the Y axis.`)
    if (clearMetricFilters()) notices.push('Cleared result filters tied to the previous aggregated Y axis.')
    if (nextSeries.length !== builder.seriesColumns.length) setBuilder({ seriesColumns: nextSeries }, tabId)
    setVisualization('builder', { valueColumn: nextY, aggregation: nextAggregation, seriesColumn: null, seriesColumns: nextSeries }, tabId)
    setAxisNotice(notices.join(' ') || null)
  }
  const chooseAggregation = (value: string) => {
    const nextAggregation = value as Aggregation
    const notices: string[] = []
    const nextY = nextAggregation === 'count' ? null : selectedY
    if (nextAggregation === 'count' && selectedY) notices.push(`Cleared Y axis ${selectedY} because Count operates on rows.`)
    if (clearMetricFilters()) notices.push('Cleared result filters tied to the previous aggregation.')
    setVisualization('builder', { aggregation: nextAggregation, valueColumn: nextY }, tabId)
    setAxisNotice(notices.join(' ') || null)
  }
  const applySeries = (nextSeriesColumns: string[], requestTabId = tabId) => {
    setBuilder({ seriesColumns: nextSeriesColumns }, requestTabId)
    setVisualization('builder', { seriesColumn: null, seriesColumns: nextSeriesColumns }, requestTabId)
  }
  const probePredicates = (): CardinalityProbePredicate[] => builder.timeColumn && effectiveTimeRange ? timeRangeProbePredicates(effectiveTimeRange, builder.timeColumn, timeFilterColumn?.dataTypeName) : []
  const selectSeries = async (requestedSeriesColumns: string[]) => {
    const nextSeriesColumns = requestedSeriesColumns.filter((column) => column !== selectedX && column !== selectedY)
    const canOnlyDecrease = isSeriesColumnRemoval(builder.seriesColumns, nextSeriesColumns)
    if (canOnlyDecrease) { probeGuard.current.invalidate(); setSeriesProbe(null); applySeries(nextSeriesColumns); return }
    if (!tabConnectionId || !builder.table) return
    const requestTabId = tabId
    const requestProfileId = await ensureConnectionForTab(requestTabId)
    if (!requestProfileId) return
    const fingerprint = seriesProbeFingerprint({ profileId: requestProfileId, builder: { ...builder, timeRange: effectiveTimeRange }, seriesColumns: nextSeriesColumns })
    const operation = probeGuard.current.begin(fingerprint)
    if (operation.cached) { setSeriesProbe(null); applySeries(nextSeriesColumns, requestTabId); return }
    const retry = () => void selectSeries(nextSeriesColumns)
    setSeriesProbe({ status: 'checking' })
    const isCurrent = () => {
      const current = useStore.getState()
      const session = selectSession(current, requestTabId)
      const currentFingerprint = session?.connectionProfileId
        ? seriesProbeFingerprint({ profileId: session.connectionProfileId, builder: session.builder, seriesColumns: nextSeriesColumns })
        : null
      return currentFingerprint === fingerprint && probeGuard.current.isCurrent(operation.revision, fingerprint)
    }
    try {
      if (nextSeriesColumns.length === 1) {
        const statsKey = seriesStatisticsFingerprint({ profileId: requestProfileId, builder: { ...builder, timeRange: effectiveTimeRange }, seriesColumns: nextSeriesColumns })
        let statistics = statisticsCache.current.get(statsKey)
        if (!statistics) {
          try {
            statistics = await api.query.seriesStatistics(requestProfileId, { schema: builder.table.schema, table: builder.table.name, column: nextSeriesColumns[0] })
          } catch {
            statistics = { available: false, source: 'pg_stats' }
          }
          if (!isCurrent()) return
          statisticsCache.current.set(statsKey, statistics ?? { available: false, source: 'pg_stats' })
        }
        if (!isCurrent()) return
        const resolvedStatistics = statistics ?? { available: false, source: 'pg_stats' as const }
        const decision = decideFromSeriesStatistics(resolvedStatistics, Boolean(effectiveTimeRange && effectiveTimeRange.kind !== 'all'), nextSeriesColumns.length)
        if (decision === 'accept') {
          if (probeGuard.current.approve(operation.revision, fingerprint)) { setSeriesProbe(null); applySeries(nextSeriesColumns, requestTabId) }
          return
        }
        if (decision === 'reject') {
          const estimate = Math.round(resolvedStatistics.estimatedDistinct ?? 0).toLocaleString()
          setSeriesProbe({ status: 'error', message: `PostgreSQL estimates this column has approximately ${estimate} distinct values, above the supported chart limit of ${CHART_SERIES_HARD_LIMIT}. Filter the data first or choose another column.`, retry })
          return
        }
      }
      const response = await api.query.probeSeriesCardinality(requestProfileId, { schema: builder.table.schema, table: builder.table.name, seriesColumns: nextSeriesColumns, predicates: probePredicates() })
      if (!isCurrent()) return
      if (response.exceedsHardLimit) {
        setSeriesProbe({ status: 'error', message: `This Series selection has more than ${CHART_SERIES_HARD_LIMIT} distinct combinations and cannot be charted safely. Filter the data first or choose lower-cardinality dimensions.`, retry })
        return
      }
      if (probeGuard.current.approve(operation.revision, fingerprint)) { setSeriesProbe(null); applySeries(nextSeriesColumns, requestTabId) }
    } catch {
      if (probeGuard.current.isCurrent(operation.revision, fingerprint)) setSeriesProbe({ status: 'error', message: 'Could not check Series cardinality.', retry })
    }
  }
  useEffect(() => {
    probeGuard.current.invalidate()
    setSeriesProbe(null)
  }, [tabConnectionId, builder.table?.schema, builder.table?.name, builder.timeColumn, selectedX, builder.timeBucket, JSON.stringify(effectiveTimeRange)])
  useEffect(() => () => probeGuard.current.invalidate(), [])
  const run = async () => {
    if (!generatedSql || !tabConnectionId || connecting) return
    const requestTabId = tabId
    const requestQuery = generatedQuery
    const requestSql = generatedSql
    const requestProfileId = await ensureConnectionForTab(requestTabId)
    if (!requestProfileId || !stillBoundTo(requestTabId, requestProfileId)) return
    const revision = (queryRevisions.current.get(requestTabId) ?? 0) + 1
    queryRevisions.current.set(requestTabId, revision)
    startQuery(requestTabId); setHasRun(true, requestTabId)
    try {
      const result: QueryResult = await api.query.run(requestProfileId, requestSql, requestQuery?.parameters ?? [])
      if (queryRevisions.current.get(requestTabId) === revision && stillBoundTo(requestTabId, requestProfileId)) completeQuery(result, null, requestTabId)
    } catch (error) {
      if (queryRevisions.current.get(requestTabId) === revision && stillBoundTo(requestTabId, requestProfileId)) completeQuery(null, error instanceof Error ? error.message : String(error), requestTabId)
    }
  }
  useEffect(() => {
    const execution = generatedQuery ? JSON.stringify([generatedQuery.sql, generatedQuery.parameters]) : null
    const previous = previousExecution.current.get(tabId)
    const session = selectSession(useStore.getState(), tabId)
    if (previous !== undefined && execution !== previous && session?.builderHasRun && execution) void run()
    if (execution) previousExecution.current.set(tabId, execution)
  }, [tabId, generatedQuery?.sql, JSON.stringify(generatedQuery?.parameters ?? [])])
  useEffect(() => {
    if (!filterNotice) return
    const timer = window.setTimeout(() => clearFilterNotice(filterNotice.id, tabId), 3000)
    return () => window.clearTimeout(timer)
  }, [filterNotice, clearFilterNotice, tabId])
  const openGeneratedSqlMode = () => {
    if (!generatedQuery) return
    const materialized = materializeSqlParameters(generatedQuery.sql, generatedQuery.parameters)
    setSql(formatSqlOrOriginal(materialized, formatterDialect), tabId)
    setMode('sql', tabId)
  }
  const onKeyDown = (event: React.KeyboardEvent) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); run() }
  }

  return <div className="editor-pane builder-pane" onKeyDown={onKeyDown}>
    <div className="editor-head"><ModeSwitch /><div className="spacer"/><span className="info">⌘↵ run</span><button className="btn primary" onClick={run} disabled={!generatedSql || !tabConnectionId || connecting || running || Boolean(rangeError)}>{running ? 'Running…' : connecting ? 'Connecting…' : 'Run query'}</button></div>
    <div className="builder-form axis-builder-form">
      <div className="builder-row builder-row-context">
        <div className="builder-control"><span className="builder-field-label">Schema</span><Combobox label="Schema" value={selectedSchema} options={schemaOptions} onChange={chooseSchema} placeholder="Select a schema…" loading={metadataStatus === 'loading'} error={metadataStatus === 'error' ? (storeMetadataError ?? 'Could not load schemas') : null} disabled={!tabConnectionId || metadataStatus === 'loading'} /></div>
        <div className="builder-control"><span className="builder-field-label">Table/view</span><Combobox label="Table or view" value={selectedRelation ? relationIdentity(selectedRelation) : ''} options={relationOptions} onChange={chooseTable} placeholder="Select a table or view…" searchable disabled={!selectedSchema} emptyMessage="No matching tables or views" invalidationKey={selectedSchema} /></div>
        <div className="builder-control"><span className="builder-field-label">Time column</span><Combobox label="Time column" value={builder.timeColumn ?? ''} options={timeColumnOptions} onChange={chooseTimeColumn} placeholder={temporalColumns.length ? 'Select a time column…' : 'No date/time columns'} searchable disabled={!builder.table || temporalColumns.length === 0} emptyMessage="No matching date/time columns" invalidationKey={relationInvalidationKey} /></div>
        {effectiveTimeRange && timeFilterColumn ? <TimeRangeField value={effectiveTimeRange} onChange={(timeRange) => setBuilder({ timeRange }, tabId)} error={rangeError} columnName={timeFilterColumn.name}/> : <div className="builder-control"><span className="builder-field-label">Time range</span><div className="builder-unavailable" aria-disabled="true">{!builder.table ? 'Select a table' : temporalColumns.length ? 'Select a time column' : 'No date/time columns'}</div></div>}
      </div>
      <div className="builder-row">
        <div className="builder-control"><span className="builder-field-label">X axis</span><Combobox label="X axis" value={selectedX ?? ''} options={xAxisOptions} onChange={chooseXAxis} placeholder="Select an X axis…" searchable disabled={!builder.table} emptyMessage="No matching columns" invalidationKey={relationInvalidationKey} /></div>
        {xTemporal ? <div className="builder-control"><span className="builder-field-label">Time bucket</span><Combobox label="Time bucket" value={builder.timeBucket} options={timeBucketOptions} onChange={(value) => { probeGuard.current.invalidate(); setSeriesProbe(null); setBuilder({ timeBucket: value as TimeBucket }, tabId) }} /></div> : <div className="builder-slot-empty" aria-hidden="true"/>}
        <div className="builder-control"><span className="builder-field-label">Series</span><MultiCombobox label="Series columns" values={builder.seriesColumns} options={seriesColumnOptions} onChange={(nextSeriesColumns) => void selectSeries(nextSeriesColumns)} placeholder="No breakdown" searchable showChips disabled={!builder.table || seriesProbe?.status === 'checking'} invalidationKey={`${relationInvalidationKey}\0${selectedX ?? ''}\0${selectedY ?? ''}`} />{seriesProbe?.status === 'checking' && <small role="status">Checking cardinality…</small>}{seriesProbe?.status === 'error' && <small className="inline-error" role="alert">{seriesProbe.message} <button className="btn ghost" onClick={seriesProbe.retry}>Retry</button></small>}</div>
      </div>
      <div className="builder-row">
        <div className="builder-control"><span className="builder-field-label">Y axis <span>(optional for Count)</span></span><Combobox label="Y axis" value={selectedY ?? ''} options={yAxisOptions} onChange={chooseY} placeholder={aggregation === 'count' ? 'Count rows (no Y axis)' : 'Select a numeric Y axis…'} searchable disabled={!builder.table} emptyMessage="No matching numeric columns" invalidationKey={`${relationInvalidationKey}\0${selectedX ?? ''}\0${builder.seriesColumns.join('\0')}`} />{yRequired && !selectedY && <small className="inline-error" role="status">{aggregationLabel(aggregation)} requires a numeric Y axis column.</small>}</div>
        <div className="builder-control"><span className="builder-field-label">Aggregation</span><Combobox label="Aggregation" value={aggregation} options={aggregationOptions} onChange={chooseAggregation} disabled={!builder.table} /></div>
        <div className="builder-slot-empty" aria-hidden="true"/>
      </div>
    </div>
    {selectedRelation?.columnsStatus === 'error' && <div className="inline-error" role="alert">Could not load columns. {metadataError || selectedRelation.columnsError}<button className="btn ghost" type="button" onClick={() => void loadColumns(selectedRelation, true)}>Retry column metadata</button></div>}
    {(axisNotice || filterNotice) && <div className="toast" role="status">{[axisNotice, filterNotice?.message].filter(Boolean).join(' ')}</div>}
    <details className="generated-sql">
      <summary>
        <span style={{ marginLeft: 4 }}>Generated SQL</span>
        <button className="btn ghost" type="button" disabled={!generatedQuery} style={{ float: 'right', marginTop: -4, marginBottom: -4 }} onClick={(event) => {
          event.preventDefault(); event.stopPropagation(); openGeneratedSqlMode()
        }}>Open in SQL mode</button>
      </summary>
      {generatedQuery ? <>
        <CodeMirror value={formattedGeneratedSql} height="150px" theme={oneDark} editable={false} basicSetup={{ lineNumbers: true, foldGutter: false }} />
        {generatedQuery.parameters.length > 0 && <div className="generated-parameters"><strong>Parameters:</strong> <code>{JSON.stringify(generatedQuery.parameters)}</code></div>}
        <div className="generated-actions"><CopySqlButton sql={formattedGeneratedSql} /></div>
      </> : <p>{builder.table && selectedX && yRequired && !selectedY ? `Select a numeric Y axis for ${aggregationLabel(aggregation)}.` : 'Select a table and X axis to preview SQL.'}</p>}
    </details>
  </div>
}
