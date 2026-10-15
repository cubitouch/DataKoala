# AGG-02 — Independent coverage completeness and evidence challenge

**Final disposition: PARTIAL.** The original 175-ID inventory and 37-source ownership can be independently reconstructed. Nine feature-level classifications differ from AGG-01. All 25 mapped failed-acceptance IDs are preserved. Historical visual provenance remains qualified; zero original archive PNGs were independently reopened; one supplementary historical CAP-09 log frame was inspected, with distinct provenance.

## A. Execution and independence declaration

- Immutable integration base: `47ad04e82208cdfeae47961ae8916f9d8cd85847`.
- PR #406 was open/draft on `audit/391-ux-convergence`; PR #438 was merged into that exact head. Branch and open-PR checks found no competing AGG-02 writer before local branch creation.
- Isolated branch: `audit/391-agg-02-independent-coverage`; draft PR targets `audit/391-ux-convergence`. Publication URL and resulting commit/CI identifiers belong to the PR handoff, rather than a fabricated self-referential commit.
- Read root AGENTS.md, inventory, coverage register, Phase 1A/1B architecture audit, visual-documentation guidance, AGG-01 and its validator, all 17 preserved CAP records and 20 standalone reports. CAP-07 was separately read at its actual historical completion revision.
- The inventory comes from its original atomic rows. Ownership comes from the pre-AGG-01 register at `e4c036d853e6f5fe6aecd794a2404c7331c5c13e`. Feature support comes from original embedded feature rows/completion narratives and standalone per-feature matrices, with later cross-batch support explicitly identified. AGG-01 active classifications are comparison inputs only. Its embedded snapshot and validator output did not determine the independent ledger or its totals.
- Live GitHub metadata was fetched anew for all 37 generating runs, including individual NON job conclusions. Named UI log results were matched to exact unchanged test sources at `c148f91906a69529318dec170a7922e4d9fa465e`, with their actual synthetic merge checkout separately recorded.
- No local linting/formatting, production tests, provider execution, screenshot regeneration or production edits. Only the three permitted aggregation files change.

“Independent” here means an independent source reconstruction and challenge, plus direct remote metadata/log checks. It does not mean 175 behaviors were rerun. Source-reported original-resolution inspection remains attributed evidence; an artifact listing is not an image review. Signed archive transfers for CAP-06/09 failed with HTTP 502. No unavailable image is marked independently reviewed.

## B. Original inventory reconstruction

The complete enumeration, exact definitions, provider scopes, inventory rows and ownership citations are in [agg-02-evidence.json](agg-02-evidence.json), `ledger[0..174]`. Each source reference identifies an immutable commit, path, line and exact quote. This is a full-ID review ledger, not a sample or a duplicate of AGG-01's snapshot.

| Family | Original enumeration | Count |
| --- | --- | ---: |
| A | A01–A25 | 25 |
| S | S01–S28 | 28 |
| C | C01–C18 | 18 |
| P | P01–P17 | 17 |
| L | L01–L26 | 26 |
| T | T01–T24 | 24 |
| R | R01–R25 | 25 |
| X | X01–X12 | 12 |
| Total | Unique original atomic rows | 175 |

There are no duplicate IDs, missing assignments or unexplained duplicate primary owners. The original register's 168-row defect and damaged T10 are real historical document damage. Independent inventory rows and CAP-23/24 source matrices supply T10–T17 without relying on AGG-01's repaired active rows. Five UI leads and N01–N11 are excluded. Aliases remain original IDs but do not count as independent implementations or executions.

## C. Full coverage challenge

Every ledger entry includes definition/scope, historical owner, completion source, claimed visual/behavior/source evidence, actual support, independent modalities, acceptance failure citation, residual conditions, AGG-01 comparison and findings. Original claims are retained as claims. The residual column is not a passing checklist.

Eight scoped behaviors have stronger execution support than AGG-01's SO labels. Historical [UI job 116153333548](https://github.com/cubitouch/DataKoala/actions/runs/38652171501/job/116153333548) logs the exact successful suites; the ledger embeds timestamped relevant log lines and named source assertions. Their source files are byte-identical between the generating head and integration base. This supports executed jsdom/domain BV, not a general “CI passed” inference or Electron acceptance.

| ID | AGG-01 behavior | Independent behavior and exact scoped assertion |
| --- | --- | --- |
| A06 | SO | BV — ConnectionStatus asserts connected text/data-state, polite aria-live and title; CSS glow/native announcement unverified |
| A11 | SO | BV — Sidebar restores filtered tree and reports failed manual refresh |
| A13 | SO | BV — relationColumns discards an old-generation response |
| A20 | SO | BV — ModeSwitch clicks Builder for SQL/PromQL/TraceQL/LogQL labels; separate Explain lock |
| S03 | SO | BV — contextual completion returns one typed column provider; native popup UV |
| S14 | SO | BV — Series order/removal/X-Y exclusion; live cardinality UV |
| P02 | SO | BV — selecting a metric updates Builder while preserving raw PromQL |
| L04 | SO | BV — useful Loki labels, hidden internal labels and lazy value selection |

