# CAP-27 — Legend isolation, resize and chart point filters

**Parent:** [#391](https://github.com/cubitouch/DataKoala/issues/391) · **Integration:** [draft #406](https://github.com/cubitouch/DataKoala/pull/406) · **Isolated PR:** [draft #434](https://github.com/cubitouch/DataKoala/pull/434)

**Disposition: PARTIAL.** The standalone Electron CAP-27 scenario passed, all **four** original-resolution screenshots were opened and inspected individually, and the primary PostgreSQL R16/R17/R18 behavioral contracts were verified without provider requests. Not classified EVIDENCE_COMPLETE because a post-resize screenshot, cross-provider runtime parity, persistence and several edge cases remain UV. No production, shared harness, workflow, register, CAP-26 or integration branch changes.

## 1. Commits, base and workflow provenance

| Field | Value |
| --- | --- |
| Integration branch and verified base HEAD | audit/391-ux-convergence at **3cadf2e41ada6f02e53b06f9d500d84a928ca292** |
| Isolated branch | audit/391-cap-27-legend-filters |
| Initial scenario commit | **8b92ddf001b5cda4a4b8a11a1ed21af3bef487b8** |
| Scenario revisions | ad68afd47edfbdcf92bfe4d6269c8b7a2932fddb (sorted series/colors); 53b185e21d037702ff3397564c492219c4d3369a (Electron arrow key mapping); e1a3f8b1af9e6503ccfcc1310222ce766805f0c9 (encoded focus and diagnostics) |
| **Accepted scenario generating HEAD** | **175d0ead3a66dace3dee7a318fe4d004ae028bac** (single-series/no-legend observation handling) |
| Report commit | Separate commit containing this Markdown file; a commit cannot include its own SHA. Retrieve its SHA from the PR history. |
| **Accepted workflow** | [Visual preview run 38794465569](https://github.com/cubitouch/DataKoala/actions/runs/38794465569) — **capture SUCCESS, publish SUCCESS** |
| **Accepted artifact** | [12001128524](https://github.com/cubitouch/DataKoala/actions/runs/38794465569/artifacts/12001128524), datakoala-ux-audit-pr-434 |
| Original screenshot output | visual-audit/batches/CAP-27/ |
| Exact sourceHead | **175d0ead3a66dace3dee7a318fe4d004ae028bac** in measurements.json, status.json, batches/index.json and the CAP-27 index item |
| Runtime | Actual Electron renderer; synthetic PostgreSQL tab and IPC; 1440 × 900 viewport; DPR 1; webContents zoom 1 |
| Local lint/format | **Not run** |

The accepted status.json reports CAP-27 status **success** and matching sourceHead. The standalone batch index lists CAP-18, CAP-19, CAP-20, CAP-21, CAP-22, CAP-23, CAP-25 and CAP-27 **success**, with sourceHead consistent across the index. Exact PNG manifest checked against exported screenshot list: four filenames and no extra CAP-27 PNG. Each PNG was independently checked as **1440×900**, each measurement has DPR/zoom **1** and a positive chart target box. The generating HEAD is the PR head used to generate these images; the separate report commit is **not** being represented as the generating SHA. Actions' synthetic merge checkout may have a different merge SHA from the PR source HEAD.

Earlier runs are diagnostic, **not accepted**: [38792709860](https://github.com/cubitouch/DataKoala/actions/runs/38792709860), failure from sending Electron ArrowLeft instead of Left, artifact 12001495776; [38793549943](https://github.com/cubitouch/DataKoala/actions/runs/38793549943), renderer-expression failure in the resize sequence, artifact 12001241632. Both captured three useful diagnostic images but did not complete CAP-27. These audit-driver faults were corrected without production edits. Intermediate superseded runs are not used to support acceptance.

## 2. Fixture and deterministic renderer method

Initial synthetic result is injected into a real SQL-mode session; **no real database connection**. Six fixed UTC timestamps on 2026-08-19 at 16:00, 16:10, 16:20, 16:30, 16:40 and 16:50. Columns: timestamp (timestamptz), service (text), value (int4). One row per series per timestamp: **18 source rows**.

| Named series | Six values in time order | Rendered legend order |
| --- | --- | --- |
| Gamma | 142, 153, 137, 158, 146, 165 | 1 (ordered by total) |
| Beta | 70, 82, **95**, 76, 108, 90 | 2 |
| Alpha | 20, 28, 21, 34, 25, 38 | 3 |

Line chart: timestamp X, value Y, service series, Sum presentation. Stable selected point: **Beta at 2026-08-19T16:20:00.000Z, value 95**. After initial fixture injection, the module operates actual legend buttons, Isolate controls, keyboard separator, native ECharts mouse interactions, chart point menu, filter chips and brush. HTML aria-pressed alone is **not** used to assert hidden curves: each expected visible or absent colored series is measured in the real ECharts canvas pixels. Source rows are checked immutable. Intercepted query:run and query:run-loki IPC requests are counted.

## 3. Inventory dispositions: visual versus behavior

| Inventory / owner | Visual | Behavioral | Scope |
| --- | --- | --- | --- |
| **R16** — legend visibility/isolation; **Shared SQL4/PM/LK** | **VV**: accepted default, hidden and isolated full-resolution frames individually inspected | **BV**: hide/restore, isolate after another hidden series, repeat isolation, canvas pixel assertions and no refetch | Direct PG synthetic only; other sources and reorder/all-hidden/long-label cases **UV** |
| **R17** — legend resize; **Shared SQL4/PM/LK** | **VV** initial legend in default frame; **UV** resized-state screenshot (not taken due to four-image budget) | **BV** native focused ArrowLeft and ArrowRight, exact DOM geometry and plot resizing, restored series and zero provider requests | Pointer drag, extrema, responsive clamp and persistence across views/restart **UV**; policy/test wiring **SO** |
| **R18** — point/context filtering/brush; **Shared/Conditional SQL4/PM/LK** | **VV** actual point-filter frame, chips and tooltip; brush-selected state separately **UV** visually (no fifth image) | **BV** actual ECharts point click → menu → two filters → chip remove; native lineX brush → correct half-open interval and filtered rows → reset, zero provider requests | Real provider validation and PM/LK adapter-specific interactions **UV**; explicit Apply to SQL promotion is server-backed by design and **N/A** to client-only no-query acceptance |

R16, R17 and R18 definitions come from datasource inventory and the coverage register. Owners inspected: GenericResultExplorer, ChartLegend and ChartLegendResizer, chartVisibility, chartPresentation, chartInteractions, ChartFilterPopover, chartPointFilters, chartRangeSelection, ResultFilterBar/Chip, resultFilters, and relevant React/Vitest chart legend/filter tests. R17 clamps intentionally differ from the global workspace/detail resizers.

## 4. R16 interaction matrix — visible pixels, not just buttons

| Native UI transition | Actual visible series | ECharts canvas check | Provider calls |
| --- | --- | --- | --- |
| Default Line result | Gamma, Beta, Alpha | Pixel counts Gamma **1319**, Beta **1326**, Alpha **1246** | **0→0** |
| Click Beta legend label | Gamma, Alpha | Beta **0** colored pixels; Gamma **1319**, Alpha **1246**; Beta crossed out; Show all appears | **0→0** |
| Click Beta again | Gamma, Beta, Alpha | Three colored curves restored | **0→0** |
| Hide Gamma, then click explicit Isolate Beta button | Beta only | Gamma **0**, Beta **1379**, Alpha **0**; crossed-out Gamma/Alpha, y-axis adjusts | **0→0** |
| Click Isolate Beta again | Gamma, Beta, Alpha | All curves restored | **0→0** |
| Isolate Alpha then repeat Isolate Alpha | Gamma, Beta, Alpha | Repeated isolation reconciled with all visible | **0→0** |

**Important contract detail:** repeating isolation restores **all**, not the previously hidden Gamma subset. The pre-hidden Gamma state and restoration semantics were explicitly tested. Do not misstate them as prior hidden-state preservation. One-series filtered mode deliberately omits the HTML legend; the audit observer handles this normal condition.

## 5. R17 resize: exact geometry and interaction method

Actual control: focus the vertical separator labeled **Resize chart legend** and use Electron-native Left and Right events corresponding to keyboard ArrowLeft/ArrowRight; each native key changes requested legend width by **24 CSS pixels**. No claim of pointer drag.

| Geometry | Original | Expanded via ArrowLeft | Restored via ArrowRight |
| --- | ---: | ---: | ---: |
| Legend width | **200px** | **224px** | **200px** |
| Plot width | **928px** | **904px** | **928px** |
| Divider x | **1202px** | **1178px** | **1202px** |
| Canvas | x248 y494 w1192 h406 | x248 y494 w1192 h406 | x248 y494 w1192 h406 |
| Plot x and height | 258 / 390px | 258 / 390px | 258 / 390px |
| Series states | Gamma/Beta/Alpha visible | same | same |
| Chart finished, populated | Yes | Yes | Yes |
| Provider count | **0** | **0** | **0** |

Plot loss **24px** exactly equals legend growth **24px**, and both return to baseline. Rendered chart state and colored series were asserted after restoration. Source-defined legend minimum 140, maximum 420, reserved minimum plot 240+64 and localStorage persistence wiring remain **SO**; no boundary keyboard steps, pointer gestures, reload or view-switch restoration was executed. The default screenshot establishes visual layout only; no screenshot of the expanded legend exists.

## 6. R18 point filter, temporal brush and query invariance

**Point:** native canvas click at **(648, 673)** opened the actual chart point menu. Supported combined series-and-X action created two local predicates, with readable screenshot chips:

- **service equals Beta**, displayed **service = “Beta”**.
- **timestamp equals 2026-08-19T16:20:00.000Z**, displayed exact ISO timestamp.
- The screenshot tooltip confirms **Beta, 95, 19 Aug 16:20**. Y is the point's value, **not** an invented separate Y equality filter.
- Visible result changed **18 → 1 of 18 rows**; both chip close controls were clicked and restored **18 rows**. Original tab result retained **18 rows**.
- With just one series/point, ChartLegend appropriately disappears; filters remain visible.

**Brush:** native ECharts lineX drag from x **495.88** to **863.10** at y **570** produced the exact client-only half-open filter **[2026-08-19T16:11:00.421Z, 2026-08-19T16:32:29.648Z)** on timestamp. The selected view became **6 of 18 rows** (16:20 and 16:30 for all three series); chip removal restored **18**. These are the observed bounds, **not** assumed snapped 16:10/16:30 endpoints. Source result remained **18**. Brush state lacks a separate screenshot due to budget.

**Provider request invariant, synthetic intercepted channels:** initial **0**; default **0→0**; legend hide/restore **0→0**; isolate/repeat **0→0**; legend resize/restore **0→0**; point menu/filter/chip clearing **0→0**; brush filter/reset **0→0**; final **0 requests**, logged request array **empty**. This asserts absence of provider execution in the controlled real renderer; it does not assert authenticated database acceptance. Explicit user-selected source promotion would be server-backed intentionally and is not this client-only contract.

## 7. Four-image manifest and individual visual inspection

Artifact [12001128524](https://github.com/cubitouch/DataKoala/actions/runs/38794465569/artifacts/12001128524); each image opened separately at original **1440×900**, not merely inferred from a green workflow. Exact PNGs under batches/CAP-27:

| Screenshot | Semantic target | Individual visual finding |
| --- | --- | --- |
| **cap27-legend-default-desktop.png** | x248 y494 w1192 h406, DPR/zoom 1 | **VV** — Gamma yellow, Beta cyan, Alpha orange; three distinct curves and six points, readable legend labels/axes/toolbars; no clipping or blank plot |
| **cap27-legend-hidden-desktop.png** | x248 y494 w1192 h406, DPR/zoom 1 | **VV** — cyan Beta curve absent, Beta label grey/struck through, Gamma/Alpha remain, Show all present; no overlap |
| **cap27-legend-isolated-desktop.png** | x248 y494 w1192 h406, DPR/zoom 1 | **VV** — only cyan Beta curve, Gamma/Alpha struck through, y-domain adjusts; labels and controls remain usable |
| **cap27-chart-filter-desktop.png** | x248 y531 w1192 h369, DPR/zoom 1 | **VV** — two readable filter chips, 1 of 18 rows, single plotted point, tooltip **Beta 95 at 16:20**; no visible clipping |

**Observation requiring review:** in the fourth frame, ECharts' single-timestamp auto time axis extends roughly from the preceding day well into the following day, considerably wider than the original fixture's 50-minute span. This does not invalidate the correctly selected source point and chip values, but is tracked as VC27-03. An uncaptured resized/brush frame is **not** claimed as direct visual acceptance.

## 8. Deferred Visual Convergence Atlas candidates

| Stable ID and class | Ownership, evidence and scope | Impact / confidence | Direction |
| --- | --- | --- | --- |
| **VC27-01 ALREADY_CONVERGED** | **R16/R17**, shared GenericResultExplorer / ChartLegend / chartVisibility / chartPresentation for SQL4, PM, LK. Three accepted PG frames plus actual canvas hidden/isolated pixels, prior ChartLegend regression tests and Phase 1A UX-15. PM/LK direct runtime **UV**. | Low duplication need; **high** shared source and PG confidence, **medium** cross-provider parity. | Preserve shared legend; when scheduled, compare per-provider runtime with distinct adapter data; do not fork legend. |
| **VC27-02 INTENTIONAL_DIFFERENCE** | **R17 / A25**, right legend reserves minimum plot width and has different clamp/persistence ownership from ResizableDetailPanel and global workspace splitter (Phase 1A UX-14). Actual keyboard 200→224→200 and plot 928→904→928. | Geometry impact medium; source confidence high, boundary runtime confidence medium. | Retain geometry policies; consider sharing only low-level pointer mechanics later, not during audit. |
| **VC27-03 UNVERIFIED** | **R18**, visual fourth screenshot shows a single selected 16:20 point but a broad auto-generated temporal X-domain extending into adjacent days. Correct chips/tooltip and 1-of-18 scope confirmed; whether time-axis span violates a product contract **unverified**. | Potential clarity issue medium; **high** screenshot confidence, **low** defect classification confidence. | Agree on one-point temporal domain semantics; add targeted test; consider bounded local fallback if warranted, without a provider query. Do not assert confirmed defect yet. |
| **VC27-04 UNVERIFIED** | **R16/R17/R18**, shared generic chart but PM/LK and other SQL adapters not exercised in CAP-27; prior source/tests exist, no directly equivalent per-provider visual/runtime evidence. | Medium potential parity impact; high confidence in gap. | Targeted provider-specific synthetic scenarios later; preserve intentional time/series semantics rather than asserting all providers identical. |

**Confirmed production defects:** none established by the executed acceptance transitions. Earlier failures were audit-driver errors and are fixed in the CAP-27-only script. VC27-03 remains a proposed UX investigation, not a demonstrated contract violation.

## 9. UV, SO and N/A boundaries; stop

**UV:** all-series-hidden attempt, long legend labels/tooltip, empty result, series ID reorder, chart configuration change, filter reset followed by a **new** point selection, legend resize pointer drag and clamps, legend width persistence across views/restarts, narrow container clamp, zoom while a legend series is hidden, visual frame during resized and brushed state, PM/LK and all other provider runtime behavior, source promotion and real database execution. **SO:** source and named tests for clamp, localStorage and shared PM/LK legend ownership. **N/A:** deliberately server-backed Apply to SQL promotion is not within the zero-request claim for client-only presentation interactions.

**Status PARTIAL** reflects these exact gaps despite successful scoped Electron behavioral capture. No fifth screenshot created. No production UX or shared files, central inventory/register, CAP-26, integration #406, Phase 2 or release changes. **Stop after CAP-27.**
