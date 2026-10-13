# SQL Builder asynchronous ownership — #365 Phase 4B

Baseline: `main` `c5fc56b`, after #395/#396/#397/#399, 2026-10-13.
Scope: SQL Builder metadata consumers and local Series decisions; release #382.

## Ownership inventory

| Operation                 | Owner and identity                                                                                        | Publication, supersession and lifetime                                                                                                                                                                                                                                                                                                                                          |
| ------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Relation discovery        | Profile connection generation; `connectionMetadata`, connect/hydration and `metadataRefresh`              | Shared store metadata survives tab/component removal. Usable-generation checks reject obsolete publication. Refresh joins current-generation work and cleans up only its own promise (#397). Builder reads the profile store; it does not own discovery.                                                                                                                        |
| Column discovery          | `relationColumns` profile/generation/qualified relation pending key                                       | Same-generation requests coalesce; a replacement generation starts independently. Generation/status guards protect success/error; identity-safe cleanup preserves replacement work. Loaded values and error/retry state live in profile metadata. Switching schema/table does not cancel useful cached work.                                                                    |
| Selected columns and axes | Originating tab's Builder/visualization, selected relation identity                                       | The existing selected-relation effect reconciles loaded columns through `selectionPatchForColumns` and validates X/Y. It reads current store state, never a late callback's old columns. On return/remount it reconciles the currently selected cached relation.                                                                                                                |
| Series statistics         | Main-process `SeriesCardinalityProbes` and actual `DataSourceSession`                                     | PostgreSQL statistics and BigQuery estimates are strategies inside `probeSeriesCardinality`, not a separate Builder request. Estimates may accept/reject or fall back to exact probing. No renderer statistics-response state to consolidate.                                                                                                                                   |
| Cardinality decision      | Component-local `SeriesCardinalityProbeGuard` revision/candidate fingerprint plus committed Builder owner | Owner includes tab, profile, connection status/generation, query context, Builder relation/time/bucket/ordered Series, X/Y and aggregation. Store subscription synchronously revokes decisions on owner change; checks after awaits reject obsolete success/error. Unmount revokes the revision. Returning requires explicit selection/retry, never an automatic primary query. |
| Probe coalescing/cache    | Main process, `WeakMap<DataSourceSession, Map<request, promise>>`                                         | Only in-flight requests are reused. Reconnect means another actual session; no persisted approval or resolved-result cache. Per-field hard-limit decisions and time predicates remain unchanged.                                                                                                                                                                                |
| Confirmation/rejection    | Local checking/error message and owner-bound Retry                                                        | Current code has no high-cardinality acceptance/confirmation dialog. Above-limit fields are rejected; Retry rechecks rather than bypassing the limit. Retained Retry checks owner and revision before starting work.                                                                                                                                                            |
| Loading/errors            | Shared metadata status/error; local `seriesProbe`                                                         | Metadata errors remain profile/relation-owned; explicit Retry uses shared loader. Series checking/error clears synchronously on context replacement. There is no probe `finally` that clears a newer operation. An old success/error cannot change newer checking, selection or warning.                                                                                        |
| Primary Run/Explain       | Durable tab query/session lifecycle from #384/#386                                                        | Independent of metadata/probe work. Explicit primary execution uses the existing connection preflight and `QueryOperation`. No new execution/cancellation IPC or persistence fields.                                                                                                                                                                                            |

## Reproduced defects and corrections

The component suite was run with all new tests against the unchanged baseline:
**8 failed, 25 passed**. The failures are ordinary deferred-promise regressions,
not expected-failure annotations. With the correction all **33 pass**.

1. **Late A columns clear B axes.** Start A's lazy describe, replace relation with
   loaded B and select B's `market`/`revenue`, then resolve A with `old_only`.
   `selectionPatchForColumns` correctly rejects A, but the duplicate callback
   continues and validates B's axes against A's columns, clearing them. Remove
   that entire duplicated success/error path. Shared metadata publishes the
   profile result; the existing selected-relation effect alone reconciles state.
   A's useful metadata still loads without changing B or running a query.
2. **Reconnection leaves a decision eligible.** Resolve/reject a pending probe
   after replacing the same profile's generation. Previously success applied the
   candidate and failure displayed an obsolete error. Capture generation/status
   in the local owner and invalidate synchronously; current-generation retry works.
3. **Y can become the pending Series candidate.** Select numeric `revenue` as
   Series, change Y to `revenue`, then approve the old probe. Previously the same
   field became both Y and Series. Include Y/aggregation in the owner.
4. **Identical tab replacement retains local work.** Reuse BuilderPanel for B
   with the same profile and configuration while A's probe is pending. Previously
   it applied the abandoned decision to A and reused local presentation in B.
   Include active tab identity and synchronously revoke on tab changes.
5. **Away/back state changes can escape effect invalidation.** Change bucket
   away and back in one React batch. Previously checking remained eligible.
   The store subscription observes both transitions; a newer pending probe's
   loading survives the obsolete failure and completes normally.
6. **Retained retry starts obsolete work.** Fail a probe, replace generation,
   invoke the old Retry handler before React commits. Previously a second probe
   starts. Retry now verifies its original owner/revision before dispatch.
7. **Same-looking reset preserves an approval.** Replace query context while
   keeping visible fields identical, then complete the old probe. Previously
   approval applies. The existing session query-context identity revokes it.

Additional passing boundaries: current failure followed by successful explicit
Retry, late success/error after unmount/remount, existing time-scope invalidation,
per-field estimated/exact rejection, ordered additions/removals, independent time
source, relation reset, SQL/raw preservation and no automatic Run. Existing #397
metadata tests retain same-generation coalescing, generation replacement in both
completion orders, stale publication, current failure/retry and profile isolation.
Existing #399 pure transitions and D1/D2/D3 tests remain unchanged.

## Simplification and boundaries

No responsibility moves into a new hook/controller. Removing the duplicate
metadata callback removes repeated axis reconciliation, local metadata error
state and redundant store error writes. The existing profile metadata loader
and selected-relation effect retain their distinct contracts. Builder preflight
captures its profile before awaiting and will not describe the old relation on
a newly bound profile.

The local Series owner comparison replaces the repeated current-fingerprint
reconstruction and five handler invalidations plus the incomplete dependency
effect. One synchronous subscription owns invalidation, including external store
transitions and transient away/back changes. The existing candidate revision is
still needed: candidates can supersede one another without changing the committed
Builder. Direct Series removal/reorder retains explicit candidate invalidation.
Metadata generations and probe candidates must remain separate; sharing their
promise-shaped implementation would hide their different lifetimes.

SQL generation, parameterization, thresholds, filters, visualization behavior,
raw drafts, saved Builder/preset shapes and primary lifecycle are unchanged.
Issued backend requests continue; logical revocation is not physical cancellation.
Series controls already disable additions during checking, so tests do not invent
an impossible rapid concurrent selection path; changing context permits a new
candidate and exercises supersession with controlled promises.

## Coverage limits and Phase 4C recommendation

Same-generation metadata-tree revision replacement remains the previously noted
lower-priority shared-metadata question; no new defect is claimed here. Native
combobox interaction, actual provider reconnect, packaged rendering and real
query execution remain release acceptance. The tests model query-context reset
at the established ownership boundary; shared lifecycle tests cover actual reset
and rebind actions. There is no separate pending confirmation flow to test.

**Skip Phase 4C in this refactoring pass.** The current architecture is adequate
with these corrections. A component decomposition is not needed for async
correctness, and no new coordinator or UI extraction is justified by this audit.
Reconsider a bounded presentation extraction only with a concrete maintenance or
UX requirement; do not make it a v0.2.1 gate or begin it automatically.

## Pending release handoff — extend RC-13

Risk: medium, confined to stale metadata validation and local probe decisions.
Deferred automation covers exact race schedules; no equivalent manual stress
matrix is required. With safe read-only PostgreSQL (BigQuery where available):

1. Change A to B while A's columns load; select B's axes. B's controls/SQL remain
   intact, metadata eventually loads, and explicit column Retry recovers an error.
2. Add ordered Series; observe checking and estimated/exact rejection where a
   fixture exceeds 100 distinct values. Change Y or relation, then select a new
   Series. No old selection/warning returns; rejection cannot be bypassed by Retry.
3. Reset/reconnect or switch A/B during a pending probe; controls recover and
   the current candidate can be selected explicitly. Other tabs are unchanged.
   Exercise ordinary failure/Retry once, without duplicating synthetic race timing.
4. Inspect generated SQL/parameters and preserved raw draft; no primary query
   occurs during edits/probes. Explicit Run (and existing Explain/Analyze smoke)
   remains usable. Deduplicate persistence/normal SQL checks with existing RC-13.

Record each result on the frozen release candidate, not this moving PR branch:

| Frozen RC SHA          | Datasource/fixture | Actions               | Expected outcome                                                            | Actual outcome/evidence | Status      |
| ---------------------- | ------------------ | --------------------- | --------------------------------------------------------------------------- | ----------------------- | ----------- |
| Pending release freeze | Pending            | RC-13 additions above | Current selection/SQL, recovered controls, tab isolation, explicit Run only | Pending                 | **Pending** |

No release candidate has been frozen here and no human acceptance is passed.
Exact local commands, environment failures and final-head CI results belong in
the draft PR validation record. Do not merge or publish from this handoff.