S02 remains behavior SO: dialect mapping/token colors do not execute syntax correctness. P03 remains SO/SO: the metadata test fixture contains type/help/unit, but its assertions do not verify the populated detail contract. X11 remains UV/UV. A25 changes visual VV→UV because the report does not establish original-resolution inspection of the resized image. Its measured pointer/key BV is preserved.

VV is retained only for a scoped relevant state with traceable source review support. In particular, R07's picker VV is not Bar pixel acceptance; R17's initial legend VV is not visual verification of the uncaptured expanded state. Neither gets full feature acceptance from a scoped VV flag.

## D. Batch audit

The JSON `batches` array contains all 37 separately assessed sources, original dispositions, remote generating SHA/run/artifact metadata, workflow versus individual job conclusions, review provenance and recovery lineage. The following table separates delivered audit evidence from product correctness. “Scoped” does not certify every original manual-verification condition.

| Batch | Source disposition | Direct remote generating-run check | Independent qualification |
| --- | --- | --- | --- |
| CAP-01 | EVIDENCE_COMPLETE | [38602027521](https://github.com/cubitouch/DataKoala/actions/runs/38602027521) failure | PG picker/validation/TLS only; whole capture workflow failed later. V-03 remains failed. |
| CAP-02 | EVIDENCE_COMPLETE | [38605551434](https://github.com/cubitouch/DataKoala/actions/runs/38605551434) success | PG edit/delete/read-only form only; delete Escape/Cancel focus BODY remains failed. |
| CAP-03 | EVIDENCE_COMPLETE | [38608584909](https://github.com/cubitouch/DataKoala/actions/runs/38608584909) success | BQ/LF/SQ payloads; real chooser, files, ADC and enforcement UV. |
| CAP-04 | EVIDENCE_COMPLETE | [38614943136](https://github.com/cubitouch/DataKoala/actions/runs/38614943136) success | OBS3 UID variations; no live gcx authentication. |
| CAP-05 | EVIDENCE_COMPLETE | [38617523822](https://github.com/cubitouch/DataKoala/actions/runs/38617523822) success | Actual PG Retry/filter; refresh/lazy native substates remain UV. Named jsdom tests support scoped BV. |
| CAP-06 | EVIDENCE_COMPLETE | [38617523822](https://github.com/cubitouch/DataKoala/actions/runs/38617523822) success | Original montage review ambiguous; later CAP-18 P02/L04 and CAP-22 T04 visuals support their bounded states. P03 SO. |
| CAP-07 | EVIDENCE_COMPLETE | [38622912415](https://github.com/cubitouch/DataKoala/actions/runs/38622912415) success | Historical six-ID narrative recovered exactly from 9ef44d8; running flag injected, no live pending query. |
| CAP-08 | EVIDENCE_COMPLETE | [38640786557](https://github.com/cubitouch/DataKoala/actions/runs/38640786557) success | PG/Loki CRUD/reset; stubbed native confirmation, ephemeral repository; durable restart UV. |
| CAP-09 | EVIDENCE_COMPLETE | [38645215482](https://github.com/cubitouch/DataKoala/actions/runs/38645215482) success | Resizing/clipboard assertions supported; original resized image review uncertain; A25 visual UV. |
| CAP-10 | EVIDENCE_COMPLETE | [38652171440](https://github.com/cubitouch/DataKoala/actions/runs/38652171440) success | Populated PG/BQ editor; autocomplete exact helper/test assertions executed; native popup/caret UV. |
| CAP-11 | EVIDENCE_COMPLETE | [38710823797](https://github.com/cubitouch/DataKoala/actions/runs/38710823797) success | PG dimensions; Series selection tested in jsdom, not operated natively; custom endpoints/provider cardinality UV. |
| CAP-12 | EVIDENCE_COMPLETE | [38712444172](https://github.com/cubitouch/DataKoala/actions/runs/38712444172) success | CSV/JSON native scope; resize-sort failure retained R02/R04; glyph support remains unverified. |
| CAP-13 | EVIDENCE_COMPLETE | [38718496827](https://github.com/cubitouch/DataKoala/actions/runs/38718496827) success | Local versus promoted filters; native Escape loses focus S19/R19; outside-click policy unresolved. |
| CAP-14 | EVIDENCE_COMPLETE | [38719221058](https://github.com/cubitouch/DataKoala/actions/runs/38719221058) success | Synthetic Explain/Analyze flags and graph identity; no live Analyze side-effect safety claim. |
| CAP-15 | EVIDENCE_COMPLETE | [38721215076](https://github.com/cubitouch/DataKoala/actions/runs/38721215076) success | Explicit AI review/Apply versus Run; synthetic PG, historical ordinary images keep their 1440x972 provenance. |
| CAP-16 | EVIDENCE_COMPLETE | [38721954515](https://github.com/cubitouch/DataKoala/actions/runs/38721954515) success | Classic/native/unknown histogram controls; seeded SQL-shaped results do not prove Prometheus data. |
| CAP-17 | EVIDENCE_COMPLETE | [38754779526](https://github.com/cubitouch/DataKoala/actions/runs/38754779526) success | Labels/range/step; bounded 200 options; no large-provider performance or live metadata proof. |
| CAP-18 | EVIDENCE_COMPLETE | [38763236819](https://github.com/cubitouch/DataKoala/actions/runs/38763236819) success | Advanced LogQL and exact requests; restored arrays injected; raw formatter expected failures retained. |
| CAP-19 | EVIDENCE_COMPLETE | [38772943101](https://github.com/cubitouch/DataKoala/actions/runs/38772943101) success | Virtual logs/inspector; nested object presentation and rejected clipboard failed; unknown severity/OS UV. |
| CAP-20 | EVIDENCE_COMPLETE | [38773038498](https://github.com/cubitouch/DataKoala/actions/runs/38773038498) success | Patterns and safe promotion/fallback; malformed provider types and extreme cardinality UV. |
| CAP-21 | PARTIAL | [38780232482](https://github.com/cubitouch/DataKoala/actions/runs/38780232482) success | Original #422 frozen evidence, report recovery #427 counted once; raw editor height defect and relative range UV. |
| CAP-22 | PARTIAL | [38778100440](https://github.com/cubitouch/DataKoala/actions/runs/38778100440) success | HTTP/RPC; real raw Format/Copy and delayed/failed/stale metadata not covered. |
| CAP-23 | PARTIAL | [38779965647](https://github.com/cubitouch/DataKoala/actions/runs/38779965647) success | Original #424 frozen evidence, report recovery #428 counted once; T13 clipping failed; other samples/metadata races UV. |
| CAP-24 | PARTIAL | [38794494341](https://github.com/cubitouch/DataKoala/actions/runs/38794494341) success | Exact displayed-boundary characterization succeeded; T18 product FAIL; raw floating-point edge contract not separately proved. |
| CAP-25 | PARTIAL | [38789455942](https://github.com/cubitouch/DataKoala/actions/runs/38789455942) success | Filtered map requires full-trace lookups; trace-switch stale inspector and in-flight brush UV. |
| CAP-26 | PARTIAL | [38792865339](https://github.com/cubitouch/DataKoala/actions/runs/38792865339) success | Scatter manufactured zeros/numeric category spacing failed R10/R13; wider negative/provider matrix UV. |
| CAP-27 | PARTIAL | [38794465569](https://github.com/cubitouch/DataKoala/actions/runs/38794465569) success | PG legend/point/brush; initial legend VV is not resized-state visual acceptance; pointer/clamps/persistence UV. |
| CAP-28 | PARTIAL | [38814994606](https://github.com/cubitouch/DataKoala/actions/runs/38814994606) success | Export bytes/anomaly identity; retained-result and feedback/cancel policy unresolved; UI-004 remains open. |
| CAP-29 | PARTIAL | [38814864167](https://github.com/cubitouch/DataKoala/actions/runs/38814864167) success | Nested Escape and failed-Save focus failed X01; normal native opening autofocus qualified. |
| CAP-30 | PARTIAL | [38815371248](https://github.com/cubitouch/DataKoala/actions/runs/38815371248) success | Exact query/log/Grafana/diagram payloads; X11 identifiers not established by TraceQL query copy. |
| NON-01 | EVIDENCE_COMPLETE | [38763003457](https://github.com/cubitouch/DataKoala/actions/runs/38763003457) failure | Executed deterministic lazy/explicit intent expected failures A04/A07/A08; logical invalidation is not physical cancellation. |
| NON-02 | EVIDENCE_COMPLETE | [38759788917](https://github.com/cubitouch/DataKoala/actions/runs/38759788917) cancelled | Local deterministic 117 ordinary passes plus two expected failures; override loss A19 failed; packaged restore UV. |
| NON-03 | EVIDENCE_COMPLETE | [38759956034](https://github.com/cubitouch/DataKoala/actions/runs/38759956034) failure | Mocked platform encryption and ADC; synthetic upstream-message exposure C10 failed; no real credential leak established. |
| NON-04 | PARTIAL | [38765295024](https://github.com/cubitouch/DataKoala/actions/runs/38765295024) cancelled | Native DuckDB/SQLite and mocked BQ/PG guards; actual PG read-only and script-child/EXPLAIN security UV. |
| NON-05 | PARTIAL | [38769180343](https://github.com/cubitouch/DataKoala/actions/runs/38769180343) cancelled | 13 generator assertions, three desired-invariant expected failures S16; no live syntax or injection exploit claim. |
| NON-06 | PARTIAL | [38765367153](https://github.com/cubitouch/DataKoala/actions/runs/38765367153) cancelled | Unit job succeeded despite cancelled workflow and stale conditional summary; duplicate/stale-context S26 failures retained. |
| NON-07 | PARTIAL | [38769577600](https://github.com/cubitouch/DataKoala/actions/runs/38769577600) failure | Unit job succeeded; malformed null/blank zero and unsafe Int64 estimate rounding C12 failed; UI contract unresolved. |

No source disposition is rewritten. The independently parsed declarations remain 23 EVIDENCE_COMPLETE / 14 PARTIAL. They measure completion under different explicitly scoped batch definitions, so this is not 23 fully accepted product areas.

## E. Evidence and screenshot challenge

**AGG-02 independently reopened 0 original artifact PNGs and 1 supplementary historical log PNG.** Remote artifact metadata was obtained for all 30 CAP entries, representing 29 distinct archives because CAP-05/06 share one. All have the expected generating head in artifact workflow metadata. This verifies archive identity/availability, not measurements.json, dimensions, pixels or the author's inspection action.

| Check | Directly established | Remaining limit |
| --- | --- | --- |
| CAP-06, run 38617523822 / artifact 11920633396 | Nonexpired archive metadata, head `5aac39dd0d69c3542683f3b0f79fc8931cb31fda`; signed download attempted | HTTP 502; no image bytes, dimensions or visible state independently checked |
| CAP-09, run 38645215482 / artifact 11932551046 | Nonexpired archive metadata, head `296a6ada15031c4455adc89e58fc5a57ce03243e`; signed download attempted | HTTP 502; original resized PNG not independently reviewed |
| All 37 runs | Fresh run conclusions; all individual NON job conclusions | Metadata does not prove each acceptance assertion |
| Eight upgraded BV entries | Exact suite-pass log plus exact named test source at historical head; no intervening test-file change | Historical jsdom/helper assertions; no new runtime reproduction |
| Other VV/BV entries | Original per-feature source claims and boundaries cross-checked | Source-supported, historically executed/reviewed as reported; not independently reproduced here |

CAP-06's wording “opened individually in a desktop screenshot montage” does not by itself establish original-resolution inspection. However CAP-18 E3 explicitly records individual original-resolution review of `selector-prometheus-options-desktop.png` and `selector-loki-options-desktop.png`; those source records support scoped P02/L04 VV. CAP-22's native namespace/service image and Enter scenario separately support T04. These secondary records are explicit ledger citations; they do not retroactively repair the original CAP-06 review chain. P03 is not rescued by images that do not show its populated details.

CAP-09 describes review of PNG/JSON values emitted through CI while offline. That may have exposed the true image, but the record does not establish that fact or its display resolution. A25 is therefore visual UV pending original inspection. A24 has separate Phase 1B clipboard-error/success image review support and keeps scoped VV; it does not depend solely on the new resize image.

## F. High-risk findings

### CAP-07 continuity

The historical narrative at [9ef44d8](https://github.com/cubitouch/DataKoala/blob/9ef44d802fca7645781e1aadbe52bf47ce064089/docs/architecture/ux-convergence-coverage-register.md#cap-07-completion--query-tabs-running-indicator-and-rawbuilder-evidence_complete-scoped) explicitly covers A14/A15/A16/A17/A18/A20, scenario `9a3484fc3c56f773331b1040300c79a8908199ac`, run 38622912415 and artifact 11922344749. Those identities match fresh remote metadata. Native New/rename/Close and inherited PG binding are recorded; the background running flag is injected. Named characterization tests were read, not locally rerun. VC07-01/02 survive in the historical narrative and current assignment table. Losing the narrative did not establish new mode-retention or cross-provider behavior. No restored historical record is manufactured. Broader mode BV now has the specifically executed ModeSwitch test evidence in section C.

### Scoped EVIDENCE_COMPLETE claims

CAP-05 explicitly excludes native refresh/lazy error/retry and connected-status visual variants. Its later named tests support a narrower jsdom BV claim. CAP-06 explicitly leaves P03 and deep metadata branches open; its montage provenance remains qualified. CAP-07 explicitly excludes actual pending query, running confirmation and cross-provider binding. CAP-10 excludes native completion popup/caret and other formatter dialects; CAP-11 excludes native Series/cardinality and custom endpoint editing. CAP-15 is synthetic PG plus attributed older ordinary proposal images, not SQL4/model acceptance. CAP-18's restored parser/filter arrays are setup, not arbitrary UI creation; provider regex acceptance is UV. CAP-19's seven IDs have bounded native scenarios while nested fields/clipboard fail and unknown severity/OS remain UV.

These are documented scope limitations rather than evidence that every EVIDENCE_COMPLETE declaration is false. CAP-06/09 original visual-review uncertainty is a material provenance qualification; CAP-09's A25 VV should not be accepted until reviewed. No blanket batch promotion/demotion is recommended. The scope contract should accompany any later completeness display.

### Confirmed failed acceptance

All 25 IDs are independently associated with original failure statements in the ledger and source-anchor validator. They are corroborated failures, **not newly reproduced failures**. There is no product acceptance promotion.

| Source failure | Inventory IDs | Corroborated result |
| --- | --- | --- |
| V-03 / CAP-02 | A01, A02, A03 | Custom modal keyboard policy; delete returns focus to BODY |
| NON01-06 | A04, A07, A08 | Older lazy completion temporarily overwrites newer pending intent |
| NON02-01 | A19 | Explicit classic/native histogram override lost on workspace parse |
| NON03-01 | C10 | Synthetic upstream sensitive marker retained; real credential leak unproved |
| NON07-01/02 | C12 | Malformed null/blank becomes zero; unsafe dry-run Int64 rounds |
| NON05-01/02/03 | S16 | Quoted placeholders/GoogleSQL promoted identifiers violate correctness |
| NON06-01/02 | S26 | Stale metadata guard expected failure and duplicate selection |
| UX-05 / VC18-04 | L02 | Two late-formatter draft overwrite reproductions |
| VC19-02 | L16 | Nested values become [object Object] |
| V-07 / VC19-01 / VC30-03 | L18, X10 | Rejected log copy has no feedback and unhandled rejection |
| VC12-03 | R02, R04 | Native resizing activates another sort |
| VC13-01 | S19, R19 | Filter menu Escape loses initiating focus |
| VC23-01 | T13 | Sample-size label clipped while request value stays correct |
| VC24-03 | T18 | Shown start excluded, shown end included; fractional internal bounds distinguished |
| VC26-01/02 | R10, R13 | Missing combinations become zero marks; numeric X receives categorical spacing |
| VC29-01/03 | X01 | First Escape removes child and parent; failed Save leaves BODY focus |
| V-08 / VC30-02 | X06 | PromQL action announces Copy SQL |

This is a unique-ID failure ledger, not an exhaustive list of defects. For example VC21-01 raw-editor height is preserved as an additional finding already within failed L02's editor scope; V-04 containment and unverified security leads still require their own precise contract mapping. Do not add neighboring feature failures merely because they share a component.

CAP-24 and CAP-29 current characterization assertions require the precise observed incorrect state. Successful audit execution and failed product acceptance coexist. Source code and reports preserve that distinction; fresh remote capture/publish success corroborates execution provenance. No success status is substituted for a product pass. NON-07's tests named EXPECTED FAILURE are ordinary passing characterizations of incorrect output; NON-01/02/05/06 also contain actual expected-failing desired-invariant tests. These test forms are not interchangeable with passing desired contracts.

### X11 relevance

Inventory X11 is Copy trace details/identifiers for Tempo. CAP-30 copies a TraceQL expression and copies trace/span identifiers from a **Loki** inspector. Those prove X06 and X10 respectively. Neither proves Tempo identifier-copy controls. AGG-01 correctly leaves X11 UV/UV; the source CAP-30 table's “BV only for TraceQL query copy” is irrelevant to X11 acceptance. No capability absence or product defect is inferred merely from unverified controls.

## G. Provisional leads

| Lead | Independent outcome | Evidence and next owner |
| --- | --- | --- |
| UI-001 | Resolved as scoped confirmed focus issue; light-dismiss policy open | CAP-13 VC13-01/03, S19/R19; no new original ID |
| UI-002 | POLICY_UNRESOLVED | Inventory C12 says “UI exposes values where available”; NON-07 finds no approved detailed visible-statistics contract. This is a real verification expectation, not permission to declare absence intentional. Product owner must specify visibility/location/units/missing-state requirements. No confirmed UI defect yet. |
| UI-003 | Resolved duplicate | CAP-12 S21 formatted-text JSON modal, not an untested independent tree capability |
| UI-004 | INSUFFICIENT_EVIDENCE, remains unresolved | CAP-28 checks scale, hidden-series Bar→Line and splitter resize; CAP-27 width step. Dimension/legend-width/tab/restart restoration are not closed. Product/architecture owner defines required persistence scope. |
| UI-005 | Resolved duplicate | CAP-15 S24/S25/X03/X04 explicit review/repair substates |

Three resolved / two unresolved remains supported. “Resolved” means classified/assigned, not fixed or accepted. The pre-AGG register's CAP-08/CAP-05 lead ownership for UI-002/UI-004 was stale; NON-07/CAP-28 are the relevant source owners. AGG-01's owner corrections agree with those sources.

## H. AGG-01 discrepancy register

| Finding | Category / severity / confidence | IDs / batches | AGG-01 claim versus independent source conclusion | Totals impact / action |
| --- | --- | --- | --- | --- |
| AGG02-01 | PROVENANCE_GAP; medium; high confidence in ambiguity | P02/L04/T04, CAP-06 plus CAP-18/22 | Montage wording cannot establish original full-resolution review. Later exact selector review records support bounded VV; original chain remains unresolved. | No VV loss after secondary-source corroboration. Preserve attribution; reopen originals when archive transfer works. |
| AGG02-02 | OVERSTATED / PROVENANCE_GAP; medium; medium confidence | A25, CAP-09 | VV based on CI-emitted image review cannot be established as original-resolution inspection. Pointer/key assertions remain BV. | VV −1. Coverage owner should review original resized PNG and record dimensions/state/head before restoring VV. |
| AGG02-03 | UNDERSTATED; medium; high confidence | A06/A11/A13/A20/S03/S14/P02/L04 | SO labels omit exact successfully executed jsdom/helper assertions; log identifies suites, immutable source identifies assertions. | BV +8; SO-only −3. Recommend scoped BV with runtime type and native gaps retained. |
| AGG02-04 | AGREE with provenance qualification; medium; high confidence | CAP-07 six IDs | Historical narrative genuinely exists and distinguishes injected running presentation from live query execution. | No inventory/owner/failure delta; keep historical reference and do not rewrite completion. |
| AGG02-05 | SOURCE_CONFLICT (stale summary); low; high confidence | S26, NON-06 | Summary remains conditional/pending although its own detailed section and fresh remote Unit job show execution. AGG-01 already qualifies this correctly. | No delta; use detailed executed job plus residual stale-context failure. |
| AGG02-06 | POLICY_UNRESOLVED; medium; high confidence in open decision | C12/UI-002, R17/R24/R25/UI-004 | Broad inventory verification expectations lack precise display/restoration acceptance policy; neither source proves these leads closed. | No delta; product/architecture decisions before declaring defects or intentional omission. |
| AGG02-07 | AGREE; high product relevance; high source confidence | T18/R10/R13/X01/X06/L18/X10 and NON failures | Characterization success preserves failure, not product acceptance. Exact 25-ID associations corroborated from source anchors. | No failure delta. Preserve before AGG-03/04 and any release assessment. |
| AGG02-08 | INSUFFICIENT_EVIDENCE; medium; high confidence | X11, CAP-30 | TraceQL query and Loki ID copies do not cover Tempo trace/span IDs. AGG-01 UV/UV is correct. | No delta; dedicated Tempo copy execution needed. |

Release-relevant correctness/security/focus failures above are distinct from documentation provenance and classification corrections. This review changes neither release gates nor the canonical register. Nine IDs have modality disagreement; the remaining 166 agree at the stated narrow modality granularity. Many agreeing entries still have significant residual acceptance gaps.

## I. Independent totals

VV and BV overlap; these are scoped modality counts, not “fully accepted” feature totals.

| Metric | AGG-01 published | Independently source-supported AGG-02 |
| --- | ---: | ---: |
| Original IDs | 175 | 175 |
| Batch sources | 37 | 37 |
| Declared EVIDENCE_COMPLETE / PARTIAL batches | 23 / 14 | 23 / 14 |
| Scoped VV | 147 | 146 |
| Scoped BV | 164 | 172 |
| SO-only | 4 | 1 |
| Wholly UV | 1 | 1 |
| Failed scoped acceptance IDs | 25 | 25 |
| Provisional resolved / unresolved | 3 / 2 | 3 / 2 |

Exact differences: A25 loses VV. A06/A11/A13/A20/S03/S14/P02/L04 gain bounded executed-test BV. A11/S03/S14 consequently leave the SO-only group. P03 is now the sole SO-only ID; X11 remains wholly UV. No total was edited to meet a test. L04/T04/P02 use named secondary visual evidence without counting new features or duplicate owners.

Independent corroboration is separated by claim type: all 175 inventory identities/ownership assignments and all 37 source declarations are directly checked against original records; all 37 run identities/conclusions and NON job outcomes were checked remotely; eight specifically disputed executed-test claims were matched to log and source. The remaining historical behavioral claims are source-supported and not reproduced by AGG-02. All 146 retained VV claims remain source-reported original-image review, with zero original artifact image inspections; the supplementary log frame is not counted as VV. Nine feature modality claims are disputed; X11 is wholly unverified. Missing behavioral proof is distinct from an otherwise traced archive that cannot currently be transferred.

## J. AGG-03 and AGG-04 handoff

AGG-03 can consume the verified inventory, owner map, attributed evidence and source-supported failures with these qualifications carried explicitly. It must not treat the 146/172 flags as release acceptance or flatten the 23 scoped EVIDENCE_COMPLETE declarations into universal completeness.

Preserve VC07 lineage via the historical record, count CAP-21/23 recovery evidence once, deduplicate shared failure lineage (V-02/VC29-01; V-07/VC19-01/VC30-03; V-08/VC30-02; VC23-01/VC25-06), and keep semantic NON cards nonvisual. AGG-01's candidate index is a navigation aid, not an independent finding count or ranking. No final ranked Atlas is produced here.

Before AGG-04 acceptance claims: retain X11 UV, P03 SO, native completion/caret and provider/OS/packaged limits; resolve UI-002/UI-004 product policy; recover CAP-09 original image review and CAP-06 original chain; test raw-fractional versus displayed T18 endpoints separately. Do not infer provider authorization/security from mocked SDKs or expected-failure tests. Correcting the canonical register requires a separately reviewed change; recommended exact modality edits are in sections C/H.

## K. Final disposition and validation

**PARTIAL.** Meaningful independent source reconstruction and full 175-ID challenge are complete. Material historical visual-review qualifications and unverified product conditions remain. INDEPENDENTLY_CORROBORATED would overstate this result.

Focused validation: `python docs/audit/391/aggregation/validate-agg-02.py --negative-controls` passes. The original six in-memory negative controls reject: missing ID, duplicate ID, fabricated path, failed acceptance promoted to PASS, UV upgraded to BV without execution citation, and independent image-review claim without inspection evidence. Authoritative files are never mutated for negative controls.

The validator independently reads original Git inventory/assignment/disposition records, exact cited Git bytes and curated failure anchors. It compares AGG-01 only as a baseline after reconstruction. It checks source/test identity, evidence vocabulary, references, per-ID comparisons, all five leads and recomputed totals. Git objects are required; unavailable historical objects fail closed rather than substituting AGG-01's snapshot.

Limits: the human-curated failure-to-feature associations and modality interpretations are review judgments. Stored remote metadata/log excerpts are checked for internal consistency offline; the validator cannot reauthenticate remote results, establish behavior from prose, infer acceptance truth, prove screenshot inspection, or detect every semantically irrelevant citation. A structural PASS is neither BV nor VV. It is not integrated into shared CI/workflows, which are outside permitted scope. Applicable PR CI is reported at the final handoff; Quality failures must remain distinguished from successful test/visual jobs.

Stop after AGG-02. Keep its PR draft; no merge, AGG-03/04 execution, canonical edits, production changes, release acceptance or Phase 2.

## L. Bounded historical recovery and closure review

The recovery changes no classifications or totals: **175 IDs, 37 batches, 146 scoped VV, 172 scoped BV, 1 SO-only, 1 wholly UV, 25 failed IDs; PARTIAL**. Source-reported evidence remains separate from the new inspection in `visualRecovery`; `closureReview` records the bounded review.

### Retrieval paths and original provenance

The originals are PR #406 GitHub Actions artifacts, not replacement captures from PR #439. CAP-06 reuses CAP-05's artifact **11920633396**, run **38617523822**, sourceHead `5aac39dd0d69c3542683f3b0f79fc8931cb31fda`. CAP-09 uses artifact **11932551046**, run **38645215482**, sourceHead `296a6ada15031c4455adc89e58fc5a57ce03243e`. Fresh authenticated artifact API requests returned new signed transfer references; both transfers returned **HTTP 502**. The CAP-09 response explicitly reported `Connection refused` from the transfer proxy. No expired signed URL was reused. Direct fresh GitHub API `/actions/artifacts/{id}/zip` requests returned **401 Requires authentication** because the shell has no GitHub credential. The connected generic fetch rejected the binary endpoint (400 unsupported endpoint); Library materialization rejected the transfer reference (INVALID_ARGUMENT/schema validation). No complete archive was recovered.

CAP-06's six relevant reused manifest names are `prometheus-builder-desktop.png`, `loki-builder-desktop.png`, `tempo-builder-desktop.png`, `selector-prometheus-options-desktop.png`, `selector-loki-options-desktop.png`, and `selector-tempo-options-desktop.png`. None was independently opened here or newly generated by CAP-06. A default builder screen does not substantiate P03's populated metadata detail contract.

Historical published measurements were separately recovered from immutable `pr-406/audit/measurements.json` at commits `bccec5da64c9447bc715916714a7d18b685ecaf5` (CAP-06) and `2c21ede5c2cf29101a08aceb07f7da8cfe326c7c` (CAP-09). Their sourceHeads match the generating commits. CAP-06 reports 251 observations and the six entries above at viewport 1440×900, scale/zoom 1. CAP-09 reports 265 observations including `cap09-resized-workspace-desktop.png` at that viewport. These are reported measurement dimensions, not independently verified original PNG headers. Capture jobs 116036331896 and 116130262607 succeeded, respectively logging `AUDIT_OK 191 images; 251 measured states/interactions` and `AUDIT_OK 196 images; 265 measured states/interactions`. These early batches predate standalone status.json; no such file was inferred.

### Exactly one supplementary image inspected

The full-resolution **1440×900** PNG decoded from CAP-09 job 116130262607's `CAP09_PNG_BASE64` line at `2026-10-14T22:08:21.2134174Z` was individually opened at original resolution. Its SHA-256 is `021adc4398859caaf61ec41d2c881265071614caf83461b42bc5c820a22c2fb3`. It corresponds to the log capture immediately after `cap09-resized-workspace-desktop.png`, but **is not proven byte-identical to that archived PNG**: the exact generating `audit.mjs` calls `capture(win, filename)` and then makes a second `webContents.capturePage()` for the log. It is recorded as `HISTORICAL_LOG_ADJACENT_CAPTURE`, not an inspected artifact original.

The frame shows a readable SQL toolbar/editor, sidebar around 240px, focused yellow splitter near y310, and a three-row category/value result table (42, 17, 3) without visible clipping. The recovered measurement reports final sidebar/editor 240/270, mainLeft 248, editorBottom 310 and resultsTop 318. It also reports pointer 320/364, keyboard 304/348, maxima 520/692 and minima 180/180; the inspected frame shows only the final geometry, not those intermediate states. Pixels do not prove keyboard operation, resize behavior or request invariance. Those remain scoped historical behavioral evidence. **A25 stays UV/BV**, pending the original artifact image/provenance recovery; no VV total is restored.

### Eight successful-execution spot checks

All eight checks were matched anew to successful historical UI job **116153333548**, run **38652171501**, and the exact assertions in the actual checkout `f35a8cfb2f4971ba28cbb73f796fd5eb683a9b7a` (PR source `c148f91906a69529318dec170a7922e4d9fa465e`). The six test-file Git blobs and `vitest.ui.config.ts` match that checkout. Runtime: **Node 24.21.0, pnpm 9.15.9, Vitest 4.1.11, jsdom, Ubuntu 24.04**; the successful job reports 100 files, 965 ordinary passes and two expected failures. Timestamped suite results and exact blob identities are retained in the ledger.

| ID | Narrow behavior proven by successful assertions | Preserved gap |
| --- | --- | --- |
| A06 | Connected text, data-state, polite live attribute and title | CSS glow/pixels and native announcement |
| A11 | Mock refresh rejection preserves cached old_orders and orders filter | Native/provider refresh |
| A13 | Controlled old-generation column promise returns undefined and does not retain stale columns | Rendered UI/live provider |
| A20 | Four language cases invoke Builder mode; separate Explain guard | Workspace draft/caret/native keyboard |
| S03 | EditorState/CompletionContext helper returns id/created_at once, including integer detail | Mounted native completion popup/caret |
| S14 | Series order, chip removal and X/Y exclusion | Native control and provider cardinality |
| P02 | Selecting up sets metric while preserving raw PromQL | Authenticated catalog/native search |
| L04 | Useful labels, hidden internal labels, lazy checkout-api selection and exact service_name matcher | Live provider/stale-generation filtering |

These retain eight bounded BV upgrades; none establishes full native or provider acceptance. A06's earlier broad “glow” wording is narrowed to the actual assertions.

### Failed ledger, recovery lineage and validation boundaries

All **25** unique failed-acceptance IDs were rechecked against their original cited finding or characterization assertion; none lacks both. This is source review, not reproduction of every defect. **A02** is an inherited V-03 custom edit-dialog finding explicitly carried by CAP-02; no separate native edit-mode Tab/Escape assertion was located. **A08** is explicitly mapped by NON01-06 to same-generation intent arbitration; it does not establish failure of every generation-replacement guard. These qualifications are recorded without dropping failures or adding neighboring IDs.

CAP-21's frozen head `bb66ca4dcb83b5edb3a87f93cf3a82221dfd01bd`, run 38780232482, original #422/recovery #427, is one batch owning L22/L23/L24/L26. CAP-23's head `8306fb19cd476d2125153fa297bd00a86f5e63f0`, run 38779965647, original #424/recovery #428, is one batch owning T09–T13. Recovery reports add no duplicate executions or IDs. X11 remains UV/UV; TraceQL query copying is not Tempo identifier copying.

The original six negative controls were rechecked and reject. A seventh rejects promotion of the adjacent log capture to an inspected original. The validator independently reads immutable source Git bytes for inventory, assignments, dispositions and cited failure anchors. Modality vocabulary/totals, nonempty execution references, discrepancy presence, stored remote metadata/log fields, supplementary-image metadata and recovered-measurement records are structural/internal-consistency checks of AGG-02's own ledger. They do not independently authenticate remote logs, inspect PNG bytes or establish semantic relevance; a self-consistent ledger can still contain a mistaken human interpretation. Final-head CI and the exact three-file PR scope are reported in the PR handoff.
