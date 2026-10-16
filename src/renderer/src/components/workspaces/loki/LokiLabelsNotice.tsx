import { useEffect, useState } from 'react'
import { CopySqlButton } from '@components/query/CopySqlButton'
import styles from './LokiExplorer.module.css'

/** The workspace owns label-discovery failure; other consumers link here. */
export function LokiLabelsNotice({
  status,
  error,
  onRetry,
}: {
  status: 'loading' | 'loaded' | 'error'
  error: string | null
  onRetry: () => Promise<void>
}) {
  const [recovering, setRecovering] = useState(false)
  useEffect(() => {
    if (status === 'error') setRecovering(true)
  }, [status])
  if (status !== 'error' && !recovering) return null
  return (
    <section
      id="loki-label-recovery"
      className={styles.labelRecovery}
      aria-label="Loki label recovery"
      role={status === 'error' ? 'alert' : 'status'}
    >
      <div className={styles.recoveryActions}>
        <strong>
          {status === 'error'
            ? "Couldn't refresh Loki labels"
            : status === 'loading'
              ? 'Retrying Loki labels…'
              : 'Loki labels refreshed'}
        </strong>
        {status !== 'loaded' && (
          <button
            id="loki-retry-labels"
            type="button"
            className="btn primary"
            disabled={status === 'loading'}
            onClick={() => void onRetry()}
          >
            {status === 'loading' ? 'Retrying…' : 'Retry labels'}
          </button>
        )}
      </div>
      {status === 'error' && (
        <>
          <p>
            Label discovery is unavailable. Raw LogQL and loaded results remain
            usable.
          </p>
          <details>
            <summary>Technical details</summary>
            <pre>{error}</pre>
            <CopySqlButton sql={error ?? ''} language="Loki diagnostics" />
          </details>
        </>
      )}
    </section>
  )
}
