# DataKoala #391 — Phase 1C audit record

**Start here:** [Final audit report](final-report.md) → [Phase 2 roadmap](phase-2-roadmap.md) → [Coverage/provenance](evidence-and-coverage.md). The permanent source of truth for current classifications, inventory/candidate mappings and package contracts is the corrected [Visual Convergence Atlas](aggregation/agg-03-atlas.json).

[VIS-01 review board](../../../tools/visual-review/README.md) is an interactive, offline, local screenshot decision tool. Start it from repository root with `node tools/visual-review/generate.mjs` and `node tools/visual-review/serve.mjs`. It has 18 comparisons, 23 committed and verified images, and three explicitly missing image slots. Export local decisions before clearing browser storage.

**Preservation state:** all original evidence is pinned to [commit `7cfc8a3b5ac92a471f2a8930599dabe68f9291db`](https://github.com/cubitouch/DataKoala/tree/7cfc8a3b5ac92a471f2a8930599dabe68f9291db), also held by the remotely verified but **mutable** [evidence retention branch](https://github.com/cubitouch/DataKoala/tree/audit/archive-391-phase-1c-evidence). An immutable `audit-391-phase-1c-evidence` tag is still required. **No historical files were deleted** pending that prerequisite.

The former [AGG-01](aggregation/AGG-01.md), [AGG-02](aggregation/AGG-02.md), [AGG-03](aggregation/AGG-03.md), [AGG-04](aggregation/AGG-04.md) reports and [CAP/NON batch records](batches/) are kept as provenance, not competing final recommendations. The [coverage register](../../architecture/ux-convergence-coverage-register.md) contains embedded CAP-01–17 records; do not assume one Markdown file per CAP. Production acceptance is not implied by a passing validator.

The reusable [Electron audit harness](../../../scripts/visual-preview/) and [existing Visual Preview workflow](../../../.github/workflows/visual-preview.yml) are permanent engineering infrastructure. [Deferred maintenance considerations](harness-maintenance.md) are intentionally *not* a closeout refactor.
