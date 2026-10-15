# Visual previews and product documentation

DataKoala has one real-renderer capture harness with three isolated outputs. The default **regression** run creates assertion-heavy PR images for layout review. `DATAKOALA_PREVIEW_KIND=documentation` creates the six curated, public **documentation** images consumed by the Vite site. Documentation images are not copied wholesale from regression output.

Deterministic public fixture definitions and the expected documentation file list live in `scripts/visual-preview/fixtures.mjs`. Shared Electron launch, renderer waits, interactions, capture helpers, and the two intentionally small scenario sequences live in `scripts/visual-preview/capture.mjs`; `scripts/capture-visual-preview.mjs` remains the stable workflow entry point. The harness enables the existing `DATAKOALA_SMOKE` seam only inside its controlled Electron process. It never needs a live database or metrics service.

## Local review

Build the application and generate the complete canonical set:

```bash
xvfb-run --auto-servernum --server-args='-screen 0 1440x900x24' pnpm docs:screenshots
pnpm docs:dev
```

On a desktop with a display, `pnpm docs:screenshots` can run without `xvfb-run`. Use `pnpm docs:build` for the Pages-ready static build and `pnpm docs:preview` to inspect it locally. Vite uses `/DataKoala/` as its production base.

## Adding a documentation scenario

1. Add synthetic, generic fixture data to `fixtures.mjs` when it can be shared.
2. Compose the state in the documentation branch of `capture.mjs`, using existing renderer/store seams and capture helpers.
3. Add the filename to `documentationScreenshots`. Generation fails when a file is missing or an unexpected PNG remains.
4. Add the image and meaningful alt text to `docs-site/src/main.ts`, then inspect the full-resolution image and responsive site.

Every documentation scenario must assert its visible semantic state immediately before capture—not only that a canvas or filename exists. Check the active mode/view, selected controls, expected row or series count, absence of stale filters/results, and any dialog content that the screenshot is meant to demonstrate. Charts run without animation in the controlled smoke process so capture cannot sample an ECharts transition.

The visual-preview workflow continues to publish PR-only review artifacts to `visual-previews`. The Pages workflow validates screenshots and the site on pull requests but deploys nothing. Only a push to `main` generates the canonical site artifact and deploys it with the official Pages actions. The repository owner may first need to select **Settings → Pages → Source → GitHub Actions**.

## Public SQL, log-volume and trace-cohort images

`docs-sql-area.png` uses the same monthly market data as the Builder starter, with Builder controls visible and the Area view selected. The capture asserts mode, chart configuration and rendered counts before writing it.

The shared Loki capture writes `loki-log-chart.png` with 60 one-minute buckets across 16:00–17:00 UTC and three stacked series. Intraday chart axes use time-only UTC labels; tooltips retain the date and ranges crossing UTC midnight retain date labels.

The shared Tempo capture continues to write the two-point `tempo-trace-scatter.png` local-filter regression. A separate deterministic 48-trace cohort, with both statuses and slower outliers, writes `tempo-trace-cohort.png` for the website only after the existing regression sequence completes. The Visual Preview manifest publishes both images. Neither generated image is committed by hand.

## UX convergence audit mode (PR-only)

`DATAKOALA_PREVIEW_KIND=audit` uses the same `capture.mjs` Electron launcher,
BrowserWindow, preload, renderer wait and capture function. Its public fixtures,
strict screenshot manifest and captions live in `audit-fixtures.mjs`; focused
scenarios, DOM observations and artifact index live in `audit.mjs`. No production
renderer path or CSS is changed to improve an audit screenshot.

```bash
pnpm build
TZ=UTC DATAKOALA_PREVIEW_KIND=audit DATAKOALA_PREVIEW_OUTPUT=visual-audit \
  xvfb-run --auto-servernum --server-args='-screen 0 1600x1800x24' \
  pnpm exec electron --no-sandbox scripts/capture-visual-preview.mjs
```

