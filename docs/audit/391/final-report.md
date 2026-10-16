# DataKoala #391 — final Phase 1C audit report

**Status: audit analysis complete; product acceptance NOT achieved. Closeout pruning BLOCKED pending a remotely verified immutable evidence tag.**  
**Current classification source:** post-REC-01 [structured Visual Convergence Atlas](https://github.com/cubitouch/DataKoala/blob/7cfc8a3b5ac92a471f2a8930599dabe68f9291db/docs/audit/391/aggregation/agg-03-atlas.json), at the [verified pre-closeout commit](https://github.com/cubitouch/DataKoala/tree/7cfc8a3b5ac92a471f2a8930599dabe68f9291db).  
**Historical review:** [AGG-04](https://github.com/cubitouch/DataKoala/blob/7cfc8a3b5ac92a471f2a8930599dabe68f9291db/docs/audit/391/aggregation/AGG-04.md); [REC-01 PR #442](https://github.com/cubitouch/DataKoala/pull/442).  
**Visual decisions:** [VIS-01 Review Board](../../../tools/visual-review/README.md) ([PR #443](https://github.com/cubitouch/DataKoala/pull/443)).  
**Next steps:** [Phase 2 roadmap](phase-2-roadmap.md) · [Coverage and provenance](evidence-and-coverage.md) · [closeout index](README.md).

## Executive summary

Phase 1C systematically assessed UX presentation, interaction contracts, lifecycle behavior and implementation convergence across PostgreSQL, BigQuery, DuckDB/SQLite, Prometheus, Loki and Tempo, as well as shared workspace, table/chart, connection, settings, AI and security surfaces. Evidence was assembled from 30 CAP and seven NON batches, reconciled through AGG-01/02/03, independently challenged in AGG-04, corrected via REC-01 and made reviewable in VIS-01.

The **audit is complete as an evidence/analysis exercise, not a product pass**. Source-reported visual results, selected Electron synthetic fixtures, UI assertions and structured provenance justify scoped proposals and known failures. They do not certify real providers, OS clipboard/keychain, packaged application, screen reader, network/security exposure, or any unexercised path. Structural validators check records, not product behavior.

Correctness priorities include SQL lexical materialization (P2-01), Scatter coordinate fidelity (P2-02), displayed Tempo range membership (P2-03), connection intent (P2-04), late LogQL formatting (P2-19), AI context revision races (P2-20), BigQuery numeric boundary handling (P2-11), and known UX regressions. Convergence is separately justified for focus/overlay policy and composable openable rows, **without** flattening provider-specific semantics. The six BLOCKED packages are investigation/policy tracks, not authorized implementations.

## Reconciled coverage

| Measure | Verified count |
| --- | ---: |
| Original inventory IDs | 175 |
| CAP/NON batch sources | 37 |
| Original Atlas candidate declarations | 147 |
| Canonical Atlas entries | 107 |
| Multi-candidate groups | 25 |
| Extra grouped candidate slots | 40 |
| Original failed-acceptance IDs | 25 |
| Provisional leads | 5 |
| Phase 2 packages (excluding P2-05 planning umbrella) | 25 |
| Ready proposals / decision-evidence tracks | 19 / 6 |

The 37 source batches retain 23 `EVIDENCE_COMPLETE` and 14 `PARTIAL` dispositions, each scoped to its original assertions. AGG-02 separately counted 146 scoped visual and 172 scoped behavioral validations; AGG-01's earlier historical values (147/164) were **not silently reconciled into product-wide passes**. CAP-21 and CAP-23 recovery executions count once each. See the [inventory mappings](https://github.com/cubitouch/DataKoala/blob/7cfc8a3b5ac92a471f2a8930599dabe68f9291db/docs/audit/391/aggregation/agg-03-atlas.json) rather than assigning newly invented IDs to unclaimed gaps.

| Atlas classification | Count | Meaning |
| --- | ---: | --- |
| `CONVERGENCE_OPPORTUNITY` | 3 | Bounded shared interaction/presentation candidate |
| `CONFIRMED_DEFECT` | 24 | Scoped failure requiring fix/proof |
| `POLICY_UNRESOLVED` | 11 | Requires explicit product decision |
| `ALREADY_CONVERGED` | 20 | Preserve current working convergence |
| `INTENTIONAL_DIFFERENCE` | 23 | Keep legitimate provider-specific behavior |
| `TECHNICAL_RISK` | 6 | Bounded technical risk; verify before claiming user impact |
| `INSUFFICIENT_EVIDENCE` | 20 | Do not infer a failure from partial data |

Every canonical finding, candidate-to-primary mapping, original inventory association, source citation, package ownership and link to related entries remains queryable in [`agg-03-atlas.json`](https://github.com/cubitouch/DataKoala/blob/7cfc8a3b5ac92a471f2a8930599dabe68f9291db/docs/audit/391/aggregation/agg-03-atlas.json). P2-05a/b/c/d replace one former implementation package; the umbrella is planning-only. REC-01 separated mixed intentional-vs-already-converged ownership (ATL-029/030/035 and ATL-105/106/107).

## Evidence and acceptance limitations that must survive Phase 2

- **CAP-06 and CAP-09 original screenshot ZIPs were not independently recovered/inspected.** AGG-02 recovered one CAP-09 *log-adjacent* image, not a byte-confirmed original. VIS-01 has 23 committed, Git-verified PNGs and three explicitly missing slots; paired context images often do not reproduce the finding itself.
- **A25 = UV/BV**, **P03 = SO/SO**, **X11 = UV/UV**. In particular, TraceQL query copying is not proof of Tempo identifier copying. Do not promote visual/behavioral qualifications without direct evidence.
- **UI-002** (BigQuery statistics field/units/parent-child display) remains a product policy decision. **UI-004** (retained-results state) remains insufficient evidence; P2-14 requires a decision.
- **Known-defect characterizations stay failing product contracts.** A passing CI fixture that asserts today's defect (notably CAP-24 displayed-boundary behavior) is not a passing product acceptance. All 25 original failed-acceptance IDs remain recorded.
- **Synthetic diagnostic-marker retention in BigQuery** is a scoped finding. Actual credential exposure, renderer/log propagation, Electron display and exploitability were *not* shown. ATL-089/P2-22 remain blocked pending realistic threat/diagnostic policy and provider-boundary tests.
- Native keyboard/focus, packaged restart, OS integration, live PG/BQ/DuckDB/Prometheus/Loki/Tempo provider behavior, authentication and real-world security must be explicitly tested where the proposal requires them. Do not infer equivalence from mock IPC or screenshots alone.

## Implementation handoff and decision gate

Use the [Phase 2 roadmap](phase-2-roadmap.md) as the **single current planning list**: 19 ready-to-scope proposals, six blocked decision/evidence tracks. Each item retains its exact Atlas IDs, original inventory IDs, dependencies, acceptance contract and regression proof. Ready means *reviewable proposal*, not permission to ship. Distinguish isolated correctness fixes from UX implementation convergence, and preserve already-converged and intentional provider differences.

Recommended early correctness tracks: P2-01 → P2-02 → P2-03 → P2-04 → P2-19 → P2-20 (priority order, not technical dependencies). For keyboard convergence implement P2-05a before P2-05b; P2-05c/d are independent. Openable-row convergence P2-13 is compositional only, retaining three domain densities and virtualization differences. Product-owner choices for UI-002/UI-004 and other blocked tracks precede implementation.

## Evidence archive, preservation and closeout state

Full pre-closeout evidence remains at exact [commit `7cfc8a3b5ac92a471f2a8930599dabe68f9291db`](https://github.com/cubitouch/DataKoala/tree/7cfc8a3b5ac92a471f2a8930599dabe68f9291db) and its remotely verified **retention branch** [`audit/archive-391-phase-1c-evidence`](https://github.com/cubitouch/DataKoala/tree/audit/archive-391-phase-1c-evidence). **This branch can be moved or removed: it is NOT an immutable tag.** The required `audit-391-phase-1c-evidence` tag was absent at preflight, and the available connection cannot create it. Therefore **NO historical documents or validators are deleted in this PR**; the documented file inventory and archive plan are in [Coverage and provenance](evidence-and-coverage.md). Before authorizing a destructive follow-up, create the tag at `7cfc8a3b5ac92a471f2a8930599dabe68f9291db`, verify it from GitHub remotely, and re-run the focused validator without its temporary untagged allowance.

All executable Electron runners, fixtures, assertions, standalone CAP modules and Visual Preview workflow remain untouched. VIS-01 generation, its 18 curated comparisons, 23 local PNGs, three missing slots, persistence and exports remain intact. [Deferred harness maintenance](harness-maintenance.md) is expressly out of scope. This closeout is documentation and validation only; it changes neither production behavior nor product acceptance.
