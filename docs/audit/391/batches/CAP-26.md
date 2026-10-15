# CAP-26 — Generic chart view types and configuration

**Parent:** [#391](https://github.com/cubitouch/DataKoala/issues/391) · **Integration:** [draft #406](https://github.com/cubitouch/DataKoala/pull/406) · **Isolated audit:** [draft #433](https://github.com/cubitouch/DataKoala/pull/433)

**Disposition: PARTIAL.** The standalone CAP-26 Electron batch executed successfully, its six original-resolution images were individually inspected, and provenance was verified. Two concrete Scatter presentation defects were identified; the required broader negative-state and cross-provider matrix is not exhaustive. Successful capture does **not** imply defect-free rendering or acceptance as \`EVIDENCE_COMPLETE\`.

## 1. Execution and chain of custody

| Field | Verified value |
| --- | --- |
| Base branch and exact base HEAD | \`audit/391-ux-convergence\` — \`3cadf2e41ada6f02e53b06f9d500d84a928ca292\` |
| Isolated branch | \`audit/391-cap-26-generic-charts\` |
| Scenario implementation commit | \`04cbf4be65650098e955dd43266ecc9dd3d61ee7\` |
| Accepted scenario/generating commit | **\`0416e50fbf977aa67f8e6f9762d615452ccd82ad\`** (escaped semantic selector correction) |
| Report commit | The separate commit containing this report; its SHA is intentionally not self-referential |
| Workflow | [Visual Preview run 38792865339](https://github.com/cubitouch/DataKoala/actions/runs/38792865339) — **success**, capture and publish |
| Audit artifact | **12001161095**, \`datakoala-ux-audit-pr-433\`, containing \`batches/CAP-26\` |
| GitHub Actions synthetic merge checkout | \`a45e01b35162eb6374583c023ed6e91ccf153aa2\`, **not** the generating sourceHead |
| Provenance | \`measurements.json\`, \`status.json\`, and \`batches/index.json\` all match **\`0416e50fbf977aa67f8e6f9762d615452ccd82ad\`**; CAP-26 status **success** |
| Images / viewport | Six PNG files, each **1440 × 900 RGB**, DPR 1, Electron zoom 1, positive semantic target bounds |
| CI at generating SHA | [CI run 38792865401](https://github.com/cubitouch/DataKoala/actions/runs/38792865401): **failure** in repository-wide Quality → Check formatting; Unit, UI, Production build, and DuckDB macOS runtime/package jobs **success** |
| Documentation | [run 38792865468](https://github.com/cubitouch/DataKoala/actions/runs/38792865468) — **success** |
| Formatting failure scope | 27 unrelated existing files (coverage register, prior CAP/NON reports and NON tests); **CAP-26 module was not listed**. Overall CI is not green. |
| Local checks | No local linting or formatting |
| Change boundaries | This PR adds only the standalone CAP-26 module and this CAP-26 report; no production source, shared runner, workflow, canonical fixture, other CAP, or central register change |

**Evidence vocabulary:** VV = visually verified through an original-resolution screenshot inspection; BV = asserted behavior exercised in Electron; SO = source-only; UV = not verified. VV/BV apply only to explicitly listed subbehaviors.

## 2. Individual inventory dispositions

| Inventory ID | Visual | Behavior | Specific evidence and remaining scope |
| --- | --- | --- | --- |
| **P16** — Metric result as table/chart | **VV** | **BV** | Prometheus Line screenshot has two label-derived series, 10 input rows, nine plotted non-null items and one-range time axis; Area/Bar/Line switches make zero provider queries. Prometheus Table transition, many-series thresholds and rich missing data remain UV. |
| **R07** — Bar | **VV** (shared chart shell; Area reference image) | **BV** | PG and PM Bar selection, finished canvas, two series, PG eight aggregated items, zero local-query delta. No dedicated Bar PNG; edge cases UV. |
| **R08** — Line | **VV** | **BV** | PG selected/finished with two series and eight aggregated marks; Prometheus Line PNG with time bounds and nine non-null items. Gaps partially observed; timezone-boundary cases UV. |
| **R09** — Area | **VV** | **BV** | PG Area screenshot, two series, eight aggregated buckets; PM Area selected and finished; stacking/null corner cases beyond this fixture UV. |
| **R10** — Scatter | **VV** | **BV**, **defects** | PG numeric X/Y mapping via real Combobox and populated screenshot; see **VC26-01** (fabricated zero marks) and **VC26-02** (categorical positioning of numeric X). Exact valid scatter mark contract **not accepted**. PM numeric Scatter and separate Tempo trace scatter UV/out of this baseline. |
| **R11** — Treemap | **VV** | **BV** | PG two-level node aggregation via deterministic source, applied chart fingerprint and labels; initial root totals 58/56; no refetch. Null categories, PM hierarchy, breadcrumb traversal UV. |
| **R12** — Sunburst | **VV** | **BV** | PG same source 114-unit total after hierarchy reorder; two category roots (82/32), correct second-level labels, one rendered ECharts series; PM and invalid hierarchy UV. |
| **R13** — X/Y/series mapping | **VV** | **BV** | PG X \`time_bucket\`→\`duration_ms\`, Y \`value\`→\`other_value\`→\`value\`; Series \`series\`→two-level \`series,category\`. PM \`timestamp/value/status\` mapping. Invalid/non-numeric selection paths UV. |
| **R14** — Hierarchy reorder | **VV** | **BV** | Actual \`Move series outward\` changed order \`series,category\`→\`category,series\`, reconstructing Sunburst root totals without provider query. More than two levels and optional empty branch UV. |
| **R15** — Axis scale / temporal units | **VV** (controls visible) | **BV** | Actual Linear→Log combobox change produced explicit warning **“Log scale: 2 zero or negative points are not plotted.”**; Unit→Time and input unit→\`s\` persisted, no provider query. All numerical tick formatting variants, units in PNG, invalid log/domain cases UV. |

## 3. Chart-type capability and transition matrix

| View | PostgreSQL synthetic result | Prometheus synthetic result | Capability/limitation |
| --- | --- | --- | --- |
| Table | **VV/BV** populated 16-row table, successful return | **SO/UV**; control exposed but not selected | Generic result-driven table, not a separate datasource run |
| Line | **BV**, eight aggregated items, two series | **VV/BV**, two label series, nine non-null marks | Time-domain handling differs legitimately |
| Bar | **BV**, two series/eight aggregated items | **BV**, two series | Chart presentation is local |
| Area | **VV/BV**, two series/eight aggregated items | **BV**, two series | Chart presentation is local |
| Scatter | **VV/BV but defective**; 32 displayed items vs 16 input rows | **UV** | Numeric-X handling needs correction |
| Treemap | **VV/BV**, hierarchy totals 114 | **UV** | Needs Series dimensions and numeric Y |
| Sunburst | **VV/BV**, hierarchy totals 114 | **UV** | Shares hierarchy with Treemap; not assumed interaction-equivalent |

All seven result picker options (Table and six charts) are displayed in both screenshot shells. Visibility of a view is not proof that arbitrary result shapes can render it.

## 4. Mapping, aggregation, scales and provider requests

| Scenario | Source/mapping | Verified presentation |
| --- | --- | --- |
| PG Line/Bar/Area | \`time_bucket\` UTC; \`value\` numeric; \`series\` North/South | Four timestamp buckets × two series = **eight aggregated items**; selecting Line, Bar or Area does not issue a query |
| PG Scatter | numeric \`duration_ms\` and \`other_value\`; \`series\` North/South | One known real coordinate is **(100, 100)** in North; however, 16 actual rows are expanded into **32 rendered items**, including synthetic zeros: **confirmed invalid chart presentation** |
| PG two-level hierarchy | \`value\`; order \`series → category\` | North: API 44 + Worker 12 = **56**. South: API 38 + Worker 20 = **58**. Grand total **114** |
| PG reordered hierarchy | Real reorder to \`category → series\` | API: North 44 + South 38 = **82**. Worker: South 20 + North 12 = **32**. Grand total **114** unchanged |
| PG Log and temporal unit | Log scale; \`displayUnit: {family:'time',unit:'s'}\` | Explicit zero/negative omission warning, control state persisted, **no query** |
| Prometheus metric | \`timestamp/value/status\`, statuses \`200\` and \`500\` | Two label-derived series, 10 result rows, **nine non-null plotted marks**; one missing data point retained as gap. Explicit time-range 16:00–17:00 UTC |

**Exact captured query ledger:** PostgreSQL count **1** after initial Run and all view, dimension, series, hierarchy, scale, unit and Table-return operations; **4** PostgreSQL requests only after explicit Run for original, empty, single-row, and changed-shape results; **1** Prometheus Run for \`up\`, with **0** additional requests across Line/Area/Bar/Line transitions. Five total provider requests by final screenshot. Query-result shape reconciliation changed stale X/Y fields to \`new_label/amount\`. Provider invariance is verified for these local actions, not claimed for all live-provider flows.

**Rendering distinction:** Native source rows, pivoted series buckets, semantic ECharts items, and chart pixels are different layers. The Scatter mismatch occurs at the presentation layer; it must not be hidden by a green screenshot-generation assertion.

## 5. Original-resolution screenshot manifest and inspection

All six files were extracted from artifact **12001161095** and individually opened at **1440 × 900**. Every measurement contains DPR 1, zoom 1, a positive target rectangle, a recorded generating \`sourceHead\`, and zero unexpected provider requests during local configuration.

| Filename | Inspection result |
| --- | --- |
| \`cap26-views-postgres-default-desktop.png\` | Populated 16×6 SQL table, clear selected Table state, all chart picker controls, no apparent clipping. The intentionally empty synthetic objects sidebar is not a real metadata-discovery assertion. |
| \`cap26-views-postgres-changed-desktop.png\` | Finished Area canvas, visibly separate North/South regions, numeric/time axes, selected Area state, dimension selectors and right legend, no apparent clipping. |
| \`cap26-scatter-desktop.png\` | Finished Scatter canvas and numeric X/Y labels; **numerous extraneous plotted zeros at the horizontal baseline** and equally spaced numeric-X categories; **defect**. |
| \`cap26-treemap-desktop.png\` | Finished Treemap canvas with two-level hierarchy selectors and API/Worker labels in all four visible child regions; numeric totals verified from applied chart fingerprint. Breadcrumb displays \`North > API\` while all four regions are visible; interaction meaning not established. |
| \`cap26-sunburst-desktop.png\` | Finished Sunburst canvas, distinct API/Worker sectors and North/South leaf labels; new hierarchy order visible; no clipping. |
| \`cap26-prometheus-chart-desktop.png\` | Finished Line chart, \`timestamp/value/status\` selectors, two visible label-series traces, null-induced gap in the 500 series, no apparent clipping. The one-hour horizontal domain deliberately contains only the first few minutes of synthetic samples. |

Image metadata: each PNG is RGB, exact 1440×900. \`measurements.json\` contains exactly six observations corresponding one-to-one with the screenshot manifest, all \`dpr=1\`, \`zoom=1\`, all targets nonempty; \`status.json\` is CAP-26 success; \`batches/index.json\` lists CAP-26 success. The three files carry the **same generating commit**, distinct from the GitHub Actions pull-request synthetic merge commit.

## 6. Visual Convergence Atlas candidates

| ID / Classification | Evidence, implementation owner and affected IDs | Impact / confidence / future direction |
| --- | --- | --- |
| **VC26-01 — CONFIRMED_DEFECT** | Scatter PNG: **16 raw rows → 32 semantic marks**, including fake zero points for missing X/series pairings. \`resultVisualization.pivotRowsForChart\` constructs \`missing[]\` and synthetic zeros; \`chartPresentation.buildChartPresentationOptions\` strips \`missing\` and plots the zeros. **R10, R13**. | **High impact, high confidence.** Missing combinations are not measured zero. In Phase 2, retain gaps as non-plotted/null points in Scatter and assert exact scatter mark count and coordinate set. |
| **VC26-02 — CONFIRMED_DEFECT** | Scatter PNG: numeric X \`duration_ms\` values **100, 103, 110, 113…** occupy equally spaced category positions; \`buildChartPresentationOptions\` uses \`xAxis.type='category'\` whenever X is not temporal. **R10, R13**. | **High impact, high confidence.** Distances are misrepresented. In Phase 2 use numerical value-axis semantics for a numeric Scatter X, preserving genuine coordinates and tooltip labels. |
| **VC26-03 — ALREADY_CONVERGED** | Both PG and PM screenshots share \`ChartPicker\`, \`GenericResultExplorer\`, X/Y/Series controls, view state, chart action toolbar, and legend presentation. **P16, R07–R15**. | **Medium impact, high confidence** for inspected shell. Preserve shared component ownership; do not forcibly homogenize provider-specific data contracts. |
| **VC26-04 — INTENTIONAL_DIFFERENCE** | PG uses result-derived SQL columns/series; PM uses label-derived metric series and a requested time-domain bound with resolution. \`QueryEditor\`, \`ResultExplorer\` time-domain adapter. **P16, R08, R13, R15**. | **Medium impact, high confidence.** Preserve provider-specific semantics within the shared chart presentation. |
| **VC26-05 — UNVERIFIED** | Treemap breadcrumb shows \`North > API\` while all four child rectangles remain visible; no breadcrumb interaction or selection was performed. \`chartPresentation\` Treemap option and ECharts renderer. **R11, R14**. | **Low–medium impact, low confidence.** Reproduce via an intentional breadcrumb/node click before deciding whether this is a defect or default ECharts behavior. |

No production/chart refactor is included in this audit. These are Atlas **candidates**, not an assembled Atlas or authorized Phase 2 work.

## 7. Residual verification and acceptance

Not exhausted: empty results and single-point visual screenshots (behavior exercised); invalid/non-numeric dimension UI; null/empty hierarchy categories and depth beyond two; long series/axis names; node tooltip and navigation semantics; exact tick formatting across unit families; chart resizing; PM Treemap/Sunburst/Scatter and Prom Table flow; invalid log-domain behavior; live-provider network semantics; keyboard and screen-reader acceptance; separately owned Tempo trace Scatter, legend isolation/resizing and point/brush filters (CAP-27 boundary). Numeric Scatter currently violates expected coordinate/point semantics.

**Final CAP-26 decision: \`PARTIAL\`.** Strong VV/BV evidence exists for the six core captures, query-count invariance and verified hierarchy math, but two confirmed Scatter defects and remaining unverified cases prevent \`EVIDENCE_COMPLETE\`. Keep PR #433 draft. Do not merge, alter #406 directly, edit the coverage register, start CAP-27 or Phase 2, or generate the Atlas.
