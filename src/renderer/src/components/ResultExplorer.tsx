import { useCallback, useMemo } from 'react'
import { isBuilderFilterPromotable } from '../lib/builderSql'
import { resultFilterDemotion, type ResultFilter } from '../lib/resultFilters'
import { timeRangeChartDomain } from '../lib/prometheusTimeRange'
import { deriveEffectiveVisualization, type VisualizationConfiguration } from '../lib/resultVisualization'
import { selectActiveSession, useStore, type QueryMode } from '../store/useStore'
import { GenericResultExplorer } from './results/GenericResultExplorer'

export interface ResultExplorerProps {
  mode: QueryMode
  /** Determines whether this result view or an upstream UI owns X/Y/Series mapping. */
  dimensionControls?: 'result' | 'external'
  hasRun?: boolean
}

/** Active-session adapter that maps session state onto controlled result presentation. */
export function ResultExplorer({ mode, dimensionControls = 'result', hasRun = true }: ResultExplorerProps) {
  const tabId = useStore((state) => state.activeTabId)
  const session = useStore(selectActiveSession)
  const connectionStatus = useStore((state) => state.connectionStatus)
  const reconnect = useStore((state) => state.reconnectActiveProfile)
  const datasourceKind = useStore((state) => state.profiles.find((profile) => profile.id === selectActiveSession(state).connectionProfileId)?.kind)
  const setVisualization = useStore((state) => state.setVisualization)
  const addResultFilter = useStore((state) => state.addResultFilter)
  const removeResultFilter = useStore((state) => state.removeResultFilter)
  const clearResultFilters = useStore((state) => state.clearResultFilters)
  const setResultFilterExecution = useStore((state) => state.setResultFilterExecution)
  const setSeriesVisibility = useStore((state) => state.setSeriesVisibility)

  const result = session.result
  const configuration = mode === 'sql' ? session.sqlVisualization : session.builderVisualization
  const activeFilters = mode === 'sql' ? session.sqlResultFilters : session.builderResultFilters
  const effectiveConfiguration = useMemo(() => result
    ? deriveEffectiveVisualization(result, configuration, dimensionControls === 'external' && mode === 'builder' ? 'builder' : 'result', session.builder.seriesColumns)
    : configuration, [configuration, dimensionControls, mode, result, session.builder.seriesColumns])
  const activeTimeRange = datasourceKind === 'prometheus'
    ? session.prometheusTimeRange
    : mode === 'builder' && effectiveConfiguration.xColumn === 'time_bucket' ? session.builder.timeRange : undefined
  const chartTimeDomain = useMemo(() => activeTimeRange ? timeRangeChartDomain(activeTimeRange) : null, [activeTimeRange])

  const handleConfigurationChange = useCallback((next: VisualizationConfiguration) => {
    setVisualization(mode, next, tabId)
  }, [mode, setVisualization, tabId])
  const onSeriesVisibilityChange = useCallback((visibility: Record<string, boolean>) => setSeriesVisibility(visibility, tabId), [setSeriesVisibility, tabId])
  const onAddFilter = useCallback((filter: ResultFilter) => addResultFilter(mode, filter, tabId), [addResultFilter, mode, tabId])
  const onRemoveFilter = useCallback((id: string) => removeResultFilter(mode, id, tabId), [removeResultFilter, mode, tabId])
  const onClearFilters = useCallback(() => clearResultFilters(mode, tabId), [clearResultFilters, mode, tabId])
  const onToggleFilterExecution = useMemo(() => mode === 'builder' ? (id: string) => {
    const target = activeFilters.find((filter) => filter.id === id)
    if (target) setResultFilterExecution(mode, id, target.execution === 'query' ? 'client' : 'query', tabId)
  } : undefined, [activeFilters, mode, setResultFilterExecution, tabId])
  const canPromoteTableFilter = useMemo(() => mode === 'builder'
    ? (filter: ResultFilter) => isBuilderFilterPromotable(filter, session.builder)
    : undefined, [mode, session.builder])
  const canPromoteChartFilter = useMemo(() => mode === 'builder'
    ? (filter: ResultFilter) => isBuilderFilterPromotable(filter, { ...session.builder, xColumn: configuration.xColumn })
    : undefined, [configuration.xColumn, mode, session.builder])
  const canDemoteFilter = useMemo(() => mode === 'builder'
    ? (filter: ResultFilter) => resultFilterDemotion(filter, result?.columns.map((column) => column.name) ?? [])
    : undefined, [mode, result])

  return <GenericResultExplorer
    mode={mode}
    dimensionControls={dimensionControls}
    hasRun={hasRun}
    result={result}
    resultRevision={session.resultRevision}
    running={session.running}
    error={session.queryError}
    isResultStale={session.isResultStale}
    reconnecting={connectionStatus === 'reconnecting'}
    configuration={configuration}
    seriesVisibility={session.seriesVisibility}
    activeFilters={activeFilters}
    externalSeriesColumns={session.builder.seriesColumns}
    timeBucket={session.builder.timeBucket}
    chartTimeDomain={chartTimeDomain}
    onConfigurationChange={handleConfigurationChange}
    onSeriesVisibilityChange={onSeriesVisibilityChange}
    onAddFilter={onAddFilter}
    onRemoveFilter={onRemoveFilter}
    onClearFilters={onClearFilters}
    onToggleFilterExecution={onToggleFilterExecution}
    canPromoteTableFilter={canPromoteTableFilter}
    canPromoteChartFilter={canPromoteChartFilter}
    canDemoteFilter={canDemoteFilter}
    onReconnect={() => void reconnect()}
  />
}
