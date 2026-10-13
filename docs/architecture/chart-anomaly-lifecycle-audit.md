# Chart anomaly lifecycle — #365 Phase 2B

Audited on 2026-10-13 against `main` at `90493e1`, including #384/#386 query ownership and
#389/#390 temporal filtering/chart interaction work. Phase 2B only.

## Before and after ownership

Before: `GenericResultExplorer` owned settings eligibility, sampling, request ID,
context revision, cancellation, loading/error/findings/toggle state, annotation
mapping and ECharts presentation. Its data invalidation effect depended on result
object identity and a serialized chart context; unmount cancelled the request.

After: `useChartAnomalyAnalysis` owns the active request and analysis state as one
cohesive boundary. Generic Result Explorer supplies its existing data context,
settings eligibility and tab-bound callback identity, invokes `analyze` only from
the existing button, and renders markers/tooltips/details using the existing
`resolveAiAnomalies`, chart presentation and details popover. The hook returns
analysis, submitted samples, visibility, loading, error and explicit actions; it
has no ECharts, store, query execution or provider configuration responsibility.

The existing `onAddFilter` callback identifies the owning workspace: Result
Explorer memoizes it by tab/mode; Loki memoizes it by session ID. This is the same
ownership boundary already used for point-menu invalidation in #390. It is an
internal identity input, never invoked by AI, and avoids new public props or a
second copy of session state. Future callers must preserve that stable per-owner
callback convention. Unmount ends analysis ownership; returning to a tab does
not restore or rerun analysis. Primary queries remain durable session operations
from #384/#386; these transient AI findings do not join that lifecycle.

## Actual lifecycle and invariants

1. Analysis starts only on explicit Analyze with AI. Eligibility/settings/UI are
   unchanged: the button is available for configured, renderable Line charts and
   blocked during analysis or for disconnected stale results. No new datasource
   receives AI support.
2. Visible series are sampled with existing `sampleChartSeries`: minimum three
   numeric points, at most eight submitted series and 32 points per series. The
   payload still contains request ID, chart type, axes and bounded sample metadata
   with only `{x, y}` points. Exact original indexes remain local, alongside source
   series indexes/names. Full rows, credentials and unrelated metadata are not
   added. Main validation, provider/model/settings and privacy boundaries are
   unchanged.
3. A UUID identifies the active request. The hook owns it; explicit replacement
   first invalidates/cancels its predecessor, including when the replacement has
   no eligible samples. The UI still disables repeat clicks while pending; direct
   hook replacement is tested defensively, not exposed as a new UX.
4. Context identity combines the result object, existing serialized context key
   and owning callback. The key includes revision, row count, view, axes, series
   columns, filters, chart time domain and bucket. Visibility, logarithmic scale
   and display units remain presentation-only. Immutable result replacement
   invalidates even without a revision bump. In-place mutation of result objects
   is not supported by existing chart memoization or this contract.
5. Context changes/unmount invalidate at layout-effect cleanup, before promise
   completions can target new committed data. State is also tagged with context,
   so old findings cannot be rendered against new data before cleanup. Disabling
   AI while pending clears/cancels that work, matching existing behavior; disabling
   after completion retains existing findings.
6. Every success/failure/final cleanup checks both request ID and active context.
   Older success cannot replace a newer response; older rejection cannot replace
   success; older cleanup cannot clear a newer loading state. Current failure
   clears loading and exposes the existing error/retry UX. Retained actions after
   unmount/context replacement cannot initiate provider work.
7. Completed findings and submitted samples remain associated with their context.
   Result/revision/data/filter/axis/series/view changes remove findings and errors.
   **Existing chart-type changes invalidate**, including Line to Area; this slice
   does not broaden compatible-view retention. Axis scale/display-unit changes
   preserve findings, including the existing nonpositive log-axis limitations.
8. Hide/show does not invalidate or call AI again, including while pending.
   Mapping uses original submitted series indexes/names/point references; hidden
   annotations disappear visually and reappear on their original series. Showing
   an originally unsubmitted series does not invent findings for it.
9. Switching tabs changes the tab-bound callback even if tabs share the exact same
   result object/revision/configuration. The old request is cancelled/discarded;
   neither old success nor error can appear in the new tab. No query result or
   persisted state is mutated. Unmount cancels and makes late deliveries inert.

## Verified gaps addressed

The old context did not include owner identity. With shared result identities and
identical context across two sessions, component reuse could retain findings or
accept A's response in B. The real-store regression uses this exact condition.

Replacement previously overwrote the active request ID without cancelling its
predecessor. If new sampling produced no eligible series, it left the old request
active and allowed that response to erase the new empty-sample error. The hook
invalidates before sampling and deterministic tests cover this path.

The existing cancellation IPC reaches owner-scoped `AiService` AbortControllers,
which race cancellation and pass the signal to OpenRouter. This slice preserves
that mechanism. Logical stale-delivery protection is enforced locally regardless
of cancellation timing; it does not claim that the remote provider stopped work
or incurred no cost. No datasource cancellation behavior is changed.

## Automated and manual evidence

Direct hook tests use deferred promises for result/revision replacement,
out-of-order success, late rejection, stale finally during newer loading,
unmount/retained actions, settings disabling and replacement with empty samples.
They also cover current failure/retry, completed invalidation, explicit reanalysis,
visibility/toggle retention and exact payload limits/local point references.

Component tests retain marker coordinates, tooltip content, details and sample
coverage, log-axis behavior, visibility toggles and pending visibility changes.
Added visible retry, chart-type invalidation and real-store A/B ownership with
identical result identities and late A failure after B success. Existing #390
interaction tests remain intact. These tests mock ECharts; live geometry/provider
rendering belongs to release testing. Screenshots do not prove async correctness.

### Proposed #382 RC-05B addition — all pending

Run once alongside RC-05/05A on the frozen v0.2.1 candidate with supported SQL,
Prometheus or Loki Line charts and a configured test AI provider. Record build,
commit, datasource/query, provider/model, pass/fail and unavailable coverage.

1. Successful analysis: invoke explicitly; verify loading, original-point markers,
   tooltips, details/limitations and unchanged query/result. No primary query runs.
2. Visibility/presentation: hide/show an annotated series; annotations return to
   the same points without another AI request. Toggle markers and change linear/log
   scale; verify details and omitted nonpositive marker behavior. Change chart
   type: existing behavior clears findings; returning to Line allows explicit
   reanalysis without an automatic request.
3. Result invalidation: execute a new query/replace the result; obsolete markers
   and details disappear. Explicit analysis works against the new result.
4. Failure/retry: use a controlled test-provider failure; verify visible error,
   loading cleanup and successful explicit retry without duplicate markers.
5. Tabs/async: start in A, switch to B and return; no findings/errors leak and no
   automatic analysis. Where practical, replace a pending result and let the old
   response finish; it must not annotate the replacement.

Risk: low/medium, concentrated in async ownership and live ECharts integration.
Deterministic regressions cover the sensitive ordering; no additional mandatory
premerge manual check is identified. All human scenarios remain pending until
consolidated release-candidate testing. Do not mark Phase 2B complete before
review/merge, or proceed to 2C/3 in this PR.
