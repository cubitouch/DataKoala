# Visual previews and product documentation

DataKoala has one real-renderer capture harness with two outputs. The default **regression** run creates assertion-heavy PR images for layout review. `DATAKOALA_PREVIEW_KIND=documentation` creates the six curated, public **documentation** images consumed by the Vite site. Documentation images are not copied wholesale from regression output.

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
