import React from 'react'
void React

export function QueryUnavailable({ loading = false }: { loading?: boolean }) {
  if (loading) return <section className="query-unavailable" role="status" aria-labelledby="query-loading-title">
    <div className="query-unavailable-icon" aria-hidden="true">◌</div>
    <h2 id="query-loading-title">Loading connection…</h2>
    <p>DataKoala is restoring the saved datasource for this query tab.</p>
  </section>
  return <section className="query-unavailable" role="status" aria-labelledby="query-unavailable-title">
    <div className="query-unavailable-icon" aria-hidden="true">◌</div>
    <h2 id="query-unavailable-title">Prometheus query support is coming</h2>
    <p>This connection can discover metric metadata. PromQL queries and the query editor are not available yet.</p>
  </section>
}