On a desktop, omit the Xvfb wrapper. Captures use 1440×900 and 900×900 content
viewports, zoom/device scale 1 and fixed public timestamps. Native keyboard and
pointer events exercise hover/focus/Enter, Escape and Tab; synthetic IPC controls
provider loading/failure/retry and progressive Tempo batches. Metadata loading
and error presentations are explicitly state-injected, not claimed as exercised
provider retry. Clipboard failures/successes are synthetic browser API outcomes,
not native OS permission tests.

Every screenshot requires a positive-sized semantic target, an asserted intended
state and a manifest/caption entry. Selected charts additionally use existing
finished/populated semantic-report assertions. `measurements.json` includes
source head, geometry/styles, overflow, current focus, rendered row counts and
interaction outcomes. `review.html` is a self-contained index. Six contact sheets
use scale-1 crops; they never resize individual components to make them match.
A successful run is **generation evidence**, not a reviewed UX verdict.

The Visual preview workflow runs this extra mode only on branches named `audit/*`.
It uploads the separate `datakoala-ux-audit-pr-N` artifact, including partial
evidence after a failed audit run. It publishes contact sheets, four key diagnostic frames and the DOM
report under `visual-previews/pr-N/audit/`. The ordinary regression manifest and
public documentation screenshot list remain unchanged. Full comparisons stay in
the PR artifact; no audit image is added to the public Pages website.

When adding a state, update the audit manifest and captions, assert the actual
view/semantic state before capture, execute the relevant transitions, and inspect
the resulting images. Record **Visually verified**, **Behavior verified**,
**Source-only** and **Unverified** separately in the audit. Preserve deliberate
source-specific content, density, domain behavior and capability exceptions.

Renderer expression values use `renderer-value.mjs`; operation source remains
owned by the harness. Encode complete data values/selectors, never accept a raw
expression as a configurable scope. See the [CodeQL boundary review](visual-preview-security-review.md)
for per-alert source analysis, encoding guarantees and regression coverage.

## Standalone parallel audit batches

Repository-owned modules in `scripts/visual-preview/audit-batches/` are discovered
in filename order using `<lowercase-prefix>-<two digits>.mjs`. Helpers, tests,
directories and symlinks are not entry points. No arbitrary import path is accepted.
Each module exports `installAuditIpc(ipcMain)`, `runVisualAudit(context)` and a
`screenshots` array of unique flat PNG filenames. The context uses the existing
window, renderer wait, capture and divider helpers. All module screenshots are
1440×900, DPR/zoom 1, with positive semantic targets. Modules own their fixtures
and assertions, not the canonical audit manifest.

The Visual preview workflow first executes the canonical audit unchanged, then
`run-audit-batches.mjs` starts a fresh Electron process for every discovered batch.
Outputs go under `visual-audit/batches/<UPPERCASE-ID>/` in the same existing
`datakoala-ux-audit-pr-N` artifact. Regression/public documentation filenames and
published canonical previews are unchanged. Run locally under Xvfb with:

```bash
TZ=UTC DATAKOALA_AUDIT_HEAD=$(git rev-parse HEAD) \
  xvfb-run --auto-servernum node scripts/visual-preview/run-audit-batches.mjs
```

A module writes `measurements.json` with the exact generating `sourceHead` and an
`observations` array. Every screenshot observation includes `filename`, `dpr: 1`,
`zoom: 1` and a positive `target.width/height`, plus its own asserted domain state.
The loader checks the exact PNG set, dimensions and provenance after execution;
it cannot replace visual review. `status.json` and the aggregate `batches/index.json`
distinguish success from failure. Failures retain partial evidence, fail the step,
and do not stop other batches from producing diagnostic evidence. Each child has
a three-minute execution limit. Missing exports, imports, evidence and unknown
IDs fail closed. Import/setup failures also exit nonzero and appear in the index.

`node --test scripts/visual-preview/*.test.mjs` covers registry/loading, evidence
validation and failure propagation, and runs as part of the existing unit CI.
