# DataKoala #391 — evidence and coverage provenance

**Read this before treating a Phase 1C result as product acceptance.** The canonical [structured Atlas](https://github.com/cubitouch/DataKoala/blob/7cfc8a3b5ac92a471f2a8930599dabe68f9291db/docs/audit/391/aggregation/agg-03-atlas.json) preserves source declarations, 147 candidate-to-primary mappings, 175 original inventory mappings, 25 failed original IDs, five leads and 25 packages. The independent evidence challenge lives in [AGG-02](https://github.com/cubitouch/DataKoala/blob/7cfc8a3b5ac92a471f2a8930599dabe68f9291db/docs/audit/391/aggregation/AGG-02.md) and its [ledger](https://github.com/cubitouch/DataKoala/blob/7cfc8a3b5ac92a471f2a8930599dabe68f9291db/docs/audit/391/aggregation/agg-02-evidence.json); the independent final challenge in [AGG-04](https://github.com/cubitouch/DataKoala/blob/7cfc8a3b5ac92a471f2a8930599dabe68f9291db/docs/audit/391/aggregation/AGG-04.md) and its [verification JSON](https://github.com/cubitouch/DataKoala/blob/7cfc8a3b5ac92a471f2a8930599dabe68f9291db/docs/audit/391/aggregation/agg-04-verification.json).

## Preservation reference and blocking condition

**Verified original tree commit:** [`7cfc8a3b5ac92a471f2a8930599dabe68f9291db`](https://github.com/cubitouch/DataKoala/tree/7cfc8a3b5ac92a471f2a8930599dabe68f9291db), also reachable through the [retention branch](https://github.com/cubitouch/DataKoala/tree/audit/archive-391-phase-1c-evidence) created at exactly that SHA. The retention branch is mutable; it is **not** an immutable archive tag. The intended remote tag `audit-391-phase-1c-evidence` did not exist at preflight and tag-writing is unavailable via the connected GitHub actions.

**Consequence:** destructive consolidation is BLOCKED. No historical evidence tree path is removed here. To enable pruning in a **separate, explicitly reviewed update**, create the tag at `7cfc8a3b5ac92a471f2a8930599dabe68f9291db`, verify the remote ref and check representative retained sources via `git show audit-391-phase-1c-evidence:<path>`. Do not delete unless the tag is fetchable, the validator's archive check passes, no active runtime dependency exists, and every archived file has an exact commit/path link.

**Permanent links remain pinned to the commit SHA, not to mutable branches or expiring GitHub Actions artifacts.** Screenshot ZIP bytes for CAP-06/09 were not recovered and are not claimed to exist in this Git tree. The 23 curated VIS-01 images *are* tracked Git PNGs with per-blob checksums and fixture provenance, while three image slots remain absent.

## Exact source accounting

The 37 original sources comprise 30 CAP and seven NON batches. CAP-01–17 are embedded primarily in [the canonical coverage register](https://github.com/cubitouch/DataKoala/blob/7cfc8a3b5ac92a471f2a8930599dabe68f9291db/docs/architecture/ux-convergence-coverage-register.md), whereas later CAP/NON reports have separate files under [`docs/audit/391/batches`](https://github.com/cubitouch/DataKoala/tree/7cfc8a3b5ac92a471f2a8930599dabe68f9291db/docs/audit/391/batches). A source disposition is not full product acceptance.

| Batch | Historical disposition | Source line at pinned commit | Batch execution head | Workflow run |
| --- | --- | --- | --- | ---: |
| CAP-01 | EVIDENCE_COMPLETE | [original record](https://github.com/cubitouch/DataKoala/blob/e4c036d853e6f5fe6aecd794a2404c7331c5c13e/docs/architecture/ux-convergence-coverage-register.md#L219) | [`d1e3127ba380`](https://github.com/cubitouch/DataKoala/commit/d1e3127ba380f75108b296f737b42729ae4dd073) | 38602027521 |
| CAP-02 | EVIDENCE_COMPLETE | [original record](https://github.com/cubitouch/DataKoala/blob/e4c036d853e6f5fe6aecd794a2404c7331c5c13e/docs/architecture/ux-convergence-coverage-register.md#L237) | [`5a7ac174ef8d`](https://github.com/cubitouch/DataKoala/commit/5a7ac174ef8d1519ee1630f2bbd18692ec40bec6) | 38605551434 |
| CAP-03 | EVIDENCE_COMPLETE | [original record](https://github.com/cubitouch/DataKoala/blob/e4c036d853e6f5fe6aecd794a2404c7331c5c13e/docs/architecture/ux-convergence-coverage-register.md#L248) | [`1ca7411e446d`](https://github.com/cubitouch/DataKoala/commit/1ca7411e446d2b00bb19ea5812c1c979a0feb7df) | 38608584909 |
| CAP-04 | EVIDENCE_COMPLETE | [original record](https://github.com/cubitouch/DataKoala/blob/e4c036d853e6f5fe6aecd794a2404c7331c5c13e/docs/architecture/ux-convergence-coverage-register.md#L260) | [`1184afcf3d7c`](https://github.com/cubitouch/DataKoala/commit/1184afcf3d7c93a1311080df5fbab9d0df9a4704) | 38614943136 |
| CAP-05 | EVIDENCE_COMPLETE | [original record](https://github.com/cubitouch/DataKoala/blob/e4c036d853e6f5fe6aecd794a2404c7331c5c13e/docs/architecture/ux-convergence-coverage-register.md#L272) | [`5aac39dd0d69`](https://github.com/cubitouch/DataKoala/commit/5aac39dd0d69c3542683f3b0f79fc8931cb31fda) | 38617523822 |
| CAP-06 | EVIDENCE_COMPLETE | [original record](https://github.com/cubitouch/DataKoala/blob/e4c036d853e6f5fe6aecd794a2404c7331c5c13e/docs/architecture/ux-convergence-coverage-register.md#L293) | [`5aac39dd0d69`](https://github.com/cubitouch/DataKoala/commit/5aac39dd0d69c3542683f3b0f79fc8931cb31fda) | 38617523822 |
| CAP-07 | EVIDENCE_COMPLETE | [original record](https://github.com/cubitouch/DataKoala/blob/9ef44d802fca7645781e1aadbe52bf47ce064089/docs/architecture/ux-convergence-coverage-register.md#L315) | [`9a3484fc3c56`](https://github.com/cubitouch/DataKoala/commit/9a3484fc3c56f773331b1040300c79a8908199ac) | 38622912415 |
| CAP-08 | EVIDENCE_COMPLETE | [original record](https://github.com/cubitouch/DataKoala/blob/e4c036d853e6f5fe6aecd794a2404c7331c5c13e/docs/architecture/ux-convergence-coverage-register.md#L311) | [`1521a01404cd`](https://github.com/cubitouch/DataKoala/commit/1521a01404cd8b27bce8d99d25643f4b88c7a015) | 38640786557 |
| CAP-09 | EVIDENCE_COMPLETE | [original record](https://github.com/cubitouch/DataKoala/blob/e4c036d853e6f5fe6aecd794a2404c7331c5c13e/docs/architecture/ux-convergence-coverage-register.md#L326) | [`296a6ada1503`](https://github.com/cubitouch/DataKoala/commit/296a6ada15031c4455adc89e58fc5a57ce03243e) | 38645215482 |
| CAP-10 | EVIDENCE_COMPLETE | [original record](https://github.com/cubitouch/DataKoala/blob/e4c036d853e6f5fe6aecd794a2404c7331c5c13e/docs/architecture/ux-convergence-coverage-register.md#L341) | [`c148f91906a6`](https://github.com/cubitouch/DataKoala/commit/c148f91906a69529318dec170a7922e4d9fa465e) | 38652171440 |
| CAP-11 | EVIDENCE_COMPLETE | [original record](https://github.com/cubitouch/DataKoala/blob/e4c036d853e6f5fe6aecd794a2404c7331c5c13e/docs/architecture/ux-convergence-coverage-register.md#L359) | [`5ba36d0d2626`](https://github.com/cubitouch/DataKoala/commit/5ba36d0d26264896aea7149aa2ca0c0cf973821c) | 38710823797 |
| CAP-12 | EVIDENCE_COMPLETE | [original record](https://github.com/cubitouch/DataKoala/blob/e4c036d853e6f5fe6aecd794a2404c7331c5c13e/docs/architecture/ux-convergence-coverage-register.md#L371) | [`a51aaf88148f`](https://github.com/cubitouch/DataKoala/commit/a51aaf88148fab5967fa427dedbf81601524ba8e) | 38712444172 |
| CAP-13 | EVIDENCE_COMPLETE | [original record](https://github.com/cubitouch/DataKoala/blob/e4c036d853e6f5fe6aecd794a2404c7331c5c13e/docs/architecture/ux-convergence-coverage-register.md#L465) | [`199cbafb309a`](https://github.com/cubitouch/DataKoala/commit/199cbafb309a7efa1b23b24e2ed76168baf1aba6) | 38718496827 |
| CAP-14 | EVIDENCE_COMPLETE | [original record](https://github.com/cubitouch/DataKoala/blob/e4c036d853e6f5fe6aecd794a2404c7331c5c13e/docs/architecture/ux-convergence-coverage-register.md#L487) | [`0132a94548b6`](https://github.com/cubitouch/DataKoala/commit/0132a94548b6678f44320d7a7e6bbd093f231e75) | 38719221058 |
| CAP-15 | EVIDENCE_COMPLETE | [original record](https://github.com/cubitouch/DataKoala/blob/e4c036d853e6f5fe6aecd794a2404c7331c5c13e/docs/architecture/ux-convergence-coverage-register.md#L506) | [`0f022427225a`](https://github.com/cubitouch/DataKoala/commit/0f022427225a4b222d352ddade7c59f4e1dbe147) | 38721215076 |
| CAP-16 | EVIDENCE_COMPLETE | [original record](https://github.com/cubitouch/DataKoala/blob/e4c036d853e6f5fe6aecd794a2404c7331c5c13e/docs/architecture/ux-convergence-coverage-register.md#L527) | [`178700809b85`](https://github.com/cubitouch/DataKoala/commit/178700809b85add44d88c44799cc12baed76b51d) | 38721954515 |
| CAP-17 | EVIDENCE_COMPLETE | [original record](https://github.com/cubitouch/DataKoala/blob/e4c036d853e6f5fe6aecd794a2404c7331c5c13e/docs/architecture/ux-convergence-coverage-register.md#L549) | [`ec0641ea9f33`](https://github.com/cubitouch/DataKoala/commit/ec0641ea9f33e16a05e8d23de3b27ac807e62834) | 38754779526 |
| CAP-18 | EVIDENCE_COMPLETE | [original record](https://github.com/cubitouch/DataKoala/blob/47ad04e82208cdfeae47961ae8916f9d8cd85847/docs/audit/391/batches/CAP-18.md#L1) | [`34753c046b18`](https://github.com/cubitouch/DataKoala/commit/34753c046b18ba838331a5c3652b8ac429ed7b89) | 38763236819 |
| CAP-19 | EVIDENCE_COMPLETE | [original record](https://github.com/cubitouch/DataKoala/blob/47ad04e82208cdfeae47961ae8916f9d8cd85847/docs/audit/391/batches/CAP-19.md#L1) | [`345382a72d90`](https://github.com/cubitouch/DataKoala/commit/345382a72d904e5bc03c668aec9184da9108ddb8) | 38772943101 |
| CAP-20 | EVIDENCE_COMPLETE | [original record](https://github.com/cubitouch/DataKoala/blob/47ad04e82208cdfeae47961ae8916f9d8cd85847/docs/audit/391/batches/CAP-20.md#L1) | [`ce088a2bdfcd`](https://github.com/cubitouch/DataKoala/commit/ce088a2bdfcd0f710fc93a15561d05a208badcae) | 38773038498 |
| CAP-21 | PARTIAL | [original record](https://github.com/cubitouch/DataKoala/blob/47ad04e82208cdfeae47961ae8916f9d8cd85847/docs/audit/391/batches/CAP-21.md#L1) | [`bb66ca4dcb83`](https://github.com/cubitouch/DataKoala/commit/bb66ca4dcb83b5edb3a87f93cf3a82221dfd01bd) | 38780232482 |
| CAP-22 | PARTIAL | [original record](https://github.com/cubitouch/DataKoala/blob/47ad04e82208cdfeae47961ae8916f9d8cd85847/docs/audit/391/batches/CAP-22.md#L1) | [`52fd2e08e824`](https://github.com/cubitouch/DataKoala/commit/52fd2e08e82446fa37be3930c497b540f5f50dc2) | 38778100440 |
| CAP-23 | PARTIAL | [original record](https://github.com/cubitouch/DataKoala/blob/47ad04e82208cdfeae47961ae8916f9d8cd85847/docs/audit/391/batches/CAP-23.md#L1) | [`8306fb19cd47`](https://github.com/cubitouch/DataKoala/commit/8306fb19cd476d2125153fa297bd00a86f5e63f0) | 38779965647 |
| CAP-24 | PARTIAL | [original record](https://github.com/cubitouch/DataKoala/blob/47ad04e82208cdfeae47961ae8916f9d8cd85847/docs/audit/391/batches/CAP-24.md#L1) | [`ee031b9d3969`](https://github.com/cubitouch/DataKoala/commit/ee031b9d3969bf81f4e6ed36e11314dcaefdd0b3) | 38794494341 |
| CAP-25 | PARTIAL | [original record](https://github.com/cubitouch/DataKoala/blob/47ad04e82208cdfeae47961ae8916f9d8cd85847/docs/audit/391/batches/CAP-25.md#L1) | [`e0b3b8e547d7`](https://github.com/cubitouch/DataKoala/commit/e0b3b8e547d711d9f27168ea35d9f285fd46abbb) | 38789455942 |
| CAP-26 | PARTIAL | [original record](https://github.com/cubitouch/DataKoala/blob/47ad04e82208cdfeae47961ae8916f9d8cd85847/docs/audit/391/batches/CAP-26.md#L1) | [`0416e50fbf97`](https://github.com/cubitouch/DataKoala/commit/0416e50fbf977aa67f8e6f9762d615452ccd82ad) | 38792865339 |
| CAP-27 | PARTIAL | [original record](https://github.com/cubitouch/DataKoala/blob/47ad04e82208cdfeae47961ae8916f9d8cd85847/docs/audit/391/batches/CAP-27.md#L1) | [`175d0ead3a66`](https://github.com/cubitouch/DataKoala/commit/175d0ead3a66dace3dee7a318fe4d004ae028bac) | 38794465569 |
| CAP-28 | PARTIAL | [original record](https://github.com/cubitouch/DataKoala/blob/47ad04e82208cdfeae47961ae8916f9d8cd85847/docs/audit/391/batches/CAP-28.md#L1) | [`83eeb52e4dfb`](https://github.com/cubitouch/DataKoala/commit/83eeb52e4dfbd3c12979a6888b2d0e9fba22101e) | 38814994606 |
| CAP-29 | PARTIAL | [original record](https://github.com/cubitouch/DataKoala/blob/47ad04e82208cdfeae47961ae8916f9d8cd85847/docs/audit/391/batches/CAP-29.md#L1) | [`f1ca5d671597`](https://github.com/cubitouch/DataKoala/commit/f1ca5d6715973ee52f84ad4ad25abcb30dfbca96) | 38814864167 |
| CAP-30 | PARTIAL | [original record](https://github.com/cubitouch/DataKoala/blob/47ad04e82208cdfeae47961ae8916f9d8cd85847/docs/audit/391/batches/CAP-30.md#L1) | [`e9c893853586`](https://github.com/cubitouch/DataKoala/commit/e9c893853586a3218d4b0c3ed3e103c82d04d9b3) | 38815371248 |
| NON-01 | EVIDENCE_COMPLETE | [original record](https://github.com/cubitouch/DataKoala/blob/47ad04e82208cdfeae47961ae8916f9d8cd85847/docs/audit/391/batches/NON-01.md#L1) | [`bd4da52b80f6`](https://github.com/cubitouch/DataKoala/commit/bd4da52b80f65618a4908529ae4df91cc3b124e3) | 38763003457 |
| NON-02 | EVIDENCE_COMPLETE | [original record](https://github.com/cubitouch/DataKoala/blob/47ad04e82208cdfeae47961ae8916f9d8cd85847/docs/audit/391/batches/NON-02.md#L1) | [`c3b9e055b329`](https://github.com/cubitouch/DataKoala/commit/c3b9e055b3298911c55e533202048800df5b0001) | 38759788917 |
| NON-03 | EVIDENCE_COMPLETE | [original record](https://github.com/cubitouch/DataKoala/blob/47ad04e82208cdfeae47961ae8916f9d8cd85847/docs/audit/391/batches/NON-03.md#L1) | [`1fdc3a604310`](https://github.com/cubitouch/DataKoala/commit/1fdc3a604310622e7f99ef09ba7a6ed374c6b4ac) | 38759956034 |
| NON-04 | PARTIAL | [original record](https://github.com/cubitouch/DataKoala/blob/47ad04e82208cdfeae47961ae8916f9d8cd85847/docs/audit/391/batches/NON-04.md#L1) | [`ac99126feb21`](https://github.com/cubitouch/DataKoala/commit/ac99126feb212986f4acffcc058172af469fc73e) | 38765295024 |
| NON-05 | PARTIAL | [original record](https://github.com/cubitouch/DataKoala/blob/47ad04e82208cdfeae47961ae8916f9d8cd85847/docs/audit/391/batches/NON-05.md#L1) | [`e50b8f779638`](https://github.com/cubitouch/DataKoala/commit/e50b8f7796382767cd0da424f4996c88a4aa7dc2) | 38769180343 |
| NON-06 | PARTIAL | [original record](https://github.com/cubitouch/DataKoala/blob/47ad04e82208cdfeae47961ae8916f9d8cd85847/docs/audit/391/batches/NON-06.md#L1) | [`c3ec6f04b87a`](https://github.com/cubitouch/DataKoala/commit/c3ec6f04b87ae3bac4ec343642756e3a09ed41e0) | 38765367153 |
| NON-07 | PARTIAL | [original record](https://github.com/cubitouch/DataKoala/blob/47ad04e82208cdfeae47961ae8916f9d8cd85847/docs/audit/391/batches/NON-07.md#L1) | [`e7b4c978183e`](https://github.com/cubitouch/DataKoala/commit/e7b4c978183e7cb832448d2136bfbe064beed9ff) | 38769577600 |

## Active and historical document roles

| Paths | Closeout role | Action in this non-destructive PR |
| --- | --- | --- |
| `docs/audit/391/final-report.md` and `phase-2-roadmap.md` | Authoritative conclusions and planning | Added |
| `docs/audit/391/README.md`, `evidence-and-coverage.md`, `harness-maintenance.md` | Entry point, provenance and deferred work | Added |
| `docs/audit/391/aggregation/agg-03-atlas.json` | Corrected machine-readable current classification | **Retained unchanged**; necessary for VIS-01 |
| `docs/audit/391/aggregation/AGG-01..04.md`, `agg-02-evidence.json`, `agg-04-verification.json`, `validate-agg-01..04.py` | Historical aggregation checkpoints/validators | Retained pending verified immutable tag and safe dependency review |
| `docs/audit/391/batches/CAP-18..30.md`, `NON-01..07.md` | Original 20 standalone source reports | Retained pending verified immutable tag |
| `docs/architecture/ux-convergence-coverage-register.md` | CAP-01–17 embedded original records and 175-ID provenance | Retained; no lossy replacement |
| `docs/architecture/ux-implementation-convergence-audit.md` | Phase 1B V-01–12 original declarations | Retained as provenance |
| `scripts/visual-preview/**`, `.github/workflows/visual-preview.yml` and relevant tests | Executable audit regression infrastructure | **Retained without edits** |
| `tools/visual-review/**` (including 23 PNGs) | VIS-01 app, manifest, provenance, local decisions/tests | **Retained without edits** |

Removed files: **none**. All historical documents remain in the active source tree until a verifiably immutable archive exists. The closeout validator must not report this stage as a successful archival deletion.

## Verified before/after size (non-destructive stage)

The full tracked tree has **806 files before** (pre-closeout commit `7cfc8a3`) and **813 after** (+7), with zero deletions and no production, Electron harness, Atlas or existing VIS-01 changes. The entire PR adds **1,003 lines** (six audit documents/scripts plus one focused workflow) and deletes zero. This is an intentionally *larger* interim tree, **not** the final requested smaller permanent record.

Within `docs/audit/391/`, the measured LF line count across tracked files changes from **38,615 lines in 31 files** to **39,587 lines in 37 files** (+972 lines, +6 files). Counts include original JSON ledgers and source Markdown; file-line totals were measured from source bytes at the pinned Git tree. A later, separately authorized historical-pruning PR must provide its own after-pruning file/line inventory, after the immutable tag is remotely verified. Do not count this stage as completed pruning.

## Evidence semantics and trust boundaries

- **Source-backed:** original 175-ID inventory and 37 batch declarations, 147 original candidate IDs/line locations, named failed contracts, and exact original source revision links. Source-text consistency is distinct from rerunning assertions.
- **Internal/structural:** uniqueness, status totals, mapping reciprocity, package readiness, document/asset reference validity. A coherent JSON cannot establish provider behavior.
- **Historical scoped behavior:** successful tests at their generating commit, synthetic IPC Electron scenarios, and source-reported original-resolution visuals. AGG-02's eight BV upgrades were bounded to successful named assertions; no native or provider promotion.
- **Unresolved:** CAP-06/09 screenshot archive availability; A25 UV/BV, P03 SO/SO, X11 UV/UV; UI-002 product policy and UI-004 retained-result evidence; native/provider/OS acceptance; CAP-24 displayed-boundary known defect; realistic diagnostic-security exposure.
- **VIS-01:** 18 comparisons, 23 Git PNGs, three explicitly missing image slots. Browser decisions persist locally and export JSON/Markdown; they do not rewrite the Atlas or grant acceptance.

## Verification commands

```sh
python -B docs/audit/391/validate-closeout.py --negative-controls --allow-untagged-archive
node tools/visual-review/generate.mjs
node tools/visual-review/generate.mjs --check
node --test tools/visual-review/review-board.test.mjs
```

The `--allow-untagged-archive` switch is a **temporary non-destructive check** and must be removed before historical pruning. Run the existing Electron Visual Preview workflow on the closeout PR, inspect final-head outcomes and keep production code excluded. See [deferred harness maintenance](harness-maintenance.md).
