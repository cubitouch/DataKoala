# AGG-01 — Coverage-register reconciliation and evidence traceability

**Final disposition: PARTIAL.** All 175 inventory IDs and 37 batch evidence sources are accounted for, with mechanically consistent accounting. Material source/review qualifications and product acceptance gaps remain. This report is a factual aggregation, not independent product verification or AGG-02 execution.

## A. Execution metadata

- Integration: [#406](https://github.com/cubitouch/DataKoala/pull/406), open/draft, base `main` at `49ef6cd0a44041e200c362f7d707e5d22254f956`; integration head `audit/391-ux-convergence`.
- Immutable integration base: `e4c036d853e6f5fe6aecd794a2404c7331c5c13e`; fetched again for this execution. Isolated branch `audit/391-agg-01-coverage-reconciliation`, draft PR targeting `audit/391-ux-convergence` only. The PR URL and two final commit SHAs are recorded in the final handoff; no self-referential SHA is invented here.
- Date: 2026-10-16 Europe/Paris (remote audit records dated October 15). Original inventory blob `21f723cb836de386fedda74bfac2a567f65941bd`, original register blob `90a88af124831a90c177906cf2275b15487bb158`.
- Corrected user authorization: **17 embedded CAP-01–17 completion records + 13 standalone CAP-18–30 + 7 standalone NON-01–07 = 37 sources**. No artificial standalone CAP-01–17 reports created.
- Start gate: PR #406 open/draft, correct head/base; all 37 sources integrated at immutable base. GitHub open-PR search returned only #406 and dependency #429. No competing AGG branch existed. All 20 isolated evidence/recovery PRs listed below individually confirmed closed/merged. CAP-21 recovery #427 and CAP-23 recovery #428 integrate the accepted reports, counting once each; original #422/#424 evidence remains chain of custody.
- Root AGENTS.md read; recursive tree confirms no nested AGENTS.md. Inventory/register, Phase 1A/1B audit, visual-documentation guidance and all 37 batch evidence records consulted. Historical CAP-07 completion commit consulted separately. No repository-wide local lint/format or production/provider execution performed.
- Local immutable baseline files were compared to exact remote Git blob SHA-1s before editing. Original CAP-01 onward historical tail was extracted before edits and preserved verbatim inside the register's historical markers, SHA-256 `c3b936b13ce4c050a29632c7b636d371701859c6ae2fdb0606e49d66da99b361`. Earlier active rows remain retrievable from the immutable base link, including damaged T10 and absent T11–T17.

## B. Inventory baseline

The [authoritative inventory](../../../datasource-feature-inventory.md) contains exactly **175 unique original IDs**, A25/S28/C18/P17/L26/T24/R25/X12. Original names and provider scopes are copied exactly, not redefined. All 175 have one primary owner among 30 CAP and seven NON batches. Navigation aliases such as S20/R05/R06/X07, S18/R20, S25/X04 and R21/X08 remain separate original inventory IDs but **not independent tests or implementations**. N01–N11 are interaction indexes, not additional inventory items.

The input had 168 original rows: T11–T17 absent and T10 combined with a literal historical `…722 tokens truncated…` span. The opening `Warning: truncated output` notice was literally part of the committed file, confirmed by matching blob hash, rather than a new connector-only truncation. All seven missing rows and T10 were reconstructed from inventory definitions plus CAP-23/24 evidence, with no invented behavior. The historical damaged material is preserved in Git; unchanged completion tail remains in the output.

Five UI leads remain separate: UI-001 classified as confirmed scoped focus defect (light-dismiss policy still UV), UI-003/UI-005 resolved duplicate, UI-002/UI-004 unresolved. UI-002 primary owner corrected CAP-08→NON-07; UI-004 corrected CAP-05→CAP-28 with CAP-27 comparison. No sixth lead or original feature was invented.

CAP-07 current completion exists in the batch table and six feature rows, but its narrative heading was lost in a historical register replacement. Its source narrative is verified at [completion commit 9ef44d8](https://github.com/cubitouch/DataKoala/blob/9ef44d802fca7645781e1aadbe52bf47ce064089/docs/architecture/ux-convergence-coverage-register.md#cap-07-completion--query-tabs-running-indicator-and-rawbuilder-evidence_complete-scoped). That historical consultation supplements the accepted current embedded record; it is not silently inserted as original current text. See G-01.

## C. Batch evidence manifest

One row per source; detailed entries below retain exact SHA/provenance and source limitations. **Source types are literal** EMBEDDED_REGISTER / STANDALONE_REPORT. Screenshot count is newly added batch PNGs, not total archive count: shared/reused images are not summed into new coverage. CAP-06 adds zero and reuses six images; CAP-15 also reuses five ordinary images; CAP-28's exported PNG binary is separate from its five screenshot PNGs. No artifact PNG was independently reopened in AGG-01.

| Batch | Type / integrated source | Disposition | Original / recovery PR | Generating evidence SHA | Workflow conclusion / artifact | New PNGs / review claim |
| --- | --- | --- | --- | --- | --- | --- |
| [CAP-01](#cap-01) | EMBEDDED_REGISTER; [register](../../../architecture/ux-convergence-coverage-register.md#historical-completion-records-and-checkpoint-log--immutable-input) | EVIDENCE_COMPLETE | 406 | `d1e3127ba380f75108b296f737b42729ae4dd073` | [run 38602027521](https://github.com/cubitouch/DataKoala/actions/runs/38602027521) failure; [artifact 11914875832](https://github.com/cubitouch/DataKoala/actions/runs/38602027521/artifacts/11914875832) | 3; originals inspected according to source |
| [CAP-02](#cap-02) | EMBEDDED_REGISTER; [register](../../../architecture/ux-convergence-coverage-register.md#historical-completion-records-and-checkpoint-log--immutable-input) | EVIDENCE_COMPLETE | 406 | `5a7ac174ef8d1519ee1630f2bbd18692ec40bec6` | [run 38605551434](https://github.com/cubitouch/DataKoala/actions/runs/38605551434) success; [artifact 11914894484](https://github.com/cubitouch/DataKoala/actions/runs/38605551434/artifacts/11914894484) | 3; originals inspected according to source |
| [CAP-03](#cap-03) | EMBEDDED_REGISTER; [register](../../../architecture/ux-convergence-coverage-register.md#historical-completion-records-and-checkpoint-log--immutable-input) | EVIDENCE_COMPLETE | 406 | `1ca7411e446d2b00bb19ea5812c1c979a0feb7df` | [run 38608584909](https://github.com/cubitouch/DataKoala/actions/runs/38608584909) success; [artifact 11917370950](https://github.com/cubitouch/DataKoala/actions/runs/38608584909/artifacts/11917370950) | 3; originals inspected according to source |
| [CAP-04](#cap-04) | EMBEDDED_REGISTER; [register](../../../architecture/ux-convergence-coverage-register.md#historical-completion-records-and-checkpoint-log--immutable-input) | EVIDENCE_COMPLETE | 406 | `1184afcf3d7c93a1311080df5fbab9d0df9a4704` | [run 38614943136](https://github.com/cubitouch/DataKoala/actions/runs/38614943136) success; [artifact 11920175581](https://github.com/cubitouch/DataKoala/actions/runs/38614943136/artifacts/11920175581) | 2; originals inspected according to source |
| [CAP-05](#cap-05) | EMBEDDED_REGISTER; [register](../../../architecture/ux-convergence-coverage-register.md#historical-completion-records-and-checkpoint-log--immutable-input) | EVIDENCE_COMPLETE | 406 | `5aac39dd0d69c3542683f3b0f79fc8931cb31fda` | [run 38617523822](https://github.com/cubitouch/DataKoala/actions/runs/38617523822) success; [artifact 11920633396](https://github.com/cubitouch/DataKoala/actions/runs/38617523822/artifacts/11920633396) | 2; originals inspected according to source |
| [CAP-06](#cap-06) | EMBEDDED_REGISTER; [register](../../../architecture/ux-convergence-coverage-register.md#historical-completion-records-and-checkpoint-log--immutable-input) | EVIDENCE_COMPLETE | 406 | `5aac39dd0d69c3542683f3b0f79fc8931cb31fda` | [run 38617523822](https://github.com/cubitouch/DataKoala/actions/runs/38617523822) success; [artifact 11920633396](https://github.com/cubitouch/DataKoala/actions/runs/38617523822/artifacts/11920633396) | 0; report-derived inspection; qualified G-03 |
| [CAP-07](#cap-07) | EMBEDDED_REGISTER; [register](../../../architecture/ux-convergence-coverage-register.md#historical-completion-records-and-checkpoint-log--immutable-input) | EVIDENCE_COMPLETE | 406 | `9a3484fc3c56f773331b1040300c79a8908199ac` | [run 38622912415](https://github.com/cubitouch/DataKoala/actions/runs/38622912415) success; [artifact 11922344749](https://github.com/cubitouch/DataKoala/actions/runs/38622912415/artifacts/11922344749) | 1; originals inspected according to source |
| [CAP-08](#cap-08) | EMBEDDED_REGISTER; [register](../../../architecture/ux-convergence-coverage-register.md#historical-completion-records-and-checkpoint-log--immutable-input) | EVIDENCE_COMPLETE | 406 | `1521a01404cd8b27bce8d99d25643f4b88c7a015` | [run 38640786557](https://github.com/cubitouch/DataKoala/actions/runs/38640786557) success; [artifact 11930132295](https://github.com/cubitouch/DataKoala/actions/runs/38640786557/artifacts/11930132295) | 3; originals inspected according to source |
| [CAP-09](#cap-09) | EMBEDDED_REGISTER; [register](../../../architecture/ux-convergence-coverage-register.md#historical-completion-records-and-checkpoint-log--immutable-input) | EVIDENCE_COMPLETE | 406 | `296a6ada15031c4455adc89e58fc5a57ce03243e` | [run 38645215482](https://github.com/cubitouch/DataKoala/actions/runs/38645215482) success; [artifact 11932551046](https://github.com/cubitouch/DataKoala/actions/runs/38645215482/artifacts/11932551046) | 1; report-derived inspection; qualified G-03 |
| [CAP-10](#cap-10) | EMBEDDED_REGISTER; [register](../../../architecture/ux-convergence-coverage-register.md#historical-completion-records-and-checkpoint-log--immutable-input) | EVIDENCE_COMPLETE | 406 | `c148f91906a69529318dec170a7922e4d9fa465e` | [run 38652171440](https://github.com/cubitouch/DataKoala/actions/runs/38652171440) success; [artifact 11935740784](https://github.com/cubitouch/DataKoala/actions/runs/38652171440/artifacts/11935740784) | 4; originals inspected according to source |
| [CAP-11](#cap-11) | EMBEDDED_REGISTER; [register](../../../architecture/ux-convergence-coverage-register.md#historical-completion-records-and-checkpoint-log--immutable-input) | EVIDENCE_COMPLETE | 406 | `5ba36d0d26264896aea7149aa2ca0c0cf973821c` | [run 38710823797](https://github.com/cubitouch/DataKoala/actions/runs/38710823797) success; [artifact 11960906106](https://github.com/cubitouch/DataKoala/actions/runs/38710823797/artifacts/11960906106) | 3; originals inspected according to source |
| [CAP-12](#cap-12) | EMBEDDED_REGISTER; [register](../../../architecture/ux-convergence-coverage-register.md#historical-completion-records-and-checkpoint-log--immutable-input) | EVIDENCE_COMPLETE | 406 | `a51aaf88148fab5967fa427dedbf81601524ba8e` | [run 38712444172](https://github.com/cubitouch/DataKoala/actions/runs/38712444172) success; [artifact 11960729292](https://github.com/cubitouch/DataKoala/actions/runs/38712444172/artifacts/11960729292) | 5; originals inspected according to source |
| [CAP-13](#cap-13) | EMBEDDED_REGISTER; [register](../../../architecture/ux-convergence-coverage-register.md#historical-completion-records-and-checkpoint-log--immutable-input) | EVIDENCE_COMPLETE | 406 | `199cbafb309a7efa1b23b24e2ed76168baf1aba6` | [run 38718496827](https://github.com/cubitouch/DataKoala/actions/runs/38718496827) success; [artifact 11964151467](https://github.com/cubitouch/DataKoala/actions/runs/38718496827/artifacts/11964151467) | 4; originals inspected according to source |
| [CAP-14](#cap-14) | EMBEDDED_REGISTER; [register](../../../architecture/ux-convergence-coverage-register.md#historical-completion-records-and-checkpoint-log--immutable-input) | EVIDENCE_COMPLETE | 406 | `0132a94548b6678f44320d7a7e6bbd093f231e75` | [run 38719221058](https://github.com/cubitouch/DataKoala/actions/runs/38719221058) success; [artifact 11963329437](https://github.com/cubitouch/DataKoala/actions/runs/38719221058/artifacts/11963329437) | 3; originals inspected according to source |
| [CAP-15](#cap-15) | EMBEDDED_REGISTER; [register](../../../architecture/ux-convergence-coverage-register.md#historical-completion-records-and-checkpoint-log--immutable-input) | EVIDENCE_COMPLETE | 406 | `0f022427225a4b222d352ddade7c59f4e1dbe147` | [run 38721215076](https://github.com/cubitouch/DataKoala/actions/runs/38721215076) success; [artifact 11965871767](https://github.com/cubitouch/DataKoala/actions/runs/38721215076/artifacts/11965871767) | 2; originals inspected according to source |
| [CAP-16](#cap-16) | EMBEDDED_REGISTER; [register](../../../architecture/ux-convergence-coverage-register.md#historical-completion-records-and-checkpoint-log--immutable-input) | EVIDENCE_COMPLETE | 406 | `178700809b85add44d88c44799cc12baed76b51d` | [run 38721954515](https://github.com/cubitouch/DataKoala/actions/runs/38721954515) success; [artifact 11965678386](https://github.com/cubitouch/DataKoala/actions/runs/38721954515/artifacts/11965678386) | 4; originals inspected according to source |
| [CAP-17](#cap-17) | EMBEDDED_REGISTER; [register](../../../architecture/ux-convergence-coverage-register.md#historical-completion-records-and-checkpoint-log--immutable-input) | EVIDENCE_COMPLETE | 406 | `ec0641ea9f33e16a05e8d23de3b27ac807e62834` | [run 38754779526](https://github.com/cubitouch/DataKoala/actions/runs/38754779526) success; [artifact 11982702976](https://github.com/cubitouch/DataKoala/actions/runs/38754779526/artifacts/11982702976) | 4; originals inspected according to source |
| [CAP-18](#cap-18) | STANDALONE_REPORT; [CAP-18.md](../batches/CAP-18.md) | EVIDENCE_COMPLETE | 412 | `34753c046b18ba838331a5c3652b8ac429ed7b89` | [run 38763236819](https://github.com/cubitouch/DataKoala/actions/runs/38763236819) success; [artifact 11986523589](https://github.com/cubitouch/DataKoala/actions/runs/38763236819/artifacts/11986523589) | 5; originals inspected according to source |
| [CAP-19](#cap-19) | STANDALONE_REPORT; [CAP-19.md](../batches/CAP-19.md) | EVIDENCE_COMPLETE | 420 | `345382a72d904e5bc03c668aec9184da9108ddb8` | [run 38772943101](https://github.com/cubitouch/DataKoala/actions/runs/38772943101) success; [artifact 11992208313](https://github.com/cubitouch/DataKoala/actions/runs/38772943101/artifacts/11992208313) | 5; originals inspected according to source |
| [CAP-20](#cap-20) | STANDALONE_REPORT; [CAP-20.md](../batches/CAP-20.md) | EVIDENCE_COMPLETE | 421 | `ce088a2bdfcd0f710fc93a15561d05a208badcae` | [run 38773038498](https://github.com/cubitouch/DataKoala/actions/runs/38773038498) success; [artifact 11992971450](https://github.com/cubitouch/DataKoala/actions/runs/38773038498/artifacts/11992971450) | 4; originals inspected according to source |
| [CAP-21](#cap-21) | STANDALONE_REPORT; [CAP-21.md](../batches/CAP-21.md) | PARTIAL | 427 (original 422) | `bb66ca4dcb83b5edb3a87f93cf3a82221dfd01bd` | [run 38780232482](https://github.com/cubitouch/DataKoala/actions/runs/38780232482) success; [artifact 11996675450](https://github.com/cubitouch/DataKoala/actions/runs/38780232482/artifacts/11996675450) | 4; originals inspected according to source |
| [CAP-22](#cap-22) | STANDALONE_REPORT; [CAP-22.md](../batches/CAP-22.md) | PARTIAL | 423 | `52fd2e08e82446fa37be3930c497b540f5f50dc2` | [run 38778100440](https://github.com/cubitouch/DataKoala/actions/runs/38778100440) success; [artifact 11994213479](https://github.com/cubitouch/DataKoala/actions/runs/38778100440/artifacts/11994213479) | 5; originals inspected according to source |
| [CAP-23](#cap-23) | STANDALONE_REPORT; [CAP-23.md](../batches/CAP-23.md) | PARTIAL | 428 (original 424) | `8306fb19cd476d2125153fa297bd00a86f5e63f0` | [run 38779965647](https://github.com/cubitouch/DataKoala/actions/runs/38779965647) success; [artifact 11994998803](https://github.com/cubitouch/DataKoala/actions/runs/38779965647/artifacts/11994998803) | 5; originals inspected according to source |
| [CAP-24](#cap-24) | STANDALONE_REPORT; [CAP-24.md](../batches/CAP-24.md) | PARTIAL | 430 | `ee031b9d3969bf81f4e6ed36e11314dcaefdd0b3` | [run 38794494341](https://github.com/cubitouch/DataKoala/actions/runs/38794494341) success; [artifact 12001392707](https://github.com/cubitouch/DataKoala/actions/runs/38794494341/artifacts/12001392707) | 5; originals inspected according to source |
| [CAP-25](#cap-25) | STANDALONE_REPORT; [CAP-25.md](../batches/CAP-25.md) | PARTIAL | 431 | `e0b3b8e547d711d9f27168ea35d9f285fd46abbb` | [run 38789455942](https://github.com/cubitouch/DataKoala/actions/runs/38789455942) success; [artifact 11998819921](https://github.com/cubitouch/DataKoala/actions/runs/38789455942/artifacts/11998819921) | 5; originals inspected according to source |
| [CAP-26](#cap-26) | STANDALONE_REPORT; [CAP-26.md](../batches/CAP-26.md) | PARTIAL | 433 | `0416e50fbf977aa67f8e6f9762d615452ccd82ad` | [run 38792865339](https://github.com/cubitouch/DataKoala/actions/runs/38792865339) success; [artifact 12001161095](https://github.com/cubitouch/DataKoala/actions/runs/38792865339/artifacts/12001161095) | 6; originals inspected according to source |
| [CAP-27](#cap-27) | STANDALONE_REPORT; [CAP-27.md](../batches/CAP-27.md) | PARTIAL | 434 | `175d0ead3a66dace3dee7a318fe4d004ae028bac` | [run 38794465569](https://github.com/cubitouch/DataKoala/actions/runs/38794465569) success; [artifact 12001128524](https://github.com/cubitouch/DataKoala/actions/runs/38794465569/artifacts/12001128524) | 4; originals inspected according to source |
| [CAP-28](#cap-28) | STANDALONE_REPORT; [CAP-28.md](../batches/CAP-28.md) | PARTIAL | 436 | `83eeb52e4dfbd3c12979a6888b2d0e9fba22101e` | [run 38814994606](https://github.com/cubitouch/DataKoala/actions/runs/38814994606) success; [artifact 12010741400](https://github.com/cubitouch/DataKoala/actions/runs/38814994606/artifacts/12010741400) | 5; originals inspected according to source |
| [CAP-29](#cap-29) | STANDALONE_REPORT; [CAP-29.md](../batches/CAP-29.md) | PARTIAL | 435 | `f1ca5d6715973ee52f84ad4ad25abcb30dfbca96` | [run 38814864167](https://github.com/cubitouch/DataKoala/actions/runs/38814864167) success; [artifact 12009723643](https://github.com/cubitouch/DataKoala/actions/runs/38814864167/artifacts/12009723643) | 3; originals inspected according to source |
| [CAP-30](#cap-30) | STANDALONE_REPORT; [CAP-30.md](../batches/CAP-30.md) | PARTIAL | 437 | `e9c893853586a3218d4b0c3ed3e103c82d04d9b3` | [run 38815371248](https://github.com/cubitouch/DataKoala/actions/runs/38815371248) success; [artifact 12010408386](https://github.com/cubitouch/DataKoala/actions/runs/38815371248/artifacts/12010408386) | 5; originals inspected according to source |
| [NON-01](#non-01) | STANDALONE_REPORT; [NON-01.md](../batches/NON-01.md) | EVIDENCE_COMPLETE | 415 | `bd4da52b80f65618a4908529ae4df91cc3b124e3` | [run 38763003457](https://github.com/cubitouch/DataKoala/actions/runs/38763003457) failure; N/A — nonvisual | 0; no visual acceptance |
| [NON-02](#non-02) | STANDALONE_REPORT; [NON-02.md](../batches/NON-02.md) | EVIDENCE_COMPLETE | 413 | `c3b9e055b3298911c55e533202048800df5b0001` | [run 38759788917](https://github.com/cubitouch/DataKoala/actions/runs/38759788917) cancelled; N/A — nonvisual | 0; no visual acceptance |
| [NON-03](#non-03) | STANDALONE_REPORT; [NON-03.md](../batches/NON-03.md) | EVIDENCE_COMPLETE | 414 | `1fdc3a604310622e7f99ef09ba7a6ed374c6b4ac` | [run 38759956034](https://github.com/cubitouch/DataKoala/actions/runs/38759956034) failure; N/A — nonvisual | 0; no visual acceptance |
| [NON-04](#non-04) | STANDALONE_REPORT; [NON-04.md](../batches/NON-04.md) | PARTIAL | 416 | `ac99126feb212986f4acffcc058172af469fc73e` | [run 38765295024](https://github.com/cubitouch/DataKoala/actions/runs/38765295024) cancelled; N/A — nonvisual | 0; no visual acceptance |
| [NON-05](#non-05) | STANDALONE_REPORT; [NON-05.md](../batches/NON-05.md) | PARTIAL | 418 | `e50b8f7796382767cd0da424f4996c88a4aa7dc2` | [run 38769180343](https://github.com/cubitouch/DataKoala/actions/runs/38769180343) cancelled; N/A — nonvisual | 0; no visual acceptance |
| [NON-06](#non-06) | STANDALONE_REPORT; [NON-06.md](../batches/NON-06.md) | PARTIAL | 417 | `c3ec6f04b87ae3bac4ec343642756e3a09ed41e0` | [run 38765367153](https://github.com/cubitouch/DataKoala/actions/runs/38765367153) cancelled; N/A — nonvisual | 0; no visual acceptance |
| [NON-07](#non-07) | STANDALONE_REPORT; [NON-07.md](../batches/NON-07.md) | PARTIAL | 419 | `e7b4c978183e7cb832448d2136bfbe064beed9ff` | [run 38769577600](https://github.com/cubitouch/DataKoala/actions/runs/38769577600) failure; N/A — nonvisual | 0; no visual acceptance |

### CAP-01

**EMBEDDED_REGISTER — EVIDENCE_COMPLETE.** Source `docs/architecture/ux-convergence-coverage-register.md` at base `e4c036d853e6f5fe6aecd794a2404c7331c5c13e`, blob `90a88af124831a90c177906cf2275b15487bb158`. Integrated record revision `98591c0393e8ca7ab0357a63ec53b978a2feebab`; Work committed directly to historical integration PR #406; no original isolated PR. Generating evidence sourceHead `d1e3127ba380f75108b296f737b42729ae4dd073`; [workflow 38602027521](https://github.com/cubitouch/DataKoala/actions/runs/38602027521) remote final conclusion **failure**. Artifact **11914875832**, `datakoala-ux-audit-pr-406`, not expired when checked; artifact.workflow_run.head_sha exactly matches `d1e3127ba380f75108b296f737b42729ae4dd073`; digest `sha256:1065ab8674bdf399139dc74307cf10399b3fd5d4c462e20ca95604492de15fd5`. New screenshots **3**. Historical screenshot review/status/index claims are source-derived; archive JSON and PNGs were not downloaded in AGG-01.

Scoped capture assertions complete in partial archive; full workflow FAIL after narrow log-hover timeout. Modal Tab/Escape fails V-03; live PG/TLS UV. Source/test versus native IPC/provider boundaries remain exactly scoped to the record. Product acceptance is separately listed in feature rows; no report is promoted.

### CAP-02

**EMBEDDED_REGISTER — EVIDENCE_COMPLETE.** Source `docs/architecture/ux-convergence-coverage-register.md` at base `e4c036d853e6f5fe6aecd794a2404c7331c5c13e`, blob `90a88af124831a90c177906cf2275b15487bb158`. Integrated record revision `4afae545fe6234d6142a09c4393b5918c38a5fb5`; Work committed directly to historical integration PR #406; no original isolated PR. Generating evidence sourceHead `5a7ac174ef8d1519ee1630f2bbd18692ec40bec6`; [workflow 38605551434](https://github.com/cubitouch/DataKoala/actions/runs/38605551434) remote final conclusion **success**. Artifact **11914894484**, `datakoala-ux-audit-pr-406`, not expired when checked; artifact.workflow_run.head_sha exactly matches `5a7ac174ef8d1519ee1630f2bbd18692ec40bec6`; digest `sha256:ef6b52ff5484986d39068535ea11467adc2a613ce5c431a5dc990e69926f73b7`. New screenshots **3**. Historical screenshot review/status/index claims are source-derived; archive JSON and PNGs were not downloaded in AGG-01.

PG-only edit/delete/read-only controls; Delete Escape/Cancel focus BODY FAIL. Backend cleanup/read-only enforcement UV. Source/test versus native IPC/provider boundaries remain exactly scoped to the record. Product acceptance is separately listed in feature rows; no report is promoted.

### CAP-03

**EMBEDDED_REGISTER — EVIDENCE_COMPLETE.** Source `docs/architecture/ux-convergence-coverage-register.md` at base `e4c036d853e6f5fe6aecd794a2404c7331c5c13e`, blob `90a88af124831a90c177906cf2275b15487bb158`. Integrated record revision `809a0f065fc04948ffcf968fa0002ba28c1600ac`; Work committed directly to historical integration PR #406; no original isolated PR. Generating evidence sourceHead `1ca7411e446d2b00bb19ea5812c1c979a0feb7df`; [workflow 38608584909](https://github.com/cubitouch/DataKoala/actions/runs/38608584909) remote final conclusion **success**. Artifact **11917370950**, `datakoala-ux-audit-pr-406`, not expired when checked; artifact.workflow_run.head_sha exactly matches `1ca7411e446d2b00bb19ea5812c1c979a0feb7df`; digest `sha256:6eaa9efc56f281c9aa92b567b527599f1ba11ba4caad053ad5a5a43592d81f53`. New screenshots **3**. Historical screenshot review/status/index claims are source-derived; archive JSON and PNGs were not downloaded in AGG-01.

BQ/LF/SQ form payloads only; live ADC/chooser/filesystem/enforcement UV; inherited modal mechanics unresolved. Source/test versus native IPC/provider boundaries remain exactly scoped to the record. Product acceptance is separately listed in feature rows; no report is promoted.

### CAP-04

**EMBEDDED_REGISTER — EVIDENCE_COMPLETE.** Source `docs/architecture/ux-convergence-coverage-register.md` at base `e4c036d853e6f5fe6aecd794a2404c7331c5c13e`, blob `90a88af124831a90c177906cf2275b15487bb158`. Integrated record revision `51ba439e75547f888b1644e474e6878593f4e772`; Work committed directly to historical integration PR #406; no original isolated PR. Generating evidence sourceHead `1184afcf3d7c93a1311080df5fbab9d0df9a4704`; [workflow 38614943136](https://github.com/cubitouch/DataKoala/actions/runs/38614943136) remote final conclusion **success**. Artifact **11920175581**, `datakoala-ux-audit-pr-406`, not expired when checked; artifact.workflow_run.head_sha exactly matches `1184afcf3d7c93a1311080df5fbab9d0df9a4704`; digest `sha256:afcfda61b5e3088920391fc7568197857a3fd0255f083665b5033ac259d6b981`. New screenshots **2**. Historical screenshot review/status/index claims are source-derived; archive JSON and PNGs were not downloaded in AGG-01.

Provider-specific UID semantics retained; only synthetic gcx. Full publish status independently confirmed successful. Source/test versus native IPC/provider boundaries remain exactly scoped to the record. Product acceptance is separately listed in feature rows; no report is promoted.

### CAP-05

**EMBEDDED_REGISTER — EVIDENCE_COMPLETE.** Source `docs/architecture/ux-convergence-coverage-register.md` at base `e4c036d853e6f5fe6aecd794a2404c7331c5c13e`, blob `90a88af124831a90c177906cf2275b15487bb158`. Integrated record revision `16142d4963e0eea98245ae36bf42689f72989d05`; Work committed directly to historical integration PR #406; no original isolated PR. Generating evidence sourceHead `5aac39dd0d69c3542683f3b0f79fc8931cb31fda`; [workflow 38617523822](https://github.com/cubitouch/DataKoala/actions/runs/38617523822) remote final conclusion **success**. Artifact **11920633396**, `datakoala-ux-audit-pr-406`, not expired when checked; artifact.workflow_run.head_sha exactly matches `5aac39dd0d69c3542683f3b0f79fc8931cb31fda`; digest `sha256:06642b886a625b49704eebddf01c4a09c5f2124916ec2b0db3617d9dec23f695`. New screenshots **2**. Historical screenshot review/status/index claims are source-derived; archive JSON and PNGs were not downloaded in AGG-01.

Native PG Retry and filter clear; injected initial metadata. Status variants, native refresh and lazy-column failure/retry UV. Source/test versus native IPC/provider boundaries remain exactly scoped to the record. Product acceptance is separately listed in feature rows; no report is promoted.

### CAP-06

**EMBEDDED_REGISTER — EVIDENCE_COMPLETE.** Source `docs/architecture/ux-convergence-coverage-register.md` at base `e4c036d853e6f5fe6aecd794a2404c7331c5c13e`, blob `90a88af124831a90c177906cf2275b15487bb158`. Integrated record revision `1273af75d1b58b0c5e36bf98d066bcfe359a6475`; Work committed directly to historical integration PR #406; no original isolated PR. Generating evidence sourceHead `5aac39dd0d69c3542683f3b0f79fc8931cb31fda`; [workflow 38617523822](https://github.com/cubitouch/DataKoala/actions/runs/38617523822) remote final conclusion **success**. Artifact **11920633396**, `datakoala-ux-audit-pr-406`, not expired when checked; artifact.workflow_run.head_sha exactly matches `5aac39dd0d69c3542683f3b0f79fc8931cb31fda`; digest `sha256:06642b886a625b49704eebddf01c4a09c5f2124916ec2b0db3617d9dec23f695`. New screenshots **0**. Historical screenshot review/status/index claims are source-derived; archive JSON and PNGs were not downloaded in AGG-01.

No new images; six reused Builder/selector frames. P03 type/help/unit SO; report also says montage, so individual-original inspection claim needs AGG-02 scrutiny. Source/test versus native IPC/provider boundaries remain exactly scoped to the record. Product acceptance is separately listed in feature rows; no report is promoted.

### CAP-07

**EMBEDDED_REGISTER — EVIDENCE_COMPLETE.** Source `docs/architecture/ux-convergence-coverage-register.md` at base `e4c036d853e6f5fe6aecd794a2404c7331c5c13e`, blob `90a88af124831a90c177906cf2275b15487bb158`. Integrated record revision `9ef44d802fca7645781e1aadbe52bf47ce064089`; Work committed directly to historical integration PR #406; no original isolated PR. Generating evidence sourceHead `9a3484fc3c56f773331b1040300c79a8908199ac`; [workflow 38622912415](https://github.com/cubitouch/DataKoala/actions/runs/38622912415) remote final conclusion **success**. Artifact **11922344749**, `datakoala-ux-audit-pr-406`, not expired when checked; artifact.workflow_run.head_sha exactly matches `9a3484fc3c56f773331b1040300c79a8908199ac`; digest `sha256:acb6232bcf80df021a21dad14ff99fab4b3a31e6d36822ad83dc4d5bb10f6b9a`. New screenshots **1**. Historical screenshot review/status/index claims are source-derived; archive JSON and PNGs were not downloaded in AGG-01.

Current completion table and six rows survive; narrative/VC07-01/02 recovered for consultation from 9ef44d8. Injected running flag; mode toggle/cross-provider binding UV. Source/test versus native IPC/provider boundaries remain exactly scoped to the record. Product acceptance is separately listed in feature rows; no report is promoted.

### CAP-08

**EMBEDDED_REGISTER — EVIDENCE_COMPLETE.** Source `docs/architecture/ux-convergence-coverage-register.md` at base `e4c036d853e6f5fe6aecd794a2404c7331c5c13e`, blob `90a88af124831a90c177906cf2275b15487bb158`. Integrated record revision `e41519c1c5bc8878c1053ef735b14cf5f7542c6b`; Work committed directly to historical integration PR #406; no original isolated PR. Generating evidence sourceHead `1521a01404cd8b27bce8d99d25643f4b88c7a015`; [workflow 38640786557](https://github.com/cubitouch/DataKoala/actions/runs/38640786557) remote final conclusion **success**. Artifact **11930132295**, `datakoala-ux-audit-pr-406`, not expired when checked; artifact.workflow_run.head_sha exactly matches `1521a01404cd8b27bce8d99d25643f4b88c7a015`; digest `sha256:6b7da11c8b1bb3137191311e4a0fa1a2b308a24f7cdd5db155bb44b729e18653`. New screenshots **3**. Historical screenshot review/status/index claims are source-derived; archive JSON and PNGs were not downloaded in AGG-01.

PG/Loki CRUD/Reset synthetic; native confirm visuals, Tempo transient cleanup and cold persistence UV. Source/test versus native IPC/provider boundaries remain exactly scoped to the record. Product acceptance is separately listed in feature rows; no report is promoted.

### CAP-09

**EMBEDDED_REGISTER — EVIDENCE_COMPLETE.** Source `docs/architecture/ux-convergence-coverage-register.md` at base `e4c036d853e6f5fe6aecd794a2404c7331c5c13e`, blob `90a88af124831a90c177906cf2275b15487bb158`. Integrated record revision `031096b6bf13b2e99c2a23c56c5345de89aa9c2e`; Work committed directly to historical integration PR #406; no original isolated PR. Generating evidence sourceHead `296a6ada15031c4455adc89e58fc5a57ce03243e`; [workflow 38645215482](https://github.com/cubitouch/DataKoala/actions/runs/38645215482) remote final conclusion **success**. Artifact **11932551046**, `datakoala-ux-audit-pr-406`, not expired when checked; artifact.workflow_run.head_sha exactly matches `296a6ada15031c4455adc89e58fc5a57ce03243e`; digest `sha256:3549db94209d8df7e101e035b48c6d85bcae912c68d073a33cbed2ae0f57d79e`. New screenshots **1**. Historical screenshot review/status/index claims are source-derived; archive JSON and PNGs were not downloaded in AGG-01.

Native App splitter/copy assertions; report qualifies inspection through CI-emitted PNG/JSON while offline. Original-resolution review chain needs AGG-02 check. Source/test versus native IPC/provider boundaries remain exactly scoped to the record. Product acceptance is separately listed in feature rows; no report is promoted.

### CAP-10

**EMBEDDED_REGISTER — EVIDENCE_COMPLETE.** Source `docs/architecture/ux-convergence-coverage-register.md` at base `e4c036d853e6f5fe6aecd794a2404c7331c5c13e`, blob `90a88af124831a90c177906cf2275b15487bb158`. Integrated record revision `47fe6afab30c4027c00182afbc60956a02b9d1ae`; Work committed directly to historical integration PR #406; no original isolated PR. Generating evidence sourceHead `c148f91906a69529318dec170a7922e4d9fa465e`; [workflow 38652171440](https://github.com/cubitouch/DataKoala/actions/runs/38652171440) remote final conclusion **success**. Artifact **11935740784**, `datakoala-ux-audit-pr-406`, not expired when checked; artifact.workflow_run.head_sha exactly matches `c148f91906a69529318dec170a7922e4d9fa465e`; digest `sha256:a2a9a397e92cd2b1dc8e8a0a760db737342047165862c65fca6c0c5d254542ca`. New screenshots **4**. Historical screenshot review/status/index claims are source-derived; archive JSON and PNGs were not downloaded in AGG-01.

Populated PG/BQ editors; native completion popup/caret and shortcut UV. Docs screenshot timeout separate from successful Visual run. Source/test versus native IPC/provider boundaries remain exactly scoped to the record. Product acceptance is separately listed in feature rows; no report is promoted.

### CAP-11

**EMBEDDED_REGISTER — EVIDENCE_COMPLETE.** Source `docs/architecture/ux-convergence-coverage-register.md` at base `e4c036d853e6f5fe6aecd794a2404c7331c5c13e`, blob `90a88af124831a90c177906cf2275b15487bb158`. Integrated record revision `6e199b00861f3ad4340052284989e132cbcda4e8`; Work committed directly to historical integration PR #406; no original isolated PR. Generating evidence sourceHead `5ba36d0d26264896aea7149aa2ca0c0cf973821c`; [workflow 38710823797](https://github.com/cubitouch/DataKoala/actions/runs/38710823797) remote final conclusion **success**. Artifact **11960906106**, `datakoala-ux-audit-pr-406`, not expired when checked; artifact.workflow_run.head_sha exactly matches `5ba36d0d26264896aea7149aa2ca0c0cf973821c`; digest `sha256:a674407ee70b60b4e29983bd89b8509bf4ad06094efc68c4dda77335009a792d`. New screenshots **3**. Historical screenshot review/status/index claims are source-derived; archive JSON and PNGs were not downloaded in AGG-01.

PG dimensional controls; Series/native cardinality and endpoint edits UV; S14 named-test-only. Source/test versus native IPC/provider boundaries remain exactly scoped to the record. Product acceptance is separately listed in feature rows; no report is promoted.

### CAP-12

**EMBEDDED_REGISTER — EVIDENCE_COMPLETE.** Source `docs/architecture/ux-convergence-coverage-register.md` at base `e4c036d853e6f5fe6aecd794a2404c7331c5c13e`, blob `90a88af124831a90c177906cf2275b15487bb158`. Integrated record revision `234cbdeb7e6a622ba3492d26d044e5717dc034a7`; Work committed directly to historical integration PR #406; no original isolated PR. Generating evidence sourceHead `a51aaf88148fab5967fa427dedbf81601524ba8e`; [workflow 38712444172](https://github.com/cubitouch/DataKoala/actions/runs/38712444172) remote final conclusion **success**. Artifact **11960729292**, `datakoala-ux-audit-pr-406`, not expired when checked; artifact.workflow_run.head_sha exactly matches `a51aaf88148fab5967fa427dedbf81601524ba8e`; digest `sha256:1ff6b5102ddb7cc8ad076ca3adb1a9a783e0446265d385b7050a524e2683ca30`. New screenshots **5**. Historical screenshot review/status/index claims are source-derived; archive JSON and PNGs were not downloaded in AGG-01.

CSV/JSON native; R02/R04 resize changes sorting FAIL VC12-03; host glyph rendering remains a lead. Source/test versus native IPC/provider boundaries remain exactly scoped to the record. Product acceptance is separately listed in feature rows; no report is promoted.

### CAP-13

**EMBEDDED_REGISTER — EVIDENCE_COMPLETE.** Source `docs/architecture/ux-convergence-coverage-register.md` at base `e4c036d853e6f5fe6aecd794a2404c7331c5c13e`, blob `90a88af124831a90c177906cf2275b15487bb158`. Integrated record revision `92a79e0615c2204d5de350e500fe1e2f8740b3d6`; Work committed directly to historical integration PR #406; no original isolated PR. Generating evidence sourceHead `199cbafb309a7efa1b23b24e2ed76168baf1aba6`; [workflow 38718496827](https://github.com/cubitouch/DataKoala/actions/runs/38718496827) remote final conclusion **success**. Artifact **11964151467**, `datakoala-ux-audit-pr-406`, not expired when checked; artifact.workflow_run.head_sha exactly matches `199cbafb309a7efa1b23b24e2ed76168baf1aba6`; digest `sha256:e23647e04cfeac04143237c11fcdf23bcf72f19a8a3407d7ea14bdef4be7a91d`. New screenshots **4**. Historical screenshot review/status/index claims are source-derived; archive JSON and PNGs were not downloaded in AGG-01.

Local versus promoted filter semantics; menu Escape focus BODY FAIL VC13-01. Outside-click policy unresolved. Source/test versus native IPC/provider boundaries remain exactly scoped to the record. Product acceptance is separately listed in feature rows; no report is promoted.

### CAP-14

**EMBEDDED_REGISTER — EVIDENCE_COMPLETE.** Source `docs/architecture/ux-convergence-coverage-register.md` at base `e4c036d853e6f5fe6aecd794a2404c7331c5c13e`, blob `90a88af124831a90c177906cf2275b15487bb158`. Integrated record revision `1755064fcf12e7db7345d32f077fb30c6673277a`; Work committed directly to historical integration PR #406; no original isolated PR. Generating evidence sourceHead `0132a94548b6678f44320d7a7e6bbd093f231e75`; [workflow 38719221058](https://github.com/cubitouch/DataKoala/actions/runs/38719221058) remote final conclusion **success**. Artifact **11963329437**, `datakoala-ux-audit-pr-406`, not expired when checked; artifact.workflow_run.head_sha exactly matches `0132a94548b6678f44320d7a7e6bbd093f231e75`; digest `sha256:f6692b54aeabf54dac89ff743f9214bf129ee4ee1ab56f9b58765c6470aa56e7`. New screenshots **3**. Historical screenshot review/status/index claims are source-derived; archive JSON and PNGs were not downloaded in AGG-01.

Synthetic Explain/Analyze and node selection; no live execution safety, late-generation native race or export proof. Source/test versus native IPC/provider boundaries remain exactly scoped to the record. Product acceptance is separately listed in feature rows; no report is promoted.

### CAP-15

**EMBEDDED_REGISTER — EVIDENCE_COMPLETE.** Source `docs/architecture/ux-convergence-coverage-register.md` at base `e4c036d853e6f5fe6aecd794a2404c7331c5c13e`, blob `90a88af124831a90c177906cf2275b15487bb158`. Integrated record revision `be7db22c669ae6bd4b8c1ac23187c216e49d752c`; Work committed directly to historical integration PR #406; no original isolated PR. Generating evidence sourceHead `0f022427225a4b222d352ddade7c59f4e1dbe147`; [workflow 38721215076](https://github.com/cubitouch/DataKoala/actions/runs/38721215076) remote final conclusion **success**. Artifact **11965871767**, `datakoala-ux-audit-pr-406`, not expired when checked; artifact.workflow_run.head_sha exactly matches `0f022427225a4b222d352ddade7c59f4e1dbe147`; digest `sha256:37ec9a6a711b4793cf7392c6bc1500a2e98e0364ef6cadb8fa7f511b644d5323`. New screenshots **2**. Historical screenshot review/status/index claims are source-derived; archive JSON and PNGs were not downloaded in AGG-01.

Synthetic proposal/repair explicit Apply versus Run; ordinary reused 1440x972 images retain original provenance; real model UV. Source/test versus native IPC/provider boundaries remain exactly scoped to the record. Product acceptance is separately listed in feature rows; no report is promoted.

### CAP-16

**EMBEDDED_REGISTER — EVIDENCE_COMPLETE.** Source `docs/architecture/ux-convergence-coverage-register.md` at base `e4c036d853e6f5fe6aecd794a2404c7331c5c13e`, blob `90a88af124831a90c177906cf2275b15487bb158`. Integrated record revision `8f0133922690c999f9c995211e49947c2a3976b4`; Work committed directly to historical integration PR #406; no original isolated PR. Generating evidence sourceHead `178700809b85add44d88c44799cc12baed76b51d`; [workflow 38721954515](https://github.com/cubitouch/DataKoala/actions/runs/38721954515) remote final conclusion **success**. Artifact **11965678386**, `datakoala-ux-audit-pr-406`, not expired when checked; artifact.workflow_run.head_sha exactly matches `178700809b85add44d88c44799cc12baed76b51d`; digest `sha256:5588b6ff2778ddcd13fcbd9a57c444efcfd100bf0cb3022698518a7bec48b580`. New screenshots **4**. Historical screenshot review/status/index claims are source-derived; archive JSON and PNGs were not downloaded in AGG-01.

Explicit PromQL histogram cases; fixture SQL-shaped results are illustrative. Histogram override workspace-loss NON02-01 remains. Source/test versus native IPC/provider boundaries remain exactly scoped to the record. Product acceptance is separately listed in feature rows; no report is promoted.

### CAP-17

**EMBEDDED_REGISTER — EVIDENCE_COMPLETE.** Source `docs/architecture/ux-convergence-coverage-register.md` at base `e4c036d853e6f5fe6aecd794a2404c7331c5c13e`, blob `90a88af124831a90c177906cf2275b15487bb158`. Integrated record revision `2525623335f3aa6c4bd946d653135bba6b5fcda8`; Work committed directly to historical integration PR #406; no original isolated PR. Generating evidence sourceHead `ec0641ea9f33e16a05e8d23de3b27ac807e62834`; [workflow 38754779526](https://github.com/cubitouch/DataKoala/actions/runs/38754779526) remote final conclusion **success**. Artifact **11982702976**, `datakoala-ux-audit-pr-406`, not expired when checked; artifact.workflow_run.head_sha exactly matches `ec0641ea9f33e16a05e8d23de3b27ac807e62834`; digest `sha256:27c757b7de3422792b861e97b4d645ebe887bfa96e10b97c6344ddb8cb984b5d`. New screenshots **4**. Historical screenshot review/status/index claims are source-derived; archive JSON and PNGs were not downloaded in AGG-01.

Bounded labels/range/resolution; no live metadata/races, extreme scale or provider acceptance. Source/test versus native IPC/provider boundaries remain exactly scoped to the record. Product acceptance is separately listed in feature rows; no report is promoted.

### CAP-18

**STANDALONE_REPORT — EVIDENCE_COMPLETE.** Source `docs/audit/391/batches/CAP-18.md` at base `e4c036d853e6f5fe6aecd794a2404c7331c5c13e`, blob `ac5656fe1ae84ccb5248ef75cd5aa1fe7d67d47b`. Integrated record revision `909cb45b5d59d3b2758976ce1a70fd3c314c84ae`; isolated/recovery PR [#412](https://github.com/cubitouch/DataKoala/pull/412) report head `780b9cf64f6abf4e627ed58561304a0b7d5ce9ef`, integration commit `909cb45b5d59d3b2758976ce1a70fd3c314c84ae` (closed/merged). Generating evidence sourceHead `34753c046b18ba838331a5c3652b8ac429ed7b89`; [workflow 38763236819](https://github.com/cubitouch/DataKoala/actions/runs/38763236819) remote final conclusion **success**. Artifact **11986523589**, `datakoala-ux-audit-pr-412`, not expired when checked; artifact.workflow_run.head_sha exactly matches `34753c046b18ba838331a5c3652b8ac429ed7b89`; digest `sha256:2f3ad2909e29213d4b7ac71ee3857758f70cf01ca76797f3178f729202da3ab2`. New screenshots **5**. Historical screenshot review/status/index claims are source-derived; archive JSON and PNGs were not downloaded in AGG-01.

Scoped native LogQL plus generator/unit boundaries; inherited raw formatter race UX-05 FAIL. Restored-line replacement intent/regex backend UV. Source/test versus native IPC/provider boundaries remain exactly scoped to the record. Product acceptance is separately listed in feature rows; no report is promoted.

### CAP-19

**STANDALONE_REPORT — EVIDENCE_COMPLETE.** Source `docs/audit/391/batches/CAP-19.md` at base `e4c036d853e6f5fe6aecd794a2404c7331c5c13e`, blob `658a9c89df61ff2483ead06f8cc3a97db648f15a`. Integrated record revision `fba7f7bd5b6b8d73430bac15729898dcfe0268d3`; isolated/recovery PR [#420](https://github.com/cubitouch/DataKoala/pull/420) report head `c54f68d539181569c9b144a10c2b770a1591e5d5`, integration commit `fba7f7bd5b6b8d73430bac15729898dcfe0268d3` (closed/merged). Generating evidence sourceHead `345382a72d904e5bc03c668aec9184da9108ddb8`; [workflow 38772943101](https://github.com/cubitouch/DataKoala/actions/runs/38772943101) remote final conclusion **success**. Artifact **11992208313**, `datakoala-ux-audit-pr-420`, not expired when checked; artifact.workflow_run.head_sha exactly matches `345382a72d904e5bc03c668aec9184da9108ddb8`; digest `sha256:9ae165fb832fc4f2dcdeea4fddb52a1954370a43c83ec6d795591ed2ffe6b69d`. New screenshots **5**. Historical screenshot review/status/index claims are source-derived; archive JSON and PNGs were not downloaded in AGG-01.

L16 nested [object Object] and L18/X10 silent rejected clipboard FAIL; synthetic payloads/virtual list only. Source/test versus native IPC/provider boundaries remain exactly scoped to the record. Product acceptance is separately listed in feature rows; no report is promoted.

### CAP-20

**STANDALONE_REPORT — EVIDENCE_COMPLETE.** Source `docs/audit/391/batches/CAP-20.md` at base `e4c036d853e6f5fe6aecd794a2404c7331c5c13e`, blob `958955bbfb85abbc6fbbe66d95e8e7dca14477a2`. Integrated record revision `9836b7fb0f75c64cd024a36e446ec34cfbde78d1`; isolated/recovery PR [#421](https://github.com/cubitouch/DataKoala/pull/421) report head `7abae056fd646a20a87eaf5e2b780819eb4f0317`, integration commit `9836b7fb0f75c64cd024a36e446ec34cfbde78d1` (closed/merged). Generating evidence sourceHead `ce088a2bdfcd0f710fc93a15561d05a208badcae`; [workflow 38773038498](https://github.com/cubitouch/DataKoala/actions/runs/38773038498) remote final conclusion **success**. Artifact **11992971450**, `datakoala-ux-audit-pr-421`, not expired when checked; artifact.workflow_run.head_sha exactly matches `ce088a2bdfcd0f710fc93a15561d05a208badcae`; digest `sha256:8c4be0c068f933ea286bc35bac65b100329b802d8aab6f9b614f78cf20dc2d2b`. New screenshots **4**. Historical screenshot review/status/index claims are source-derived; archive JSON and PNGs were not downloaded in AGG-01.

Patterns/promoted and local fallback cases verified; provider, malformed types and extreme-cardinality UV. Source/test versus native IPC/provider boundaries remain exactly scoped to the record. Product acceptance is separately listed in feature rows; no report is promoted.

### CAP-21

**STANDALONE_REPORT — PARTIAL.** Source `docs/audit/391/batches/CAP-21.md` at base `e4c036d853e6f5fe6aecd794a2404c7331c5c13e`, blob `6a5bde542b09f6f1eb1934fcd14cbaa5ce916802`. Integrated record revision `adc1a762844eda6bb7f95434ea95a95fda04b8e0`; isolated/recovery PR [#427](https://github.com/cubitouch/DataKoala/pull/427) report head `583101106d30070d79f1e7912efdab0c7996c28f`, integration commit `adc1a762844eda6bb7f95434ea95a95fda04b8e0` (closed/merged). Generating evidence sourceHead `bb66ca4dcb83b5edb3a87f93cf3a82221dfd01bd`; [workflow 38780232482](https://github.com/cubitouch/DataKoala/actions/runs/38780232482) remote final conclusion **success**. Artifact **11996675450**, `datakoala-ux-audit-pr-422`, not expired when checked; artifact.workflow_run.head_sha exactly matches `bb66ca4dcb83b5edb3a87f93cf3a82221dfd01bd`; digest `sha256:278b831a38c8d0e43b60c9fdb9b73239ec51edb849851ca2b518da0ba93f0a74`. New screenshots **4**. Historical screenshot review/status/index claims are source-derived; archive JSON and PNGs were not downloaded in AGG-01.

Accepted recovery #427 of #422; four inspected images. Raw editor height defect; L26 rolling handoff/domain and extra-state visuals UV. Source/test versus native IPC/provider boundaries remain exactly scoped to the record. Product acceptance is separately listed in feature rows; no report is promoted.

### CAP-22

**STANDALONE_REPORT — PARTIAL.** Source `docs/audit/391/batches/CAP-22.md` at base `e4c036d853e6f5fe6aecd794a2404c7331c5c13e`, blob `3bea29b7147656ad42041c768969acac60cbbc4c`. Integrated record revision `469410f162d7118649beff2397a1985a96084548`; isolated/recovery PR [#423](https://github.com/cubitouch/DataKoala/pull/423) report head `7587bcf11fb0b58492247c5d9cba96ae9bef1456`, integration commit `469410f162d7118649beff2397a1985a96084548` (closed/merged). Generating evidence sourceHead `52fd2e08e82446fa37be3930c497b540f5f50dc2`; [workflow 38778100440](https://github.com/cubitouch/DataKoala/actions/runs/38778100440) remote final conclusion **success**. Artifact **11994213479**, `datakoala-ux-audit-pr-423`, not expired when checked; artifact.workflow_run.head_sha exactly matches `52fd2e08e82446fa37be3930c497b540f5f50dc2`; digest `sha256:98ae1222c2c4b4911f15e5b506b315d783398b8b5dba4673ad657a0631634366`. New screenshots **5**. Historical screenshot review/status/index claims are source-derived; archive JSON and PNGs were not downloaded in AGG-01.

Raw Format/Copy, delayed/failed/stale/empty metadata and additional bounds UV. Protocol-independent generic facet intent unresolved. Source/test versus native IPC/provider boundaries remain exactly scoped to the record. Product acceptance is separately listed in feature rows; no report is promoted.

### CAP-23

**STANDALONE_REPORT — PARTIAL.** Source `docs/audit/391/batches/CAP-23.md` at base `e4c036d853e6f5fe6aecd794a2404c7331c5c13e`, blob `7f4381804845d92613bffe901052450a31d901e9`. Integrated record revision `7322aae7430638c298f240011608504ee0952870`; isolated/recovery PR [#428](https://github.com/cubitouch/DataKoala/pull/428) report head `016b55fa91d3e012c274fb315088b7cfd0c8f04b`, integration commit `7322aae7430638c298f240011608504ee0952870` (closed/merged). Generating evidence sourceHead `8306fb19cd476d2125153fa297bd00a86f5e63f0`; [workflow 38779965647](https://github.com/cubitouch/DataKoala/actions/runs/38779965647) remote final conclusion **success**. Artifact **11994998803**, `datakoala-ux-audit-pr-424`, not expired when checked; artifact.workflow_run.head_sha exactly matches `8306fb19cd476d2125153fa297bd00a86f5e63f0`; digest `sha256:3d6fad9617efc8024715bf5d4f89f99a45cef0b375561537142cd3a5e960d3c7`. New screenshots **5**. Historical screenshot review/status/index claims are source-derived; archive JSON and PNGs were not downloaded in AGG-01.

Accepted recovery #428 of #424; toolbar sample label clipping FAIL T13. Metadata races, multi-value/invalid facets and alternate samples UV. Source/test versus native IPC/provider boundaries remain exactly scoped to the record. Product acceptance is separately listed in feature rows; no report is promoted.

### CAP-24

**STANDALONE_REPORT — PARTIAL.** Source `docs/audit/391/batches/CAP-24.md` at base `e4c036d853e6f5fe6aecd794a2404c7331c5c13e`, blob `0b3a9e2ceb4570530275a153b730f3616e38c2aa`. Integrated record revision `daca455dde74086c4395240c437510b953ca5b56`; isolated/recovery PR [#430](https://github.com/cubitouch/DataKoala/pull/430) report head `f9a49d8f85d447dcbc4ce461950bdb5e8f86d103`, integration commit `daca455dde74086c4395240c437510b953ca5b56` (closed/merged). Generating evidence sourceHead `ee031b9d3969bf81f4e6ed36e11314dcaefdd0b3`; [workflow 38794494341](https://github.com/cubitouch/DataKoala/actions/runs/38794494341) remote final conclusion **success**. Artifact **12001392707**, `datakoala-ux-audit-pr-430`, not expired when checked; artifact.workflow_run.head_sha exactly matches `ee031b9d3969bf81f4e6ed36e11314dcaefdd0b3`; digest `sha256:9c95df14613ad5bc7ba5381ac2a50d63401574b38720092e5347bde0476bf457`. New screenshots **5**. Historical screenshot review/status/index claims are source-derived; archive JSON and PNGs were not downloaded in AGG-01.

Known-defect characterization PASS; T18 displayed [start,end) membership FAIL VC24-03. Superseded unconditional-failure run retained historically. Source/test versus native IPC/provider boundaries remain exactly scoped to the record. Product acceptance is separately listed in feature rows; no report is promoted.

### CAP-25

**STANDALONE_REPORT — PARTIAL.** Source `docs/audit/391/batches/CAP-25.md` at base `e4c036d853e6f5fe6aecd794a2404c7331c5c13e`, blob `90e4bb233364248b0288da7565b09943298f43ba`. Integrated record revision `3cadf2e41ada6f02e53b06f9d500d84a928ca292`; isolated/recovery PR [#431](https://github.com/cubitouch/DataKoala/pull/431) report head `fba907e448bdd62585e448af51dd6627ef736081`, integration commit `3cadf2e41ada6f02e53b06f9d500d84a928ca292` (closed/merged). Generating evidence sourceHead `e0b3b8e547d711d9f27168ea35d9f285fd46abbb`; [workflow 38789455942](https://github.com/cubitouch/DataKoala/actions/runs/38789455942) remote final conclusion **success**. Artifact **11998819921**, `datakoala-ux-audit-pr-431`, not expired when checked; artifact.workflow_run.head_sha exactly matches `e0b3b8e547d711d9f27168ea35d9f285fd46abbb`; digest `sha256:142723978f25dcf54ec01a1284126baa37b7f70991bd2479413bc3bc12dd3397`. New screenshots **5**. Historical screenshot review/status/index claims are source-derived; archive JSON and PNGs were not downloaded in AGG-01.

Map needs full-trace lookups; hierarchy/inspector tested. Sample label clipping corroborates VC23-01; brush during map load/trace switch UV. Source/test versus native IPC/provider boundaries remain exactly scoped to the record. Product acceptance is separately listed in feature rows; no report is promoted.

### CAP-26

**STANDALONE_REPORT — PARTIAL.** Source `docs/audit/391/batches/CAP-26.md` at base `e4c036d853e6f5fe6aecd794a2404c7331c5c13e`, blob `45182181e1b7cc00d2bdfc5bf013e4c14045508b`. Integrated record revision `88c8ba58c95a2ab4faadfc07a8227cbb9b2ade85`; isolated/recovery PR [#433](https://github.com/cubitouch/DataKoala/pull/433) report head `f66535d65cde86be9a330f74aeeded1a442412bb`, integration commit `88c8ba58c95a2ab4faadfc07a8227cbb9b2ade85` (closed/merged). Generating evidence sourceHead `0416e50fbf977aa67f8e6f9762d615452ccd82ad`; [workflow 38792865339](https://github.com/cubitouch/DataKoala/actions/runs/38792865339) remote final conclusion **success**. Artifact **12001161095**, `datakoala-ux-audit-pr-433`, not expired when checked; artifact.workflow_run.head_sha exactly matches `0416e50fbf977aa67f8e6f9762d615452ccd82ad`; digest `sha256:64ff0b56ecf0f29e8abe483908c9d20244ca7eb5891feba487dccb97ad78eac8`. New screenshots **6**. Historical screenshot review/status/index claims are source-derived; archive JSON and PNGs were not downloaded in AGG-01.

R10/R13 FAIL: manufactured zeros and categorical numeric-X Scatter. Other providers/negative configurations UV. Source/test versus native IPC/provider boundaries remain exactly scoped to the record. Product acceptance is separately listed in feature rows; no report is promoted.

### CAP-27

**STANDALONE_REPORT — PARTIAL.** Source `docs/audit/391/batches/CAP-27.md` at base `e4c036d853e6f5fe6aecd794a2404c7331c5c13e`, blob `7aa33fcc9ec5b2d5d9e11bbf4508908596a3f329`. Integrated record revision `6f172bcfa7e90fdfeab5acd345f5f00869e1c330`; isolated/recovery PR [#434](https://github.com/cubitouch/DataKoala/pull/434) report head `f9c5650aedd40879d65463279d5731a749e8819e`, integration commit `6f172bcfa7e90fdfeab5acd345f5f00869e1c330` (closed/merged). Generating evidence sourceHead `175d0ead3a66dace3dee7a318fe4d004ae028bac`; [workflow 38794465569](https://github.com/cubitouch/DataKoala/actions/runs/38794465569) remote final conclusion **success**. Artifact **12001128524**, `datakoala-ux-audit-pr-434`, not expired when checked; artifact.workflow_run.head_sha exactly matches `175d0ead3a66dace3dee7a318fe4d004ae028bac`; digest `sha256:78378a51b26220bbdcf4b49cd93bfa161a0fe9c5e1cc0176040ade5aee36d3da`. New screenshots **4**. Historical screenshot review/status/index claims are source-derived; archive JSON and PNGs were not downloaded in AGG-01.

PG legend/point/brush scoped; expanded-legend PNG absent, pointer/clamps/persistence and provider parity UV. Source/test versus native IPC/provider boundaries remain exactly scoped to the record. Product acceptance is separately listed in feature rows; no report is promoted.

### CAP-28

**STANDALONE_REPORT — PARTIAL.** Source `docs/audit/391/batches/CAP-28.md` at base `e4c036d853e6f5fe6aecd794a2404c7331c5c13e`, blob `7eb2bfee6de8061531b9ebe19033a685017368e3`. Integrated record revision `3c0623d93cf6db9d3af9900b6c4b9b90990ef9f8`; isolated/recovery PR [#436](https://github.com/cubitouch/DataKoala/pull/436) report head `13a6e31ddf8dbee2966aac7f2d70b75841a82638`, integration commit `3c0623d93cf6db9d3af9900b6c4b9b90990ef9f8` (closed/merged). Generating evidence sourceHead `83eeb52e4dfbd3c12979a6888b2d0e9fba22101e`; [workflow 38814994606](https://github.com/cubitouch/DataKoala/actions/runs/38814994606) remote final conclusion **success**. Artifact **12010741400**, `datakoala-ux-audit-pr-436`, not expired when checked; artifact.workflow_run.head_sha exactly matches `83eeb52e4dfbd3c12979a6888b2d0e9fba22101e`; digest `sha256:22fad32370429119ae05efaa83b3099a75a7d6f461473e78d72f3561a603f17c`. New screenshots **5**. Historical screenshot review/status/index claims are source-derived; archive JSON and PNGs were not downloaded in AGG-01.

PNG bytes and anomaly source-point checked; retained-result ownership, feedback containment/cancel, native save/copy, sample limits UV. UI-004 remains unresolved. Source/test versus native IPC/provider boundaries remain exactly scoped to the record. Product acceptance is separately listed in feature rows; no report is promoted.

### CAP-29

**STANDALONE_REPORT — PARTIAL.** Source `docs/audit/391/batches/CAP-29.md` at base `e4c036d853e6f5fe6aecd794a2404c7331c5c13e`, blob `82a5cb0ddbadc1e6aea78d5c4aeec9c32345fff4`. Integrated record revision `239bc69722af982cb9174cd3101b1527e3946f67`; isolated/recovery PR [#435](https://github.com/cubitouch/DataKoala/pull/435) report head `1732f174f6c4f03cc46d3b74d3eda5493e6c241a`, integration commit `239bc69722af982cb9174cd3101b1527e3946f67` (closed/merged). Generating evidence sourceHead `f1ca5d6715973ee52f84ad4ad25abcb30dfbca96`; [workflow 38814864167](https://github.com/cubitouch/DataKoala/actions/runs/38814864167) remote final conclusion **success**. Artifact **12009723643**, `datakoala-ux-audit-pr-435`, not expired when checked; artifact.workflow_run.head_sha exactly matches `f1ca5d6715973ee52f84ad4ad25abcb30dfbca96`; digest `sha256:a04b070d45dbb60290cba6dd9ddb62799240f3bd23735c0d3e53e482175792c8`. New screenshots **3**. Historical screenshot review/status/index claims are source-derived; archive JSON and PNGs were not downloaded in AGG-01.

Known-defect characterization PASS; nested Escape and failed-Save focus FAIL X01. Native opening autofocus qualified/UV. Source/test versus native IPC/provider boundaries remain exactly scoped to the record. Product acceptance is separately listed in feature rows; no report is promoted.

### CAP-30

**STANDALONE_REPORT — PARTIAL.** Source `docs/audit/391/batches/CAP-30.md` at base `e4c036d853e6f5fe6aecd794a2404c7331c5c13e`, blob `ca093985a097c573bd84d9ad2530ce7375fffd72`. Integrated record revision `e4c036d853e6f5fe6aecd794a2404c7331c5c13e`; isolated/recovery PR [#437](https://github.com/cubitouch/DataKoala/pull/437) report head `f8adb6477087b2e49f355fdc1fabbc0debad958a`, integration commit `e4c036d853e6f5fe6aecd794a2404c7331c5c13e` (closed/merged). Generating evidence sourceHead `e9c893853586a3218d4b0c3ed3e103c82d04d9b3`; [workflow 38815371248](https://github.com/cubitouch/DataKoala/actions/runs/38815371248) remote final conclusion **success**. Artifact **12010408386**, `datakoala-ux-audit-pr-437`, not expired when checked; artifact.workflow_run.head_sha exactly matches `e9c893853586a3218d4b0c3ed3e103c82d04d9b3`; digest `sha256:28ca9aa9a63b56fd07d5c6f88ac598caadc78679ab28c043c110ec253572d685`. New screenshots **5**. Historical screenshot review/status/index claims are source-derived; archive JSON and PNGs were not downloaded in AGG-01.

PromQL Copy SQL label and rejected Loki copy FAIL; dedicated X11 identifier-copy UV. Query-level handoff only; actual OS/paste/Grafana UV. Source/test versus native IPC/provider boundaries remain exactly scoped to the record. Product acceptance is separately listed in feature rows; no report is promoted.

### NON-01

**STANDALONE_REPORT — EVIDENCE_COMPLETE.** Source `docs/audit/391/batches/NON-01.md` at base `e4c036d853e6f5fe6aecd794a2404c7331c5c13e`, blob `736feb7f6aa754db038ba4180b9e07b4240d95a8`. Integrated record revision `834f7b4befbc78467754bbcdffe619bb1d2c37de`; isolated/recovery PR [#415](https://github.com/cubitouch/DataKoala/pull/415) report head `3f8f9ccbabbab6a137b837d5f475db67b923096e`, integration commit `834f7b4befbc78467754bbcdffe619bb1d2c37de` (closed/merged). Generating evidence sourceHead `bd4da52b80f65618a4908529ae4df91cc3b124e3`; [workflow 38763003457](https://github.com/cubitouch/DataKoala/actions/runs/38763003457) remote final conclusion **failure**. Executed job metadata independently checked: Unit tests=success (job 116519101905), Quality=failure (job 116519102464), DuckDB macOS runtime and package=success (job 116519102516), UI tests=success (job 116519102638), Production build=success (job 116519102689). No screenshot/artifact acceptance is applicable.

Executed synthetic lazy/explicit connect race expected failures NON01-06; A04/A07/A08 FAIL. Real teardown/physical cancellation/auth UV. Source/test versus native IPC/provider boundaries remain exactly scoped to the record. Product acceptance is separately listed in feature rows; no report is promoted.

### NON-02

**STANDALONE_REPORT — EVIDENCE_COMPLETE.** Source `docs/audit/391/batches/NON-02.md` at base `e4c036d853e6f5fe6aecd794a2404c7331c5c13e`, blob `a743174fced67c84fabf23be3a79b71f5642e106`. Integrated record revision `062af9bd25f1987e91d097af97e78be00730e7ed`; isolated/recovery PR [#413](https://github.com/cubitouch/DataKoala/pull/413) report head `a85d9fcb8b7e9f240047cb1343cd6a91b9c3ab95`, integration commit `062af9bd25f1987e91d097af97e78be00730e7ed` (closed/merged). Generating evidence sourceHead `c3b9e055b3298911c55e533202048800df5b0001`; [workflow 38759788917](https://github.com/cubitouch/DataKoala/actions/runs/38759788917) remote final conclusion **cancelled**. Executed job metadata independently checked: UI tests=success (job 116507708852), Quality=failure (job 116507708937), Production build=success (job 116507708996), DuckDB macOS runtime and package=cancelled (job 116507709125), Unit tests=success (job 116507709156). No screenshot/artifact acceptance is applicable.

Executed workspace/preset tests; A19 explicit histogram override loss FAIL NON02-01. Packaged restart/missing-profile UI/durability UV. Source/test versus native IPC/provider boundaries remain exactly scoped to the record. Product acceptance is separately listed in feature rows; no report is promoted.

### NON-03

**STANDALONE_REPORT — EVIDENCE_COMPLETE.** Source `docs/audit/391/batches/NON-03.md` at base `e4c036d853e6f5fe6aecd794a2404c7331c5c13e`, blob `34a9a3f0bf5ba87d20ef7451478de0f7b5b6e425`. Integrated record revision `369061f0641cd3ae86c79e9c85998dcef97c8412`; isolated/recovery PR [#414](https://github.com/cubitouch/DataKoala/pull/414) report head `a460200eb95f3e1362ebbd9c6d2977007656b870`, integration commit `369061f0641cd3ae86c79e9c85998dcef97c8412` (closed/merged). Generating evidence sourceHead `1fdc3a604310622e7f99ef09ba7a6ed374c6b4ac`; [workflow 38759956034](https://github.com/cubitouch/DataKoala/actions/runs/38759956034) remote final conclusion **failure**. Executed job metadata independently checked: Quality=failure (job 116508284684), Unit tests=success (job 116508285041), DuckDB macOS runtime and package=success (job 116508285117), Production build=success (job 116508285237), UI tests=success (job 116508285299). No screenshot/artifact acceptance is applicable.

Mocked encryption/ADC and real local serialization; C10 unredacted synthetic provider message FAIL NON03-01 (no real credential leak established). Native OS UV. Source/test versus native IPC/provider boundaries remain exactly scoped to the record. Product acceptance is separately listed in feature rows; no report is promoted.

### NON-04

**STANDALONE_REPORT — PARTIAL.** Source `docs/audit/391/batches/NON-04.md` at base `e4c036d853e6f5fe6aecd794a2404c7331c5c13e`, blob `7631c390a092ed47c78e2cd2a792163de8882c7a`. Integrated record revision `0f4a39bc597c0b75cce95c0e4dfe6ca3b4e6b8ec`; isolated/recovery PR [#416](https://github.com/cubitouch/DataKoala/pull/416) report head `3097d1afd3e10795a61c21814d6f1d5cf0c51271`, integration commit `0f4a39bc597c0b75cce95c0e4dfe6ca3b4e6b8ec` (closed/merged). Generating evidence sourceHead `ac99126feb212986f4acffcc058172af469fc73e`; [workflow 38765295024](https://github.com/cubitouch/DataKoala/actions/runs/38765295024) remote final conclusion **cancelled**. Executed job metadata independently checked: UI tests=success (job 116526809003), Production build=success (job 116526809359), DuckDB macOS runtime and package=cancelled (job 116526809623), Quality=failure (job 116526809717), Unit tests=success (job 116526809775). No screenshot/artifact acceptance is applicable.

Native DuckDB/SQLite and mocks pass; PG actual read-only, EXPLAIN effects and BQ script-child security UV. Source/test versus native IPC/provider boundaries remain exactly scoped to the record. Product acceptance is separately listed in feature rows; no report is promoted.

### NON-05

**STANDALONE_REPORT — PARTIAL.** Source `docs/audit/391/batches/NON-05.md` at base `e4c036d853e6f5fe6aecd794a2404c7331c5c13e`, blob `da2931197105091932fbd3648b12e7ad0d34efbf`. Integrated record revision `77d779c08168a3ffb329aeeacef8a02082ecb401`; isolated/recovery PR [#418](https://github.com/cubitouch/DataKoala/pull/418) report head `d7cfcfa6db0ea4771b280e8373e8892bfeccf908`, integration commit `77d779c08168a3ffb329aeeacef8a02082ecb401` (closed/merged). Generating evidence sourceHead `e50b8f7796382767cd0da424f4996c88a4aa7dc2`; [workflow 38769180343](https://github.com/cubitouch/DataKoala/actions/runs/38769180343) remote final conclusion **cancelled**. Executed job metadata independently checked: Quality=failure (job 116540386274), DuckDB macOS runtime and package=cancelled (job 116540386665), UI tests=success (job 116540386805), Unit tests=success (job 116540386872), Production build=success (job 116540387015). No screenshot/artifact acceptance is applicable.

Three expected-failure correctness repros FAIL S16; no injection exploit/live syntax claim. Token-blind materialization and BQ identifier conversion. Source/test versus native IPC/provider boundaries remain exactly scoped to the record. Product acceptance is separately listed in feature rows; no report is promoted.

### NON-06

**STANDALONE_REPORT — PARTIAL.** Source `docs/audit/391/batches/NON-06.md` at base `e4c036d853e6f5fe6aecd794a2404c7331c5c13e`, blob `34d1302c9c62612a6df2aa46a09a827a1f53b376`. Integrated record revision `906960284260175f88761d9ff93fe2fd79351dbd`; isolated/recovery PR [#417](https://github.com/cubitouch/DataKoala/pull/417) report head `3097e7ec2bf7f8c5efa8afcfb4e3d1a4c7a7349b`, integration commit `906960284260175f88761d9ff93fe2fd79351dbd` (closed/merged). Generating evidence sourceHead `c3ec6f04b87ae3bac4ec343642756e3a09ed41e0`; [workflow 38765367153](https://github.com/cubitouch/DataKoala/actions/runs/38765367153) remote final conclusion **cancelled**. Executed job metadata independently checked: Quality=failure (job 116527046199), DuckDB macOS runtime and package=cancelled (job 116527046523), UI tests=success (job 116527046649), Unit tests=success (job 116527046896), Production build=success (job 116527046969). No screenshot/artifact acceptance is applicable.

Unit job executed tests despite stale conditional summary. S26 duplicate selection confirmed; stale metadata expected failure. Provider/catalog authorization UV. Source/test versus native IPC/provider boundaries remain exactly scoped to the record. Product acceptance is separately listed in feature rows; no report is promoted.

### NON-07

**STANDALONE_REPORT — PARTIAL.** Source `docs/audit/391/batches/NON-07.md` at base `e4c036d853e6f5fe6aecd794a2404c7331c5c13e`, blob `194d79219368ad39ac9d1b9e259f1aed14d33e3e`. Integrated record revision `cfcf1bb6e5d85e5a6b01d593b0e37ac053ca8c16`; isolated/recovery PR [#419](https://github.com/cubitouch/DataKoala/pull/419) report head `e24fa4c468bc33ad280aef9d29b9807b03f55196`, integration commit `cfcf1bb6e5d85e5a6b01d593b0e37ac053ca8c16` (closed/merged). Generating evidence sourceHead `e7b4c978183e7cb832448d2136bfbe064beed9ff`; [workflow 38769577600](https://github.com/cubitouch/DataKoala/actions/runs/38769577600) remote final conclusion **failure**. Executed job metadata independently checked: Production build=success (job 116542047942), DuckDB macOS runtime and package=success (job 116542047991), Quality=failure (job 116542048327), Unit tests=success (job 116542048492), UI tests=success (job 116542048712). No screenshot/artifact acceptance is applicable.

C12 null/blank->zero and unsafe dry-run rounding confirmed. UI-002 requirement unresolved; renderer stats absence is not approved UI defect. Source/test versus native IPC/provider boundaries remain exactly scoped to the record. Product acceptance is separately listed in feature rows; no report is promoted.

## D. Reconciliation results

- Replaced active stale totals/status/handoff tables, while keeping the entire original completion/checkpoint tail explicitly historical. All 175 feature names/scopes now match inventory; 168 represented rows reconciled, seven restored, T10 corruption repaired in active table.
- All 20 formerly active NOT_STARTED CAP-18–30/NON rows now show their actual 6 EVIDENCE_COMPLETE / 14 PARTIAL outcomes. CAP-01–17 retain EVIDENCE_COMPLETE, with scope concerns flagged rather than silently downgrading them.
- Every feature links to its batch manifest, with separate visual, behavioral, source/test/implementation and acceptance/gap fields. Later report matrices replace stale SO-only summaries. Existing early detailed evidence preserved; named-test-only native dimensions are SO (A06/A11/A13/P02/P03/L04/A20/S03/S14). T04 also references CAP-22's executed namespace/service subset without double-counting it as new evidence.
- X11 remains UV: copying TraceQL in CAP-30 proves X06, not dedicated Tempo identifier copying. T24 is visual SO but behavioral BV; P17/X09 visual UV with BV URL checks. R07 picker VV does not certify Bar pixels, and R17 baseline VV does not certify an absent expanded-legend image.
- Source classifications preserved, including deliberate separate semantics of Tempo map/waterfall, Loki primary/optional work, SQL dialect/read-only boundaries, and clipboard/save transports. Current baseline reuse UNKNOWN/PARTIAL remains scoped; no refactor inferred from common UX labels.
- Two provisional owner corrections and three resolved lead classifications are explicit; no source report, inventory definition, fixture, workflow, harness, screenshot or release criterion changed.

## E. Totals and invariants

| Metric | Recomputed value |
| --- | --- |
| original | 175 |
| assigned | 175 |
| VV | 147 |
| BV | 164 |
| SO_ONLY | 4 |
| UV_ONLY | 1 |
| VISUAL_UV | 3 |
| BEHAVIOR_UV | 1 |
| VISUAL_NA | 19 |
| FAIL | 25 |
| CAP | 30 |
| NON | 7 |
| EVIDENCE_COMPLETE | 23 |
| PARTIAL | 14 |
| PROVISIONAL_RESOLVED | 3 |
| PROVISIONAL_UNRESOLVED | 2 |
| MISSING_SOURCES | 0 |
| DUPLICATE_OWNERS | 0 |

VV/BV count unique original IDs with at least one scoped verified instance; they overlap. SO_ONLY means neither VV nor BV but some SO support; UV_ONLY means neither verified nor SO support. VISUAL_UV/BEHAVIOR_UV count their respective primary dimension labels, not every remaining UV subbehavior. N/A is scoped nonvisual evidence, never proof that the overall feature has no UI. FAIL is a unique feature count with at least one confirmed failed scoped product claim, not a unique defect count. All five provisional leads are excluded from original counts. Completed CAP/NON totals count delivered integrated audit records; no batch is counted twice after recovery.

Reproduce using `python docs/audit/391/aggregation/validate-agg-01.py` from any working directory in a complete checkout. The read-only validator parses the inventory, active register and this report's bounded metadata snapshot; verifies IDs/names/scopes/owners, 30+7 source types, exact report blobs, preserved historical bytes, dispositions, feature counts, required failure retention, sourceHead/artifact consistency, anchor/path references and candidate IDs. It does not execute production code, re-render PNGs or claim live product acceptance. Mechanical outcome is recorded after actual execution below.

## F. Confirmed failures preserved

| Original ID | Failed scoped acceptance | Primary evidence owner |
| --- | --- | --- |
| A01 | V-03 custom picker/PG modal Tab containment and Escape fail. | CAP-01 |
| A02 | V-03 custom editing-modal focus/dismissal gap; other provider edit acceptance UV. | CAP-02 |
| A03 | CAP-02 Escape/Cancel returns focus to BODY. | CAP-02 |
| A04 | NON01-06 older lazy completion overwrites newer pending status. | NON-01 |
| A07 | NON01-06 obsolete lazy failure/status publication. | NON-01 |
| A08 | NON01-06 same-generation intent arbitration fails; generation guards elsewhere pass. | NON-01 |
| A19 | NON02-01 explicit classic/native histogram override lost on workspace parse. | NON-02 |
| C10 | NON03-01 synthetic sensitive upstream message retained; practical ADC leak UV. | NON-03 |
| C12 | NON07-01/02 null/blank fabricated zero and unsafe dry-run rounding. | NON-07 |
| L02 | UX-05/VC18-04 two existing async raw formatter overwrite reproductions. | CAP-18 |
| L16 | VC19-02 nested fields collapse to [object Object]. | CAP-19 |
| L18 | V-07/VC19-01 rejected clipboard yields unhandled rejection/no feedback. | CAP-19 |
| R02 | VC12-03 native resize unexpectedly changes sort. | CAP-12 |
| R04 | VC12-03 resizing triggers header sort. | CAP-12 |
| R10 | VC26-01/02 fabricated zero marks and categorical numeric-X geometry. | CAP-26 |
| R13 | VC26-01/02 numeric Scatter mapping misrepresents coordinates. | CAP-26 |
| R19 | VC13-01 menu focus-return failure; chips/clear otherwise scoped. | CAP-13 |
| S16 | NON05-01/02/03 quoted placeholders/materialized binding and BQ promoted identifier mismatch. | NON-05 |
| S19 | VC13-01 local-filter menu Escape loses focus to BODY. | CAP-13 |
| S26 | NON06-02 duplicate referenced relations consume slots; NON06-01 stale revision expected-failure remains. | NON-06 |
| T13 | VC23-01 sample-size toolbar label clipped at 1440px; request value correct. | CAP-23 |
| T18 | VC24-03 displayed start excluded/end included; known-defect characterization passes, product FAIL. | CAP-24 |
| X01 | VC29-01 nested Escape dismisses both; VC29-03 failed Save loses modal focus. | CAP-29 |
| X06 | V-08/VC30-02 actual PromQL Copy labeled Copy SQL. | CAP-30 |
| X10 | V-07/VC30-03 silent rejected log Copy. | CAP-30 |

Minimum-preservation checks: VC24-03 Tempo displayed-boundary mismatch; VC26-01 manufactured zero points; VC26-02 categorical numeric-X Scatter; VC29-01 nested Escape; VC29-03 failed-Save focus loss; VC30-02 PromQL Copy SQL label; VC30-03 Loki clipboard rejection/no feedback. Their characterization execution can PASS while product acceptance remains FAIL. Future production fixes require changing the expected characterization to assert the corrected contract. No `it.fails` outcome is relabeled a passing desired invariant.

Additional inherited V-04 narrow Tempo inner-toolbar overflow, UX-05 formatter races and V-03 custom-dialog focus policies remain referenced by the preserved Phase 1A/1B audit. Failure ID counts above use the directly attributable scoped feature mapping, not every comparator/toolbar alias. Nonvisual error-boundary findings retain synthetic qualifiers: no real credential leak, write exploit or live provider injection is asserted.

## G. Contradictions, weak evidence and open questions

| Ref | Claim A / claim B | Affected scope | Disposition / next owner |
| --- | --- | --- | --- |
| G-01 | CAP-07 current completion table/rows vs missing narrative heading; earlier completion commit retains full narrative/VC07-01/02 | A14–A18/A20 | Historical register replacement lost narrative. Current embedded completion accepted per corrected gate; original narrative consulted, not rewritten. AGG-02 verify history and source mapping. |
| G-02 | Historical register says 175 represented vs actual 168, T10 literal truncation and T11–17 omissions | T10–T17 | Active accounting repaired from unchanged inventory and CAP-23/24; old source remains historical. No missing behavior fabricated. |
| G-03 | CAP-06 says individual review but also montage; CAP-09 says originals inspected but offline CI-emitted PNG/JSON path | P02/L04/T04/A24/A25 | VV retained only as qualified report-derived substate claim; AGG-02 inspect original images and review chain before independent verification. |
| G-04 | EVIDENCE_COMPLETE vs material native UV in CAP-05/06/07/10/11/15 and provider gaps in CAP-18/19 | multiple | Preserve report dispositions; verify intended scoped completion criteria independently. P03 remains SO; no forced completeness. |
| G-05 | NON-06 opening/final text says CI pending although section G and remote Unit/UI jobs succeeded | S26 | BV supported for executed tests; batch remains PARTIAL because stale metadata and authorization gaps persist. Run final cancellation does not cancel already successful jobs. |
| G-06 | Several NON reports describe CI pending or imply full run outcomes before later cancellation | NON-02/04/05/06/07 | Remote final run conclusions and individual jobs recorded above. NON-07 UI job now success; Quality fails. No full-green claim. |
| G-07 | CAP-24/29 green execution vs failed product contracts | T18/X01 | Legitimate known-defect characterization PASS/product FAIL; preserve exact expectations and failed acceptance. |
| G-08 | CAP-19 calls clipboard race/feedback defect complete while CAP-30 remains PARTIAL for same failure plus extra scope | L18/X10/X06/X11 | Different evidence completeness policies/scopes, not a product-fix contradiction. Preserve both dispositions; AGG-02 check scoped criteria. |
| G-09 | UI-002 source statistics absent vs inventory expectation UI exposes values where available | C12/UI-002 | NON-07 leaves approved product requirement unresolved; do not call UI absence confirmed defect or retire lead. |
| G-10 | CAP-08 classifies prior toast as expected; CAP-30 classifies similar cross-workspace toast UNVERIFIED | A24/X06/X12 | Different sequence/context; keep both observations. Product-policy owner must establish cross-workspace notification contract before AGG-03 dedup. |
| G-11 | CAP-23 source uses branch head language for execution vs synthetic checkout distinction elsewhere | T09–T13 | Remote workflow/artifact metadata match sourceHead; exact synthetic checkout not recorded in recovery report. Do not invent it; archived status/index matching remains report-derived. |
| G-12 | Report commit self-reference placeholders in standalone records | 20 reports | Manifest now records integration record revision and isolated/recovery report head; original separate report-introducing commit may need PR-history inspection if forensic precision is required. Neither is used as generating SHA. |
| G-13 | UI-004 partial configuration/legend coverage vs duplicate R-family lead | UI-004/R16/R17/R24/R25 | Keep unresolved lineage: CAP-28 verifies limited restoration, broader width/tab/restart states UV; no new original feature or forced retirement. |
| G-14 | Many source matrices use BV for code tests vs native renderer subbehavior | A06/A11/A13/P02/P03/L04/A20/S03/S14 | Early named-test-only unexecuted native dimensions labeled SO. NON executed deterministic serialization/adapter contracts remain BV at their actual runtime, not live/native OS proof. AGG-02 should examine classification consistency. |

No missing provenance is replaced by the integration merge SHA. CAP-01 generating sourceHead, previously not explicit in its narrative, is now identifiable from matching run/artifact metadata as d1e3127ba380f75108b296f737b42729ae4dd073; CAP-09 abbreviated 296a6ada expands to 296a6ada15031c4455adc89e58fc5a57ce03243e. CAP-06 reuses CAP-05's run/source and generates zero new images. Original image inspection/status/index fields are report claims, not independently reverified byte-level archive contents. All cited main artifacts are remotely present/not expired when checked; no unavailable artifact was presented as independently reviewed.

## H. Candidate-reference index

Source candidate text/classifications, associated IDs and earlier V/UX references are retained below; no final ranking, redesign, normalization or Atlas synthesis. Where a source line mixes a candidate's classification with a comparison, read its source report for the exact boundary. Narrative-style entries retain their actual paragraphs. VC07-01/02 are recovered historical references. No global candidate-ID collision was found in the collected index; alias references in other reports do not create extra candidates.

| Candidate | Source batch | Related original IDs / earlier findings | Source classification and evidence location |
| --- | --- | --- | --- |
| VC05-01 | [CAP-05](#cap-05) | A09, A13 | - **VC05-01 — metadata hierarchy, intentional difference (KEEP DISTINCT).** IDs A09/A13; patterns `sidebar/metadata`. Compare inspected `metadata-postgres-settled-desktop.png` (schema → relation → columns) against `metadata-tempo-settled-desktop.png` (service leaf). Owner Sidebar.tsx / SqlMetadataTree.tsx / Tempo service branch and shared MetadataTree; named SqlMetadataTree.test.tsx. Impact: normal source comprehension, confidence **high**. Do not force a universal SQL relation tree; preserve common loading/error/Retry chrome. |
| VC05-02 | [CAP-05](#cap-05) | A11, A12 | - **VC05-02 — initial error vs refresh error, independent same contract / follow-up.** IDs A11/A12; pattern `feedback/metadata`. Inspected `metadata-postgres-error-desktop.png` shows *injected initial error*, `cap05-pg-retry-desktop.png` recovered state, and nonvisual `Sidebar.connectionKinds.test.tsx` named failed-refresh assertion. `Sidebar.tsx` shows different text/actions for initial Retry and refreshError; `metadataRefresh.ts` retains cached loaded state, but `data-object-tree-viewport` becomes **hidden during refreshing**. Confidence **high for source/test**, **unverified native refresh screenshot**. Candidate comparison: initial error/Retry vs refreshing/refreshError at same viewport; decide common feedback semantics vs legitimate in-place refresh without inventing after-images. |
| VC05-03 | [CAP-05](#cap-05) | A06 | - **VC05-03 — status owner split, already scoped / comparison candidate.** A06; `sidebar/status`. Inspected `metadata-postgres-settled-desktop.png`, `metadata-tempo-settled-desktop.png` show connected indicators, nonvisual `ConnectionStatus.test.tsx` tab-scoping and `Sidebar.connectionKinds.test.tsx` per-profile reconnection. Owner ConnectionStatus/Sidebar/useStore. Confidence **high on state tests**, full disconnected/connecting/error visual variants **unverified**. Suggested final atlas comparison: active-tab toolbar status vs sidebar profile badges, with shared visual language but intentionally different scope. |
| VC06-01 | [CAP-06](#cap-06) | L04, P02, T04 | - **VC06-01 — provider discovery semantics, intentional difference / KEEP DISTINCT.** P02/L04/T04, pattern `builder/metadata/selector`. Pair existing inspected `selector-prometheus-options-desktop.png` (metric), `selector-loki-options-desktop.png` (indexed label), and `selector-tempo-options-desktop.png` (namespace); inspect common dropdown chrome and distinct option sources. Owners PromqlBuilderPanel, LokiSidebarTree + LokiMetadataTree, TraceBuilderPanel; confidence high on visual default controls and named code paths, lower on unseen failure states. No universal selector data model warranted; reuse Combobox chrome, preserve source-specific meaning. Cross-reference VC05-01/VC05-02. |
| VC06-02 | [CAP-06](#cap-06) | P03 | - **VC06-02 — Prometheus detail presence, needs verification.** P03, pattern `metadata/detail`. **No validated populated type/help/unit screenshot**. Nonvisual source `PrometheusMetadataTree.tsx` renders type/help and optional Unit on expansion; future contrast with Tempo service leaf screenshot and missing-optional-field state. Impact low/medium discoverability, confidence high on code contract but insufficient visual evidence for a defect. Do not claim divergence until the actual populated and absent detail states are reviewed. |
| VC07-01 | [CAP-07](#cap-07) | A14, A17, A18 | - **VC07-01 — background-tab running indicator vs active connection state, already converged / keep distinct ownership.** A14/A17/A18; `tabs/navigation/status`. Inspected `cap07-tabs-running-desktop.png` with inactive original A yellow running dot while active Audit B has no dot; green top-toolbar PG connection remains a distinct status. Owners `QueryTabs.tsx`, `ConnectionStatus.tsx`, `useStore.ts`; CAP-07 renderer assertion plus cross-tab `ConnectionStatus.test.tsx`. Confidence **high** for renderer contract, no backend duration/abort. Pair with VC05-03 active tab vs sidebar status in final atlas; status should remain tab-scoped, not universally reused. |
| VC07-02 | [CAP-07](#cap-07) | A20 | - **VC07-02 — SQL vs LogQL Raw/Builder controls, already converged chrome / intentional labels.** A20; `editor/query-mode`. Inspected `postgres-raw-desktop.png`, `postgres-builder-desktop.png`, `loki-raw-desktop.png`, `loki-builder-desktop.png`. Shared `ModeSwitch.tsx` selects language-specific Raw label; provider Builders remain independent. Confidence **high** for visible chrome, **unverified** actual cross-tab draft retention. Pair with VC06-01 selector semantics, look for consistent layout but preserve query-language labels. No defect alleged. |
| VC08-01 | [CAP-08](#cap-08) | A21, A23 | - **VC08-01 — shared in-app confirmation vs native preset-delete confirmation (NEEDS_VERIFICATION).** IDs A21/A23; pattern `query-actions/confirmation`. Inspected `cap08-preset-list-desktop.png`, `cap08-reset-confirm-desktop.png`, and reused `dialog-presets-desktop.png` / `dialog-reset-desktop.png`; `cap08-reset-cleared-desktop.png` records the post-confirmation state. Actual preset delete Cancel/Confirm used a renderer `window.confirm` stub, so its native appearance, keyboard/focus behavior and parity with the shared Reset `Modal` have no screenshot evidence. Owners `PresetManagerAction.tsx`, `QueryUtilityActions.tsx`, `ui/Modal`; tests `PresetManagerAction.test.tsx`, `QueryUtilityActions.test.tsx`. Comparison partner: final atlas dialog/action-pattern review. Impact medium; confidence high on current renderer state transitions, low on native-dialog visual comparison. Do not call this a defect before native confirmation UX is observed. |
| VC08-02 | [CAP-08](#cap-08) | A23, A24 | - **VC08-02 — transient success feedback overlapping a subsequent action (ALREADY_CONVERGED).** ID A24 with A23 context; pattern `feedback/notifications`. `cap08-reset-cleared-desktop.png` visibly includes the preceding “Loaded preset ‘CAP08 Loki labels’.” toast within `NotificationArea.tsx`’s default 2600 ms lifetime. CAP-09 confirms actual query-copy success/error toasts replace one another; `NotificationArea.test.tsx` verifies replacement and timed dismissal. The preceding toast is expected transient feedback, not a Reset result and not a stale-notification defect. Impact low; confidence high for the shared renderer notification lifecycle; native OS notifications were not exercised. |
| VC09-01 | [CAP-09](#cap-09) | A24, V-07 | - **VC09-01 — copy toast vs inline result error (`KEEP_DISTINCT`).** ID A24; pattern `feedback/outcome`. Inspected `clipboard-query-error-desktop.png`, `clipboard-query-success-desktop.png`, and `compare-feedback.png` (reused; artifact 11930132295). Renderer assertions verify query-copy text/tone/live semantics and success replacement; `compare-feedback.png` shows datasource failures inline within result surfaces. Owners: `CopySqlButton.tsx`, `NotificationArea.tsx`, `ResultsTable.tsx`, plus result presenters. Comparison partner: Phase 1B V-07 and CAP-30 clipboard coverage; carry V-07 without duplicating it. Copy outcome and query execution failure have different action context and presentation contract. Impact low; confidence high for synthetic renderer states; no OS clipboard evidence. |
| VC09-02 | [CAP-09](#cap-09) | A25, L15, L20, R17 | - **VC09-02 — global workspace splitter vs right-side inspectors/legend (`SHARE_SHELL_KEEP_ADAPTERS`).** ID A25; pattern `workspace/resizing`. Inspected `cap09-resized-workspace-desktop.png` and static `compare-detail.png` (artifact 11932551046 plus reused artifact 11930132295). The global App splitters use width/height bounds, 16 px keys and app-level localStorage; `ResizableDetailPanel` and `ChartLegendResizer` use separate right-side width clamps/owners and 24 px keys. Their pointer/keyboard/clamp mechanics are similar while available space and minimum plot/main geometry differ; keep distinct adapters if a shared low-level interaction is considered later, without a universal pane manager. App splitters were operated; inspector and chart legend were source-only (no chart legend screenshot/interaction in this batch). Owners: `App.tsx`, `layoutDimensions.ts`, `ResizableDetailPanel.tsx`, `ChartLegend.tsx`. Comparison partners: L15/L20 and R17 in their later CAP tasks. Impact medium; confidence medium (direct App behavior, comparison partners source-only). |
| VC10-01 | [CAP-10](#cap-10) | S01, S04 | - **VC10-01 — shared SQL editor shell with datasource dialect adapters.** S01–S04; screenshots `cap10-editor-postgres-desktop.png`, `cap10-editor-bigquery-desktop.png`, `cap10-formatted-postgres-desktop.png`; sources `QueryEditor.tsx`, `QueryCodeEditor.tsx`, `sqlDialect.ts`, `formatSql.ts`, `sqlCompletionSchema.ts`; focused `sqlAutocomplete.test.tsx` and `QueryEditor.test.tsx` cases. Classification: **SHARE_SHELL_KEEP_ADAPTERS**, distinguishing already converged common editor chrome from intentional PostgreSQL/GoogleSQL syntax and formatting. Confidence **high** for inspected screenshots and tested schema/format flows; **low/unverified** for native popup and parser behavior. No defect established. |
| VC10-02 | [CAP-10](#cap-10) | S06, S17 | - **VC10-02 — common CopySqlButton path for raw and generated SQL.** S06/S17; screenshots `cap10-editor-postgres-desktop.png`, `cap10-generated-sql-desktop.png`, and CAP-09 `clipboard-query-{error,success}-desktop.png`; sources `CopySqlButton.tsx`, `GeneratedQueryPanel.tsx`, `clipboardText.ts`. Classification: **ALREADY_CONVERGED** for renderer payload/feedback behavior, with datasource-specific query content preserved. Confidence **high** for synthetic clipboard exact-payload checks; native OS clipboard remains unverified. |
| VC11-01 | [CAP-11](#cap-11) | S08, S15, V-10 | **VC11-01 — dimensional semantics under shared field chrome.** S08–S15; pattern: selectors/Builder dependencies; PostgreSQL example.sales. Inspected three cap11 frames above plus selector-postgres-options-desktop.png. Real relation/time/X/Y/aggregation mutations and CI Series compatibility tests support **SHARE_SHELL_KEEP_ADAPTERS**, high confidence; preserve Combobox/FieldChrome/TimeRangeField while SQL-only generation, cardinality and dependency invalidation remain with BuilderPanel/builderTransitions/builderSql. Partner: V-10 and later PromQL/LogQL/TraceQL CAPs; no new shell duplication finding. Impact: avoids imposing SQL semantics on other languages. Follow-up: compare shared chrome in those batches, not a universal Builder. Custom endpoint editing, live metadata/cardinality, SQL dialect/security and real query execution remain outside this evidence. |
| VC12-01 | [CAP-12](#cap-12) | R05, R06, S20, X07, UX-15, V-07 | - **VC12-01 — CSV payload contract already converged.** S20/R05/R06/X07; copy/export + feedback pattern; PostgreSQL table. Inspected filtered/resized frames. Exact Copy/Export strings, header-only and virtual cohort assertions above; owners ResultsTable/data/clipboardText/preload export. **ALREADY_CONVERGED**, high confidence; reuse UX-15 and V-07, preserve transport-specific save/clipboard and JSON inline feedback. Comparison partners: CAP-09 feedback and future log/trace copy batches. Impact: avoids duplicate CSV abstractions; native OS acceptance still unverified. |
| VC12-02 | [CAP-12](#cap-12) | S21, V-03 | - **VC12-02 — JSON dialog keyboard shell.** S21/UI-003; modal/detail pattern. Inspected JSON and invalid JSON frames; actual focus wrap, Escape/return and second target prove the shared Modal path. Owners JsonCellExplorer/Modal/jsonCell; component suite 6 passes. **ALREADY_CONVERGED**, high confidence for this standalone dialog; compare existing V-03 custom connection shells and CAP-02 delete focus, without duplicating those findings or claiming nested-modal ownership solved. Keep formatted JSON content and inline Copy feedback distinct from log/span side panels. |
| VC12-03 | [CAP-12](#cap-12) | R02, R04 | - **VC12-03 — native resize changes sort target.** R04/R02; table header pointer/click boundary. Inspected filtered frame has value ▲; resized frame has name ▲. Native drag changes first column 775.8125→655.8125 px and unexpectedly activates name sort. **CONFIRMED_DEFECT in this Electron fixture**, high confidence observed pixels/gesture; root-cause attribution medium pending native event tracing. Owners ResultsTable startColumnResize/resizeColumn/finishColumnResize and header onClick. Existing virtualization test passes because fireEvent.pointerDown/move/up does not reproduce browser-synthesized click. Impact: resizing can reorder displayed/exported data. Follow-up should reproduce ordinary native drag/click target handling and assert unchanged sort while preserving clamps/virtualization. No fix in this audit. Additional explicit before/after header measurements added for the final-head rerun. |
| VC12-04 | [CAP-12](#cap-12) | R01, S21 | - **VC12-04 — glyph availability remains unverified across hosts.** R01/S21; typed display vs JSON detail. Both typed/JSON full-size frames show boxes for 雪 and the null marker while exact clipboard/CSV text preserves Unicode. **NEEDS_VERIFICATION**, high confidence runner rendering observation, low confidence product defect; likely host font coverage is an inference. Owners shared font stack/runner fonts plus ResultsTable.renderCell/JsonCellExplorer; compare a supported desktop host before any product/font change. No production rendering fix or silent ASCII substitution. |
| VC13-01 | [CAP-13](#cap-13) | R19, S19, V-03 | - **VC13-01 — CONFIRMED_DEFECT, menu keyboard focus return.** S19/R19/UI-001; filtering/overlay focus. Inspected non-null/null menu and local-filter frames above; native focus trace summary→action→Escape→BODY. Expected dismissal keeps a reachable initiating focus target; actual focus position lost. Owners CellFilterMenu.tsx native details Escape handler, ResultsTable.tsx; controlled UI tests cover action callbacks but not browser focus. High confidence, medium accessibility priority. Compare V-03 custom-dialog and VC12-02 JSON Modal focus policy; distinct menu owner, not a duplicate resize defect. Follow-up: reproduce native keyboard and focus originating summary on dismissal; production fix deferred. |
| VC13-02 | [CAP-13](#cap-13) | R19, R20, S18, S19, UX-16 | - **VC13-02 — INTENTIONAL_DIFFERENCE, local scope versus SQL scope.** S18/S19/R19/R20; filter chips/execution. Compare inspected local vs query-filter PNGs. Expected local changes avoid execution; query-owned predicates change generated SQL. Observed 0 versus 1 query on promotion, exact SQL/params, raw-mode restrictions and actual demotion. Owners ResultExplorer, shared chips, resultFilters, BuilderPanel executionKey effect; named resultFilters and builderPromotedFilters tests. High confidence synthetic renderer, low provider acceptance; medium semantic importance. Cross-reference UX-16 and CAP-11; retain datasource and mode adapters, no universal filter execution rule. |
| VC13-03 | [CAP-13](#cap-13) | V-10 | - **VC13-03 — NEEDS_VERIFICATION, disclosure light-dismiss.** UI-001; nonvisual native outside-click trace leaves details open, unlike previously reviewed Popover selectors (V-10). Source has no outside-click listener; expected product policy is not yet established. Low priority/medium confidence policy lead, not a second confirmed defect. Reuse same menu frames and owners; verify intended disclosure behavior before changing it. |
| VC14-01 | [CAP-14](#cap-14) | C06, S22, S23, V-11, V-12 | - **VC14-01 — INTENTIONAL_DIFFERENCE, estimates versus measurements.** S22/S23/C06; plan/feedback pattern. Compare inspected explain and analyze PNGs: same selected 0.1 node and graph owner, planner cost/estimated rows versus actual rows/node time and execution summary. Expected contract preserves mode identity and captured query. Measured false/true flags, busy text and 0 ordinary Runs above. Owners QueryEditor, ExplainPane, ExecutionPlanGraph/Model, PlanNodeInspector; named QueryEditor/ExplainPane/model tests. High confidence synthetic renderer; medium importance. Reuse V-11/V-12; keep PG capability and timing semantics distinct, no cross-provider plan parity demand. |
| VC14-02 | [CAP-14](#cap-14) | S22, S23, V-06 | - **VC14-02 — NEEDS_VERIFICATION, Explain failure feedback presentation.** S22/S23; error/retained-result pattern. Inspected error frame replaces graph with ordinary Text plan reference containing failure text, without a role=alert in ExplainPane; earlier result errors in V-06 use inline alert. Native failure/old-tree removal observed, source ownership ExplainPane + QueryEditor; expected alert/disclosure policy needs product/accessibility review. Medium confidence policy lead, low/medium priority, not a confirmed defect. Compare V-06 without imposing result-table retention rules on plans. |
| VC15-01 | [CAP-15](#cap-15) | S24, S25, X03, X04, UX-19, V-12 | - **VC15-01 — ALREADY_CONVERGED, explicit review versus execution.** S24/S25/X03/X04; AI review/feedback. Compare inspected ordinary query/repair proposal frames and new stale/retry-error frames. Expected original SQL stays authoritative until explicit Apply, and Apply never Run. Observed exact query preservation, disabled stale Apply, retained prior repair diff, Cancel/Reject and zero implicit Runs above. Owners copilot/repair hooks and provider, AiQueryDiff/AiContextPopover; named Ai/QueryEditor tests. High confidence synthetic PG renderer; medium importance. Cross-reference V-12/UX-19; leave shared diff/context primitives and separate grounded workflows intact. |
| VC15-02 | [CAP-15](#cap-15) | S24, X03, V-12 | - **VC15-02 — INTENTIONAL_DIFFERENCE, raw SQL proposal versus Builder control patch.** S24/X03 with CAP-11; editor/Builder AI pattern. Inspected ordinary ai-query-proposal.png and ai-builder-proposal.png show SQL diff/current SQL versus structured X/Y/aggregation review/current Builder context. Existing ordinary capture asserts Builder Apply is atomic and does not run; named Builder AI tests cover reject/stale/unsupported responses. Separate useAiQueryCopilot/useAiBuilderCopilot validation and state owners are justified; shared presentation/duplicated composer JSX remains the already-recorded V-12 future composition lead, not a new duplication finding. High source/test confidence, native Builder sequence not newly run in CAP-15; keep semantic adapters, no universal AI controller. |
| VC16-01 | [CAP-16](#cap-16) | P06, P09 | - **VC16-01 — INTENTIONAL_DIFFERENCE, classic/native histogram intent.** P06–P09; compare inspected classic/native PNGs at source SHA/artifact above. Classic requires le aggregation; native omits le and offers Observation rate/Average/Sum of observations. Exact query cases and control ownership above; high confidence synthetic renderer, live provider unverified. Compare SQL CAP-11 aggregation while preserving PromQL weighting; do not unify generators. |
| VC16-02 | [CAP-16](#cap-16) | P04, P05, S17, V-08 | - **VC16-02 — ALREADY_CONVERGED, generated-query handoff.** P04/P05 with S17/CAP-10. Same GeneratedQueryPanel disclosure/Copy/Open shell; explicit handoff preserves raw draft until invoked and executes zero queries. Four frames above versus cap10-generated-sql-desktop.png; owner shared panel with separate language adapters. High interaction/source confidence, OS clipboard/native keyboard unverified. V-08 raw Copy accessible label remains a separate confirmed finding. |
| VC16-03 | [CAP-16](#cap-16) | P07, P08, V-10 | - **VC16-03 — INTENTIONAL_DIFFERENCE, unknown-type guard.** P07/P08; inspected unknown frame versus resolved native frame. Auto cannot generate histogram PromQL and Run is disabled; representation choice is explicit user intent, not verified metadata. Panel warning/validation and generator own guard; high bounded-fixture confidence, unknown real provider behavior unverified. Retain distinction from generic selector loading/error presentation V-10. |
| VC17-01 | [CAP-17](#cap-17) | P11, P13, V-10 | - **VC17-01 — ALREADY_CONVERGED shell, INTENTIONAL_DIFFERENCE semantics.** P11–P13; selector/multi-selection pattern. Inspected labels/search PNGs at provenance above versus V-10 compare-selectors and CAP-11 fields. Common FieldChrome/MultiCombobox search/check/chip shell; independent grouping/filter dimensions share label value state and produce exact matcher versus grouping semantics. Owners/tests above. High bounded-renderer confidence, medium usability importance; preserve generator/provider adapters and do not create independent duplicate value pickers. Full native keyboard and live metadata gaps remain. |
| VC17-02 | [CAP-17](#cap-17) | P10, P14, P15 | - **VC17-02 — INTENTIONAL_DIFFERENCE, calculation window versus fetch range/resolution.** P10/P14/P15; compare inspected labels (10m window), invalid range and resolution-guard frames with CAP-11 time bucket/range frame. Shared TimeRangeField does not imply shared query transport: fixed UTC bounds, rolling execution-time endpoints, Auto step and manual budget measured above. QueryEditor/prometheus time helpers own request; SQL time predicates/buckets have different owners. High synthetic interaction/source confidence, no live-provider or local presentation-refetch inference. Keep distinct controls/adapters; no newly confirmed product defect. |
| VC18-01 | [CAP-18](#cap-18) | L03, L05, L07, L08 | &#124; VC18-01 &#124; L03/L05/L07/L08; fields/selectors &#124; **Already converged** shared search/options/chips/field shell &#124; Canonical Loki and Prometheus selector PNGs inspected; FieldChrome, MultiCombobox, Popover, BuilderRow/FormField &#124; Low remediation value; high bounded visual/source confidence &#124; E3 canonical selectors + composition/level-group; source34753c0 &#124; Keep primitives and source-owned resource policies; no universal Builder &#124; |
| VC18-02 | [CAP-18](#cap-18) | L07, L08 | &#124; VC18-02 &#124; L07/L08; Level versus grouping &#124; **Intentional difference**: independent Level ERROR/WARN and grouping Level/environment; changing either retains the other &#124; LokiBuilderPanel/LokiExplorer/buildLokiTrendExpressions versus PromqlBuilderPanel/promqlBuilder &#124; High regression impact; high native/test confidence &#124; level-group, source34753c0; real volume/cardinality provider UV &#124; Preserve #385 and distinct count_over_time semantics &#124; |
| VC18-03 | [CAP-18](#cap-18) | L05, L06, L09, L10 | &#124; VC18-03 &#124; L05/L06/L09/L10; representability/validation &#124; **Unverified** product intent, with native-observed representability difference: saved label operators are preserved/disclosed; editing single Line contains replaces a restored multi-filter array. Field identifiers/parser syntax fail locally; regex semantic compilation remains provider-owned &#124; LokiBuilderPanel versus buildLokiQuery/logqlResultKind; SQL typed predicates and PromQL are different contracts &#124; Medium UX impact; high synthetic native/source confidence, product intent of restored-line edit unresolved &#124; composition/parser-field/invalid, source34753c0; restored pipeline transition is measured behavior without a sixth PNG &#124; Decide whether restored multi-line editing needs clearer disclosure; do not remove domain validation or invent shared predicate semantics &#124; |
| VC18-04 | [CAP-18](#cap-18) | L02, UX-05 | &#124; VC18-04 &#124; L02; async raw formatting &#124; **Confirmed inherited defect UX-05**: two preserved expected-failure tests reproduce late formatter replacing newer/other-tab draft. Normal successful/failing format/copy additionally passes natively &#124; LokiExplorer raw format versus generated revision guard and QueryEditor applyFormattedQuery &#124; High correctness impact/confidence &#124; Canonical raw34753c0 establishes shell, not race pixels; existing tests establish race &#124; Keep prior recommendation for bounded caller ownership fix; not implemented here &#124; |
| VC18-05 | [CAP-18](#cap-18) | L11 | &#124; VC18-05 &#124; L11; range/retrieval limit &#124; **Intentional difference**: shared picker but Loki request bounds/limit; committed range refreshes after earlier Run, limit changes alone do not fetch &#124; TimeRangeField/prometheusRangeBounds; LokiExplorer/GcxLokiTransport versus SQL predicates/row limit &#124; Medium request impact; high native/source confidence &#124; time-limit, source34753c0; synthetic transport only &#124; Preserve adapters; fractional/restored-limit follow-up if required; no common SQL-limit assumption &#124; |
| VC19-01 | [CAP-19](#cap-19) | L18, X10, V-07 | - **VC19-01 — CONFIRMED_DEFECT, inherited V-07 (L18/X10; clipboard/feedback).** Actual synthetic rejected raw-copy promise causes a captured unhandled rejection and no status/error notification; successful message/raw/field/trace/span payloads are exact, and no query or selection change occurs. Owners LogResultExplorer direct clipboard calls versus CopySqlButton/clipboardText/NotificationArea. Evidence copy-scroll PNG, behavior.copy-scroll, prior V-07. **Impact:** medium/high (silent failure); **confidence:** high native synthetic, OS clipboard acceptance UV. Future direction: bounded reuse of existing copy outcome handling and negative/retry tests, after audit. |
| VC19-02 | [CAP-19](#cap-19) | L16 | - **VC19-02 — CONFIRMED_DEFECT (L16; inspectability of nested values).** Source String(value) reduces nested structured metadata/parsed objects to [object Object]; observed in inspector, field-filter and copy-scroll PNGs. Long multiline message remains complete and inspectable. **Owner:** LogResultExplorer.fields. **Impact:** medium when nested values occur; **confidence:** high renderer screenshot/source. Future direction: product-approved structured value disclosure and correct copy payload, borrowing only proven structured-value patterns; do not invent a universal inspector. |
| VC19-03 | [CAP-19](#cap-19) | L09, L13, L14, L17, V-07 | - **VC19-03 — INTENTIONAL_DIFFERENCE (L13/L14/L17; search/filter scope).** Local in-memory text search vs query-level indexed severity and inspector promotion have different contracts. Native requests prove one explicit Run, no dispatch when selecting Level, searching, or clicking inspector include/exclude. **Owners:** LogResultExplorer vs LokiExplorer/LokiBuilderPanel; compare CAP-18/L09 and V-07 filter semantics. **Impact:** important for user comprehension; **confidence:** high. Future direction: clarify scope in UI if user research warrants, preserve semantic ownership and safe expression generation. |
| VC19-04 | [CAP-19](#cap-19) | L15, L16, V-09 | - **VC19-04 — ALREADY_CONVERGED shell, INTENTIONAL_DIFFERENCE in inspector content (L15/L16; V-09).** Real 420→444px resize, selected log identity, close/reopen and search reconciliation use shared ResizableDetailPanel already employed by patterns; Tempo has different navigation/detail workflow. **Evidence:** inspector/copy PNGs and behavior.close-reopen-search-reconciliation, existing shared panel tests. **Impact:** low reuse pressure; **confidence:** high synthetic renderer. Future direction: retain shared mechanical shell and provider-specific content; no universal inspector. |
| VC19-05 | [CAP-19](#cap-19) | L12, L15, V-01 | - **VC19-05 — UNVERIFIED future component convergence (L12/L15; V-01/#405).** Current Loki virtual rows visually preserve 42px density, truncation and bounded scrolled DOM; prior V-01 comparison established 42/58/68px log/pattern/trace difference. **Owner:** LogResultExplorer virtualizer vs separate pattern and trace callers. **Impact:** medium potential cross-surface consistency; **confidence:** high current-log evidence, insufficient fresh parallel comparator to approve extraction. Future direction: revisit single composable row shell only with cross-caller acceptance; no production refactor proposed here. |
| VC20-01 | [CAP-20](#cap-20) | L12, L15, L19, L20, V-01 | &#124; **VC20-01** &#124; L19/L20, comparator L12/L15 &#124; **UNNECESSARY_DIFFERENCE** in duplicated openable-row shell per V-01; count/percentage leading slot is intentional &#124; Pattern row has count/percent first, shared severity badge + chevron, separate virtual-row CSS from `LogResultExplorer` &#124; Medium visual/density impact, high confidence with new native screenshot and legacy V-01 comparison; no shared refactor in audit; preserve domain-specific metric slot, do not conflate with generic log rows &#124; |
| VC20-02 | [CAP-20](#cap-20) | L15, L20 | &#124; **VC20-02** &#124; L20/L15 &#124; **ALREADY_CONVERGED** shared width/keyboard-resize primitive, domain details intentionally differ &#124; Both log and pattern inspectors import `ResizableDetailPanel`; patterns add **View logs**, template and examples &#124; Low duplication risk, strong source/test confidence; preserve shared primitive, audit usable narrow widths before redesign &#124; |
| VC20-03 | [CAP-20](#cap-20) | L17, L21 | &#124; **VC20-03** &#124; L21/L17 &#124; **INTENTIONAL_DIFFERENCE** conditional promotion versus explicit local scope &#124; `LokiExplorer.viewPatternLogs`, `derivePatternLineContainsCandidate` and `resultFilter`; a generic filter abstraction would risk query semantics &#124; High query safety impact, strong existing UI-test/source evidence; preserve guard against saved multi/non-`&#124;=` filters; native CAP-20 confirmation complete; retain scope/provenance safeguards &#124; |
| VC20-04 | [CAP-20](#cap-20) | L19, L21 | &#124; **VC20-04** &#124; L19–L21 &#124; **ALREADY_CONVERGED** for stale-selection cleanup and explicit loaded-empty/error distinction in scoped runtime &#124; `LogPatternExplorer` selection reset, `LokiExplorer` result updates/error handling &#124; Medium UX relevance, high scoped runtime confidence; the earlier empty content remains visible after failure but a distinct role=alert and queryError make the failure explicit. No UX change proposed. &#124; |
| VC21-01 | [CAP-21](#cap-21) | Not explicit in declaration; consult source | - **VC21-01 — Confirmed raw editor height failure (high visual confidence):** rendered raw LogQL editor 1192×26.1875 despite a query body hundreds of pixels tall. The parent occupies its pane; the CodeMirror/editor child fails to fill height. Compare shared raw query shell behavior before selecting a minimal caller/layout correction. Preserve native scrolling, splitters and Builder mode. No production fix in CAP-21. |
| VC21-02 | [CAP-21](#cap-21) | Not explicit in declaration; consult source | - **VC21-02 — Unsent raw draft may trigger independent trend requests (BV observation; product-policy decision):** switching view while raw edited text was not Run caused **2 optional calls** (probe + trend) for **{service_name="cap21-raw"} &#124;= "needle"**, with **0 primary reruns**. Avoid assuming the volume belongs to the durable primary logs; determine desired source/revision ownership before treating this as a defect. Existing tests show this behavior, but user-facing consequences require targeted acceptance. |
| VC21-03 | [CAP-21](#cap-21) | Not explicit in declaration; consult source | - **VC21-03 — Strong existing shared view shell (convergence candidate / preserve):** Line, Area, Bar, Table, chart legend and local filter share result infrastructure without redundant settled queries; avoid extracting another controller or erasing intentional List/Patterns distinctions. |
| VC21-04 | [CAP-21](#cap-21) | Not explicit in declaration; consult source | - **VC21-04 — Time/handoff test coverage gap (UV):** add future focused native tests for rolling range change with both primary+trend interval, Grafana now-relative URL and domain mapping; do not assert verified based solely on helper code. |
| VC22-01 | [CAP-22](#cap-22) | T03, T05, T06, V-10 | &#124; VC22-01 &#124; T03/T05/T06 &#124; `ALREADY_CONVERGED` (source + inspected Electron) &#124; Shared FieldChrome/Combobox, BuilderForm/Row/Field, GeneratedQueryPanel; UX V-10 and `TraceBuilderPanel` &#124; Shared fields are legible and conform to V-10 in all five frames; high confidence &#124; |
| VC22-02 | [CAP-22](#cap-22) | T03, T05 | &#124; VC22-02 &#124; T05/T03 &#124; `ALREADY_CONVERGED` (native form validation) &#124; `traceBuilder.buildTraceql` omits invalid duration, `TraceExplorer.submitSearch` checks metadata refresh but not minDuration validity &#124; Although the generator omits negative duration, HTML native `min=0` validation blocks Run: zero query requests. Other invalid state entry paths remain untested; do not call this confirmed defect &#124; |
| VC22-03 | [CAP-22](#cap-22) | T06, T07, T08, V-10 | &#124; VC22-03 &#124; T06/T07/T08 &#124; `INTENTIONAL_DIFFERENCE` (inspected Electron) &#124; Protocol-specific controls/query generation in `TraceBuilderPanel` / `traceBuilder`; V-10 shared controls &#124; Keep Tempo-specific semantics for HTTP/RPC while reusing shared field chrome; high confidence based on screenshots and query assertions &#124; |
| VC22-04 | [CAP-22](#cap-22) | T03, T06 | &#124; VC22-04 &#124; T03/T06 &#124; `UNVERIFIED` &#124; `TraceExplorer` metadata effects and revision; deterministic store injection only &#124; Real slow/failed refresh and stale response arbitration requires separate provider-controlled interaction; medium priority, low runtime confidence &#124; |
| VC22-05 | [CAP-22](#cap-22) | T06, T07, T08 | &#124; VC22-05 &#124; T06/T07/T08 &#124; `UNVERIFIED` (product policy) &#124; Switching HTTP → RPC retains a manually chosen generic `span.http.status_code > 499` filter and HTTP-looking span name; `TraceBuilderPanel.advancedFilters` / `traceBuilder.buildTraceql` &#124; Visible in RPC screenshot and dispatched RPC TraceQL. Could be surprising/conflicting, but advanced filters are deliberately independent of protocol; do not auto-clear without a product contract. Medium impact, high confidence in observation &#124; |
| VC23-01 | [CAP-23](#cap-23) | T13 | &#124; **VC23-01** &#124; T13, Tempo query toolbar sample/time presentation; all five original screenshots &#124; **CONFIRMED_VISUAL_DEFECT** for truncated sample-size label at 1440px; range summary also truncated &#124; Low–medium UX impact; high visual confidence. Compare responsive `QueryToolbar`/`TraceExplorer.module.css` sizing with other source toolbars. Preserve value semantics and per-profile persistence; possible bounded label-width/tooltip alignment later. &#124; |
| VC23-02 | [CAP-23](#cap-23) | T09, T10, T11, V-10 | &#124; **VC23-02** &#124; T09/T10/T11, Builder detail/advanced chrome; messaging/database/comparator images; comparison to CAP-22 and existing V-10 &#124; **ALREADY_CONVERGED** shell, **INTENTIONAL_DIFFERENCE** in datasource predicates &#124; High source/runtime confidence. Reuse shared form/combobox/GeneratedQueryPanel chrome; keep Tempo key aliases and protocol-specific values in `traceBuilder`. &#124; |
| VC23-03 | [CAP-23](#cap-23) | T09, T10 | &#124; **VC23-03** &#124; T09/T10, saved inactive protocol drafts; messaging/database images and state observations &#124; **INTENTIONAL_DIFFERENCE**, pending product confirmation about stale *generic* facets &#124; High verified state confidence. Inactive messaging/DB fields persist but do not generate wrong-protocol predicates. Do not blanket-clear on switch or conflate protocol drafts with independent advanced attributes. &#124; |
| VC23-04 | [CAP-23](#cap-23) | T11 | &#124; **VC23-04** &#124; T11, advanced facet chip/collapsible density; comparator image &#124; **NEEDS_VERIFICATION** for readability/long attribute labels, not a proven query defect &#124; Medium visual confidence; inspect alongside CAP-22 and narrow windows, accessible full labels and keyboard focus before proposing a style change. &#124; |
| VC23-05 | [CAP-23](#cap-23) | T09, T11, T13 | &#124; **VC23-05** &#124; T09/T11/T13, empty metadata vs transient stale/loading/error and after-result sampling; no image for unexecuted branches &#124; **NEEDS_VERIFICATION**; no false cross-datasource parity claim &#124; Medium to high behavior impact, low new runtime confidence. Keep isolated Tempo async and sampling rules; add deterministic Electron edge coverage before reporting fully converged recovery policy. &#124; |
| VC24-01 | [CAP-24](#cap-24) | T16, V-01 | &#124; **VC24-01** &#124; `UNNECESSARY_DIFFERENCE` (bounded chrome only) &#124; **V-01**, T16 vs Loki log list; `TraceSearchList`, `LogResultExplorer`; current trace default screenshot and the existing `compare-lists.png` in the artifact &#124; Medium maintenance and density consistency, medium confidence: openable row focus/selection shell remains distinct. Status dots versus severity badges, duration/operation versus log text are **intentional domain differences**; only converge common accessible row chrome after cross-source review. &#124; |
| VC24-02 | [CAP-24](#cap-24) | T15, T17, V-06 | &#124; **VC24-02** &#124; `INTENTIONAL_DIFFERENCE` &#124; **V-06**, T15/T17; `TraceSearchResults`, Tempo progress controller; partial screenshot and exact disabled-state assertions &#124; High confidence, moderate usability relevance: Tempo retains a partially populated cohort and keeps List/Scatter selectable while row open and Service map are disabled. Do not impose blanket loading-disabled policy or drop progressive provenance. &#124; |
| VC24-03 | [CAP-24](#cap-24) | T18, V-06 | &#124; **VC24-03** &#124; `CONFIRMED_DEFECT` &#124; **V-06**, T18; `TraceScatterChart.traceScatterLocalRange`, `TraceExplorer` and result-range chip formatting; native brush screenshot + measured DOM boundary replacement &#124; **High impact on exact boundary predictability, high confidence**. Fractional brush bounds disagree with whole-millisecond displayed chip; `...0201` excluded at shown start, `...0202` included at shown end. Future isolated fix should normalize/filter/display bounds to the same precision or present actual representable boundaries; retain half-open semantics and add exact native edge regression. No production fix in this PR. &#124; |
| VC24-04 | [CAP-24](#cap-24) | T17, T18, V-06 | &#124; **VC24-04** &#124; `ALREADY_CONVERGED` &#124; **V-06**, T17/T18; shared `ResultFilterBar`, `TraceExplorer` local filter; scatter screenshot and request count 5 → 5 &#124; High confidence: consistent chip removal and List/Scatter cohort switching; leave the existing shared result-filter shell in place, fix only the precision contract. &#124; |
| VC24-05 | [CAP-24](#cap-24) | T15, T16, V-06 | &#124; **VC24-05** &#124; `UNVERIFIED` &#124; **V-06**, T15/T16; failure/empty states, progressive controller; completed empty screenshot and native error assertions &#124; Medium confidence limitation: empty completed search uses guidance resembling first-run copy. Product-intended distinction from never-run, interrupted progress and stale completion ownership require a separate native scenario; do not classify as a confirmed defect from this five-image run. &#124; |
| VC25-01 | [CAP-25](#cap-25) | T20, T23, V-09 | &#124; **VC25-01** &#124; T20/T23, TraceOpenedResult/SpanInspector, V-09 &#124; **INTENTIONAL_DIFFERENCE** &#124; Tempo's fixed waterfall/inspector grid vs Loki's shared resizable detail shell. High source/native-image confidence, medium layout impact; retain trace-specific timeline, converge selection/close semantics where useful. &#124; |
| VC25-02 | [CAP-25](#cap-25) | T20, T21, T23 | &#124; **VC25-02** &#124; T20/T21/T23, hierarchy/inspector &#124; **ALREADY_CONVERGED** &#124; Accurate row selection, inspector identity, close/reopen, hidden-kind reconciliation in tested interactions; high runtime confidence. Add trace-switch regression before broad claims. &#124; |
| VC25-03 | [CAP-25](#cap-25) | T19 | &#124; **VC25-03** &#124; T19, useTraceCohortAnalysis &#124; **INTENTIONAL_DIFFERENCE** &#124; A service map requires new full-trace detail requests unlike pure local result charts. Exact 3→2 lookups and no toggle refetch proved; high runtime confidence. Keep progress/request behavior explicit. &#124; |
| VC25-04 | [CAP-25](#cap-25) | T19, T24 | &#124; **VC25-04** &#124; T19/T24, local time brush and handoff &#124; **UNVERIFIED** &#124; In-flight locally brushed interval, stale async graph, and trace/span-specific deep links not exercised; potentially high cohort-identity impact. Add focused runtime scenarios, preserve query-level handoff distinction. &#124; |
| VC25-05 | [CAP-25](#cap-25) | T20, T23 | &#124; **VC25-05** &#124; T20/T23, trace lifecycle/keyboard &#124; **UNVERIFIED** &#124; Root-only D and unavailable trace-detail were fixture-defined but not opened, switching trace with inspector and keyboard not independently tested; medium impact. Add explicit isolated edge coverage. &#124; |
| VC25-06 | [CAP-25](#cap-25) | T19, T24 | &#124; **VC25-06** &#124; T19/T24 toolbar, see VC23-01 &#124; **CONFIRMED_DEFECT** (existing, not new) &#124; Native filtered map screenshot shows truncated sample-size toolbar value (“10…”); low–medium UX impact, high visual confidence; deduplicate with VC23-01 in future Atlas, address toolbar sizing/accessibility later. &#124; |
| VC26-01 | [CAP-26](#cap-26) | R10 | &#124; **R10** — Scatter &#124; **VV** &#124; **BV**, **defects** &#124; PG numeric X/Y mapping via real Combobox and populated screenshot; see **VC26-01** (fabricated zero marks) and **VC26-02** (categorical positioning of numeric X). Exact valid scatter mark contract **not accepted**. PM numeric Scatter and separate Tempo trace scatter UV/out of this baseline. &#124; |
| VC26-02 | [CAP-26](#cap-26) | R10 | &#124; **R10** — Scatter &#124; **VV** &#124; **BV**, **defects** &#124; PG numeric X/Y mapping via real Combobox and populated screenshot; see **VC26-01** (fabricated zero marks) and **VC26-02** (categorical positioning of numeric X). Exact valid scatter mark contract **not accepted**. PM numeric Scatter and separate Tempo trace scatter UV/out of this baseline. &#124; |
| VC26-03 | [CAP-26](#cap-26) | P16, R07, R15 | &#124; **VC26-03 — ALREADY_CONVERGED** &#124; Both PG and PM screenshots share `ChartPicker`, `GenericResultExplorer`, X/Y/Series controls, view state, chart action toolbar, and legend presentation. **P16, R07–R15**. &#124; **Medium impact, high confidence** for inspected shell. Preserve shared component ownership; do not forcibly homogenize provider-specific data contracts. &#124; |
| VC26-04 | [CAP-26](#cap-26) | P16, R08, R13, R15 | &#124; **VC26-04 — INTENTIONAL_DIFFERENCE** &#124; PG uses result-derived SQL columns/series; PM uses label-derived metric series and a requested time-domain bound with resolution. `QueryEditor`, `ResultExplorer` time-domain adapter. **P16, R08, R13, R15**. &#124; **Medium impact, high confidence.** Preserve provider-specific semantics within the shared chart presentation. &#124; |
| VC26-05 | [CAP-26](#cap-26) | R11, R14 | &#124; **VC26-05 — UNVERIFIED** &#124; Treemap breadcrumb shows `North > API` while all four child rectangles remain visible; no breadcrumb interaction or selection was performed. `chartPresentation` Treemap option and ECharts renderer. **R11, R14**. &#124; **Low–medium impact, low confidence.** Reproduce via an intentional breadcrumb/node click before deciding whether this is a defect or default ECharts behavior. &#124; |
| VC27-01 | [CAP-27](#cap-27) | R16, R17, UX-15 | &#124; **VC27-01 ALREADY_CONVERGED** &#124; **R16/R17**, shared GenericResultExplorer / ChartLegend / chartVisibility / chartPresentation for SQL4, PM, LK. Three accepted PG frames plus actual canvas hidden/isolated pixels, prior ChartLegend regression tests and Phase 1A UX-15. PM/LK direct runtime **UV**. &#124; Low duplication need; **high** shared source and PG confidence, **medium** cross-provider parity. &#124; Preserve shared legend; when scheduled, compare per-provider runtime with distinct adapter data; do not fork legend. &#124; |
| VC27-02 | [CAP-27](#cap-27) | A25, R17, UX-14 | &#124; **VC27-02 INTENTIONAL_DIFFERENCE** &#124; **R17 / A25**, right legend reserves minimum plot width and has different clamp/persistence ownership from ResizableDetailPanel and global workspace splitter (Phase 1A UX-14). Actual keyboard 200→224→200 and plot 928→904→928. &#124; Geometry impact medium; source confidence high, boundary runtime confidence medium. &#124; Retain geometry policies; consider sharing only low-level pointer mechanics later, not during audit. &#124; |
| VC27-03 | [CAP-27](#cap-27) | R18 | &#124; **VC27-03 UNVERIFIED** &#124; **R18**, visual fourth screenshot shows a single selected 16:20 point but a broad auto-generated temporal X-domain extending into adjacent days. Correct chips/tooltip and 1-of-18 scope confirmed; whether time-axis span violates a product contract **unverified**. &#124; Potential clarity issue medium; **high** screenshot confidence, **low** defect classification confidence. &#124; Agree on one-point temporal domain semantics; add targeted test; consider bounded local fallback if warranted, without a provider query. Do not assert confirmed defect yet. &#124; |
| VC27-04 | [CAP-27](#cap-27) | R16, R17, R18 | &#124; **VC27-04 UNVERIFIED** &#124; **R16/R17/R18**, shared generic chart but PM/LK and other SQL adapters not exercised in CAP-27; prior source/tests exist, no directly equivalent per-provider visual/runtime evidence. &#124; Medium potential parity impact; high confidence in gap. &#124; Targeted provider-specific synthetic scenarios later; preserve intentional time/series semantics rather than asserting all providers identical. &#124; |
| VC28-01 | [CAP-28](#cap-28) | R21, X08 | &#124; VC28-01 — ALREADY_CONVERGED &#124; R21/X08; GenericResultExplorer → useChartExport → chartImage. Ready/export frames, actual 2440×830 PNG, save failure and zero-query checks &#124; Medium, high confidence for tested PG save boundary. Preserve shared capture/legend ownership; verify native copy/save and long legends separately &#124; |
| VC28-02 | [CAP-28](#cap-28) | R22, R23, X05 | &#124; VC28-02 — ALREADY_CONVERGED &#124; R22/R23/X05; useChartAnomalyAnalysis, chartAnomalyMapping, chartPresentation, details popover. Exact point/ring/control pixels, details/toggle and delayed revision invalidation &#124; High semantic importance, high fixture confidence. Preserve bounded sample and context/request ownership; add native multi-finding/sample-limit and successful revised-analysis cases later &#124; |
| VC28-03 | [CAP-28](#cap-28) | R22, R25, X05 | &#124; VC28-03 — INTENTIONAL_DIFFERENCE &#124; R25 with R22/X05; generic SQL alert vs AI-specific error. Query failure has Run/Fix with AI and disables export; AI-only failure leaves SQL queryError null &#124; Medium, high behavioral confidence; AI-error visual frame UV. Preserve operation-specific recovery and data ownership, not a universal error controller &#124; |
| VC28-04 | [CAP-28](#cap-28) | R24, R25, V-06 | &#124; VC28-04 — UNVERIFIED &#124; R24/R25/UI-004; V-06 retained-result policy. Error frame retains revision 4 without explicit last-success label; queryResultLifecycle/GenericResultExplorer own behavior &#124; Medium/high clarity importance; high observation confidence, policy/defect classification unresolved. Decide explicit prior-result labeling and compare Table/chart before Phase 2 &#124; |
| VC28-05 | [CAP-28](#cap-28) | R21, R25, X08 | &#124; VC28-05 — UNVERIFIED &#124; R21/X08/R25; useChartExport inline feedback. Success text near bottom edge; cancel preserves previous save-error message immediately &#124; Low/medium, high observation but insufficient containment/policy evidence. Measure toast/ancestor bounds and test cancellation after previous outcomes; do not claim a confirmed clipping defect from this frame alone &#124; |
| VC29-01 | [CAP-29](#cap-29) | V-02 | &#124; First/second nested Escape &#124; VV: third image has no dialog/popover and focuses Settings &#124; BV: twice, first Escape removes both; second does nothing &#124; **FAIL**, VC29-01 / existing V-02 &#124; |
| VC29-03 | [CAP-29](#cap-29) | Not explicit in declaration; consult source | &#124; Save error/focus &#124; UV visual state &#124; BV: exactly one specific alert, parent/draft retained; active element BODY after busy Save &#124; Focus acceptance **FAIL in observed synthetic invocation**, VC29-03; retry remains possible &#124; |
| VC29-02 | [CAP-29](#cap-29) | Not explicit in declaration; consult source | ### VC29-02 — UNVERIFIED, automatic nested focus under native opening<br><br>- Scope **X01**; owners `Combobox` open/search-ref effect and portaled `Popover` mount timing.<br>- Evidence: `nested-open-0/1` records parent dialog active, not child search, after programmatic control activation. `nested-search-native-focus-*` proves explicit native pointer can focus Search Model; subsequent navigation succeeds. Options screenshot is after this explicit pointer, not proof of automatic focus.<br>- Expected appropriate child focus on keyboard/native opening is **not certified**; no silent PASS. Impact medium; high confidence recorded focus, limited confidence this represents a normal native trigger opening.<br>- Future direction: reproduce native mouse and Enter/ArrowDown opening separately before classifying a general product defect; preserve this qualified observation. No extra screenshot required to investigate focus. |
| VC29-04 | [CAP-29](#cap-29) | Not explicit in declaration; consult source | ### VC29-04 — ALREADY_CONVERGED, shared modal and selector chrome<br><br>- Scope **X01**; owners shared `Modal`, `FieldChrome`, `Combobox`, `Popover` and Settings content CSS.<br>- Evidence: all three new PNGs, positive target/stacking assertions, canonical Settings/Loki comparison frames and V-03. The 900px Settings versus 520px connection form width is legitimate content sizing; broad custom/shared backdrop/keyboard differences remain existing V-03.<br>- Observed common field/search/selected-check presentation and readable desktop framing; no new competing selector shell. **Product visual acceptance PASS for inspected desktop states**, while VC29-01 keyboard composition fails separately.<br>- Impact low maintenance; confidence high within these frames. Retain shared primitives and source-specific settings content; do not infer full accessibility convergence from common chrome.<br><br>## H. CI, acceptance and limits<br><br>- **Visual Preview 38814864167: SUCCESS**, both capture and publish. Canonical audit and all existing standalone modules also passed without changes.<br>- **CI 38814864181:** Unit tests, UI tests, Production build and DuckDB macOS runtime/package **success**. Quality **fails Check formatting**; subsequent lint/CSS/typecheck steps are skipped, not passed. The current inspected Quality log (116696873770 at f1ca5d6) lists 30 inherited files and no CAP-29 module; no inherited file was changed to repair formatting.<br>- **Documentation 38814864185: SUCCESS**, deployment skipped as expected for PR.<br>- Relevant existing UI suites passed: `Ai.test.tsx` 58, `Combobox.test.tsx` 14, `Popover.test.tsx` 8; UI run at prior scenario 7370ed4 logged 989 passes and 6 preserved expected failures. Current named suite execution is supported by the successful UI job, not a claim all focus composition was previously tested.<br>- Local node syntax check passed. Existing standalone loader/evidence/failure tests: **11 passed**; downloaded evidence verified with the existing verifier. **No local linting or formatting**.<br>- Initial Visual Preview 38813296181 was auto-cancelled before CAP-29. Setup failures below are retained transparently and not accepted as completed standalone evidence.<br><br>**Final X01 disposition: PARTIAL.** The primary nested-Escape acceptance fails reproducibly. Error-recovery focus also fails in the recorded synthetic invocation; native opening autofocus remains qualified/UV. Configured/unconfigured visuals, bounded selector/navigation and synthetic save/cancel/reload/error behavior have the specific VV/BV evidence above. No `EVIDENCE_COMPLETE` claim.<br><br>Remaining gaps: native keyboard/mouse trigger opening autofocus, internal dismissal-callback delivery, screen readers/IME, backdrop click and full nested Tab traversal, whole-settings loading rejection/catalog errors, real provider authentication/model discovery, actual key removal, disk restart persistence and OS encryption/migration. These gaps are not hidden behind workflow success. No production correction, merge, integration-branch write, shared harness/fixture/workflow change, central-register edit, CAP-30, Phase 2 or final Atlas.<br><br>## Reused V-02 / V-03 comparison evidence<br><br>Artifact **12009961710**, run **38813431959**, canonical measurements sourceHead **44abaa263eaec1e8add2a1cfd47365f5ce4fcc34**, was downloaded and extracted. The following pre-existing canonical images were individually opened at original **1440 × 900** resolution: `dialog-settings-desktop.png`, `nested-settings-options-desktop.png`, `nested-settings-escape-desktop.png`, `nested-loki-options-desktop.png`, `nested-loki-escape-desktop.png`. These are accepted comparison evidence from a successful canonical audit step, despite the later CAP-29 Tab-assertion failure. They are not passed off as completed standalone CAP-29 evidence.<br><br>Settings uses a centered 900 × 393 px shared modal with a 72% dark/2px blurred backdrop. The Loki custom form is 520 × 529.4375 px with a 55% unblurred backdrop. Different content widths are intentional; broad custom/shared keyboard differences remain V-03. The canonical nested-overlay ledger records childClosed=true for both, parentRemains=true for Loki and false for Settings. The inspected Loki post-Escape frame retains its form and visibly focuses its datasource trigger; the Settings post-Escape frame shows the workspace and Settings trigger focus. These corroborate existing V-02 rather than establish a new independent defect count.<br><br>Visual judgment: Settings labels/actions/privacy copy fit without clipping in this desktop state. Its unconfigured model placeholder, disabled Test/Save and usable Cancel are apparent. The nested search/list shell matches the shared Loki selector chrome, but its modal ownership differs. Neither canonical configured credentials nor model persistence is claimed from these images. |
| VC30-01 | [CAP-30](#cap-30) | X06 | &#124; VC30-01 &#124; ALREADY_CONVERGED &#124; CopySqlButton / clipboardText, X06 &#124; High confidence BV and VV: query rejection/retry preserves payload and accessible feedback; retain shared behavior &#124; |
| VC30-02 | [CAP-30](#cap-30) | X06, V-08 | &#124; VC30-02 &#124; CONFIRMED_DEFECT &#124; Prometheus QueryEditor caller, X06/V-08 &#124; High confidence BV: actual PromQL Copy exposes Copy SQL accessible label; pass correct language to existing control &#124; |
| VC30-03 | [CAP-30](#cap-30) | X10, V-07 | &#124; VC30-03 &#124; CONFIRMED_DEFECT &#124; LogResultExplorer, X10/V-07 &#124; High confidence BV, CAP-19 corroboration: rejected log copy has no failure notification and produces one unhandled rejection; adopt shared text-copy error policy later &#124; |
| VC30-04 | [CAP-30](#cap-30) | X12, UX-20 | &#124; VC30-04 &#124; INTENTIONAL_DIFFERENCE &#124; TraceServiceMap export helpers, X12/UX-20 &#124; High confidence BV/VV: PNG, SVG and Excalidraw each serve a distinct destination; preserve formats &#124; |
| VC30-05 | [CAP-30](#cap-30) | C06, X12, UX-20 | &#124; VC30-05 &#124; INTENTIONAL_DIFFERENCE &#124; ExplainPane, C06/X12/UX-20 &#124; High confidence BV/VV: PG plan text/JSON differs semantically from Tempo graph-image and Excalidraw payloads; preserve formats &#124; |
| VC30-06 | [CAP-30](#cap-30) | X06, X12, UX-20 | &#124; VC30-06 &#124; UNVERIFIED &#124; NotificationArea, X06/X12/UX-20 &#124; Medium confidence visual observation: earlier Tempo Excalidraw success toast remains visible on the later PG plan screenshot; determine desired cross-workspace toast policy before calling it a defect &#124; |
| NON01-06 | [NON-01](#non-01) | Not explicit in declaration; consult source | - **CONFIRMED SYNTHETIC RENDERER RACE (NON01-06):** Earlier lazy success/failure can temporarily publish obsolete `connected`/`error` while a newer explicit connect is pending at the same generation. The lazy path has no explicit intent guard. Both desired-invariant `it.fails` repros executed as expected failures in CI run 38763003457. Final newer success restores correct state. **Real provider timing, transient UI effect, and any credential exposure are unverified.** No remediation in this audit. |
| NON01-01 | [NON-01](#non-01) | A04, A05, A07 | &#124; **NON01-01** &#124; A04, A05, A07 &#124; ALREADY_CONVERGED shared profile lifecycle; medium importance; high source confidence (runtime pending CI) &#124; `useStore.connectProfile/reconnectActiveProfile`, `tabConnection`, `connectionLifecycle.audit.test.tsx`, `useStore.reconnect.test.tsx` &#124; Store/main SessionManager; preserve scoped generations &#124; |
| NON01-02 | [NON-01](#non-01) | A05, A08 | &#124; **NON01-02** &#124; A05, A08 &#124; ALREADY_CONVERGED query completion guards; high correctness importance; high source confidence (new runtime assertion pending CI) &#124; `beginQueryOperation`, `completeQuery`, `isQueryOperationCurrent`, subscription, `NON-01.lifecycle.test.tsx` &#124; Store and tab connection preflight; preserve token/context &#124; |
| NON01-03 | [NON-01](#non-01) | A08, L25 | &#124; **NON01-03** &#124; L25, A08 &#124; INTENTIONAL_DIFFERENCE in local optional trend vs durable primary; medium/high importance; high source confidence &#124; `LokiExplorer.loadTrend`, named Loki deferred tests &#124; Loki workspace; no generic unification &#124; |
| NON01-04 | [NON-01](#non-01) | A04, A07 | &#124; **NON01-04** &#124; A04, A07 &#124; UNVERIFIED: all callers' immediate feedback during an already-connecting lazy profile (source returns null); low/medium potential UX impact, low confidence of defect &#124; `ensureConnectionForTab` current connecting shortcut and existing retry test &#124; Tab preflight/UI; test real user action/feedback before recommending change &#124; |
| NON01-05 | [NON-01](#non-01) | A07, C04 | &#124; **NON01-05** &#124; A07; cross-reference NON03-04 / C04 &#124; DIAGNOSTIC INVESTIGATION LEAD, not proven credential leak; medium potential security impact / medium source confidence &#124; PR #414 `docs/audit/391/batches/NON-03.md` NON03-04; `src/main/adapters/postgres.ts` `reasonOf` and `handleUnexpectedDisconnect` &#124; PG main adapter; future synthetic-marker test and diagnostic policy review, distinct from lifecycle correctness &#124; |
| NON02-01 | [NON-02](#non-02) | A19 | &#124; A19 &#124; **BV**, scoped deterministic serialization, memory-storage, restore-patch, store and jsdom assertions; confirmed override-loss defect NON02-01 &#124; **N/A** for stored-data, migration and execution-side-effect contracts; layout appearance belongs to CAP-09 &#124; Shared workspaceFormat/Migrations/Storage/Restoration, stable workspacePersistence facade, useStore/querySessions; App owns separate dimensions &#124; Not packaged cold-start acceptance, durable filesystem proof, live providers or all seven actual source startups. Missing-profile UI recovery remains source-only. &#124; |
| NON02-02 | [NON-02](#non-02) | Not explicit in declaration; consult source | ### NON02-02 — Converged preset atomic compatibility, intentionally profile-bound<br><br>**ALREADY_CONVERGED**, A22; high confidence for tested domain and PG jsdom caller. One exact guard checks profile ID, source kind and query language; adapters validate before applying; store commit preserves target identity and cold-resets runtime. Same-kind different-profile rejection is intentional, even LF/SQ sharing DuckDB dialect does not allow crossing source kind. Metadata availability and same-ID endpoint changes are outside this compatibility definition. Keep source adapters; do not broaden compatibility merely because syntax is shared. Nonvisual Atlas partner: CAP-08 manager/load and workspace boundary NON02-03. |
| NON02-03 | [NON-02](#non-02) | Not explicit in declaration; consult source | ### NON02-03 — Workspace restoration preserves references, not provider compatibility<br><br>**INTENTIONAL_DIFFERENCE / NEEDS_VERIFICATION**, A19/A22. High confidence for reference preservation and no pure-restore execution; medium confidence for UI recovery implications. Workspace records do not store source kind or endpoint fingerprint; cold restore has no profiles input. A changed-kind profile ID retains old raw text and all stored source drafts, while a missing profile ID remains attached. By source, App's `queryProfileLoading` is true whenever an ID lacks a profile, including after profile loading has finished; no resolved-missing branch is visible. This may leave the query surface blocked until rebind/detach, but **no rendered missing-profile scenario was executed here**, so do not classify permanent UI recovery as a confirmed defect.<br><br>Integration follow-up request: separate synthetic missing/deleted-profile startup capture and rebind recovery, plus changed-kind raw/Builder selection; assert preserved drafts and zero automatic Run/connect. Do not change the shared harness in this batch. Distinguish live-session metadata hydration in Sidebar (listLive may intentionally fetch metadata for an existing session) from fresh provider reconnect. |
| NON02-04 | [NON-02](#non-02) | Not explicit in declaration; consult source | ### NON02-04 — Recovery and version boundaries differ deliberately; loss risks remain<br><br>**INTENTIONAL_DIFFERENCE / policy follow-up**, A19/A22. Shared workspace requires a valid complete envelope; one invalid required tab prevents all restoration, preserving current defaults rather than partially salvaging other saved tabs. Optional Tempo fields default independently. Preset repository instead skips invalid records/duplicates and keeps valid records. These are different units of trust, not needless duplicated parsing.<br><br>Workspace future-version data can be overwritten by later edit/pagehide/disposal despite read/startup preservation (executed existing test). Preset repository similarly reconstructs writes from accepted records; by source, later successful create/rename/delete can omit unsupported/malformed records and create can replace an unsupported envelope. No archival recovery, concurrent-writer merge or durable transaction promise is established. Integration should decide preservation/recovery policy separately; no migration or storage policy change is authorized here. Atlas: nonvisual risk card, no pixel evidence. |
| NON02-05 | [NON-02](#non-02) | Not explicit in declaration; consult source | ### NON02-05 — Shared ownership is already separated; keep semantic validation boundaries<br><br>**ALREADY_CONVERGED / SHARE_SHELL_KEEP_ADAPTERS**, A19/A22, source assessment. #365 Phase 5A/5B separation is present: pure current format and historical converters; storage owns browser access/debounce/cache/events; restoration owns cold allocation; facade composes one patch without importing store at runtime. Presets deliberately use a different versioned repository and strict adapter parsers. Both paths repeat time-range/visualization/Builder shape checks, but workspace accepts historical shapes/defaults whereas preset load rejects invalid payloads. No extraction is justified solely by similar lists or predicates. A future enum/default addition should be reviewed across both paths (NON02-01 demonstrates maintenance drift); do not share permissive workspace migration as a strict preset validator. |
| NON03-01 | [NON-03](#non-03) | Not explicit in declaration; consult source | &#124; Failure &#124; New secret save refuses unavailable encryption; no new plaintext fallback. Legacy preservation is an explicit historical exception, not evidence of newly persisted plaintext &#124; Actionable auth/permission errors; no in-app login/refresh mechanism. Provider text remains in errors (NON03-01) &#124; Shared/legacy failures rejected; generic service fallback for unknown exceptions; malformed legacy file remains until explicit removal/replacement &#124; |
| NON03-02 | [NON-03](#non-03) | Not explicit in declaration; consult source | ### NON03-02 — Shared secret mechanism is already converged<br><br>- IDs: C04, X02. Classification: ALREADY_CONVERGED; high source/deterministic confidence, medium architectural importance.<br>- Shared `EncryptedSecretStore` + `createElectronEncryption`; namespaces keep AI and datasource records separate. Executed store lifecycle/concurrent-writes tests plus new redacted-backend-failure test support the contract.<br>- AI and PG migrations remain separate because AI legacy data is encrypted, PG historical data can be plaintext, and profile presence/state differs. Small duplicate base64 validation in AI legacy decoding is aligned with a historical format, not sufficient reason for a generic credential framework.<br>- Future direction: preserve common encryption/atomic persistence and provider-specific lifecycle adapters; verify native OS behavior separately. Atlas should cross-reference nonvisual evidence, no invented screenshots. |
| NON03-03 | [NON-03](#non-03) | Not explicit in declaration; consult source | ### NON03-03 — External ADC authentication is intentionally separate<br><br>- ID: C10. Classification: INTENTIONAL_DIFFERENCE; high source/mocked-client confidence.<br>- `BigQueryAdapter.client`, `BigQueryDiscoveryService`, constructor-options/project tests establish external identity and separate billing/data project selection. No Google token managed by the normal app profile flow.<br>- Project access failure does not imply expired credentials; identity must not be inferred from selected billing project. SDK caching/refresh is not independently verified. Keep ADC outside shared password storage; no universal credential abstraction proposed. |
| NON03-04 | [NON-03](#non-03) | Not explicit in declaration; consult source | ### NON03-04 — PG diagnostics preserve upstream message text<br><br>- ID: C04. Classification: source-reviewed diagnostic exposure lead; SO, medium confidence on practical sensitivity, not a demonstrated credential leak.<br>- `src/main/adapters/postgres.ts` `reasonOf`/`handleUnexpectedDisconnect` logs raw message and emits message/technicalDetail. It does not log the profile/password object at this site, but there is no message redaction there.<br>- Future direction: deterministic synthetic disconnect test through existing lifecycle harness and diagnostic policy review, coordinated with NON-01 owner. No shared harness edited. Do not infer that a real PostgreSQL error includes a password; that is unverified. |
| NON03-05 | [NON-03](#non-03) | Not explicit in declaration; consult source | ### NON03-05 — Credential presence is distinct from credential usability<br><br>- IDs: C04, X02. Classification: source/test-established contract with verification gap; high confidence.<br>- `EncryptedSecretStore.has` checks record shape/base64 without decrypting. AI summary also treats existing legacy file as presence even when corrupt. PG migration/presence states do not establish current native decryption availability.<br>- Existing “secure credential presence survives unavailable decryption and metadata save”, new corrupt-legacy test, and unavailable-legacy AI test distinguish these contracts. Future native failure/recovery acceptance should verify actionable feedback without declaring stored credentials usable based on presence alone. |
| NON04-01 | [NON-04](#non-04) | S27, S28 | &#124; **NON04-01** &#124; **Unverified security boundary; priority high** &#124; S28/S27; PG read-only setting is a startup default, and the first-keyword precheck alone accepts a string beginning with SELECT followed by more statements &#124; postgres.ts assertReadonly/buildPoolConfig/runQuery; new synthetic lexical characterization &#124; Security review of session settings mutability, protocol multi-statement effects and DB role restrictions **on disposable local PG only**. Do not claim proven write exploit or remediate in audit. &#124; |
| NON04-02 | [NON-04](#non-04) | C11, S27, S28 | &#124; **NON04-02** &#124; **Intentional difference / already-converged dispatch** &#124; S27/S28/C11; BQ scripts vs DuckDB single-statement vs configurable PG &#124; db.ts dispatch, BQ scanner, DuckDB extracted StatementType tests &#124; Preserve adapter-specific policies; shared IPC/query-result contract is sufficient. &#124; |
| NON04-03 | [NON-04](#non-04) | C16, C18, S28 | &#124; **NON04-03** &#124; **Unverified security boundary** &#124; C16/S28/C18; DuckDB allows prepared EXPLAIN in addition to SELECT, and security also depends on native settings/OS &#124; local-files-adapter.ts assertDuckDBReadOnlyQuery; sqlite-file-adapter.ts config &#124; Review EXPLAIN ANALYZE/side-effectful functions and file/extension operations in an isolated, disposable DuckDB environment. No real-file or exploit attempt here. &#124; |
| NON04-04 | [NON-04](#non-04) | C11, S28 | &#124; **NON04-04** &#124; **Intentional provider behavior / residual verification** &#124; C11/S28; dry-run statementType SCRIPT is not per-child policy evidence &#124; bigquery-script.ts, BigQuerySession.query; existing and new mock tests &#124; Validate dry-run and child-job guarantees with permission-restricted sacrificial BigQuery project if approved; retain local scanner. &#124; |
| NON04-05 | [NON-04](#non-04) | C15, C16, C18, S28 | &#124; **NON04-05** &#124; **Already-converged shared implementation** &#124; C15/C16/C18/S28; local-file and SQLite SQL queries share DuckDB classification and result cap &#124; assertDuckDBReadOnlyQuery/queryResultFromDuckDBReader; existing real-adapter tests &#124; Preserve reuse. Their connection setup and allowed paths should stay deliberately separate. &#124; |
| NON04-06 | [NON-04](#non-04) | C15, C16, C18 | &#124; **NON04-06** &#124; **Unverified file-boundary limitations** &#124; C15/C16/C18; selected-file canonicalization and SQLite WAL handling have platform/TOCTOU and external native-extension dependencies &#124; realpath, allowed_paths, sqlite_scanner attachment and fingerprint tests &#124; Characterize symlink replacement, malformed shape and packaged extension across supported platforms; do not overstate sandbox completeness. &#124; |
| NON05-01 | [NON-05](#non-05) | Not explicit in declaration; consult source | &#124; PG materialization with quoted `"$1"` plus real `$1` &#124; **Desired invariant fails:** substitution also changes identifier text to `"'safe'"` &#124; BV expected failure, **NON05-01** &#124; |
| NON05-02 | [NON-05](#non-05) | Not explicit in declaration; consult source | &#124; GoogleSQL materialization with quoted `\`status?\`` and one real `?` &#124; **Desired invariant fails:** quoted `?` consumes the first binding; subsequent `?` reports missing value &#124; BV expected failure, **NON05-02** &#124; |
| NON05-03 | [NON-05](#non-05) | Not explicit in declaration; consult source | &#124; GoogleSQL promoted source column `a"b` &#124; **Desired invariant fails:** intermediate `"a""b"` becomes `\`a\`\`b\`` rather than preserving the double quote; SELECT and WHERE now reference different strings &#124; BV expected failure, **NON05-03** &#124; |
| NON05-04 | [NON-05](#non-05) | Not explicit in declaration; consult source | &#124; **NON05-04** &#124; **Unverified dialect syntax and unnecessary duplication candidate (medium)** — GoogleSQL quoting logic differs between Builder `quoteIdentifier`/relation names, `seriesCardinality.quoteGoogle` and `wrapSqlWithResultFilters`; backtick, backslash and control-char escaping policy not unified &#124; SO: three independently authored quoted-identifier strategies; provider grammar UV &#124; Establish GoogleSQL lexical contract with parser/provider tests before any focused deduplication; do not impose universal cross-dialect escaping &#124; |
| NON05-05 | [NON-05](#non-05) | Not explicit in declaration; consult source | &#124; **NON05-05** &#124; **Unverified materialized literal semantics (medium)** — one `formatPostgresLiteral` emits raw backslashes/controls for PostgreSQL, DuckDB and GoogleSQL despite different string literal rules; renderer only uses it for editable handoff, not parameterized Builder Run &#124; SO; exact escaped apostrophe BV but provider interpretation UV &#124; Compare materialized raw execution with parameterized run using disposable provider fixtures; consider dialect-aware materialization or avoid inline substitution &#124; |
| NON05-06 | [NON-05](#non-05) | Not explicit in declaration; consult source | &#124; **NON05-06** &#124; **Unverified provider type compatibility (medium)** — promoted GoogleSQL time bucket and scalar comparisons may use uncast `?` where independent time limits explicitly cast to temporal type &#124; SO: `resolveBuilderPromotedFilters` and `buildBuilderPredicates`; CI checks strings only &#124; Check DATE/DATETIME/TIMESTAMP filters against BigQuery typed parameters and generated SQL before deciding on casts &#124; |
| NON05-07 | [NON-05](#non-05) | Not explicit in declaration; consult source | &#124; **NON05-07** &#124; **Intentional / already converged** — standard Builder Run keeps values bound; dialect adapters enforce distinct execution rules; SQLite reuses DuckDB, and supported filter vocabulary intentionally excludes arbitrary LIKE/IN/free-form SQL expressions &#124; BV/SO, NON-04 &#124; Preserve separated generator and provider policy; do not conflate visual query preview with execution validation &#124; |
| NON06-01 | [NON-06](#non-06) | S26 | &#124; **NON06-01 — missing guard / expected-failure** &#124; S26: context can complete from an earlier metadata revision while its originating profile metadata has changed; stale schema/model context risk, not confirmed execution &#124; Source `workflow.ts` lacks post-await revision check; `NON06 EXPECTED FAILURE…` synthetic test. **Medium confidence; medium potential impact.** Renderer AI workflow/metadata owner: capture metadata revision/generation and check before column load and before second provider request; coordinate with lazy-loader generation rules. No production fix in this PR. &#124; |
| NON06-02 | [NON-06](#non-06) | S26 | &#124; **NON06-02 — confirmed duplicate-selection defect** &#124; S26: duplicate eligible records referenced by current SQL can occupy two of up to eight relation slots &#124; `selectAiRelations` initially slices referenced records without deduping keys; `NON06 characterization: duplicate SQL references…`. **High source confidence; low-to-medium impact**, depends on malformed/duplicate source metadata. Renderer context owner: dedupe at selection, preserve priority. &#124; |
| NON06-03 | [NON-06](#non-06) | S26 | &#124; **NON06-03 — insufficient normalization** &#124; S26: duplicate valid `searchTerms` consume some of five term slots but do not bypass size caps &#124; `queryStep` validates each term but does not dedupe. **High confidence, low impact.** Main query validator owner: optional dedupe/normalization with contract review. &#124; |
| NON06-04 | [NON-06](#non-06) | S24, S26 | &#124; **NON06-04 — intentional security separation** &#124; S24/S26: `queryStep` parses bounded SQL text but does not enforce read-only SQL syntax &#124; Existing architecture #365 and new `NON06 characterization: syntactically valid SQL proposals…`. **High confidence.** Do not treat proposal acceptance as query execution authorization; enforce statement safety at execution boundary, preserve explicit Apply/Run. &#124; |
| NON06-05 | [NON-06](#non-06) | S26 | &#124; **NON06-05 — unverified provider/catalog authorization** &#124; S26: a user-controlled IPC request can include schema-shaped relation names not verified against an active datasource by `proposalRequest`; no direct DB metadata call on that IPC path &#124; Source main validator/service and local `workflow.ts`. **High source confidence; real authorization impact unverified.** Integration owner: characterize actual main `describeTable` source scopes, profile deletion/reconnection, BigQuery project/dataset restrictions and threat model. &#124; |
| NON06-06 | [NON-06](#non-06) | Not explicit in declaration; consult source | &#124; **NON06-06 — intentional capability ownership** &#124; AI query/repair vs Builder/anomaly/plan validators remain distinct; facade and shared primitive exports are stable &#124; `docs/architecture/ai-validation-capabilities.md` Phase 6A/6B, `validation/query.ts`, `service.ts`, `openrouter.ts`. **High source confidence.** No extraction requested; similarity alone is not duplication. &#124; |
| NON06-07 | [NON-06](#non-06) | Not explicit in declaration; consult source | &#124; **NON06-07 — discovery visibility question** &#124; The names-only `availableRelations` list is capped, but local semantic matching searches *all* eligible profile metadata, not only displayed catalog entries &#124; `withAiRelationCatalog` and `expandAiRelations`. **High source confidence; privacy/product semantics unverified.** Owner: decide whether local semantic search beyond names-only disclosure is intended; do not conflate same-profile match with cross-source metadata access. &#124; |
| NON07-01 | [NON-07](#non-07) | Not explicit in declaration; consult source | &#124; **NON07-01 — CONFIRMED normalization edge case, lower severity** &#124; Adapter uses `Number(raw)`; `null` and blank values become zero, conflating missing and true zero. Deterministic reproduction. BigQuery adapter owner: validate decimal-string input before coercion, preserve optional absence; no fix within this PR. No proof that normal live BigQuery responses contain these malformed values. &#124; |
| NON07-02 | [NON-07](#non-07) | Not explicit in declaration; consult source | &#124; **NON07-02 — CONFIRMED dry-run precision gap** &#124; `estimateQuery` lacks `Number.isSafeInteger` protection present in `executeQuery`, and can silently round Int64 estimates above 2^53−1. Deterministic reproduction. BigQuery adapter owner: retain exact decimal string or explicitly guard/report unrepresentable values after contract review. &#124; |
| NON07-03 | [NON-07](#non-07) | Not explicit in declaration; consult source | &#124; **NON07-03 — UNVERIFIED REQUIREMENT / scoped omission** &#124; BigQuery provides billed bytes, slot time, job ID and more, but `QueryExecutionInfo` does not include them. These are not dropped in IPC: they are deliberately never normalized into the result. Product/architecture owner to decide whether further fields are required, their units and safe representation before feature work. &#124; |
| NON07-04 | [NON-07](#non-07) | Not explicit in declaration; consult source | &#124; **NON07-04 — UNVERIFIED UI expectation (UI-002)** &#124; Result toolbars display rows/cols/duration but no BQ bytes/cache; the typed execution fields reach renderer state. No confirmed business/product requirement specifies they must be visible. Preserve lead, do not call confirmed UI defect or create speculative screenshot. &#124; |
| NON07-05 | [NON-07](#non-07) | Not explicit in declaration; consult source | &#124; **NON07-05 — INTENTIONAL DIFFERENCE, scripts** &#124; Script parent returns last-statement rows and parent statistics, not per-statement breakout. Provider documents child jobs. A per-statement UI would require a separate approved contract and enumeration; do not silently treat parent stats as final SELECT's exact costs. &#124; |
| NON07-06 | [NON-07](#non-07) | Not explicit in declaration; consult source | &#124; **NON07-06 — ALREADY-CONVERGED infrastructure, with stale display caveat** &#124; Generic `QueryResult`/IPC/lifecycle preserve `execution` fields without BigQuery-specific code, subject to current-operation guards. A failed query may leave the previous successful result visible; future stats presentation must label association appropriately. No new universal abstraction warranted. &#124; |

Possible duplicate links for AGG-03 only: V-07 ↔ VC19-01 ↔ VC30-03; V-08 ↔ VC30-02; V-02 ↔ VC29-01; VC23-01 ↔ VC25-06 (sample-label clipping); V-01 ↔ VC20-01 ↔ VC24-01 (common row shell; domain content distinct). VC26-01 and VC26-02 affect the same Scatter but are distinct zero-manufacture and coordinate-position contracts. NON01-05 ↔ NON03-04 is a diagnostic lead, not evidence of a credential leak. V-06 ↔ VC28-04 is retained-result policy, not automatically a new defect. No unilateral merging or ranking performed.

## I. AGG-02 handoff

Independently verify the exact 175-ID baseline, one-primary-owner mapping and table totals, then scrutinize the G table. Prioritize CAP-07 historical source continuity, CAP-06/09 original image review chain, scoped EVIDENCE_COMPLETE criteria, native versus named-test classifications, preserved T18/Scatter/X01/clipboard failures and NON expected failures. Check X11 feature relevance separately from query copying. Review both unresolved leads and candidate declaration completeness/collisions against full source reports. Do not assume script-passing bookkeeping closes acceptance, source provenance or independent screenshot review.

No new behavioral investigations, production fixes, Atlas ranking, release-gate changes or AGG-02 execution are authorized in AGG-01. Further runtime/OS/provider tests require separately scoped follow-up. The 20 source reports and historical embedded tail must remain intact.

## J. Final disposition and validation record

**PARTIAL**, because G-01/G-03/G-04 and the other stated evidence/acceptance limitations prevent an unqualified internally complete evidence claim. Structural reconciliation is complete; source dispositions are preserved, not inflated. Negative controls on temporary copies correctly rejected a missing original ID, an illicit PARTIAL-to-EVIDENCE_COMPLETE promotion, and changed historical completion bytes; source files were not mutated by those checks. The mechanical validator was executed successfully: all structural checks passed, including 175 unique IDs, 37 sources, preserved historical bytes and 25 failed scoped claims. The exact recomputed totals match section E. CI belongs to the AGG-01 PR head and is reported in the final handoff; no unrun check is marked passed. The repository's audit-branch Visual workflow may rerun existing scenarios automatically; any new artifact is not substituted for the historical evidence without inspection.

Commit 1 `16ed9018da39eedd20091834b5a6921a9b7e3c16` contains only the canonical register reconciliation. Commit 2 `35c094d728fe63f5d1316fb1d9d187e92f8df0ba` adds this companion report and read-only validator. A third report-only correction removes trailing spaces introduced in this report, detected by initial CI run 38819357308 (Quality job 116711855419, changed-files whitespace step); this was an AGG-01-owned error, not inherited formatting debt. The historical register bytes and evidence remain unchanged. Any ordinary correction after validation is identified in an additional AGG-01-only commit. Stop after AGG-01; no merge.

### Reconciliation snapshot for read-only validation

The snapshot records checked source metadata and expected totals. The validator independently parses active rows and authoritative source files rather than treating these totals as proof. Remote run/artifact results are observed metadata, not promises about future availability.

```json
{
  "base": "e4c036d853e6f5fe6aecd794a2404c7331c5c13e",
  "inventoryBlob": "21f723cb836de386fedda74bfac2a567f65941bd",
  "originalRegisterBlob": "90a88af124831a90c177906cf2275b15487bb158",
  "historicalTailSha256": "c3b936b13ce4c050a29632c7b636d371701859c6ae2fdb0606e49d66da99b361",
  "manifest": [
    {
      "id": "CAP-01",
      "type": "EMBEDDED_REGISTER",
      "path": "docs/architecture/ux-convergence-coverage-register.md",
      "disposition": "EVIDENCE_COMPLETE",
      "pr": 406,
      "sourceHead": "d1e3127ba380f75108b296f737b42729ae4dd073",
      "reportCommit": "98591c0393e8ca7ab0357a63ec53b978a2feebab",
      "run": 38602027521,
      "workflowConclusion": "failure",
      "artifact": 11914875832,
      "artifactSourceHead": "d1e3127ba380f75108b296f737b42729ae4dd073",
      "artifactExpired": false,
      "newScreenshots": 3,
      "notes": "Scoped capture assertions complete in partial archive; full workflow FAIL after narrow log-hover timeout. Modal Tab/Escape fails V-03; live PG/TLS UV.",
      "sourceBlob": "90a88af124831a90c177906cf2275b15487bb158"
    },
    {
      "id": "CAP-02",
      "type": "EMBEDDED_REGISTER",
      "path": "docs/architecture/ux-convergence-coverage-register.md",
      "disposition": "EVIDENCE_COMPLETE",
      "pr": 406,
      "sourceHead": "5a7ac174ef8d1519ee1630f2bbd18692ec40bec6",
      "reportCommit": "4afae545fe6234d6142a09c4393b5918c38a5fb5",
      "run": 38605551434,
      "workflowConclusion": "success",
      "artifact": 11914894484,
      "artifactSourceHead": "5a7ac174ef8d1519ee1630f2bbd18692ec40bec6",
      "artifactExpired": false,
      "newScreenshots": 3,
      "notes": "PG-only edit/delete/read-only controls; Delete Escape/Cancel focus BODY FAIL. Backend cleanup/read-only enforcement UV.",
      "sourceBlob": "90a88af124831a90c177906cf2275b15487bb158"
    },
    {
      "id": "CAP-03",
      "type": "EMBEDDED_REGISTER",
      "path": "docs/architecture/ux-convergence-coverage-register.md",
      "disposition": "EVIDENCE_COMPLETE",
      "pr": 406,
      "sourceHead": "1ca7411e446d2b00bb19ea5812c1c979a0feb7df",
      "reportCommit": "809a0f065fc04948ffcf968fa0002ba28c1600ac",
      "run": 38608584909,
      "workflowConclusion": "success",
      "artifact": 11917370950,
      "artifactSourceHead": "1ca7411e446d2b00bb19ea5812c1c979a0feb7df",
      "artifactExpired": false,
      "newScreenshots": 3,
      "notes": "BQ/LF/SQ form payloads only; live ADC/chooser/filesystem/enforcement UV; inherited modal mechanics unresolved.",
      "sourceBlob": "90a88af124831a90c177906cf2275b15487bb158"
    },
    {
      "id": "CAP-04",
      "type": "EMBEDDED_REGISTER",
      "path": "docs/architecture/ux-convergence-coverage-register.md",
      "disposition": "EVIDENCE_COMPLETE",
      "pr": 406,
      "sourceHead": "1184afcf3d7c93a1311080df5fbab9d0df9a4704",
      "reportCommit": "51ba439e75547f888b1644e474e6878593f4e772",
      "run": 38614943136,
      "workflowConclusion": "success",
      "artifact": 11920175581,
      "artifactSourceHead": "1184afcf3d7c93a1311080df5fbab9d0df9a4704",
      "artifactExpired": false,
      "newScreenshots": 2,
      "notes": "Provider-specific UID semantics retained; only synthetic gcx. Full publish status independently confirmed successful.",
      "sourceBlob": "90a88af124831a90c177906cf2275b15487bb158"
    },
    {
      "id": "CAP-05",
      "type": "EMBEDDED_REGISTER",
      "path": "docs/architecture/ux-convergence-coverage-register.md",
      "disposition": "EVIDENCE_COMPLETE",
      "pr": 406,
      "sourceHead": "5aac39dd0d69c3542683f3b0f79fc8931cb31fda",
      "reportCommit": "16142d4963e0eea98245ae36bf42689f72989d05",
      "run": 38617523822,
      "workflowConclusion": "success",
      "artifact": 11920633396,
      "artifactSourceHead": "5aac39dd0d69c3542683f3b0f79fc8931cb31fda",
      "artifactExpired": false,
      "newScreenshots": 2,
      "notes": "Native PG Retry and filter clear; injected initial metadata. Status variants, native refresh and lazy-column failure/retry UV.",
      "sourceBlob": "90a88af124831a90c177906cf2275b15487bb158"
    },
    {
      "id": "CAP-06",
      "type": "EMBEDDED_REGISTER",
      "path": "docs/architecture/ux-convergence-coverage-register.md",
      "disposition": "EVIDENCE_COMPLETE",
      "pr": 406,
      "sourceHead": "5aac39dd0d69c3542683f3b0f79fc8931cb31fda",
      "reportCommit": "1273af75d1b58b0c5e36bf98d066bcfe359a6475",
      "run": 38617523822,
      "workflowConclusion": "success",
      "artifact": 11920633396,
      "artifactSourceHead": "5aac39dd0d69c3542683f3b0f79fc8931cb31fda",
      "artifactExpired": false,
      "newScreenshots": 0,
      "notes": "No new images; six reused Builder/selector frames. P03 type/help/unit SO; report also says montage, so individual-original inspection claim needs AGG-02 scrutiny.",
      "sourceBlob": "90a88af124831a90c177906cf2275b15487bb158"
    },
    {
      "id": "CAP-07",
      "type": "EMBEDDED_REGISTER",
      "path": "docs/architecture/ux-convergence-coverage-register.md",
      "disposition": "EVIDENCE_COMPLETE",
      "pr": 406,
      "sourceHead": "9a3484fc3c56f773331b1040300c79a8908199ac",
      "reportCommit": "9ef44d802fca7645781e1aadbe52bf47ce064089",
      "run": 38622912415,
      "workflowConclusion": "success",
      "artifact": 11922344749,
      "artifactSourceHead": "9a3484fc3c56f773331b1040300c79a8908199ac",
      "artifactExpired": false,
      "newScreenshots": 1,
      "notes": "Current completion table and six rows survive; narrative/VC07-01/02 recovered for consultation from 9ef44d8. Injected running flag; mode toggle/cross-provider binding UV.",
      "sourceBlob": "90a88af124831a90c177906cf2275b15487bb158"
    },
    {
      "id": "CAP-08",
      "type": "EMBEDDED_REGISTER",
      "path": "docs/architecture/ux-convergence-coverage-register.md",
      "disposition": "EVIDENCE_COMPLETE",
      "pr": 406,
      "sourceHead": "1521a01404cd8b27bce8d99d25643f4b88c7a015",
      "reportCommit": "e41519c1c5bc8878c1053ef735b14cf5f7542c6b",
      "run": 38640786557,
      "workflowConclusion": "success",
      "artifact": 11930132295,
      "artifactSourceHead": "1521a01404cd8b27bce8d99d25643f4b88c7a015",
      "artifactExpired": false,
      "newScreenshots": 3,
      "notes": "PG/Loki CRUD/Reset synthetic; native confirm visuals, Tempo transient cleanup and cold persistence UV.",
      "sourceBlob": "90a88af124831a90c177906cf2275b15487bb158"
    },
    {
      "id": "CAP-09",
      "type": "EMBEDDED_REGISTER",
      "path": "docs/architecture/ux-convergence-coverage-register.md",
      "disposition": "EVIDENCE_COMPLETE",
      "pr": 406,
      "sourceHead": "296a6ada15031c4455adc89e58fc5a57ce03243e",
      "reportCommit": "031096b6bf13b2e99c2a23c56c5345de89aa9c2e",
      "run": 38645215482,
      "workflowConclusion": "success",
      "artifact": 11932551046,
      "artifactSourceHead": "296a6ada15031c4455adc89e58fc5a57ce03243e",
      "artifactExpired": false,
      "newScreenshots": 1,
      "notes": "Native App splitter/copy assertions; report qualifies inspection through CI-emitted PNG/JSON while offline. Original-resolution review chain needs AGG-02 check.",
      "sourceBlob": "90a88af124831a90c177906cf2275b15487bb158"
    },
    {
      "id": "CAP-10",
      "type": "EMBEDDED_REGISTER",
      "path": "docs/architecture/ux-convergence-coverage-register.md",
      "disposition": "EVIDENCE_COMPLETE",
      "pr": 406,
      "sourceHead": "c148f91906a69529318dec170a7922e4d9fa465e",
      "reportCommit": "47fe6afab30c4027c00182afbc60956a02b9d1ae",
      "run": 38652171440,
      "workflowConclusion": "success",
      "artifact": 11935740784,
      "artifactSourceHead": "c148f91906a69529318dec170a7922e4d9fa465e",
      "artifactExpired": false,
      "newScreenshots": 4,
      "notes": "Populated PG/BQ editors; native completion popup/caret and shortcut UV. Docs screenshot timeout separate from successful Visual run.",
      "sourceBlob": "90a88af124831a90c177906cf2275b15487bb158"
    },
    {
      "id": "CAP-11",
      "type": "EMBEDDED_REGISTER",
      "path": "docs/architecture/ux-convergence-coverage-register.md",
      "disposition": "EVIDENCE_COMPLETE",
      "pr": 406,
      "sourceHead": "5ba36d0d26264896aea7149aa2ca0c0cf973821c",
      "reportCommit": "6e199b00861f3ad4340052284989e132cbcda4e8",
      "run": 38710823797,
      "workflowConclusion": "success",
      "artifact": 11960906106,
      "artifactSourceHead": "5ba36d0d26264896aea7149aa2ca0c0cf973821c",
      "artifactExpired": false,
      "newScreenshots": 3,
      "notes": "PG dimensional controls; Series/native cardinality and endpoint edits UV; S14 named-test-only.",
      "sourceBlob": "90a88af124831a90c177906cf2275b15487bb158"
    },
    {
      "id": "CAP-12",
      "type": "EMBEDDED_REGISTER",
      "path": "docs/architecture/ux-convergence-coverage-register.md",
      "disposition": "EVIDENCE_COMPLETE",
      "pr": 406,
      "sourceHead": "a51aaf88148fab5967fa427dedbf81601524ba8e",
      "reportCommit": "234cbdeb7e6a622ba3492d26d044e5717dc034a7",
      "run": 38712444172,
      "workflowConclusion": "success",
      "artifact": 11960729292,
      "artifactSourceHead": "a51aaf88148fab5967fa427dedbf81601524ba8e",
      "artifactExpired": false,
      "newScreenshots": 5,
      "notes": "CSV/JSON native; R02/R04 resize changes sorting FAIL VC12-03; host glyph rendering remains a lead.",
      "sourceBlob": "90a88af124831a90c177906cf2275b15487bb158"
    },
    {
      "id": "CAP-13",
      "type": "EMBEDDED_REGISTER",
      "path": "docs/architecture/ux-convergence-coverage-register.md",
      "disposition": "EVIDENCE_COMPLETE",
      "pr": 406,
      "sourceHead": "199cbafb309a7efa1b23b24e2ed76168baf1aba6",
      "reportCommit": "92a79e0615c2204d5de350e500fe1e2f8740b3d6",
      "run": 38718496827,
      "workflowConclusion": "success",
      "artifact": 11964151467,
      "artifactSourceHead": "199cbafb309a7efa1b23b24e2ed76168baf1aba6",
      "artifactExpired": false,
      "newScreenshots": 4,
      "notes": "Local versus promoted filter semantics; menu Escape focus BODY FAIL VC13-01. Outside-click policy unresolved.",
      "sourceBlob": "90a88af124831a90c177906cf2275b15487bb158"
    },
    {
      "id": "CAP-14",
      "type": "EMBEDDED_REGISTER",
      "path": "docs/architecture/ux-convergence-coverage-register.md",
      "disposition": "EVIDENCE_COMPLETE",
      "pr": 406,
      "sourceHead": "0132a94548b6678f44320d7a7e6bbd093f231e75",
      "reportCommit": "1755064fcf12e7db7345d32f077fb30c6673277a",
      "run": 38719221058,
      "workflowConclusion": "success",
      "artifact": 11963329437,
      "artifactSourceHead": "0132a94548b6678f44320d7a7e6bbd093f231e75",
      "artifactExpired": false,
      "newScreenshots": 3,
      "notes": "Synthetic Explain/Analyze and node selection; no live execution safety, late-generation native race or export proof.",
      "sourceBlob": "90a88af124831a90c177906cf2275b15487bb158"
    },
    {
      "id": "CAP-15",
      "type": "EMBEDDED_REGISTER",
      "path": "docs/architecture/ux-convergence-coverage-register.md",
      "disposition": "EVIDENCE_COMPLETE",
      "pr": 406,
      "sourceHead": "0f022427225a4b222d352ddade7c59f4e1dbe147",
      "reportCommit": "be7db22c669ae6bd4b8c1ac23187c216e49d752c",
      "run": 38721215076,
      "workflowConclusion": "success",
      "artifact": 11965871767,
      "artifactSourceHead": "0f022427225a4b222d352ddade7c59f4e1dbe147",
      "artifactExpired": false,
      "newScreenshots": 2,
      "notes": "Synthetic proposal/repair explicit Apply versus Run; ordinary reused 1440x972 images retain original provenance; real model UV.",
      "sourceBlob": "90a88af124831a90c177906cf2275b15487bb158"
    },
    {
      "id": "CAP-16",
      "type": "EMBEDDED_REGISTER",
      "path": "docs/architecture/ux-convergence-coverage-register.md",
      "disposition": "EVIDENCE_COMPLETE",
      "pr": 406,
      "sourceHead": "178700809b85add44d88c44799cc12baed76b51d",
      "reportCommit": "8f0133922690c999f9c995211e49947c2a3976b4",
      "run": 38721954515,
      "workflowConclusion": "success",
      "artifact": 11965678386,
      "artifactSourceHead": "178700809b85add44d88c44799cc12baed76b51d",
      "artifactExpired": false,
      "newScreenshots": 4,
      "notes": "Explicit PromQL histogram cases; fixture SQL-shaped results are illustrative. Histogram override workspace-loss NON02-01 remains.",
      "sourceBlob": "90a88af124831a90c177906cf2275b15487bb158"
    },
    {
      "id": "CAP-17",
      "type": "EMBEDDED_REGISTER",
      "path": "docs/architecture/ux-convergence-coverage-register.md",
      "disposition": "EVIDENCE_COMPLETE",
      "pr": 406,
      "sourceHead": "ec0641ea9f33e16a05e8d23de3b27ac807e62834",
      "reportCommit": "2525623335f3aa6c4bd946d653135bba6b5fcda8",
      "run": 38754779526,
      "workflowConclusion": "success",
      "artifact": 11982702976,
      "artifactSourceHead": "ec0641ea9f33e16a05e8d23de3b27ac807e62834",
      "artifactExpired": false,
      "newScreenshots": 4,
      "notes": "Bounded labels/range/resolution; no live metadata/races, extreme scale or provider acceptance.",
      "sourceBlob": "90a88af124831a90c177906cf2275b15487bb158"
    },
    {
      "id": "CAP-18",
      "type": "STANDALONE_REPORT",
      "path": "docs/audit/391/batches/CAP-18.md",
      "disposition": "EVIDENCE_COMPLETE",
      "pr": 412,
      "sourceHead": "34753c046b18ba838331a5c3652b8ac429ed7b89",
      "reportCommit": "909cb45b5d59d3b2758976ce1a70fd3c314c84ae",
      "run": 38763236819,
      "workflowConclusion": "success",
      "artifact": 11986523589,
      "artifactSourceHead": "34753c046b18ba838331a5c3652b8ac429ed7b89",
      "artifactExpired": false,
      "newScreenshots": 5,
      "notes": "Scoped native LogQL plus generator/unit boundaries; inherited raw formatter race UX-05 FAIL. Restored-line replacement intent/regex backend UV.",
      "sourceBlob": "ac5656fe1ae84ccb5248ef75cd5aa1fe7d67d47b"
    },
    {
      "id": "CAP-19",
      "type": "STANDALONE_REPORT",
      "path": "docs/audit/391/batches/CAP-19.md",
      "disposition": "EVIDENCE_COMPLETE",
      "pr": 420,
      "sourceHead": "345382a72d904e5bc03c668aec9184da9108ddb8",
      "reportCommit": "fba7f7bd5b6b8d73430bac15729898dcfe0268d3",
      "run": 38772943101,
      "workflowConclusion": "success",
      "artifact": 11992208313,
      "artifactSourceHead": "345382a72d904e5bc03c668aec9184da9108ddb8",
      "artifactExpired": false,
      "newScreenshots": 5,
      "notes": "L16 nested [object Object] and L18/X10 silent rejected clipboard FAIL; synthetic payloads/virtual list only.",
      "sourceBlob": "658a9c89df61ff2483ead06f8cc3a97db648f15a"
    },
    {
      "id": "CAP-20",
      "type": "STANDALONE_REPORT",
      "path": "docs/audit/391/batches/CAP-20.md",
      "disposition": "EVIDENCE_COMPLETE",
      "pr": 421,
      "sourceHead": "ce088a2bdfcd0f710fc93a15561d05a208badcae",
      "reportCommit": "9836b7fb0f75c64cd024a36e446ec34cfbde78d1",
      "run": 38773038498,
      "workflowConclusion": "success",
      "artifact": 11992971450,
      "artifactSourceHead": "ce088a2bdfcd0f710fc93a15561d05a208badcae",
      "artifactExpired": false,
      "newScreenshots": 4,
      "notes": "Patterns/promoted and local fallback cases verified; provider, malformed types and extreme-cardinality UV.",
      "sourceBlob": "958955bbfb85abbc6fbbe66d95e8e7dca14477a2"
    },
    {
      "id": "CAP-21",
      "type": "STANDALONE_REPORT",
      "path": "docs/audit/391/batches/CAP-21.md",
      "disposition": "PARTIAL",
      "pr": 427,
      "sourceHead": "bb66ca4dcb83b5edb3a87f93cf3a82221dfd01bd",
      "reportCommit": "adc1a762844eda6bb7f95434ea95a95fda04b8e0",
      "run": 38780232482,
      "workflowConclusion": "success",
      "artifact": 11996675450,
      "artifactSourceHead": "bb66ca4dcb83b5edb3a87f93cf3a82221dfd01bd",
      "artifactExpired": false,
      "newScreenshots": 4,
      "notes": "Accepted recovery #427 of #422; four inspected images. Raw editor height defect; L26 rolling handoff/domain and extra-state visuals UV.",
      "sourceBlob": "6a5bde542b09f6f1eb1934fcd14cbaa5ce916802"
    },
    {
      "id": "CAP-22",
      "type": "STANDALONE_REPORT",
      "path": "docs/audit/391/batches/CAP-22.md",
      "disposition": "PARTIAL",
      "pr": 423,
      "sourceHead": "52fd2e08e82446fa37be3930c497b540f5f50dc2",
      "reportCommit": "469410f162d7118649beff2397a1985a96084548",
      "run": 38778100440,
      "workflowConclusion": "success",
      "artifact": 11994213479,
      "artifactSourceHead": "52fd2e08e82446fa37be3930c497b540f5f50dc2",
      "artifactExpired": false,
      "newScreenshots": 5,
      "notes": "Raw Format/Copy, delayed/failed/stale/empty metadata and additional bounds UV. Protocol-independent generic facet intent unresolved.",
      "sourceBlob": "3bea29b7147656ad42041c768969acac60cbbc4c"
    },
    {
      "id": "CAP-23",
      "type": "STANDALONE_REPORT",
      "path": "docs/audit/391/batches/CAP-23.md",
      "disposition": "PARTIAL",
      "pr": 428,
      "sourceHead": "8306fb19cd476d2125153fa297bd00a86f5e63f0",
      "reportCommit": "7322aae7430638c298f240011608504ee0952870",
      "run": 38779965647,
      "workflowConclusion": "success",
      "artifact": 11994998803,
      "artifactSourceHead": "8306fb19cd476d2125153fa297bd00a86f5e63f0",
      "artifactExpired": false,
      "newScreenshots": 5,
      "notes": "Accepted recovery #428 of #424; toolbar sample label clipping FAIL T13. Metadata races, multi-value/invalid facets and alternate samples UV.",
      "sourceBlob": "7f4381804845d92613bffe901052450a31d901e9"
    },
    {
      "id": "CAP-24",
      "type": "STANDALONE_REPORT",
      "path": "docs/audit/391/batches/CAP-24.md",
      "disposition": "PARTIAL",
      "pr": 430,
      "sourceHead": "ee031b9d3969bf81f4e6ed36e11314dcaefdd0b3",
      "reportCommit": "daca455dde74086c4395240c437510b953ca5b56",
      "run": 38794494341,
      "workflowConclusion": "success",
      "artifact": 12001392707,
      "artifactSourceHead": "ee031b9d3969bf81f4e6ed36e11314dcaefdd0b3",
      "artifactExpired": false,
      "newScreenshots": 5,
      "notes": "Known-defect characterization PASS; T18 displayed [start,end) membership FAIL VC24-03. Superseded unconditional-failure run retained historically.",
      "sourceBlob": "0b3a9e2ceb4570530275a153b730f3616e38c2aa"
    },
    {
      "id": "CAP-25",
      "type": "STANDALONE_REPORT",
      "path": "docs/audit/391/batches/CAP-25.md",
      "disposition": "PARTIAL",
      "pr": 431,
      "sourceHead": "e0b3b8e547d711d9f27168ea35d9f285fd46abbb",
      "reportCommit": "3cadf2e41ada6f02e53b06f9d500d84a928ca292",
      "run": 38789455942,
      "workflowConclusion": "success",
      "artifact": 11998819921,
      "artifactSourceHead": "e0b3b8e547d711d9f27168ea35d9f285fd46abbb",
      "artifactExpired": false,
      "newScreenshots": 5,
      "notes": "Map needs full-trace lookups; hierarchy/inspector tested. Sample label clipping corroborates VC23-01; brush during map load/trace switch UV.",
      "sourceBlob": "90e4bb233364248b0288da7565b09943298f43ba"
    },
    {
      "id": "CAP-26",
      "type": "STANDALONE_REPORT",
      "path": "docs/audit/391/batches/CAP-26.md",
      "disposition": "PARTIAL",
      "pr": 433,
      "sourceHead": "0416e50fbf977aa67f8e6f9762d615452ccd82ad",
      "reportCommit": "88c8ba58c95a2ab4faadfc07a8227cbb9b2ade85",
      "run": 38792865339,
      "workflowConclusion": "success",
      "artifact": 12001161095,
      "artifactSourceHead": "0416e50fbf977aa67f8e6f9762d615452ccd82ad",
      "artifactExpired": false,
      "newScreenshots": 6,
      "notes": "R10/R13 FAIL: manufactured zeros and categorical numeric-X Scatter. Other providers/negative configurations UV.",
      "sourceBlob": "45182181e1b7cc00d2bdfc5bf013e4c14045508b"
    },
    {
      "id": "CAP-27",
      "type": "STANDALONE_REPORT",
      "path": "docs/audit/391/batches/CAP-27.md",
      "disposition": "PARTIAL",
      "pr": 434,
      "sourceHead": "175d0ead3a66dace3dee7a318fe4d004ae028bac",
      "reportCommit": "6f172bcfa7e90fdfeab5acd345f5f00869e1c330",
      "run": 38794465569,
      "workflowConclusion": "success",
      "artifact": 12001128524,
      "artifactSourceHead": "175d0ead3a66dace3dee7a318fe4d004ae028bac",
      "artifactExpired": false,
      "newScreenshots": 4,
      "notes": "PG legend/point/brush scoped; expanded-legend PNG absent, pointer/clamps/persistence and provider parity UV.",
      "sourceBlob": "7aa33fcc9ec5b2d5d9e11bbf4508908596a3f329"
    },
    {
      "id": "CAP-28",
      "type": "STANDALONE_REPORT",
      "path": "docs/audit/391/batches/CAP-28.md",
      "disposition": "PARTIAL",
      "pr": 436,
      "sourceHead": "83eeb52e4dfbd3c12979a6888b2d0e9fba22101e",
      "reportCommit": "3c0623d93cf6db9d3af9900b6c4b9b90990ef9f8",
      "run": 38814994606,
      "workflowConclusion": "success",
      "artifact": 12010741400,
      "artifactSourceHead": "83eeb52e4dfbd3c12979a6888b2d0e9fba22101e",
      "artifactExpired": false,
      "newScreenshots": 5,
      "notes": "PNG bytes and anomaly source-point checked; retained-result ownership, feedback containment/cancel, native save/copy, sample limits UV. UI-004 remains unresolved.",
      "sourceBlob": "7eb2bfee6de8061531b9ebe19033a685017368e3"
    },
    {
      "id": "CAP-29",
      "type": "STANDALONE_REPORT",
      "path": "docs/audit/391/batches/CAP-29.md",
      "disposition": "PARTIAL",
      "pr": 435,
      "sourceHead": "f1ca5d6715973ee52f84ad4ad25abcb30dfbca96",
      "reportCommit": "239bc69722af982cb9174cd3101b1527e3946f67",
      "run": 38814864167,
      "workflowConclusion": "success",
      "artifact": 12009723643,
      "artifactSourceHead": "f1ca5d6715973ee52f84ad4ad25abcb30dfbca96",
      "artifactExpired": false,
      "newScreenshots": 3,
      "notes": "Known-defect characterization PASS; nested Escape and failed-Save focus FAIL X01. Native opening autofocus qualified/UV.",
      "sourceBlob": "82a5cb0ddbadc1e6aea78d5c4aeec9c32345fff4"
    },
    {
      "id": "CAP-30",
      "type": "STANDALONE_REPORT",
      "path": "docs/audit/391/batches/CAP-30.md",
      "disposition": "PARTIAL",
      "pr": 437,
      "sourceHead": "e9c893853586a3218d4b0c3ed3e103c82d04d9b3",
      "reportCommit": "e4c036d853e6f5fe6aecd794a2404c7331c5c13e",
      "run": 38815371248,
      "workflowConclusion": "success",
      "artifact": 12010408386,
      "artifactSourceHead": "e9c893853586a3218d4b0c3ed3e103c82d04d9b3",
      "artifactExpired": false,
      "newScreenshots": 5,
      "notes": "PromQL Copy SQL label and rejected Loki copy FAIL; dedicated X11 identifier-copy UV. Query-level handoff only; actual OS/paste/Grafana UV.",
      "sourceBlob": "ca093985a097c573bd84d9ad2530ce7375fffd72"
    },
    {
      "id": "NON-01",
      "type": "STANDALONE_REPORT",
      "path": "docs/audit/391/batches/NON-01.md",
      "disposition": "EVIDENCE_COMPLETE",
      "pr": 415,
      "sourceHead": "bd4da52b80f65618a4908529ae4df91cc3b124e3",
      "reportCommit": "834f7b4befbc78467754bbcdffe619bb1d2c37de",
      "run": 38763003457,
      "workflowConclusion": "failure",
      "artifact": null,
      "artifactSourceHead": null,
      "artifactExpired": null,
      "newScreenshots": 0,
      "notes": "Executed synthetic lazy/explicit connect race expected failures NON01-06; A04/A07/A08 FAIL. Real teardown/physical cancellation/auth UV.",
      "sourceBlob": "736feb7f6aa754db038ba4180b9e07b4240d95a8"
    },
    {
      "id": "NON-02",
      "type": "STANDALONE_REPORT",
      "path": "docs/audit/391/batches/NON-02.md",
      "disposition": "EVIDENCE_COMPLETE",
      "pr": 413,
      "sourceHead": "c3b9e055b3298911c55e533202048800df5b0001",
      "reportCommit": "062af9bd25f1987e91d097af97e78be00730e7ed",
      "run": 38759788917,
      "workflowConclusion": "cancelled",
      "artifact": null,
      "artifactSourceHead": null,
      "artifactExpired": null,
      "newScreenshots": 0,
      "notes": "Executed workspace/preset tests; A19 explicit histogram override loss FAIL NON02-01. Packaged restart/missing-profile UI/durability UV.",
      "sourceBlob": "a743174fced67c84fabf23be3a79b71f5642e106"
    },
    {
      "id": "NON-03",
      "type": "STANDALONE_REPORT",
      "path": "docs/audit/391/batches/NON-03.md",
      "disposition": "EVIDENCE_COMPLETE",
      "pr": 414,
      "sourceHead": "1fdc3a604310622e7f99ef09ba7a6ed374c6b4ac",
      "reportCommit": "369061f0641cd3ae86c79e9c85998dcef97c8412",
      "run": 38759956034,
      "workflowConclusion": "failure",
      "artifact": null,
      "artifactSourceHead": null,
      "artifactExpired": null,
      "newScreenshots": 0,
      "notes": "Mocked encryption/ADC and real local serialization; C10 unredacted synthetic provider message FAIL NON03-01 (no real credential leak established). Native OS UV.",
      "sourceBlob": "34a9a3f0bf5ba87d20ef7451478de0f7b5b6e425"
    },
    {
      "id": "NON-04",
      "type": "STANDALONE_REPORT",
      "path": "docs/audit/391/batches/NON-04.md",
      "disposition": "PARTIAL",
      "pr": 416,
      "sourceHead": "ac99126feb212986f4acffcc058172af469fc73e",
      "reportCommit": "0f4a39bc597c0b75cce95c0e4dfe6ca3b4e6b8ec",
      "run": 38765295024,
      "workflowConclusion": "cancelled",
      "artifact": null,
      "artifactSourceHead": null,
      "artifactExpired": null,
      "newScreenshots": 0,
      "notes": "Native DuckDB/SQLite and mocks pass; PG actual read-only, EXPLAIN effects and BQ script-child security UV.",
      "sourceBlob": "7631c390a092ed47c78e2cd2a792163de8882c7a"
    },
    {
      "id": "NON-05",
      "type": "STANDALONE_REPORT",
      "path": "docs/audit/391/batches/NON-05.md",
      "disposition": "PARTIAL",
      "pr": 418,
      "sourceHead": "e50b8f7796382767cd0da424f4996c88a4aa7dc2",
      "reportCommit": "77d779c08168a3ffb329aeeacef8a02082ecb401",
      "run": 38769180343,
      "workflowConclusion": "cancelled",
      "artifact": null,
      "artifactSourceHead": null,
      "artifactExpired": null,
      "newScreenshots": 0,
      "notes": "Three expected-failure correctness repros FAIL S16; no injection exploit/live syntax claim. Token-blind materialization and BQ identifier conversion.",
      "sourceBlob": "da2931197105091932fbd3648b12e7ad0d34efbf"
    },
    {
      "id": "NON-06",
      "type": "STANDALONE_REPORT",
      "path": "docs/audit/391/batches/NON-06.md",
      "disposition": "PARTIAL",
      "pr": 417,
      "sourceHead": "c3ec6f04b87ae3bac4ec343642756e3a09ed41e0",
      "reportCommit": "906960284260175f88761d9ff93fe2fd79351dbd",
      "run": 38765367153,
      "workflowConclusion": "cancelled",
      "artifact": null,
      "artifactSourceHead": null,
      "artifactExpired": null,
      "newScreenshots": 0,
      "notes": "Unit job executed tests despite stale conditional summary. S26 duplicate selection confirmed; stale metadata expected failure. Provider/catalog authorization UV.",
      "sourceBlob": "34d1302c9c62612a6df2aa46a09a827a1f53b376"
    },
    {
      "id": "NON-07",
      "type": "STANDALONE_REPORT",
      "path": "docs/audit/391/batches/NON-07.md",
      "disposition": "PARTIAL",
      "pr": 419,
      "sourceHead": "e7b4c978183e7cb832448d2136bfbe064beed9ff",
      "reportCommit": "cfcf1bb6e5d85e5a6b01d593b0e37ac053ca8c16",
      "run": 38769577600,
      "workflowConclusion": "failure",
      "artifact": null,
      "artifactSourceHead": null,
      "artifactExpired": null,
      "newScreenshots": 0,
      "notes": "C12 null/blank->zero and unsafe dry-run rounding confirmed. UI-002 requirement unresolved; renderer stats absence is not approved UI defect.",
      "sourceBlob": "194d79219368ad39ac9d1b9e259f1aed14d33e3e"
    }
  ],
  "counts": {
    "original": 175,
    "assigned": 175,
    "VV": 147,
    "BV": 164,
    "SO_ONLY": 4,
    "UV_ONLY": 1,
    "VISUAL_UV": 3,
    "BEHAVIOR_UV": 1,
    "VISUAL_NA": 19,
    "FAIL": 25,
    "CAP": 30,
    "NON": 7,
    "EVIDENCE_COMPLETE": 23,
    "PARTIAL": 14,
    "PROVISIONAL_RESOLVED": 3,
    "PROVISIONAL_UNRESOLVED": 2,
    "MISSING_SOURCES": 0,
    "DUPLICATE_OWNERS": 0
  },
  "failedIDs": [
    "A01",
    "A02",
    "A03",
    "A04",
    "A07",
    "A08",
    "A19",
    "C10",
    "C12",
    "L02",
    "L16",
    "L18",
    "R02",
    "R04",
    "R10",
    "R13",
    "R19",
    "S16",
    "S19",
    "S26",
    "T13",
    "T18",
    "X01",
    "X06",
    "X10"
  ],
  "standaloneBlobs": {
    "docs/audit/391/batches/CAP-18.md": "ac5656fe1ae84ccb5248ef75cd5aa1fe7d67d47b",
    "docs/audit/391/batches/CAP-19.md": "658a9c89df61ff2483ead06f8cc3a97db648f15a",
    "docs/audit/391/batches/CAP-20.md": "958955bbfb85abbc6fbbe66d95e8e7dca14477a2",
    "docs/audit/391/batches/CAP-21.md": "6a5bde542b09f6f1eb1934fcd14cbaa5ce916802",
    "docs/audit/391/batches/CAP-22.md": "3bea29b7147656ad42041c768969acac60cbbc4c",
    "docs/audit/391/batches/CAP-23.md": "7f4381804845d92613bffe901052450a31d901e9",
    "docs/audit/391/batches/CAP-24.md": "0b3a9e2ceb4570530275a153b730f3616e38c2aa",
    "docs/audit/391/batches/CAP-25.md": "90e4bb233364248b0288da7565b09943298f43ba",
    "docs/audit/391/batches/CAP-26.md": "45182181e1b7cc00d2bdfc5bf013e4c14045508b",
    "docs/audit/391/batches/CAP-27.md": "7aa33fcc9ec5b2d5d9e11bbf4508908596a3f329",
    "docs/audit/391/batches/CAP-28.md": "7eb2bfee6de8061531b9ebe19033a685017368e3",
    "docs/audit/391/batches/CAP-29.md": "82a5cb0ddbadc1e6aea78d5c4aeec9c32345fff4",
    "docs/audit/391/batches/CAP-30.md": "ca093985a097c573bd84d9ad2530ce7375fffd72",
    "docs/audit/391/batches/NON-01.md": "736feb7f6aa754db038ba4180b9e07b4240d95a8",
    "docs/audit/391/batches/NON-02.md": "a743174fced67c84fabf23be3a79b71f5642e106",
    "docs/audit/391/batches/NON-03.md": "34a9a3f0bf5ba87d20ef7451478de0f7b5b6e425",
    "docs/audit/391/batches/NON-04.md": "7631c390a092ed47c78e2cd2a792163de8882c7a",
    "docs/audit/391/batches/NON-05.md": "da2931197105091932fbd3648b12e7ad0d34efbf",
    "docs/audit/391/batches/NON-06.md": "34d1302c9c62612a6df2aa46a09a827a1f53b376",
    "docs/audit/391/batches/NON-07.md": "194d79219368ad39ac9d1b9e259f1aed14d33e3e"
  },
  "candidateIDs": [
    "VC05-01",
    "VC05-02",
    "VC05-03",
    "VC06-01",
    "VC06-02",
    "VC07-01",
    "VC07-02",
    "VC08-01",
    "VC08-02",
    "VC09-01",
    "VC09-02",
    "VC10-01",
    "VC10-02",
    "VC11-01",
    "VC12-01",
    "VC12-02",
    "VC12-03",
    "VC12-04",
    "VC13-01",
    "VC13-02",
    "VC13-03",
    "VC14-01",
    "VC14-02",
    "VC15-01",
    "VC15-02",
    "VC16-01",
    "VC16-02",
    "VC16-03",
    "VC17-01",
    "VC17-02",
    "VC18-01",
    "VC18-02",
    "VC18-03",
    "VC18-04",
    "VC18-05",
    "VC19-01",
    "VC19-02",
    "VC19-03",
    "VC19-04",
    "VC19-05",
    "VC20-01",
    "VC20-02",
    "VC20-03",
    "VC20-04",
    "VC21-01",
    "VC21-02",
    "VC21-03",
    "VC21-04",
    "VC22-01",
    "VC22-02",
    "VC22-03",
    "VC22-04",
    "VC22-05",
    "VC23-01",
    "VC23-02",
    "VC23-03",
    "VC23-04",
    "VC23-05",
    "VC24-01",
    "VC24-02",
    "VC24-03",
    "VC24-04",
    "VC24-05",
    "VC25-01",
    "VC25-02",
    "VC25-03",
    "VC25-04",
    "VC25-05",
    "VC25-06",
    "VC26-01",
    "VC26-02",
    "VC26-03",
    "VC26-04",
    "VC26-05",
    "VC27-01",
    "VC27-02",
    "VC27-03",
    "VC27-04",
    "VC28-01",
    "VC28-02",
    "VC28-03",
    "VC28-04",
    "VC28-05",
    "VC29-01",
    "VC29-03",
    "VC29-02",
    "VC29-04",
    "VC30-01",
    "VC30-02",
    "VC30-03",
    "VC30-04",
    "VC30-05",
    "VC30-06",
    "NON01-06",
    "NON01-01",
    "NON01-02",
    "NON01-03",
    "NON01-04",
    "NON01-05",
    "NON02-01",
    "NON02-02",
    "NON02-03",
    "NON02-04",
    "NON02-05",
    "NON03-01",
    "NON03-02",
    "NON03-03",
    "NON03-04",
    "NON03-05",
    "NON04-01",
    "NON04-02",
    "NON04-03",
    "NON04-04",
    "NON04-05",
    "NON04-06",
    "NON05-01",
    "NON05-02",
    "NON05-03",
    "NON05-04",
    "NON05-05",
    "NON05-06",
    "NON05-07",
    "NON06-01",
    "NON06-02",
    "NON06-03",
    "NON06-04",
    "NON06-05",
    "NON06-06",
    "NON06-07",
    "NON07-01",
    "NON07-02",
    "NON07-03",
    "NON07-04",
    "NON07-05",
    "NON07-06"
  ]
}
```
