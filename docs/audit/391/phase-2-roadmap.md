# DataKoala #391 — Phase 2 implementation roadmap

**Status:** planning only; no Phase 2 production changes authorized. **Source of truth:** [corrected Atlas](https://github.com/cubitouch/DataKoala/blob/7cfc8a3b5ac92a471f2a8930599dabe68f9291db/docs/audit/391/aggregation/agg-03-atlas.json). Original [AGG-03 proposal](https://github.com/cubitouch/DataKoala/blob/7cfc8a3b5ac92a471f2a8930599dabe68f9291db/docs/audit/391/aggregation/AGG-03.md) was independently reviewed in [AGG-04](https://github.com/cubitouch/DataKoala/blob/7cfc8a3b5ac92a471f2a8930599dabe68f9291db/docs/audit/391/aggregation/AGG-04.md) and reconciled in [REC-01](https://github.com/cubitouch/DataKoala/pull/442). The authoritative audit synthesis is the [final report](final-report.md).

There are **25 actual packages: 19 implementation-ready *proposals* and six blocked decision/evidence tracks**. The old `P2-05` is only a planning umbrella. Do not count it as a package, collapse the four `P2-05a/b/c/d` contracts, convert a blocked track into a release-ready fix, or infer one code root from shared vocabulary.

## Overview and sequencing

| Package | State | Priority | Size estimate | Correctness/convergence/decision | Dependencies |
| --- | --- | --- | --- | --- | --- |
| [P2-01](#p2-01) | Ready proposal | P1 | M | Correct generated SQL materialization and identifiers | None |
| [P2-02](#p2-02) | Ready proposal | P1 | M | Repair Scatter missing and numeric coordinates | None |
| [P2-03](#p2-03) | Ready proposal | P1 | M | Fix displayed Tempo time-selection bounds | None |
| [P2-04](#p2-04) | Ready proposal | P1 | M | Guard lazy versus explicit connection intent | None |
| [P2-05a](#p2-05a) | Ready proposal | P1 | S | Coordinate topmost child Escape | None |
| [P2-05b](#p2-05b) | Ready proposal | P1 | M | Contain connection picker and form focus | P2-05a |
| [P2-06](#p2-06) | Ready proposal | P1 | S | Correct raw LogQL editor height | None |
| [P2-07](#p2-07) | Ready proposal | P1 | S | Make rejected log copy recoverable and label PromQL correctly | None |
| [P2-11](#p2-11) | Ready proposal | P1 | S | Handle BigQuery estimate numeric boundaries | None |
| [P2-19](#p2-19) | Ready proposal | P1 | S | Prevent late raw LogQL formatter overwrite | None |
| [P2-20](#p2-20) | Ready proposal | P1 | S | Reject stale AI metadata revisions | None |
| [P2-21](#p2-21) | Ready proposal | P1 | S | Contain Tempo toolbar and sample label | None |
| [P2-05c](#p2-05c) | Ready proposal | P2 | S | Restore originating Delete focus | None |
| [P2-05d](#p2-05d) | Ready proposal | P2 | S | Keep usable focus after failed Settings Save | None |
| [P2-08](#p2-08) | Ready proposal | P2 | S | Correct table header resize and menu focus | None |
| [P2-09](#p2-09) | Ready proposal | P2 | S | Render nested Loki values readably | None |
| [P2-10](#p2-10) | Ready proposal | P2 | S | Preserve histogram override through workspace restore | None |
| [P2-12](#p2-12) | Ready proposal | P2 | S | Dedupe AI relation selection | None |
| [P2-13](#p2-13) | Ready proposal | P2 | M | Adopt common openable-row mechanics | None |
| [P2-14](#p2-14) | Blocked | BLOCKED | M | Decide retained-result visibility and restoration | product decision / new evidence |
| [P2-15](#p2-15) | Blocked | BLOCKED | S | Define statistics display for BigQuery | product decision / new evidence |
| [P2-16](#p2-16) | Blocked | BLOCKED | M | Characterize provider security boundaries | product decision / new evidence |
| [P2-17](#p2-17) | Blocked | BLOCKED | M | Close native evidence gaps | product decision / new evidence |
| [P2-18](#p2-18) | Blocked | BLOCKED | M | Review dialog, feedback and resize presentation policy | product decision / new evidence |
| [P2-22](#p2-22) | Blocked | BLOCKED | S | Define BigQuery diagnostic policy before defensive redaction | BigQuery diagnostic threat/redaction policy; Realistic ADC errors and renderer/log-boundary characterization |

**Suggested first pass:** P2-01, P2-02, P2-03, P2-04, P2-19 and P2-20 (scoped correctness), then P2-05a followed by P2-05b (keyboard owner coordination), alongside independent P2-05c/d, P2-06, P2-21, P2-07 and P2-11. Other ready proposals may proceed after local contract review. **P2-13** is real cross-provider *composition* work, not proof of a universal domain row. **P2-14/15/16/17/18/22** are investigations/decisions, not implementation tickets.

## Per-package acceptance and evidence contract

### P2-01 — Correct generated SQL materialization and identifiers

**READY_TO_IMPLEMENT · P1 · M**
**Atlas:** `ATL-026`, `ATL-094`. **Inventory:** `S16`. **Findings:** `NON05-01`, `NON05-02`, `NON05-03`.
**Dependencies:** None declared.

**Acceptance / decision contract:** Quoted placeholder/literal text remains byte-identical as an identifier; only true bound placeholders materialize; promoted BQ fields retain their original quoted identifier.

**Regression proof:** builderSql/dialect generator tests with quoted placeholders, escapes and typed parameter cases; disposable provider parity where syntax matters.

**Evidence threshold:** Passing contract assertion at generating commit, focused tests and inspected full-resolution images where visual.

**Scope boundary:** No generic cross-dialect parser or full Builder rewrite.

### P2-02 — Repair Scatter missing and numeric coordinates

**READY_TO_IMPLEMENT · P1 · M**
**Atlas:** `ATL-021`, `ATL-022`. **Inventory:** `R10`, `R13`. **Findings:** `VC26-01`, `VC26-02`.
**Dependencies:** None declared.

**Acceptance / decision contract:** 16 raw rows do not produce 32 semantic marks; missing combinations are gaps, and numeric X uses a value axis with faithful coordinates.

**Regression proof:** Pure pivot/presentation tests plus Electron populated chart measurement and original-size screenshot for missing/uneven X values.

**Evidence threshold:** Passing contract assertion at generating commit, focused tests and inspected full-resolution images where visual.

**Scope boundary:** No Tempo scatter conversion or global chart rewrite.

### P2-03 — Fix displayed Tempo time-selection bounds

**READY_TO_IMPLEMENT · P1 · M**
**Atlas:** `ATL-065`. **Inventory:** `T18`. **Findings:** `VC24-03`.
**Dependencies:** None declared.

**Acceptance / decision contract:** Proposed implementation rule: for finite representable epoch-millisecond bounds, Q(t)=Math.trunc(t), matching Date/ISO TimeClip toward zero. After existing range ordering/clamping, use the same Q(start), Q(end) for the displayed chip and local half-open [Q(start),Q(end)) membership; quantize bounds once, never trace timestamps. Reject an invalid or collapsed interval. This is a proposed future contract, not observed corrected behavior. The fixture includes the displayed start and excludes the displayed end; preserve separate raw fractional helper tests.

**Regression proof:** Separate raw fractional comparison tests from shown-bound membership; cover exact shown start/end, inside/outside, fractional bounds, negative epoch truncation, reversed/clamped inputs and invalid/collapsed intervals. CAP-24 native brush has zero request delta; replace its known-defect expectation only alongside a passing product fix.

**Evidence threshold:** Passing contract assertion at generating commit, focused tests and inspected full-resolution images where visual.

**Scope boundary:** No hidden rounding of the visible discrepancy.

### P2-04 — Guard lazy versus explicit connection intent

**READY_TO_IMPLEMENT · P1 · M**
**Atlas:** `ATL-079`. **Inventory:** `A04`, `A07`, `A08`. **Findings:** `NON01-06`.
**Dependencies:** None declared.

**Acceptance / decision contract:** Pending explicit connect remains pending until its own result; stale lazy success or failure cannot publish current state.

**Regression proof:** NON-01 two expected-failure races become passing renderer invariants; generation/rebind scenarios remain green.

**Evidence threshold:** Passing contract assertion at generating commit, focused tests and inspected full-resolution images where visual.

**Scope boundary:** No claim of physical provider cancellation or universal async framework.

### P2-05a — Coordinate topmost child Escape

**READY_TO_IMPLEMENT · P1 · S**
**Atlas:** `ATL-002`. **Inventory:** `X01`. **Findings:** `V-02`, `VC29-01`.
**Dependencies:** None declared.

**Acceptance / decision contract:** First Escape closes only the model selector, preserves Settings identity and unsaved draft, and returns focus to the model control; second Escape closes Settings.

**Regression proof:** CAP-29 native first/second Escape with parent identity/draft and focus assertions; Loki nested selector, Reset and Presets regressions.

**Evidence threshold:** Passing contract assertion at generating commit, focused tests and inspected full-resolution images where visual.

**Scope boundary:** No form migration, delete-focus or Save-error behavior in this slice.

### P2-05b — Contain connection picker and form focus

**READY_TO_IMPLEMENT · P1 · M**
**Atlas:** `ATL-003`. **Inventory:** `A01`, `A02`. **Findings:** `V-03`.
**Dependencies:** `P2-05a`.

**Acceptance / decision contract:** Initial focus and Tab/Shift-Tab stay in the active picker/form; top Escape dismisses with trigger focus restored. Hidden visited forms are excluded; Back/drafts and pending Test/Save/Cancel semantics survive across all seven kinds.

**Regression proof:** Phase 1B dialog scenarios and focused form-kind tests; native Electron Tab/Shift-Tab, Escape, Back/draft and busy-state assertions plus original-size captures. A02 inherited edit-policy scope must be tested directly before broad acceptance.

**Evidence threshold:** Passing contract assertion at generating commit, focused tests and inspected full-resolution images where visual.

**Scope boundary:** No delete overlay, failed Settings Save or provider-content redesign.

### P2-06 — Correct raw LogQL editor height

**READY_TO_IMPLEMENT · P1 · S**
**Atlas:** `ATL-057`. **Inventory:** `L02`. **Findings:** `VC21-01`.
**Dependencies:** None declared.

**Acceptance / decision contract:** Multiline LogQL editor fills its query pane with native internal scrolling in Raw mode.

**Regression proof:** CAP-21 native 1440×900 and 900×900 pane measurement and screenshot; existing editor layout tests.

**Evidence threshold:** Passing contract assertion at generating commit, focused tests and inspected full-resolution images where visual.

**Scope boundary:** No cross-provider editor grammar change.

### P2-07 — Make rejected log copy recoverable and label PromQL correctly

**READY_TO_IMPLEMENT · P1 · S**
**Atlas:** `ATL-007`, `ATL-008`. **Inventory:** `L18`, `X06`, `X10`. **Findings:** `V-07`, `V-08`.
**Dependencies:** None declared.

**Acceptance / decision contract:** Denied log write yields one actionable error, preserves selection, retry succeeds; PromQL announces Copy PromQL.

**Regression proof:** CAP-19/30 Electron denial→retry plus QueryEditor accessible-label test; OS clipboard separately.

**Evidence threshold:** Passing contract assertion at generating commit, focused tests and inspected full-resolution images where visual.

**Scope boundary:** No universal export payload abstraction.

### P2-11 — Handle BigQuery estimate numeric boundaries

**READY_TO_IMPLEMENT · P1 · S**
**Atlas:** `ATL-103`, `ATL-104`. **Inventory:** `C12`. **Findings:** `NON07-01`, `NON07-02`.
**Dependencies:** None declared.

**Acceptance / decision contract:** Null/blank bytes are not zero; unsafe Int64 estimate is guarded or represented exactly.

**Regression proof:** NON-07 adapter and IPC tests with malformed and >2^53−1 values.

**Evidence threshold:** Passing contract assertion at generating commit, focused tests and inspected full-resolution images where visual.

**Scope boundary:** No approved statistics UI implied.

### P2-19 — Prevent late raw LogQL formatter overwrite

**READY_TO_IMPLEMENT · P1 · S**
**Atlas:** `ATL-052`. **Inventory:** `L02`. **Findings:** `VC18-04`.
**Dependencies:** None declared.

**Acceptance / decision contract:** Only the matching draft/revision may receive the formatting result; newer edits and mode changes survive.

**Regression proof:** CAP-18 two preserved expected failures become positive tests; native Raw/Builder handoff regression.

**Evidence threshold:** Passing contract assertion at generating commit, focused tests and inspected full-resolution images where visual.

**Scope boundary:** No universal editor formatter framework.

### P2-20 — Reject stale AI metadata revisions

**READY_TO_IMPLEMENT · P1 · S**
**Atlas:** `ATL-098`. **Inventory:** `S26`. **Findings:** `NON06-01`.
**Dependencies:** None declared.

**Acceptance / decision contract:** Recheck revision before column load and second provider request; stale context does not reach a model call.

**Regression proof:** NON-06 deterministic expected-failure becomes positive, including second-step discovery.

**Evidence threshold:** Passing contract assertion at generating commit, focused tests and inspected full-resolution images where visual.

**Scope boundary:** No expansion of catalog authorization policy.

### P2-21 — Contain Tempo toolbar and sample label

**READY_TO_IMPLEMENT · P1 · S**
**Atlas:** `ATL-004`, `ATL-020`. **Inventory:** `T13`, `T19`, `T20`, `T24`. **Findings:** `V-04`, `VC23-01`.
**Dependencies:** None declared.

**Acceptance / decision contract:** 652 px pane contains timing action and full sample text while preserving exact request value and other controls.

**Regression proof:** Phase 1B and CAP-23/25 Electron narrow/filtered map screenshots and DOM right-edge assertions.

**Evidence threshold:** Passing contract assertion at generating commit, focused tests and inspected full-resolution images where visual.

**Scope boundary:** No change to sample query semantics.

### P2-05c — Restore originating Delete focus

**READY_TO_IMPLEMENT · P2 · S**
**Atlas:** `ATL-003`. **Inventory:** `A03`. **Findings:** see direct source evidence.
**Dependencies:** None declared.

**Acceptance / decision contract:** Native Escape and React Cancel preserve the profile and return focus to the originating Delete control; explicit Confirm removes exactly once and uses a deliberate surviving focus target.

**Regression proof:** CAP-02 native Escape and Cancel focus observations plus Sidebar.deleteConnection tests; assert activeElement is the origin, no remove on dismiss, one remove on confirm. No live disconnect acceptance.

**Evidence threshold:** Passing contract assertion at generating commit, focused tests and inspected full-resolution images where visual.

**Scope boundary:** No connection-form focus trap or broad modal framework.

### P2-05d — Keep usable focus after failed Settings Save

**READY_TO_IMPLEMENT · P2 · S**
**Atlas:** `ATL-023`. **Inventory:** `X01`. **Findings:** `VC29-03`.
**Dependencies:** None declared.

**Acceptance / decision contract:** After delayed Save rejection, focus is on actionable content inside the same Settings dialog; draft is retained, stored value unchanged, one alert shown, and retry remains usable.

**Regression proof:** CAP-29 failed-save ledger plus native keyboard Save and delayed IPC rejection; assert parent identity, focusInParent, draft/stored values, one alert and successful retry. Error pixels and real keychain remain separately unverified until inspected/exercised.

**Evidence threshold:** Passing contract assertion at generating commit, focused tests and inspected full-resolution images where visual.

**Scope boundary:** No automatic child-opening focus claim (VC29-02), OS keychain fix or Escape rewrite.

### P2-08 — Correct table header resize and menu focus

**READY_TO_IMPLEMENT · P2 · S**
**Atlas:** `ATL-042`, `ATL-044`. **Inventory:** `R02`, `R04`, `R19`, `S19`. **Findings:** `VC12-03`, `VC13-01`.
**Dependencies:** None declared.

**Acceptance / decision contract:** Pointer resize leaves sort key/order unchanged; keyboard dismissal focuses initiating summary and keeps filters.

**Regression proof:** CAP-12 native pointer boundary, CAP-13 keyboard focus assertions and component tests.

**Evidence threshold:** Passing contract assertion at generating commit, focused tests and inspected full-resolution images where visual.

**Scope boundary:** No table virtualization redesign.

### P2-09 — Render nested Loki values readably

**READY_TO_IMPLEMENT · P2 · S**
**Atlas:** `ATL-054`. **Inventory:** `L16`. **Findings:** `VC19-02`.
**Dependencies:** None declared.

**Acceptance / decision contract:** Nested objects and arrays render readable bounded content; copy payload remains exact and independent of display formatting.

**Regression proof:** Pure formatting cases and CAP-19 inspector screenshot/selection test.

**Evidence threshold:** Passing contract assertion at generating commit, focused tests and inspected full-resolution images where visual.

**Scope boundary:** No change to raw log storage or LogQL matching.

### P2-10 — Preserve histogram override through workspace restore

**READY_TO_IMPLEMENT · P2 · S**
**Atlas:** `ATL-084`. **Inventory:** `A19`. **Findings:** `NON02-01`.
**Dependencies:** None declared.

**Acceptance / decision contract:** Round-trip yields the same override and valid profile association without auto Run/connect.

**Regression proof:** NON-02 golden fixture and cold restore tests; packaged restart remains a separate verification.

**Evidence threshold:** Passing contract assertion at generating commit, focused tests and inspected full-resolution images where visual.

**Scope boundary:** No persisted schema migration beyond required compatible field.

### P2-12 — Dedupe AI relation selection

**READY_TO_IMPLEMENT · P2 · S**
**Atlas:** `ATL-099`. **Inventory:** `S26`. **Findings:** `NON06-02`.
**Dependencies:** None declared.

**Acceptance / decision contract:** Up to eight relation slots select unique keys in existing priority order under existing caps.

**Regression proof:** NON-06 malformed/duplicate relation metadata tests: unique keys, priority, caps and existing valid selection.

**Evidence threshold:** Passing contract assertion at generating commit, focused tests and inspected full-resolution images where visual.

**Scope boundary:** No search-term uniqueness gate or catalog authorization-policy decision.

### P2-13 — Adopt common openable-row mechanics

**READY_TO_IMPLEMENT · P2 · M**
**Atlas:** `ATL-001`. **Inventory:** `L12`, `L15`, `L19`, `L20`, `T16`. **Findings:** `V-01`.
**Dependencies:** None declared.

**Acceptance / decision contract:** One composable shell preserves 42/58/68 px domain density, virtualization and content; no extra navigation/requests.

**Regression proof:** CAP-19/20/24 native narrow/scroll/focus screenshots and component interaction tests.

**Evidence threshold:** Passing contract assertion at generating commit, focused tests and inspected full-resolution images where visual.

**Scope boundary:** No generic sidebar/table/preset row conversion.

### P2-14 — Decide retained-result visibility and restoration

**DECISION_OR_EVIDENCE — BLOCKED · BLOCKED · M**
**Atlas:** `ATL-006`. **Inventory:** `R24`, `R25`, `T17`. **Findings:** `V-06`.
**Dependencies:** `product decision / new evidence`.

**Acceptance / decision contract:** Product decision defines current vs retained data, filter/export eligibility and persistence boundaries before implementation.

**Regression proof:** After decision: controlled success→failure→view-switch Electron scenario, restart/restore tests.

**Evidence threshold:** Recorded decision or direct reproduction before implementation.

**Scope boundary:** No implementation before policy approval.

### P2-15 — Define statistics display for BigQuery

**DECISION_OR_EVIDENCE — BLOCKED · BLOCKED · S**
**Atlas:** `ATL-025`. **Inventory:** `C12`. **Findings:** `NON07-04`.
**Dependencies:** `product decision / new evidence`.

**Acceptance / decision contract:** Decision names fields/units/availability and script parent vs child attribution; implementation acceptance follows separately.

**Regression proof:** After decision: adapter/IPC tests and rendered toolbar capture only if field is displayed.

**Evidence threshold:** Recorded decision or direct reproduction before implementation.

**Scope boundary:** No speculative bytes/cache UI.

### P2-16 — Characterize provider security boundaries

**DECISION_OR_EVIDENCE — BLOCKED · BLOCKED · M**
**Atlas:** `ATL-024`, `ATL-091`, `ATL-092`, `ATL-093`, `ATL-101`. **Inventory:** `A07`, `C04`, `C15`, `C16`, `C18`, `S26`, `S27`, `S28`. **Findings:** `NON04-01`, `NON04-03`, `NON04-06`, `NON06-05`, `NON01-05`, `NON03-04`.
**Dependencies:** `product decision / new evidence`.

**Acceptance / decision contract:** Comparative planning catalog only: independently scope, own and test each named investigation track; no common defect/root, exploit claim or single implementation acceptance. P2-22 separately owns BQ diagnostics.

**Regression proof:** Disposable PG/DuckDB/platform fixtures; main-process tests; no synthetic IPC as live-provider proof.

**Evidence threshold:** Recorded decision or direct reproduction before implementation.

**Scope boundary:** No production guard rewrite from source-only risk.

### P2-17 — Close native evidence gaps

**DECISION_OR_EVIDENCE — BLOCKED · BLOCKED · M**
**Atlas:** `ATL-037`, `ATL-068`, `ATL-073`, `ATL-077`. **Inventory:** `P03`, `R16`, `R17`, `R18`, `T19`, `T24`, `X01`. **Findings:** `VC06-02`, `VC25-04`, `VC27-04`, `VC29-02`.
**Dependencies:** `product decision / new evidence`.

**Acceptance / decision contract:** Named native outcomes and sourceHead-backed original images determine whether follow-up defects exist.

**Regression proof:** Existing isolated Electron modules; real/provider/native checks where synthetic seams cannot prove the contract.

**Evidence threshold:** Recorded decision or direct reproduction before implementation.

**Scope boundary:** No defect claim from absence of evidence.

### P2-18 — Review dialog, feedback and resize presentation policy

**DECISION_OR_EVIDENCE — BLOCKED · BLOCKED · M**
**Atlas:** `ATL-005`, `ATL-009`, `ATL-038`, `ATL-076`. **Inventory:** `A21`, `A23`, `C06`, `L15`, `L20`, `L23`, `R07`, `R21`, `R25`, `T15`, `T20`, `T23`, `X08`. **Findings:** `VC08-01`, `VC28-05`, `V-05`, `V-09`.
**Dependencies:** `product decision / new evidence`.

**Acceptance / decision contract:** Decision preserves native preset confirmation and provider-specific content or states the changed policy explicitly.

**Regression proof:** Paired full-resolution captures plus keyboard/resize assertions after policy decision.

**Evidence threshold:** Recorded decision or direct reproduction before implementation.

**Scope boundary:** No visual abstraction based only on similarity.

### P2-22 — Define BigQuery diagnostic policy before defensive redaction

**DECISION_OR_EVIDENCE — BLOCKED · BLOCKED · S**
**Atlas:** `ATL-089`. **Inventory:** `C10`. **Findings:** `NON03-01`.
**Dependencies:** `BigQuery diagnostic threat/redaction policy`, `Realistic ADC errors and renderer/log-boundary characterization`.

**Acceptance / decision contract:** Record realistic missing/revoked/permission ADC error shapes and allowed diagnostic fields; trace adapter, IPC, renderer and logs independently. Approve a bounded redaction contract and assess impact before scheduling a defensive fix or claiming P1 security readiness.

**Regression proof:** Retain NON-03 synthetic characterization as current failed scoped acceptance. Add realistic sanitized error-shape fixtures and renderer/log boundary tests under approved scope; a later fix must exclude approved sensitive fields while retaining actionable project/permission guidance.

**Evidence threshold:** Recorded diagnostic policy and realistic error/boundary evidence before implementation priority is assigned.

**Scope boundary:** No generic credential framework.


## Handoff guardrails

- `P2-05a` is the only formal implementation dependency of `P2-05b`; `P2-05c` and `P2-05d` have separate origin/failure focus contracts. The `P2-05` umbrella is not executable.
- `P2-03` proposes finite epoch-millisecond `Math.trunc` displayed half-open bounds after ordering/clamping; do not quantize trace event timestamps, or call current CAP-24 characterization a fixed regression.
- `P2-12` corrects *relation* deduplication. Optional AI search-term dedupe does not gate this fix.
- `P2-16` is a provider-specific investigation catalogue. It does not establish a common exploit. `P2-22` separately concerns **BigQuery diagnostic-security policy**, with synthetic-only current evidence.
- Some comparisons are best answered in [VIS-01](../../../tools/visual-review/README.md) before code is planned. Missing images, source-reported native behavior and unresolved policy are explicit reasons to defer.
