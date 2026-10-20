# #486 — failed current query data

Manual acceptance: **Pending** against the consolidated v0.2.1 RC.

Owned failures clear active and pending data and invalidate the result revision.
The draft, filters, visualization configuration and profile remain. No separate
history object is mutated. Null completion without error, disconnect retention,
connection generation and supersession guards keep their previous semantics.
Tempo progressively displays batches while running, then clears incomplete rows
on failure; it never labels them a completed search. The primary error remains
visible. This intentionally supersedes the old retained-failure characterization.

The lifecycle/store and Tempo controller own the fix; shared notifications remain
outside this change. SQL/Prometheus, Loki logs/metrics, Tempo, chart/table export
eligibility, tab/profile races and cold restoration have focused regressions.
The existing audit harness adds `fix-86` desktop/narrow captures and a scoped CI
workflow. Synthetic controller/IPC proof is separate from real provider acceptance.

## Manual steps (all Pending)

1. RC-04/12/22: For PostgreSQL, BigQuery, DuckDB/SQLite, Prometheus, Loki logs and
   metrics, and Tempo, run successful A. Choose a chart/table/list and filters.
   Run validly submitted B that the provider rejects. Expect B's error, no A data,
   no stale CSV/image export, and preserved draft/profile/configuration/filters.
2. Correct B and run C. Expect fresh data and no previous error; copy/export C.
3. RC-01/02/07/09/15: Delay an older request and finish a newer request successfully;
   let the old request fail. Expect the newer data unchanged. Repeat across tabs
   and profiles: the error belongs only to its originating session.
4. RC-02/10/20: Abandon a pending operation by reset/rebind; disconnect/reconnect.
   Expect existing stale-disconnected behavior, no obsolete completion, no stuck
   pending state, and fresh data after a new query.
5. RC-16: Fail a full and sampled Tempo search after progressive batches arrive.
   Expect incomplete rows removed, an explicit failure, and successful retry.
6. RC-19/21: Save drafts/settings, restart the packaged RC. Expect restored drafts
   and configuration, no persisted runtime rows/errors and no automatic Run.
7. RC-18: Inspect desktop and narrow error states and keyboard access to correction.

Local native capture is blocked by missing X display/GL initialization (Electron
headless capture exited SIGSEGV). CI supplies Xvfb. Native clipboard and provider
smoke remain Pending; none of these steps records manual acceptance.
