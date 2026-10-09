import { Popover } from '@components/ui/Popover'
import type { AiAnomalyAnalysis } from '@shared/ai'
import type { ChartAnomalyAnnotation } from '@lib/chartAnomalyMapping'
import type { SampledChartSeries } from '@lib/chartAnomalySampling'
import styles from '@components/ai/Ai.module.css'

function formatPoint(value: unknown): string {
  if (value instanceof Date) return value.toISOString()
  return value == null ? '—' : String(value)
}

export function AiAnomalyDetailsPopover({
  analysis,
  anomalies,
  samples,
  valueAxisScale = 'linear',
}: {
  analysis: AiAnomalyAnalysis
  anomalies: readonly ChartAnomalyAnnotation[]
  samples: readonly SampledChartSeries[]
  valueAxisScale?: 'linear' | 'log'
}) {
  const sampledCount = samples.reduce(
    (total, sample) => total + sample.points.length,
    0,
  )
  const validCount = samples.reduce(
    (total, sample) => total + sample.validPointCount,
    0,
  )
  const coverage =
    validCount > 0 ? Math.round((sampledCount / validCount) * 100) : 0

  return (
    <Popover
      trigger={`AI details (${analysis.anomalies.length})`}
      ariaLabel={`AI details (${analysis.anomalies.length})`}
      popupType="dialog"
      contentRole="dialog"
      preferredWidth={460}
      maxHeight={560}
      contentClassName={styles.context}
    >
      <header className={styles.contextHeader}>
        <div>
          <strong>AI anomaly analysis</strong>
          <div className={styles.contextHeaderSubtitle}>
            OpenRouter reviewed a bounded chart sample.
          </div>
        </div>
        <span className={styles.contextProvider}>
          {coverage}% sample coverage
        </span>
      </header>

      <div className={styles.anomalyDetailsBody}>
        <p className={styles.anomalySummary}>{analysis.summary}</p>
        {valueAxisScale === 'log' &&
          anomalies.some((anomaly) => anomaly.y <= 0) && (
            <p className={styles.anomalyCoverageNote} role="note">
              Nonpositive flagged values remain in the analysis but cannot be
              shown on a logarithmic axis.
            </p>
          )}
        <section aria-label="Flagged points">
          <h3>Flagged points</h3>
          {anomalies.length ? (
            <ul className={styles.anomalyList}>
              {anomalies.map((anomaly) => (
                <li
                  className={styles.anomalyItem}
                  key={`${anomaly.chartSeriesIndex}:${anomaly.originalIndex}`}
                >
                  <div className={styles.anomalyItemHeading}>
                    <strong>{anomaly.title}</strong>
                    {anomaly.severity && (
                      <span className={styles.anomalySeverity}>
                        {anomaly.severity}
                      </span>
                    )}
                  </div>
                  <div className={styles.anomalyPoint}>
                    {anomaly.seriesName} · X {formatPoint(anomaly.x)} · Y{' '}
                    {formatPoint(anomaly.y)}
                  </div>
                  <p>{anomaly.reason}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.anomalyEmpty}>
              No candidate anomalies found in the supplied sample.
            </p>
          )}
        </section>

        {!!analysis.limitations.length && (
          <section aria-label="Limitations">
            <h3>Limitations</h3>
            <ul className={styles.anomalyTextList}>
              {analysis.limitations.map((item, index) => (
                <li key={index}>{item}</li>
              ))}
            </ul>
          </section>
        )}

        {!!analysis.followUps.length && (
          <section aria-label="Explore next">
            <h3>Explore next</h3>
            <ul className={styles.anomalyTextList}>
              {analysis.followUps.map((item, index) => (
                <li key={index}>{item}</li>
              ))}
            </ul>
          </section>
        )}

        <section aria-label="Sample coverage">
          <h3>Sample coverage</h3>
          <ul className={styles.anomalyTextList}>
            {samples.map((sample) => (
              <li key={sample.name}>
                {sample.name}: {sample.points.length} of{' '}
                {sample.validPointCount} valid points (
                {Math.round(sample.sampleCoverage * 100)}%)
              </li>
            ))}
          </ul>
          <p className={styles.anomalyCoverageNote}>
            Points outside this bounded sample were not reviewed.
          </p>
        </section>
      </div>
    </Popover>
  )
}
