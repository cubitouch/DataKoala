# CAP-28 — Chart export, AI anomalies and empty/loading/error states

**Disposition: PARTIAL.** The scoped PostgreSQL standalone Electron scenario passed, five new 1440 × 900 screenshots were individually opened at original resolution, and the actual exported PNG was inspected. Remaining gaps include retained-result ownership clarity on SQL failure, feedback containment/cancellation semantics, native image copy/save, sample-limit cases and broader configuration/restoration substates. A green workflow does not close those gaps. No production change or newly confirmed product defect is claimed.

Parent: [#391](https://github.com/cubitouch/DataKoala/issues/391). Integration: [#406](https://github.com/cubitouch/DataKoala/pull/406). Isolated **draft [#436](https://github.com/cubitouch/DataKoala/pull/436)** targets `audit/391-ux-convergence`.

## A. Metadata, preparation and provenance

| Field | Verified value |
| --- | --- |
| Integration base fetched before writing | `88c8ba58c95a2ab4faadfc07a8227cbb9b2ade85` |
| Isolated branch | `audit/391-cap-28-chart-export-anomalies` |
| Initial published scenario | `b273e69b5fd8453f05644a06fcf851978a3e1713` |
| Accepted scenario / generating sourceHead | **`83eeb52e4dfbd3c12979a6888b2d0e9fba22101e`** |
| Separate report commit | Commit containing this report; retrieve exact SHA from PR history, not a self-referential value |
| Accepted Visual preview | [38814994606](https://github.com/cubitouch/DataKoala/actions/runs/38814994606), capture and publish **SUCCESS** |
| Full audit artifact | [12010741400](https://github.com/cubitouch/DataKoala/actions/runs/38814994606/artifacts/12010741400), `datakoala-ux-audit-pr-436`, downloaded ZIP SHA256 `22fad32370429119ae05efaa83b3099a75a7d6f461473e78d72f3561a603f17c` |
| Normal comparison artifact | 12010362814, same run and PR head |
| Actual Actions synthetic merge checkout | **`5a9983aadf9069d211554d69ff86f86c53a4179a`**, merging scenario head into recorded integration base |
| Evidence directory | `batches/CAP-28/` |
| Provenance validation | `measurements.json`, `status.json` and `batches/index.json` match accepted sourceHead exactly; CAP-28 and all other discovered CAP-18–27 batches report success |
| Local validation | Node syntax check passed; **no local linting or formatting** |

Root AGENTS guidance and absence of nested AGENTS files were checked. Inventory, architecture audit, coverage register, visual-documentation conventions, relevant standalone modules and CAP-26/CAP-27 reports were read. Large initial combined output was truncated and subsequently read in bounded sections. The inherited coverage register itself contains historical truncation notices/omitted text; these were not repaired or treated as newly complete evidence. Implementation/test inspection covered GenericResultExplorer, ResultExplorer, chart presentation/configuration/readiness, chartImage/useChartExport, anomaly sampling/mapping/analysis/details and queryResultLifecycle. Existing image, anomaly and generic-result tests provide source context; actual acceptance below comes from the new Electron run, not a claim of local test execution.

Ownership searches found no earlier CAP-28 branch/PR. Shell publication first met automatic approval rejection and then unavailable shell Git credentials after explicit user approval; the connected GitHub API published the isolated branch. Local-only preparation SHAs `2614212` and `90ae952` are **not** generating remote evidence commits.

Diagnostic runs are not accepted evidence: 38813618293 at b273e69 failed serializing ECharts formatter functions across Electron; artifact 12009717000 has no completed CAP-28 capture. Correction a853ade serialized observations; its run was superseded. 38814354494 at 14d1d38 reached chart/export/marker assertions and failed because the audit expected lowercase visible `high` instead of CSS-rendered `HIGH`; artifact 12010207064 is partial only. Final correction checks both native `high` content and displayed `HIGH`. Palette checks were aligned with canonical first-two-series yellow/cyan. These are audit-driver corrections, not product fixes.

## B. Authoritative inventory coverage matrix

Definitions are the exact atomic feature names in inventory sections G/H. UI-004 is a provisional register lead, not an eighth original capability. X08 covers PNG export, not anomalies; R21/X08 and R22/X05 overlap intentionally.

| ID / authoritative definition | Visual evidence | Behavioral evidence and limits |
| --- | --- | --- |
| R21 — Chart PNG copy/export | **VV** ready/export feedback frames and actual exported PNG; feedback-edge containment UV | **BV** actual export control, bytes/dimensions, save/error/cancel characterization and empty/error disabled states; native copy and OS save UV |
| R22 — AI line-chart anomaly analysis | **VV** configured Line control and analysis details | **BV** exact submitted series/points, real request, AI-only error and stale-response rejection; unconfigured/sample-budget cases SO/UV |
| R23 — Anomaly markers/analysis details | **VV** red Alpha marker and native details, source point and severity | **BV** exact overlay identity/coordinate, red pixels at anomaly and none at control, hide/show, details close/reopen, revision invalidation; marker hit/hover and unsampled cases UV |
| R24 — Chart readiness/animation and resize | **VV** completed populated Line; resized state not separately captured | **BV** current finished fingerprint, configuration changes, real splitter resize, new result and view switching; animations disabled by existing smoke contract, tab-switch/animation runtime UV |
| R25 — Loading/error/empty presentations | **VV** completed empty and native SQL failure; loading/AI failure only behavioral | **BV** deferred initial Run, separate native messages, underlying data intact during AI failure, new completed recovery chart; explicit retained-result label acceptance unresolved |
| X05 — AI anomaly summary/markers | **VV/BV** same scoped anomaly evidence as R22/R23 | Six points per series at 100% sample coverage; >32 points, >8 series and unsampled/hidden series UV here, source/tests SO |
| X08 — PNG chart copy/export | **VV/BV** same scoped export path as R21 | Two-label composed legend inspected; offscreen/long legend and clipboard transport UV |
| UI-004 — Advanced chart configuration and legend restoration sub-states: confirm gaps beyond R family | **VV** controls in ready/details frames | **BV** Linear→Log→Linear; hidden Alpha v2 retained through Bar→Line then restored; broader dimension/legend-width/tab/restart restoration UV |

No whole-inventory or cross-provider completion is implied by these scoped VV/BV entries. SQL4/PM/LK share the implementation; only synthetic PG was directly exercised here.

## C. Synthetic fixture and readiness matrix

Six fixed UTC timestamps on 2026-08-19, 16:00–16:50 every ten minutes; timestamp/service/value columns; twelve rows. Alpha: **20, 22, 180, 21, 24, 23**. Beta: **50, 52, 49, 53, 51, 54**. Alpha at **16:20 / 180** is anomalous; Beta at **16:20 / 49** is the unflagged control. Beta sorts first by total, using yellow; Alpha is cyan. Revised data moves timestamps one day forward, appends ` v2` to both series and adds ten to every value.

Initial session/profile/configuration are injected into the existing controlled store seam. **All six queries then use actual Run controls and synthetic IPC**, not arbitrary result injection. Only the final unsupported one-column nonnumeric shape is explicitly store-injected, limiting that claim to native presentation. No real AI, database or native save dialog was used. Mounted ECharts options are read through the existing canonical AI preview's React traversal; chart callbacks/options are not injected.

| Transition | Actual result / renderer | Query accounting |
| --- | --- | --- |
| Initial pending → ready | Real `Running…` / `Running query…`, null result, no completed-empty message; release IPC → revision **1**, twelve rows, two series, current/expected fingerprint match | One explicit query |
| Line ready | timestamp/value/service mappings; six points per series; yellow **1443**, cyan **2152** actual plotted pixels | Count remains 1 |
| Linear → Log → Linear | Native Combobox; changed fingerprint and finished chart; original rows remain authoritative | **1→1, delta 0** |
| Revised result | Revision **2**, `Alpha v2` / `Beta v2`, changed source values/timestamps; no obsolete annotation | One further explicit query |
| Hide Alpha v2 → Bar → Line → restore | Legend remains hidden across views then restores by actual toggle | **2→2, delta 0** |
| Workspace splitter +24 px | Mounted chart **928×415 → 928×391**, exact series unchanged, newly finished layout | **2→2, delta 0** |
| Empty → normal → SQL error → revised recovery | Revisions **3 → 4 → 4 → 5**; error does not fabricate a successful revision; recovery matches revised fixture and finished renderer | Four explicit queries |

Total **six** synthetic provider requests: loading, revised, empty, normal, error, revised. Configuration, export, AI/detail/toggle and view/legend/resize interactions dispatch no provider queries in their recorded intervals.

## D. Distinct export acceptance matrix

| Aspect | Measured outcome |
| --- | --- |
| Action / chart ownership | Actual **Export PNG**, Line, source revision **1**, Beta/Alpha, timestamp/value/service |
| Output contract | `datakoala_chart.png`, extensions `["png"]`; original base64 intercepted at `export:save-binary` |
| Actual bytes | Preserved verbatim as **`cap28-export-image.bin`**, a PNG retained separately from the five screenshot filenames |
| Image dimensions/content | **2440×830**; decoded through Electron nativeImage; **32,134** nonbackground pixels; original image individually opened after retrieval |
| Visual inspection | Both colored curves and all twelve points, Alpha 16:20 spike, timestamp ticks, numeric axis, grid and complete two-label legend visible; not a blank canvas |
| Success feedback | Native **`Chart exported`**, role=status, export screenshot inspected; text is close to bottom viewport edge, precise toast bounds/containment UV |
| Failure | Real control with synthetic save rejection yields **`Could not export chart`**; behavior verified, no dedicated failure screenshot |
| Cancel | Null save result; no new success; preceding `Could not export chart` persists in immediate DOM record. Recorded as characterization, not proof of ideal cancellation semantics |
| Disabled states | Copy/Export disabled for empty result and SQL failure; Export disabled for injected unsupported nonnumeric shape |
| Provider requests | Save/error/cancel **1→1, delta 0** |

This validates real generated image bytes and the renderer-to-save boundary, not the OS dialog/filesystem or clipboard image transport. Export of revision 2/5, concurrent capture replacement, long/offscreen legend and cancellation after a successful prior toast remain UV.

## E. AI anomaly and revision ownership matrix

Synthetic AI contract returns one point reference, summary, `Isolated spike`, the exact Alpha/180/16:20 reason, supported severity `high`, limitations and follow-up. Three actual synthetic AI requests: success, provider failure, delayed success from the old revision. No fabricated confidence/classification field.

| Path | Actual evidence |
| --- | --- |
| Submitted request | Beta and Alpha, six exact source points each; Alpha point index **2** is `{x:"2026-08-19T16:20:00.000Z",y:180}` |
| Mounted annotation | `__datakoala_ai_anomaly__:Alpha`; `sourceSeriesName=Alpha`, originalIndex **2**, value **[1787156400000,180]** |
| Actual drawing at source coordinate | ECharts pixel target **(391.60000002384186,20)**, **52 red pixels** in target neighborhood; control at same X / Y49 has **0** red pixels; actual marker visible in screenshot |
| Details | Actual **AI details (1)** button opens aggregate popover: matching title, point, reason, `HIGH`, limitations and **100%** coverage (6/6 for both series) |
| Close/reopen/toggle | Detail closes/reopens with same point; Show anomalies removes/restores exactly the same overlay data; zero provider calls |
| AI-specific failure | One native alert **`CAP-28 synthetic AI unavailable. Try Analyze with AI again.`**; queryError remains null, original twelve rows and valid chart retained |
| Old asynchronous result | Hold third request; actual Run produces revision **2**; original request ID is cancelled. Release old response: no old marker/details or analyzing state attaches to new Alpha v2/Beta v2 |

The product presents an aggregate findings popover. There is no per-anomaly navigation control to invent; multi-finding content and native marker hit/hover behavior are UV in this one-finding scenario. Successful fresh AI reanalysis on the revised data is also UV. Existing hook tests cover context replacement/cancel/provider rejection and mapping tests cover submitted-point ownership; those do not replace these stated native gaps.

## F. Native loading/empty/error/recovery matrix

| State | Observed native presentation / controls / disposition |
| --- | --- |
| Loading | `Running…` / `Running query…`, null initial result, no `Query returned no rows.`; **BV**, no loading PNG |
| Completed chart | Two plotted series and current finished fingerprint; **VV/BV** |
| Completed empty | **`Query returned no rows.`**, 0 rows, no stale plot, Copy/Export disabled; **VV/BV** |
| Unsupported data | **`This result does not contain a numeric column that can be used as a Y axis.`**, X reconciles to message, Y `No numeric column`, Export disabled; **BV**, explicitly injected final result shape, no PNG |
| SQL failure | Exactly **one alert**: **`CAP-28 synthetic SQL error: column missing_column does not exist`**; **Fix with AI** plus toolbar **Run**; Copy/Export disabled; **VV/BV** |
| Retained chart ownership | Prior twelve-row revision **4** remains visible, `isResultStale=false`, no explicit last-success banner. This reproduces inherited **V-06**, not a silently accepted new-result render. Ownership/clarity criterion remains **unresolved**, so PARTIAL |
| AI failure | Dedicated AI alert; valid SQL result not destroyed and SQL error remains null; **BV**; no separate visual acceptance |
| Recovery | Actual Run yields revision **5**, queryError null, exact revised rows and newly finished chart; **BV**, not merely alert disappearance |

No duplicated SQL error was observed in this fixture. Generic provider/network/connection failure, reconnect UI, real screen-reader timing and a successful AI retry after the modeled failure remain UV. Existing V-06 table/chart retained-data policy differences are preserved for product review, not repaired or reclassified automatically as a new defect.

## G. Five-image manifest and original-resolution inspection

Each PNG was individually opened at **1440×900**, DPR **1**, zoom **1**, with positive semantic geometry; exact manifest matched the module. All refer to accepted sourceHead above, not the report SHA or synthetic merge SHA.

| Screenshot | Target x/y/w/h | Individual inspection |
| --- | --- | --- |
| cap28-chart-ready-desktop.png | 248 / 469 / 1192 / 431 | **VV**: distinct yellow Beta and cyan Alpha, spike/points/ticks, mapping controls and legend populated; no chart clipping |
| cap28-chart-export-feedback-desktop.png | 248 / 429 / 1192 / 471 | **VV**: populated chart and native exported status at bottom edge; exact feedback containment not measured |
| cap28-ai-chart-anomaly-details-desktop.png | 972 / 470 / 460 / 422 | **VV**: red ring on Alpha spike; aggregate popover with exact point, HIGH and coverage; scrollable content stays in viewport; intentional chart overlay |
| cap28-chart-empty-desktop.png | 248 / 493 / 1192 / 407 | **VV**: calm centered no-rows text, 0 rows, disabled copy/export, no old marks |
| cap28-postgres-error-chart-desktop.png | 248 / 347 / 1192 / 553 | **VV**: single error and Fix with AI, disabled copy/export, previous chart/legend remain visible; no last-success label |

Actual exported image was separately opened at **2440×830**. Comparison images individually inspected: accepted normal `ai-chart-anomaly-details.png` (original **1100×674**, not relabeled as a new desktop screenshot), canonical `postgres-error-chart-desktop.png`, and CAP-27 default legend frame from the earlier diagnostic full artifact. CAP-26/CAP-27 reports corroborate shared control ownership and preserve their existing Scatter defects and verification gaps. These comparison artifacts are attributed to their generating runs and do not establish new CAP-28 behavior.

## H. Visual Convergence Atlas candidates

| Stable ID / class | IDs, implementation owner, evidence | Impact / confidence / future direction |
| --- | --- | --- |
| VC28-01 — ALREADY_CONVERGED | R21/X08; GenericResultExplorer → useChartExport → chartImage. Ready/export frames, actual 2440×830 PNG, save failure and zero-query checks | Medium, high confidence for tested PG save boundary. Preserve shared capture/legend ownership; verify native copy/save and long legends separately |
| VC28-02 — ALREADY_CONVERGED | R22/R23/X05; useChartAnomalyAnalysis, chartAnomalyMapping, chartPresentation, details popover. Exact point/ring/control pixels, details/toggle and delayed revision invalidation | High semantic importance, high fixture confidence. Preserve bounded sample and context/request ownership; add native multi-finding/sample-limit and successful revised-analysis cases later |
| VC28-03 — INTENTIONAL_DIFFERENCE | R25 with R22/X05; generic SQL alert vs AI-specific error. Query failure has Run/Fix with AI and disables export; AI-only failure leaves SQL queryError null | Medium, high behavioral confidence; AI-error visual frame UV. Preserve operation-specific recovery and data ownership, not a universal error controller |
| VC28-04 — UNVERIFIED | R24/R25/UI-004; V-06 retained-result policy. Error frame retains revision 4 without explicit last-success label; queryResultLifecycle/GenericResultExplorer own behavior | Medium/high clarity importance; high observation confidence, policy/defect classification unresolved. Decide explicit prior-result labeling and compare Table/chart before Phase 2 |
| VC28-05 — UNVERIFIED | R21/X08/R25; useChartExport inline feedback. Success text near bottom edge; cancel preserves previous save-error message immediately | Low/medium, high observation but insufficient containment/policy evidence. Measure toast/ancestor bounds and test cancellation after previous outcomes; do not claim a confirmed clipping defect from this frame alone |

No new CONFIRMED_DEFECT or unnecessary implementation difference is established. Existing V-06/V-12 and CAP-26/27 candidates are carried forward without duplicate findings or fixes. No final Atlas assembled.

## I. CI and acceptance decision

At accepted scenario SHA: Visual preview **38814994606 SUCCESS** (canonical audit, every standalone batch, capture/publish); Documentation **38814994572 SUCCESS**. CI **38814995264**: Unit, UI, production build and macOS runtime/package **SUCCESS**; Quality **FAILURE at Check formatting**, with later lint/CSS/typecheck skipped. The preceding identical-module family listed thirty inherited formatting files and no CAP-28 module; no unrelated fixes or local lint/format were run. The separate report commit triggers its own workflows; exact final status belongs in PR metadata, not invented here.

**Passed scoped acceptance:** actual ready renderer/series, configuration no-refetch, original export bytes/content/feedback/error path, anomaly source point/marker/detail ownership, delayed old-response invalidation, legend/view restoration and resize invariance, completed empty, distinct AI error, SQL recovery to new finished data. **Not fully accepted:** retained-result ownership clarity after SQL error; feedback containment/cancellation contract; native image copy/save; offscreen legend/sample limits, full animation/tab/configuration/restoration matrix, successful AI retry on revised data and other providers. These are explicit UV or unresolved branches, not silently passing behavior.

**Final CAP-28 disposition: PARTIAL. Stop after CAP-28.** Only this report and `scripts/visual-preview/audit-batches/cap-28.mjs` change. Keep #436 draft; do not merge, write #406 directly, change production/shared infrastructure/register/inventory, start CAP-29/Phase 2 or construct the final Atlas.
