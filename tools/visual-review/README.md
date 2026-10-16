# VIS-01 — Local visual review board

This is a **local product review website**, not a replacement for the Phase 1C Atlas or a claim that source-reported defects were independently reproduced.

## Start (Node.js 24, no package install)

From the repository root:

\`\`\`sh
node tools/visual-review/generate.mjs
node tools/visual-review/serve.mjs
\`\`\`

Open **http://127.0.0.1:4178**. The server binds to loopback only and regenerates the deterministic review data at startup. No database, AI service, backend account, GitHub token or network connection is required to view the committed screenshots.

The equivalent focused build/check and test commands:

\`\`\`sh
node tools/visual-review/generate.mjs
node tools/visual-review/generate.mjs --check
node --test tools/visual-review/review-board.test.mjs
\`\`\`

To use another port: \`PORT=4180 node tools/visual-review/serve.mjs\`. Use Ctrl+C to stop. Do not launch the HTML using a \`file://\` URL: the board fetches generated JSON via the local HTTP server.

## Review workflow

1. Browse the 18 curated questions, filtering by provider, category, priority, or review status. Open two screenshots side by side; click a screenshot to see its **original natural pixel resolution**, or choose **Open original PNG**.
2. Inspect the source commit, scenario, capture viewport, PNG dimensions, workflow artifact identity and Git blob ID in each image's **Screenshot provenance** expander. Follow the linked Atlas entry and batch source. Read the **Evidence boundary**: static pixels may show presentation without proving keyboard, persistence, timing or provider behavior.
3. Choose **Approve convergence**, **Keep intentional difference**, **Request redesign**, or **Defer**. Add rationale and acceptance/evidence conditions in Notes. The choice and notes autosave in this browser's localStorage; reload the page to check persistence.
4. Export **JSON** to preserve/import structured decisions in another browser or **Markdown** for a Phase 2 handoff. Importing JSON explicitly asks to replace existing local decisions. Test scenario: decide VIS-01, enter a note, reload, export, import, confirm the same choice and notes; all four outcomes have round-trip tests.

No decisions are uploaded to GitHub. Browser storage can be disabled or cleared, so export regularly. This board makes **no** Phase 2 product edits.

## Frozen evidence and regeneration

\`manifest.json\` is the **curated source of truth** for review questions and their two evidence slots. The generator joins it to the corrected \`docs/audit/391/aggregation/agg-03-atlas.json\` (107 entries, 25 packages) and computes explicit Atlas links, classifications, priorities and source citations.

The 23 committed PNGs in \`tools/visual-review/images/\` are the **exact Git blobs** published under \`visual-previews/pr-442/\` in the DataKoala repository, not invented images, illustrative replacements, or borrowed unrelated assets. Their content is compared byte-for-byte to the recorded **Git blob SHA-1**, file size and PNG IHDR dimensions each time the board is generated. They were published by the successful [PR #442 Visual Preview workflow](https://github.com/cubitouch/DataKoala/actions/runs/38879154501) for source HEAD \`88a74e22c862d97001563736140fe42979496f8f\`, in two 14-day artifacts:

- Audit evidence: \`datakoala-ux-audit-pr-442\`, artifact **12037090832**.
- Normal Visual Preview: \`datakoala-visual-preview-pr-442\`, artifact **12037215413**.

The generation job checks out the PR merge ref in GitHub Actions, while \`DATAKOALA_AUDIT_HEAD\` identifies the PR source HEAD. **Do not conflate the PR head with the exact merge checkout SHA**; the board displays the reported source HEAD and immutable screenshot blob identity, rather than asserting an unverified merge SHA. Audit composited comparison sheets are identified separately from native single frames. The capture viewport field describes the harness viewport, not necessarily the pixels in a stitched comparison sheet; actual pixel dimensions are measured from each PNG.

The selected 23 published images are present in the repository itself and remain inspectable **even after the GitHub Actions ZIP artifacts expire**. This also avoids the failure mode of a historical URL silently returning a different capture. The board never falls back to similarly named screenshots or generates mockups. Three explicit screenshot slots are missing (VIS-11, VIS-16, VIS-18). Numerous paired context screenshots do **not** directly reproduce the scoped defect; each review card states what evidence remains necessary. These decisions should often be **Defer** until corresponding exact CAP screenshots are recovered.

### Future recapture

Without modifying any existing CAP module, invoke the existing Electron harness at a pinned commit. On Linux with the repository's normal dependencies and Xvfb available:

\`\`\`sh
pnpm build
DATAKOALA_PREVIEW_KIND=audit DATAKOALA_AUDIT_HEAD="$(git rev-parse HEAD)" DATAKOALA_PREVIEW_OUTPUT=visual-audit \
  xvfb-run --auto-servernum --server-args='-screen 0 1600x1800x24' \
  pnpm exec electron --no-sandbox scripts/capture-visual-preview.mjs
\`\`\`

Standalone CAP modules (unchanged):

\`\`\`sh
DATAKOALA_AUDIT_HEAD="$(git rev-parse HEAD)" DATAKOALA_PREVIEW_OUTPUT=visual-audit \
  xvfb-run --auto-servernum --server-args='-screen 0 1440x900x24' \
  node scripts/visual-preview/run-audit-batches.mjs
\`\`\`

Capture screenshot(s), verify the generating commit, viewport, scenario, \`measurements.json\`, screenshot metadata, and the archive identity; **then** explicitly update the corresponding immutable manifest \`assets\` record and commit each real new image. Mark a recapture as new evidence, rather than overwriting a historical image record. To regenerate just the **website/data** from the curated manifest and updated Atlas, rerun \`node tools/visual-review/generate.mjs\`; the app itself is static and does not need rebuilding.

## Limits

- Screenshots are real deterministic Electron captures; they do not prove live-provider, credential, OS-level, screen-reader, timing or backend behavior.
- PR #442's published audit comparison sheets and standard previews represent bounded scenarios; the original CAP ZIP-only images are not reclassified as independently inspected here.
- The entire screen was not freshly executed in an Electron renderer for VIS-01. Audit image identity and local HTTP serving are independently testable; interactivity in an actual human browser is a manual review gate.
- Choosing a review disposition is a **design preference**, not a product acceptance or change to any Atlas classification.
- All data is local. Keep exported JSON if clearing browser data or reviewing on a different machine.
