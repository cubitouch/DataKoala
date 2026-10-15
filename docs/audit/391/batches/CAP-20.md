# CAP-20 — Loki Patterns list, detail, and View logs

**Disposition: PARTIAL — awaiting GitHub Actions execution and full-resolution visual review.**

## A. Metadata and provenance

- Date: 2026-10-15. Parent issue: [#391](https://github.com/cubitouch/DataKoala/issues/391). Integration PR: [#406](https://github.com/cubitouch/DataKoala/pull/406).
- Integration base observed before work: `906960284260175f88761d9ff93fe2fd79351dbd` (also the last verified supplied checkpoint).
- Separate branch: `audit/391-cap-20-loki-patterns`; [draft PR #421](https://github.com/cubitouch/DataKoala/pull/421) targets **`audit/391-ux-convergence`**, not `main`.
- Scope: **L19** pattern list/count/percentage, **L20** inspector/examples, **L21** View logs and safe promotion. Viewport: 1440×900, DPR/zoom 1. Four new screenshots maximum.
- Scenario module: `scripts/visual-preview/audit-batches/cap-20.mjs`. Initial module commit: `6867322f40f00e8bd9dea8b8b7940865b4a7cdf3`.
- Generating checkout SHA, final scenario commit, workflow run, artifact IDs, inspected image hashes/appearance and `sourceHead` reconciliation: **pending**. Do not treat an asserted provenance write as confirmed CI evidence.
- Isolation: only the CAP-20 module and this report are edited. The shared loader, canonical `audit.mjs`, fixtures, coverage register, GitHub Actions workflow, production UX and PR #406 are untouched. CAP-19/NON-05 files are not edited.

## B. Coverage matrix

Codes: `VV` individually viewed full-resolution native image; `BV` executed bounded deterministic behavior; `SO` source/test-only; `UV` unverified. Proposed runtime assertions cannot be upgraded from SO/UV until an actual run is checked.

| Inventory | Visual | Behavior | Owners and named evidence | Outstanding |
| --- | --- | --- | --- | --- |
| **L19** — Patterns/count/percentage | **VV inherited / new UV**: Phase 1B `patterns-default-desktop.png`, `compare-lists.png` per coverage register; CAP-20 image not yet inspected | **SO**: `clusterLogPatterns` sorting/count/denominator; `LogPatternExplorer.ui.test.tsx` virtual rows, metric/severity position; CAP-20 live renderer assertion pending | `src/shared/log-patterns.ts`; `LogPatternExplorer.tsx`; `logSeverity.ts`; `LogRowPresentation.tsx` | Runtime counts 4/32 and 2/32, equal-count ordering, long-text fit, scroll/focus; missing optional severity; extreme cardinality |
| **L20** — Inspector/examples | **VV inherited / new UV**: Phase 1B `patterns-open-desktop.png`, `compare-detail.png`; CAP-20 new image pending | **BV inherited**: Phase 1B Enter/close; **SO**: component resize/selection and examples tests; new Electron keyboard/scroll and result invalidation pending | `LogPatternExplorer.tsx`; shared `ResizableDetailPanel.tsx`; component tests | Native width, selection persistence, Escape and stale inspector invalidation; narrow main width |
| **L21** — View logs | **UV** CAP-20 result image not inspected | **SO**: `LokiExplorer.ui.test.tsx` existing exact safe promotion `{app="x"} |= "completed"`, negative/multiple filters and raw-mode fallback; CAP-20 native exact request/zero-dispatch pending | `LokiExplorer.tsx` `viewPatternLogs`; `src/shared/log-pattern-filter.ts`; `src/shared/loki-builder.ts`; `LogPatternExplorer.tsx` action | Native exact `{service_name="example-service"} |= "completed"`, incompatible filter protection, local scope feedback, explicit error |

Only the named legacy substate carries prior VV/BV. This report makes no live Loki, OS clipboard, or provider acceptance claim.

## C. Planned/executed interaction matrix

The standalone module uses real Electron controls and synthetic IPC; each row below is an **assertion implemented in the module**, not independently verified execution until CI is inspected.

| Initial state | Action | Expected/checked result | Current observed evidence |
| --- | --- | --- | --- |
| Connected Builder, 32 loaded logs (four Request, two Worker, one escaped/missing-severity, one long, 24 distinct) | Click **Run**, then **Patterns** | 28 clusters; descending count; Request 4/32=12.5%, Worker 2/32=6.3%; representative ERROR; denominator all loaded logs | Module assertions; CI pending |
| Default Patterns with 28 groups | Select Request cluster | Selected row, Request template, four logs, 12.5%, examples and variable samples agree | Module assertions; inspector screenshot pending |
| Open inspector | Keyboard resize, scroll virtual list, return to top, Escape, reselect | Width grows and persists across close/reopen; selected detail remains on scroll; Escape closes | Module assertions; CI pending |
| Selected Request in Builder; no existing line filter | **View logs** | One request with exact `{service_name="example-service"} |= "completed"`; original label selector retained; List with four responses and visible Line contains; no local scope notice | Module assertions; CAP-20 View logs image pending |
| Builder with saved non-`|=` line filter | **View logs** | Local scope banner, unchanged filters and **zero** requests | Module assertions; CI pending |
| Builder with multiple saved line filters | **View logs** | Local scope banner, both filters retained, **zero** requests | Module assertions; CI pending |
| Raw LogQL mode | **View logs** | Local scope rather than silent raw query rewrite, **zero** requests | Module assertions; CI pending |
| Pattern inspector open | Replace result IDs/messages | Selection invalidates, inspector closes | Module assertions; CI pending |
| Actual loaded empty result | Render Patterns | `0 patterns · 0 loaded logs`, “No logs to cluster.”, no inspector or View logs, no `NaN%` | Module assertions; empty image pending |
| Empty result, synthetic transport failure | Click **Run** | Explicit “Synthetic CAP-20 Loki unavailable”, not a successful empty state | Module assertions; CI pending |

The controlled fixture extends the existing `auditLogResult` canonical log shape without touching the canonical fixture file. It deliberately contains mixed severities, a missing optional severity, an escaped message, a long message, many unique clusters and four repeated variable-bearing Request messages.

## D. Screenshot manifest

All outputs are under `visual-audit/batches/CAP-20/` and must be generated by a single source commit. `sourceHead` and semantic observation fields come from `measurements.json`; loader requires exactly four 1440×900 PNGs and positive targets with DPR/zoom 1.

| PNG | Semantic target | Intended assertions | Inspection |
| --- | --- | --- | --- |
| `cap20-patterns-default-desktop.png` | `[aria-label="Log patterns"]` | 28 groups, top 4/32 and 2/32, severity and long-text fit | **Not yet inspected** |
| `cap20-patterns-inspector-desktop.png` | `[aria-label="Selected pattern details"]` | Request examples, variable samples, width after keyboard resize | **Not yet inspected** |
| `cap20-patterns-view-logs-desktop.png` | `[aria-label="Loki explorer"]` | Builder promoted line filter and four response logs | **Not yet inspected** |
| `cap20-patterns-empty-desktop.png` | `[aria-label="Log patterns"]` | Distinct genuinely empty result | **Not yet inspected** |

Do not claim any CAP-20 screenshot as VV before downloading **and opening each original full-resolution image**.

## E. Implementation ownership

`clusterLogPatterns` creates bounded signature-based groups, generalized token templates, member IDs, samples, counts and percentages relative to the loaded records. The exact implementation sorts by descending count then ascending template. `LogPatternExplorer` memoizes groups for the given rows reference, uses a virtualized selectable list, renders representative severity via `LogRowPresentation`, and creates the pattern-specific Template/metrics/Severity/Seen/Examples/Variables inspector. `ResizableDetailPanel` owns shared width clamps, keyboard/pointer resize and semantic separator; it does not own pattern semantics.

`LokiExplorer.viewPatternLogs` owns the safety decision and query execution. `derivePatternLineContainsCandidate` chooses an actual literal present in **every** member, avoiding variable placeholders. Promotion is allowed only in Builder mode with fresh metadata, no existing line filter or a single `|=` filter refined by the candidate, and a serializable Builder query. A successful promotion replaces the single visible line filter, retains unrelated Builder fields, switches to List, and executes exact generated LogQL. Otherwise the explorer retains the query and applies an explicit, removable local member-ID scope without dispatch. The result-replacement effect clears local pattern scope.

Native selection and query assertions are scoped to the deterministic fixture. No authenticated-provider execution is performed.

## F. Visual Convergence Atlas candidates

These are evidence **candidates**, not authorized fixes. Follow existing Phase 1B V-01 / V-09 and CAP-19 when its evidence is available.

| Candidate | IDs | Classification | Observation / source ownership | Impact, confidence, direction |
| --- | --- | --- | --- | --- |
| **VC20-01** | L19/L20, comparator L12/L15 | **UNVERIFIED** pending new image inspection; known V-01 list shell divergence is already documented | Pattern row has count/percent first, shared severity badge + chevron, separate virtual-row CSS from `LogResultExplorer` | Medium visual/density impact, strong source/Phase 1B evidence, new native comparison pending; preserve domain-specific metric slot, do not conflate with generic log rows |
| **VC20-02** | L20/L15 | **ALREADY_CONVERGED** shared width/keyboard-resize primitive, domain details intentionally differ | Both log and pattern inspectors import `ResizableDetailPanel`; patterns add **View logs**, template and examples | Low duplication risk, strong source/test confidence; preserve shared primitive, audit usable narrow widths before redesign |
| **VC20-03** | L21/L17 | **INTENTIONAL_DIFFERENCE** conditional promotion versus explicit local scope | `LokiExplorer.viewPatternLogs`, `derivePatternLineContainsCandidate` and `resultFilter`; a generic filter abstraction would risk query semantics | High query safety impact, strong existing UI-test/source evidence; preserve guard against saved multi/non-`|=` filters; native CAP-20 confirmation pending |
| **VC20-04** | L19–L21 | **UNVERIFIED** runtime empty/failure and stale inspector | `LogPatternExplorer` selection reset, `LokiExplorer` result updates/error handling | Medium UX impact, component/source evidence only until current CI; keep failed provider call distinguishable from loaded zero results |

## G. CI and evidence

- Visual preview workflow: **pending**. Its standalone module process should be isolated from canonical audit and CAP-18; shared runners must not change.
- Unit/UI/build/documentation jobs: **pending**.
- Runtime source commit, generating merge checkout, workflow ID, artifact ID, batch status/index, inspected screenshot dimensions/pixels, semantic `measurements.json` and its `sourceHead`: **not yet independently verified**.
- Inherited formatting/typecheck failures, if any, must be distinguished from CAP-20's two-file diff. No local lint or formatter was run.
- If the module fails, the loader retains `status.json` and partial artifact evidence. This report must remain `PARTIAL` and name the precise failure rather than extrapolate from component tests.

## H. Completion disposition

**PARTIAL.** Source ownership and an isolated scenario are documented, but native assertions, four screenshots, full-resolution inspection, provenance and canonical-audit regression are not verified in this revision. Upgrade to `EVIDENCE_COMPLETE` only after those checks pass. Keep this draft PR separate for integration-owner review; **do not merge**, change #406, edit the central register or start CAP-21.
