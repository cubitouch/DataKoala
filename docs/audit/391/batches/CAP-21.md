# CAP-21 — Loki volume, views, raw editor and Grafana handoff

**Disposition: PARTIAL — reviewed evidence, not EVIDENCE_COMPLETE.** This recovery is an audit report only. No production UX, harness, fixture, other batch or coverage-register changes are authorized.

## 1. Identity, execution and chain of custody

| Field | Verified value |
| --- | --- |
| Tracking | [#391](https://github.com/cubitouch/DataKoala/issues/391), [original draft PR #422](https://github.com/cubitouch/DataKoala/pull/422), [integration draft PR #406](https://github.com/cubitouch/DataKoala/pull/406) |
| Frozen original head / scenario source | **bb66ca4dcb83b5edb3a87f93cf3a82221dfd01bd** |
| Recovery branch | **audit/391-cap-21-recovery**, created from the exact frozen SHA |
| Recovery target | **audit/391-ux-convergence**; original branch never edited |
| Scenario implementation | **scripts/visual-preview/audit-batches/cap-21.mjs** (existing module, retained without correction) |
| Evidence | Visual Preview [run 38780232482](https://github.com/cubitouch/DataKoala/actions/runs/38780232482), archive **11996675450** / datakoala-ux-audit-pr-422, generated at frozen head |
| Action checkout | Synthetic pull-request merge **e80c456bdf42daba81c89ec9157abff96234568a**; not the sourceHead |
| Other workflows | [CI 38780232473](https://github.com/cubitouch/DataKoala/actions/runs/38780232473); [Documentation 38780232467](https://github.com/cubitouch/DataKoala/actions/runs/38780232467) |
| Evidence source | **batches/CAP-21/measurements.json**, **batches/CAP-21/status.json**, **batches/index.json**, and the four original-resolution PNGs, extracted and inspected |
| Post-recovery CI | New recovery PR checks to be reported separately; the above results apply only to original frozen source |

Archive status/index and CAP-21 measurements all say sourceHead **bb66ca4dcb83b5edb3a87f93cf3a82221dfd01bd**. The CAP-21 status is **success**; aggregate index also lists CAP-18 and CAP-20 successes, which are not re-audited here. Canonical root measurements.json reports the same sourceHead. All four CAP-21 PNG files exist, each measured at **1440 × 900** RGB. Measurements assert **DPR 1, zoom 1**, positive semantic target and no horizontal document overflow. The recorded source is the actual generating branch head, distinct from the Actions synthetic merge SHA. Generation/validation is not itself human visual acceptance.

## 2. Separate inventory dispositions

**Legend:** VV = visually verified by inspecting the captured full-resolution PNG; BV = behavior verified by executed assertions in the actual Electron renderer with controlled local synthetic IPC; SO = source-only reasoning or existing tests, not execution by this batch; UV = unverified; N/A = not applicable.

| ID | Visual disposition | Behavioral disposition | What the evidence establishes | Limits |
| --- | --- | --- | --- | --- |
| **L22** optional log volume | **VV**: default Line, Bar and optional-failure frame | **BV**: 1 primary-only List/Table; first chart dispatches probe+trend; independent settlement, pending Table return, stale older completion, primary-before-trend/trend-before-primary, remount with held trend, error/empty distinction | Primary logs remain accessible while optional volume is pending or fails; latest nonstale synthetic volume wins; cache can retain rendered trend | UV live Loki, actual provider delays, connection-generation replacement, cancellation beyond scripted races; pending/empty states have JSON-only outcomes rather than their own PNGs |
| **L23** view selection | **VV**: Line and Bar selection; Table raw view | **BV**: List/Table/Line/Area/Bar, back to Table/Line, Patterns available; Scatter/Treemap/Sunburst selection and completed canvas recorded in interactions | No extra query for settled Line→Area→Bar or filtered Table interactions; two-series Line/Area/Bar render. Scatter 2×4 points and hierarchy two aggregate nodes were observed | SO view/capability ownership in component; UV screenshots for Area, Scatter, Treemap, Sunburst, Patterns and every capability-restricted state; additional chart checks do not assert all numeric pixels |
| **L24** generic Table and chart presentation | **VV**: 8-point Line/Bar and five-row raw Table; raw editor geometry observed | **BV**: completed/fingerprint-matched charts, two legend series toggled/restored, keyboard legend resized 200→224, Table filtered 5→1, Copy CSV includes just event 3 and no provider rerun | Shared GenericResultExplorer, ResultsTable, ChartLegend and visualization configuration are exercised | UV actual file-export dialog/written CSV, native OS clipboard permission, pixel-perfect value verification for noncaptured views; confirmed raw editor height defect described below |
| **L26** Grafana and ranges | **VV**: selected absolute range in header and copied notification visible in raw/error PNGs | **BV**: all 34 recorded primary/probe/trend calls have asserted custom UTC FROM/TO/STEP; menu Copy in renderer yields exact parsed URL origin/path, orgId, absolute from/to, expression and Loki range query type | Correct fixed-window query transport parameters and copied Grafana Explore URL in controlled scenario | **UV native rolling-range handoff and query refresh**, Grafana provider acceptance, actual external navigation, cross-midnight/other zones and chart-domain exact pixel mapping; relative conversion is SO in shared code |

The module's 20 interaction records were cross-checked against its executed assertions and source paths. A recorded property alone is not promoted to BV if the module never asserts the relevant behavior; for example, the total-volume fixture sum and Grafana datasource/schema parameters are recorded/inspectable but not fully asserted as independent runtime acceptance.

## 3. Query ownership and lifecycle matrix

| Trigger / state | Durable primary query | Optional probe / trend | Observed result |
| --- | --- | --- | --- |
| Run in List, then Table | 1 primary, limit 2000 | 0 / 0 | Five synthetic logs remain in durable session; Table works independently |
| First Line selection | No new primary | 1 probe, limit 1; 1 trend, limit 100 | 2 series × 4 nonuniform timestamps; source-supplied values checkout **[2,7,3,5]**, worker **[1,2,4,1]** (sum **25**) |
| Line→Area→Bar, Table→Line with settled cache | No new primary | 0 additional | Same renderer result data/configuration without provider re-execution |
| Explicit Run in Line | Primary and optional work dispatched separately | probe/trend independent of primary completion | Five logs appear while trend remains pending; successful recovery before/after primary completion |
| Two overlapping trends | Concurrent primary runs | Older trend held; newer resolves first | Late stale volume (4 rows) cannot replace newer 8-point chart |
| Pending trend, switch away/remount | No automatic primary rerun | Mount-local trend can be refetched | Preserved durable five logs; remount outcome 8 points despite old pending completion |
| Synthetic trend error | Primary succeeds | Trend throws | queryError remains null, logs remain five; visible volume-specific error |
| Synthetic empty trend | Primary succeeds | Trend returns zero metrics | Empty chart distinct from primary error; logs retained |
| Synthetic primary error | Primary fails | Not promoted as durable result | queryError records primary failure; earlier log rows may remain stored |
| Synthetic empty primary | Primary success | Not applicable in List | 0 logs and no queryError |

Recorded **34 request objects: 10 primary, 12 cardinality probes, 12 trends**. Every request is scoped to connection **audit-loki**, interval **2026-08-19T16:00:00.000Z → 2026-08-19T17:00:00.000Z**, step **30s**. Primary query **{service_name="example-service"}**, limit **2000**. Probe expression **count(sum by (service_name) (count_over_time(({service_name="example-service"})[30s])))**, limit **1**; trend expression **sum by (service_name) (count_over_time(({service_name="example-service"})[30s]))**, limit **100**. Two optional calls associated with an *unsent raw editor draft* use that draft's expression instead; see VC21-02. Main-query ownership is guarded by query operations, whereas the optional chart trend is component-local and invalidated by a revision/cache identity, with source/result/connection checks.

The test exercises scripted out-of-order promises in real Electron renderer behavior. This is **not** a proof against all production races, cancellation cases or provider timing distributions.

## 4. Presentation and capability matrix

| Choice | Source semantics | Native result | Visual evidence |
| --- | --- | --- | --- |
| List | Five primary Loki log rows / log inspector | BV, distinct primary-only behavior | SO this batch; canonical logs images exist outside this CAP-21 manifest |
| Table | Log line column, local filter + CSV copy | BV, five visible rows; filter event 3 leaves one and copied CSV exactly contains matching row | VV cap21-loki-raw-desktop.png |
| Patterns | Pattern-specific log grouping | Selector offered; existing L20/L21 scope elsewhere | UV CAP-21 pattern transition |
| Line | Optional Loki metric volume; timestamp/value/series | BV finished canvas, 2 series, 8 items, correct config and fingerprint | VV cap21-views-loki-default-desktop.png |
| Area | Same optional metric volume | BV finished canvas 2 series/8 items with no query | UV screenshot |
| Bar | Same optional metric volume, stacked in observed frame | BV finished canvas 2 series/8 items with no query | VV cap21-views-loki-changed-desktop.png |
| Scatter | Same metric dataset | BV selector + finished canvas, 2 series/8 points | UV screenshot |
| Treemap | Hierarchical aggregation | BV selected/finished canvas; source aggregate checkout 17, worker 8 (2 nodes) | UV screenshot |
| Sunburst | Hierarchical aggregation | BV selected/finished canvas; same 17/8 two-node hierarchy | UV screenshot |

The component advertises all nine views for log results; chart views are conditional on result kind. This is not a claim that arbitrary native Loki metric results or unsupported configuration combinations were executed. A chart's finished flag, item count, canvas and matching render fingerprint prove renderer-state completion; numeric fixture contents and chart configuration are recorded, while exact all-point pixel plotting is not independently asserted.

## 5. Exact Grafana URL and time-range checks

The copied URL recorded by the native menu action was:

https://grafana.example.test/explore?panes=%7B%22datakoala%22%3A%7B%22datasource%22%3A%22loki-audit%22%2C%22queries%22%3A%5B%7B%22refId%22%3A%22A%22%2C%22datasource%22%3A%7B%22uid%22%3A%22loki-audit%22%2C%22type%22%3A%22loki%22%7D%2C%22expr%22%3A%22%7Bservice_name%3D%5C%22example-service%5C%22%7D%22%2C%22queryType%22%3A%22range%22%7D%5D%2C%22range%22%3A%7B%22from%22%3A%221787155200000%22%2C%22to%22%3A%221787158800000%22%7D%7D%7D&schemaVersion=1&orgId=7

The module **asserts** https origin, **/explore** pathname, **orgId=7**, pane from **1787155200000** and to **1787158800000** (UTC milliseconds), exact expression **{service_name="example-service"}**, and **queryType=range**. The encoded URL also **contains** schemaVersion 1, refId A, datasource **loki-audit** and type **loki**; they are visible data/source observations rather than separately asserted fields. The Copy route stubs the browser clipboard: no external navigation or authenticated Grafana handoff occurs.

The primary, probe and trend calls are each asserted to use the same fixed absolute UTC window and 30s step. The initial screenshot's x-axis visibly spans 16:00–17:00, and Line/Bar values are consistent with the fixture, but no automated comparison proves exact chart domain pixel mapping. Shared source **src/shared/grafanaExplore.ts** implements relative rolling values as now-1h, now-Nm/h/d or 30-day-month approximation, custom values as epoch milliseconds, and all-time as 0→now. **None of those relative/all-time paths is exercised by this CAP-21 Electron run; mark SO/UV, not BV.**

## 6. Full screenshot manifest — each PNG opened individually at native resolution

| Image | Dimensions / target | Manual inspection |
| --- | --- | --- |
| **cap21-views-loki-default-desktop.png** | 1440×900, chart 1192×389; 1× DPR/zoom | **VV**. Line selected, checkout yellow and worker cyan, eight markers, four timestamps over 16:00–17:00 UTC, readable axes and legend, not clipped; canvas fills result region |
| **cap21-views-loki-changed-desktop.png** | 1440×900, chart 1192×389; 1× DPR/zoom | **VV**. Bar selected, two visibly stacked colored series, four time buckets, labeled axes and legend, no clipping; chart and toolbar aligned |
| **cap21-loki-raw-desktop.png** | 1440×900, editor measured 1192×26.1875; 1× DPR/zoom | **VV**. Native CodeMirror text displays complete modified LogQL and five-row Table; selected Table and export/copy affordances. **Confirmed defect:** editor occupies only about 26 px of a much taller query region. No document horizontal overflow |
| **cap21-views-loki-empty-or-error-desktop.png** | 1440×900, results target 1192×537; 1× DPR/zoom | **VV**. Line selection retained; central specific "Log volume unavailable" message, no chart; no clipping. Primary logs remain in store per BV assertions, not visually shown in this frame |

Both raw/error frames also display a surviving **“Grafana link copied”** toast from the earlier menu action; this is incidental to their intended scenario, not independent evidence of Grafana server integration. The four screenshots are the **entire CAP-21 batch manifest**, not the canonical audit image set. The existing generic audit archive contains additional comparisons, but they were not relabeled as CAP-21 runtime proof. Blank/empty primary, pending chart, extra chart types and provider error cases lack their own CAP-21 PNGs. Visual inspection is complete **for the delivered four PNGs**, not for every exercised behavior.

## 7. Source ownership and convergence

| Concern | Primary owner(s) | Convergence / intentional distinction |
| --- | --- | --- |
| Primary query and durable session | **LokiExplorer.tsx**, **store/useStore.ts** query operation and query lifecycle | Shared session/operation ownership, Loki-specific request payload and result kind |
| Optional log-volume probe/trend | **LokiExplorer.tsx**, **src/shared/loki-trend.ts** | Independent component-local async/cache; intentionally separate from durable primary operation and its error surface; L25 hybrid ownership already audited separately |
| View selection/visualization | **LokiExplorer.tsx**, **GenericResultExplorer**, result visualization and chart/legend components | Shared chart/table renderer with datasource-specific mapping; List and Patterns remain intentionally Loki-specific; no universal result controller proposed |
| Table filtering and CSV | **GenericResultExplorer**, **ResultsTable**, result-filter/CSV and clipboard helpers | Local presentation without rerunning source; OS save/export remains unverified |
| Query editor and mode | **QueryToolbar/ModeSwitch/QueryCodeEditor**, **LokiExplorer.tsx**, **LokiExplorer.module.css** | Shared query shell, LogQL language and raw/Builder behavior distinct; rendered raw editor height diverges from expected panel fill |
| Time ranges / Grafana | **prometheusRangeBounds**, **builderTimeRange**, **GrafanaHandoffActions.tsx**, **src/shared/grafanaExplore.ts** | Shared interval conversion and OBS3 handoff with Loki range query type; separate UI copy and actual third-party acceptance |

Cross-reference the existing coverage register entries L22–L24/L26, architectural UX-04/08/15 and the canonical visual documentation. Their earlier statuses are not rewritten by this parallel PR.

## 8. Stable Visual Convergence Atlas candidates

- **VC21-01 — Confirmed raw editor height failure (high visual confidence):** rendered raw LogQL editor 1192×26.1875 despite a query body hundreds of pixels tall. The parent occupies its pane; the CodeMirror/editor child fails to fill height. Compare shared raw query shell behavior before selecting a minimal caller/layout correction. Preserve native scrolling, splitters and Builder mode. No production fix in CAP-21.
- **VC21-02 — Unsent raw draft may trigger independent trend requests (BV observation; product-policy decision):** switching view while raw edited text was not Run caused **2 optional calls** (probe + trend) for **{service_name="cap21-raw"} |= "needle"**, with **0 primary reruns**. Avoid assuming the volume belongs to the durable primary logs; determine desired source/revision ownership before treating this as a defect. Existing tests show this behavior, but user-facing consequences require targeted acceptance.
- **VC21-03 — Strong existing shared view shell (convergence candidate / preserve):** Line, Area, Bar, Table, chart legend and local filter share result infrastructure without redundant settled queries; avoid extracting another controller or erasing intentional List/Patterns distinctions.
- **VC21-04 — Time/handoff test coverage gap (UV):** add future focused native tests for rolling range change with both primary+trend interval, Grafana now-relative URL and domain mapping; do not assert verified based solely on helper code.

## 9. Confirmed, intentional and unverified

**Confirmed evidence:** independent synthetic primary/optional lifecycle, cached chart view changes, stale response rejection in scripted races, single rendered raw editor line, filtered Table CSV copy payload, strict fixed absolute query interval and Grafana Copy parameter assertions. **Confirmed visual defect:** VC21-01 raw LogQL editor height. **Behavioral concern requiring product policy:** VC21-02 unsent raw draft starts optional trend for text not executed as primary.

**Intentional differences:** Loki List/Patterns vs generic Table/chart; primary log errors vs optional volume errors; component-local volume vs durable primary session; synthetic offline IPC vs provider; absolute custom range vs relative Grafana semantics.

**Unverified leads:** live Loki/real Grafana, all production race orderings, scoped generation/reconnect edge cases, screenshot coverage for Area/Scatter/Treemap/Sunburst/pending/empty, real OS clipboard/export, quantitative domain pixel consistency, relative/all-time query handoff, timezone/cross-midnight range semantics and raw editor accessibility beyond the observed height.

## 10. CI, limits and disposition

Original **Visual Preview run 38780232482: success** (capture and publish), standalone batch status success; evidence artifact **11996675450** downloaded and four PNGs inspected. **Documentation run 38780232467: build success**, deploy skipped on PR. **Core CI run 38780232473:** Unit tests **success**, UI tests **success**, Production build **success**, macOS runtime/package **success**; **Quality failed at Check formatting**. No local lint or formatting was run. The source module retains original formatting; this report does not modify it or repair CI outside allowed scope.

**Final disposition: PARTIAL.** CAP-21 screenshot inspection and documented native synthetic scenarios are complete, but essential L26 relative-range runtime acceptance and full view/error-state visual coverage are not evidenced, and original CI Quality remains red. Do **not** mark the coverage register EVIDENCE_COMPLETE, infer live provider acceptance, merge, begin CAP-22/Phase 2, or edit #406. This independent recovery report can be reviewed by the integration owner, who will select only one version of CAP-21 evidence.
