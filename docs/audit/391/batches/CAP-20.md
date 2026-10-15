# CAP-20 — Loki Patterns list, detail, and View logs

**Disposition: EVIDENCE_COMPLETE — scoped deterministic Electron evidence and all four screenshots verified.**

## A. Metadata and provenance

- Date: 2026-10-15. Parent issue: [#391](https://github.com/cubitouch/DataKoala/issues/391). Integration PR: [#406](https://github.com/cubitouch/DataKoala/pull/406).
- Integration base observed before work: `906960284260175f88761d9ff93fe2fd79351dbd` (also the last verified supplied checkpoint).
- Separate branch: `audit/391-cap-20-loki-patterns`; [draft PR #421](https://github.com/cubitouch/DataKoala/pull/421) targets **`audit/391-ux-convergence`**, not `main`.
- Scope: **L19** pattern list/count/percentage, **L20** inspector/examples, **L21** View logs and safe promotion. Viewport: 1440×900, DPR/zoom 1. Four new screenshots maximum.
- Scenario module: `scripts/visual-preview/audit-batches/cap-20.mjs`. Initial module commit: `6867322f40f00e8bd9dea8b8b7940865b4a7cdf3`; final generating scenario commit: `ce088a2bdfcd0f710fc93a15561d05a208badcae`.
- Visual preview [run 38773038498](https://github.com/cubitouch/DataKoala/actions/runs/38773038498): **success**, audit artifact **11992971450** (`datakoala-ux-audit-pr-421`, 37,714,905 bytes). Scenario checkout/environment, `measurements.json`, `status.json` and `batches/index.json` all identify the generating SHA **`ce088a2bdfcd0f710fc93a15561d05a208badcae`**. All four original PNGs were downloaded and opened individually at their full 1440×900 resolution.
- Isolation: only the CAP-20 module and this report are edited. The shared loader, canonical `audit.mjs`, fixtures, coverage register, GitHub Actions workflow, production UX and PR #406 are untouched. CAP-19/NON-05 files are not edited.

## B. Coverage matrix

Codes: `VV` individually viewed full-resolution original PNG; `BV` executed and asserted behavior in the GitHub Actions Electron runtime; `SO` source/test-only; `UV` unverified. This audit uses deterministic IPC, not a live Loki service.

| Inventory | Visual | Behavior | Owners and named evidence | Outstanding |
| --- | --- | --- | --- | --- |
| **L19** — Patterns/count/percentage | **VV**: `cap20-patterns-default-desktop.png`, individually reviewed; legacy `patterns-default-desktop.png` and V-01 hover/focus also inspected | **BV**: 32 loaded logs, 28 clusters, Request 4 (12.5%), Worker 2 (6.3%), correct count-first ordering, ERROR/INFO, variable template, escaped and long texts, zero-loaded state | `src/shared/log-patterns.ts`, `LogPatternExplorer.tsx`, `logSeverity.ts`, `LogRowPresentation.tsx`; `log-patterns.test.ts`, CAP-20 Electron scenario | Live provider/malformed non-contract metadata, extremely large cardinalities remain unverified |
| **L20** — Inspector/examples | **VV**: `cap20-patterns-inspector-desktop.png`, selected Request + 4/12.5%/severity/examples/variable samples, verified native image | **BV**: native row selection; inspector keyboard width 420→444px, scrolling does not alter selection, Escape/reopen retains width, result replacement invalidates stale selection. Legacy V-01 Enter/close also BV | `LogPatternExplorer.tsx`; shared `ResizableDetailPanel.tsx`; component tests and CAP-20 Electron scenario | Tiny/responsive viewport and OS accessibility assistive-tech verification remain unverified |
| **L21** — View logs | **VV**: `cap20-patterns-view-logs-desktop.png`, selected List view, line filter 'completed', four logs, preserved service matcher | **BV**: exact second request `{service_name="example-service"} |= "completed"`; lineFilters replaced with visible `|= completed`, other Builder matchers retained. Negative filter, two existing filters and raw LogQL: explicit local scope, original filters unchanged, zero additional dispatch; explicit synthetic provider error | `LokiExplorer.tsx` `viewPatternLogs`; `src/shared/log-pattern-filter.ts`; `LokiExplorer.ui.test.tsx`; CAP-20 Electron scenario | No authenticated Loki/provider LogQL execution; incompatible fallback not represented by a fifth screenshot (measured/tested instead) |

All three inventory IDs have new verified scoped VV/BV evidence. Previously inspected Phase 1B V-01/V-09 images remain comparison references, not substitutes. This report makes no live Loki, OS clipboard or provider acceptance claim.

## C. Verified interaction matrix

The standalone module ran in its own actual Electron process with synthetic IPC. Every row was asserted and passed in run 38773038498. `measurements.json` records nine scenario observations, three IPC query calls (initial, promoted and explicit failure), and the four semantic screenshot observations.

| Initial state | Action | Expected/checked result | Current observed evidence |
| --- | --- | --- | --- |
| Connected Builder, 32 loaded logs (four Request, two Worker, one escaped/blank-severity, one long, 24 distinct) | Click **Run**, then **Patterns** | 28 clusters; descending count; Request 4/32=12.5%, Worker 2/32=6.3%; representative ERROR; denominator all loaded logs | **BV:** `measurements.json` + green standalone process |
| Default Patterns with 28 groups | Select Request cluster | Selected row, Request template, four logs, 12.5%, examples and variable samples agree | **BV/VV:** screenshot `cap20-patterns-inspector-desktop.png` + keyboard/DOM assertions |
| Open inspector | Keyboard resize, scroll virtual list, return to top, Escape, reselect | Width grows and persists across close/reopen; selected detail remains on scroll; Escape closes | Module assertions; CI pending |
| Selected Request in Builder; no existing line filter | **View logs** | One request with exact `{service_name="example-service"} |= "completed"`; original label selector retained; List with four responses and visible Line contains; no local scope notice | **BV/VV:** screenshot `cap20-patterns-view-logs-desktop.png` + exact observed IPC expression |
| Builder with saved non-`|=` line filter | **View logs** | Local scope banner, unchanged filters and **zero** requests | Module assertions; CI pending |
| Builder with multiple saved line filters | **View logs** | Local scope banner, both filters retained, **zero** requests | Module assertions; CI pending |
| Raw LogQL mode | **View logs** | Local scope rather than silent raw query rewrite, **zero** requests | Module assertions; CI pending |
| Pattern inspector open | Replace result IDs/messages | Selection invalidates, inspector closes | Module assertions; CI pending |
| Actual loaded empty result | Render Patterns | `0 patterns · 0 loaded logs`, “No logs to cluster.”, no inspector or View logs, no `NaN%` | **BV/VV:** screenshot `cap20-patterns-empty-desktop.png` + zero result assertions |
| Empty result, synthetic transport failure | Click **Run** | Explicit query error plus an alert reading “Synthetic CAP-20 Loki unavailable”; previous empty result may remain visible but is not silently represented as a successful new response | Module assertions; CI pending |

The deterministic fixture extends the existing `auditLogResult` canonical log shape without editing it. It contains ERROR/INFO/WARN and a **blank string severity** (the production log badge requires a string; an injected `undefined` was invalid test data), an escaped literal, a very long message, 24 distinctive templates and four grouped variable-bearing Request messages. Live malformed provider payloads beyond the valid log-row type were not exercised.

## D. Screenshot manifest

All four original PNGs under `visual-audit/batches/CAP-20/` are 1440×900 (DPR and zoom 1), with positive-sized semantic targets, no document overflow, and exactly the expected filename set. `measurements.json`, `status.json` and `batches/index.json` agree on sourceHead `ce088a2bdfcd0f710fc93a15561d05a208badcae`. The checksum prefixes below were computed on downloaded source PNG bytes; each image was independently opened and visually inspected.

| PNG | Semantic target | Intended assertions | Inspection |
| --- | --- | --- | --- |
| `cap20-patterns-default-desktop.png` | `[aria-label="Log patterns"]` | 28 groups, top 4/32 and 2/32, severity and long-text fit | **VV**: inspected full resolution |
| `cap20-patterns-inspector-desktop.png` | `[aria-label="Selected pattern details"]` | Request examples, variable samples, width after keyboard resize | **Not yet inspected** |
| `cap20-patterns-view-logs-desktop.png` | `[aria-label="Loki explorer"]` | Builder promoted line filter and four response logs | **Not yet inspected** |
| `cap20-patterns-empty-desktop.png` | `[aria-label="Log patterns"]` | Distinct genuinely empty result | **Not yet inspected** |

Source-PNG SHA-256 prefixes in manifest order: default `6551181b82908758`, inspector `5fde255940a696aa`, View logs `0081f4525dc5f2f7`, empty `103fe10998a73563`. Semantic target bounds (x,y,w,h): default (248,433,1192,467), inspector (1005,461,435,439), View logs (248,40,1192,860), empty (248,433,1192,467). All screenshots were individually reviewed for layout, text, selected state, row fit, counts and clipping.

## E. Implementation ownership

`clusterLogPatterns` creates bounded signature-based groups, generalized token templates, member IDs, samples, counts and percentages relative to the loaded records. The exact implementation sorts by descending count then ascending template. `LogPatternExplorer` memoizes groups for the given rows reference, uses a virtualized selectable list, renders representative severity via `LogRowPresentation`, and creates the pattern-specific Template/metrics/Severity/Seen/Examples/Variables inspector. `ResizableDetailPanel` owns shared width clamps, keyboard/pointer resize and semantic separator; it does not own pattern semantics.

`LokiExplorer.viewPatternLogs` owns the safety decision and query execution. `derivePatternLineContainsCandidate` chooses an actual literal present in **every** member, avoiding variable placeholders. Promotion is allowed only in Builder mode with fresh metadata, no existing line filter or a single `|=` filter refined by the candidate, and a serializable Builder query. A successful promotion replaces the single visible line filter, retains unrelated Builder fields, switches to List, and executes exact generated LogQL. Otherwise the explorer retains the query and applies an explicit, removable local member-ID scope without dispatch. The result-replacement effect clears local pattern scope.

Native selection and query assertions are scoped to the deterministic fixture. No authenticated-provider execution is performed.

## F. Visual Convergence Atlas candidates

These are evidence **candidates**, not authorized fixes. Follow existing Phase 1B V-01 / V-09 and CAP-19 when its evidence is available.

| Candidate | IDs | Classification | Observation / source ownership | Impact, confidence, direction |
| --- | --- | --- | --- | --- |
| **VC20-01** | L19/L20, comparator L12/L15 | **UNNECESSARY_DIFFERENCE** in duplicated openable-row shell per V-01; count/percentage leading slot is intentional | Pattern row has count/percent first, shared severity badge + chevron, separate virtual-row CSS from `LogResultExplorer` | Medium visual/density impact, high confidence with new native screenshot and legacy V-01 comparison; no shared refactor in audit; preserve domain-specific metric slot, do not conflate with generic log rows |
| **VC20-02** | L20/L15 | **ALREADY_CONVERGED** shared width/keyboard-resize primitive, domain details intentionally differ | Both log and pattern inspectors import `ResizableDetailPanel`; patterns add **View logs**, template and examples | Low duplication risk, strong source/test confidence; preserve shared primitive, audit usable narrow widths before redesign |
| **VC20-03** | L21/L17 | **INTENTIONAL_DIFFERENCE** conditional promotion versus explicit local scope | `LokiExplorer.viewPatternLogs`, `derivePatternLineContainsCandidate` and `resultFilter`; a generic filter abstraction would risk query semantics | High query safety impact, strong existing UI-test/source evidence; preserve guard against saved multi/non-`|=` filters; native CAP-20 confirmation complete; retain scope/provenance safeguards |
| **VC20-04** | L19–L21 | **ALREADY_CONVERGED** for stale-selection cleanup and explicit loaded-empty/error distinction in scoped runtime | `LogPatternExplorer` selection reset, `LokiExplorer` result updates/error handling | Medium UX relevance, high scoped runtime confidence; the earlier empty content remains visible after failure but a distinct role=alert and queryError make the failure explicit. No UX change proposed. |

## G. CI and evidence

- **Visual preview:** [run 38773038498](https://github.com/cubitouch/DataKoala/actions/runs/38773038498) **success**; capture job **116553517755** success, canonical UX audit and other previews intact. CAP-18 and CAP-20 run as separate processes and both have `status: success` in `batches/index.json`.
- **Evidence:** artifact **11992971450** (`datakoala-ux-audit-pr-421`), four CAP-20 original images, plus `measurements.json` and `status.json`. The loader's exact PNG set/dimension/provenance checks passed; each native image was separately opened at full resolution.
- **Provenance:** `sourceHead = ce088a2bdfcd0f710fc93a15561d05a208badcae` in both batch measurements/status and the aggregate index, identical to the generating checkout and scenario commit. Observed file dimensions are 1440×900; all four semantic targets have positive area, `dpr:1`, `zoom:1`, and `documentOverflow:false`.
- **Query safety:** exactly three requests across the entire scenario: initial `{service_name="example-service"}`, safe promotion `{service_name="example-service"} |= "completed"`, and the explicitly requested failing `{service_name="example-service"}`. Unsupported non-`|=`, multiple-filter and raw-mode View logs each dispatch **zero** new queries.
- **Tests/build:** [CI run 38773039184](https://github.com/cubitouch/DataKoala/actions/runs/38773039184): UI tests, unit tests, production build and DuckDB macOS runtime/package **passed**. [Documentation run 38773038503](https://github.com/cubitouch/DataKoala/actions/runs/38773038503) **passed**.
- **Quality:** CI overall failed its Prettier formatting check. Warnings included this newly added CAP-20 report **and** multiple pre-existing integration files; it is not accurate to call all warnings inherited. Formatting/linting was **not run locally**, and the broader formatting work remains with the integration owner.
- **Execution history:** the first attempt failed before Patterns was visible because of invalid synthetic severity/selector assumptions; the next attempt produced one screenshot before an over-strict inspector text check; the following attempt produced four reviewed screenshots but incorrectly rejected an explicit error while old empty content was still displayed. Those audit-module errors were corrected without modifying production UX; **only the final green run** establishes completed behavior/provenance.

## H. Completion disposition

**EVIDENCE_COMPLETE for CAP-20 scope (L19, L20, L21).** All four original full-resolution screenshots were generated and inspected, the 32-row grouping/percentages/ordering and inspector behavior were asserted, exact safe-promotion LogQL was observed at synthetic IPC, three incompatible cases preserved state without query dispatch, stale-selection and empty/error states were tested, provenance agrees with the generating source, and the canonical audit/CAP-18 still pass.

**Residual limitations:** no live authenticated Loki provider, unusually malformed data outside the required log-row contract (e.g. `undefined` severity), extreme pattern cardinality, narrow-viewport/assistive-technology acceptance, or OS clipboard testing. Error is explicit while the previous empty result remains visible; this is reported as an observed coexistence, not mislabeled as an empty-success response. Quality formatting remains red, including this report, outside this evidence-only audit's runtime scope.

Keep draft PR #421 open for the integration owner. **Stop after CAP-20. Do not merge, change PR #406 directly, edit the central coverage register or start Phase 2/CAP-21.**
