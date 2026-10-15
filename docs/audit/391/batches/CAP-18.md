# CAP-18 — Loki Builder advanced predicates

## A. Metadata

- Date: 2026-10-15. Authoring context: Codex, isolated parallel audit; synthetic providers only.
- Inventory: L02, L03, L05, L06, L07, L08, L09, L10, L11.
- Integration base: `2525623335f3aa6c4bd946d653135bba6b5fcda8`, fetched from draft PR #406 before writing.
- Batch branch: `audit/391-cap-18-loki-builder`.
- Temporary draft PR: https://github.com/cubitouch/DataKoala/pull/412, targeting `audit/391-ux-convergence`.
- Published scenario commit: `052bbe0536dfdaede7d205efbeacfcfd0b0fb8e5`. The report is committed separately; its immutable revision is the commit containing this file (see PR commit history). No self-referential final SHA is asserted.
- Scope: evidence and an **unexecuted proposed isolated scenario module** only. Production files, shared runner/fixtures/manifests/workflows, authoritative inventory/register/audit and other batch reports are unchanged. CAP-01–17 findings and all Phase 1B limitations remain authoritative.

## B. Coverage matrix

VV below applies only to the named inspected baseline state. BV includes deterministic executed component/unit tests and does not mean native Electron interaction or provider acceptance. All nine rows remain partial against the full CAP-18 acceptance criteria.

Paths in the table are relative to `src/renderer/src/`, except `src/shared/` and `src/main/`.

| ID | Visual evidence | Behavioral evidence | Implementation ownership and named evidence | Remaining unverified states |
| --- | --- | --- | --- | --- |
| L02 | SO for populated raw editor/Format; VV only for generated-query disclosure shell in `loki-builder-desktop.png` | BV: `components/workspaces/loki/LokiExplorer.ui.test.tsx`, successful raw Format, generated-format fallback/stale completion and explicit handoff; two preserved expected failures reproduce raw formatter overwrites | LokiExplorer owns async formatting and raw draft mutation; shared QueryCodeEditor, GeneratedQueryPanel, CopySqlButton; `src/main/gcx-loki-transport.ts` format endpoint | Native raw editing/caret, real format service and copy payload; formatter race is confirmed by tests, not newly imaged |
| L03 | VV: baseline Builder form and closed Advanced/Generated sections in `loki-builder-desktop.png` | BV: LokiExplorer UI suite exercises mode handoff, unchanged raw draft, generated-expression run/copy/handoff | LokiExplorer orchestration; `components/builder/loki/LokiBuilderPanel.tsx`; shared BuilderForm/BuilderRow/FormField | Native populated generated disclosure, all CAP-18 advanced transitions; proposed module not run |
| L05 | VV: `selector-loki-options-desktop.png`, Filter by search, environment/service_name options, selected service_name; baseline value chip | BV: `src/shared/loki-builder.test.ts` exact/escaped multi-value regex, fallback and metadata anchors; LokiExplorer empty/completed selector tests; `lib/lokiMetadata.ui.test.tsx` request/cache assertions | LokiBuilderPanel ValueControl and matcher preservation; shared MultiCombobox; lokiMetadata/useLokiLabelsResource; shared Loki generator | Native value search/custom entries, exclusion/regex preservation warning and invalid/incomplete selector interactions; authenticated semantic acceptance |
| L06 | VV: empty Line contains control/timeout placeholder only | BV: generator test “generates parser-valid LogQL for every supported operator and escaped input”; executed direct probe below; existing pattern-promotion UI cases | LokiBuilderPanel owns single contains input; `src/shared/loki-builder.ts` owns four serialized line operators | Native composed include/exclude controls and replacement of a restored multi-filter state; UI does not expose all generator operators |
| L07 | VV: All levels default only | BV: LokiExplorer “selects indexed levels before the first query and preserves other filters when cleared”, unavailable severity test; generator case-insensitive anchored escaped Level tests | resolveIndexedSeverityLabel, LokiBuilderPanel dedicated Level selector, builder.labelMatchers | Native selected ERROR/WARN and missing-severity screenshot; no inferred matching of unindexed severity |
| L08 | VV: No grouping default only | BV: parameterized “groups by indexed %s independently of Level filtering”, persistence/remount and missing-indexed-label cases; `src/shared/loki-trend.test.ts` exact volume/probe expressions | Separate session.lokiGroupBy, LokiBuilderPanel onGroupByChange, LokiExplorer loadTrend and `src/shared/loki-trend.ts` | Native simultaneous selected Level/grouping image and transitions; real cardinality probe/provider |
| L09 | SO for expanded parser controls; VV only collapsed Advanced filters shell | BV: LokiExplorer parsed JSON inspector promotion and advanced removal tests; generator JSON/regexp/pattern probes below | LokiBuilderPanel edits existing stage arrays; LokiExplorer resultFilter introduces required parser from inspector; generator orders stages | Native parser changes/invalid expression visuals; no Add parser button in inspected panel source; arbitrary manual stage creation UX requires integration-owner assessment |
| L10 | SO: no inspected populated field predicate | BV: LokiExplorer advanced field value/removal test; generator invalid-name and value probes below | LokiBuilderPanel text/operator controls, LokiExplorer inspector resultFilter; generator identifier/parser guards; execution logqlResultKind | Native invalid field Run guard, all operators and value errors; regex compilation is not checked by local grammar parser |
| L11 | VV: baseline committed one-hour custom range and Limit 1000 | BV: LokiExplorer empty Builder bounded-time/limit request test; transport exact argv and limit+one/truncation tests | shared TimeRangeField/prometheusRangeBounds; LokiExplorer interval/limit; GcxLokiTransport and normalizeLokiQuery | Native limit clamping and custom/relative picker commit/refetch; proposed module not run; malformed persisted/noninteger limits are source-only |

### Executed exact generation probes

At the integration production-source base, Node 24 executed the actual `buildLokiQuery` and `logqlResultKind` exports with controlled state. These are generator behavior, **not renderer or authenticated Loki evidence**.

```text
Empty selector without fallback:
  Choose a value for at least one indexed label or provide a safe fallback selector.
Empty or incomplete environment value, service_name fallback supplied:
  {service_name=~".+"}
Completed negative-only matcher (grammar accepted, resultKind logs):
  {app!="x"}
Invalid field name bad-field:
  Invalid Loki field name: bad-field
Numeric-looking field value (string comparison):
  {service_name="checkout"} | attempt="42"
Empty field string (grammar accepted):
  {service_name="checkout"} | attempt=""
Invalid regex contents (grammar accepted; compilation unverified):
  {service_name="checkout"} | attempt=~"["
json expression "message", or regexp stage without expression:
  Generated LogQL is not parser-valid.
Pattern expression:
  {service_name="checkout"} | pattern "<_> <message>"
Line composition with quote/backslash escaping:
  {service_name="checkout"} |= "a\"b\\c" != "noise"
```

The generator discards incomplete matchers. With no completed matcher it uses the metadata-backed positive fallback **only** when service_name is available; otherwise the workspace disables Run with an associated status explanation. An incomplete user selection can therefore run the bounded fallback query by design; it is not guaranteed to preserve the user's intended unfinished filter. A completed negative-only matcher bypasses fallback and passes the local grammar parser. Provider-level selector acceptance is not proved. Do not label either case a security bypass or live-query defect from these probes alone.

## C. Implementation mapping

### Shared presentation, separate query semantics

The inspected default selector uses the existing MultiCombobox/FieldChrome/Popover presentation, not a Loki-specific selector fork. BuilderForm, BuilderRow, FormField, TextInput and CollapsibleSection provide form structure. QueryCodeEditor, QueryToolbar, ModeSwitch, GeneratedQueryPanel and CopySqlButton provide query presentation; the read-only generated editor is an intentional separate use of the same editor primitive.

LokiBuilderPanel owns filter/group selection and async ValueControl loading. Metadata values combine retained/custom selections with deduplicated sorted provider values. Requests include UTC bounds and a selector excluding the edited label. `selectorWithoutMatcher` requires a positive nonempty anchor and conservatively drops unsafe regexes for metadata requests. These metadata restrictions are not identical to query-generation restrictions. `lokiMetadata.ts` caches by profile, label, bounds and selector; `useLokiLabelsResource.ts` keys label discovery by profile/generation/tab/range. These serve distinct resource responsibilities.

### Operators and transformations

- Label values: editable equality or `values` matchers use multi-selection. One value generates exact equality; multiple literal values generate an anchored, regex-escaped alternation. Dedicated Level produces a case-insensitive anchored alternation on a genuinely indexed severity label. Canonical label resolution is deterministic.
- Legacy `!=`, `=~`, `!~` matchers without `values` are retained and disclosed as unsupported saved expressions. The label-value UI does not provide an operator picker for those expressions; raw LogQL is the edit path. This differs from field predicates, whose operator Combobox offers `=`, `!=`, `=~`, `!~`.
- Line input renders only `lineFilters[0].value`; changing it replaces the whole array with one `|=` filter or clears it. The generator supports ordered `|=`, `!=`, `|~`, `!~` arrays. Restored multi-filter editing is therefore an important unverified UX state, not proof those operators are missing from the language implementation.
- Existing parser controls support json/logfmt/pattern/regexp and optional expression text. No Add parser/field control was found in LokiBuilderPanel. The actual inspector `resultFilter` creates a parser when required, deduplicates by kind and creates/replaces a field predicate, then enters Builder mode. Source and executed component tests establish this path; a fresh arbitrary-stage workflow was not executed.
- Serialization is fixed: indexed selector, line filters, all parsers in order, then all field predicates. UI supports edits/removal, not arbitrary interleaving/reordering. Identifier guards plus the LogQL grammar parser reject malformed generated syntax. Strings are JSON escaped; field values remain strings, not SQL typed literals. Parser validity does not establish regex compilation, Loki RE2 semantics or server acceptance.

### Level, grouping and requests

`lokiGroupBy` is independent session state; Level is a matcher in `lokiBuilder.labelMatchers`. Grouping controls can include the indexed severity label displayed as Level, without selecting a Level filter. The base log expression is not wrapped by changing grouping. Optional volume/probe expressions are generated by buildLokiTrendExpressions: grouping belongs to derived count_over_time aggregation, unlike grouping an arbitrary PromQL metric calculation. #359/#385 is delivered; this report does not reopen the completed decoupling.

LokiExplorer owns Run, expression classification, current operation publication and optional trend requests. It invokes runLoki with expression/start/end/step/limit. Time range and retrieval limit are request fields rather than appended SQL LIMIT/time predicates. `prometheusRangeBounds` is deliberately shared with Prometheus for UTC/custom and execution-time rolling bounds. `interval` selects a step for the range. A confirmed changed range can rerun after an earlier result (`hasRun`); changing a field or limit does not itself use that range-refresh effect.

The numeric Limit control clamps Number(text) to 1–5000; source-only: it does not explicitly round to an integer. Main db.runLokiQuery checks provider identity and delegates through LokiAdapter; GcxLokiTransport classifies expression again and constructs argv without shell interpolation. Logs request limit+1, then normalizer orders globally newest-first, truncates and reports a notice. Metrics use a different transport route and normalization; this is not a shared SQL row-cap contract. The two expression checks protect different process/transport entry points and are not automatically removable duplication.

## D. Visual Convergence Atlas candidates

### VC18-01 — Shared field/selector shell

- IDs/pattern: L03/L05/L07/L08; searchable selector and field chrome.
- Classification: **already converged** for inspected default/search shell; advanced selected states **unverified**.
- Observed: baseline Filter by popup has search, Clear all, environment/service_name rows and selected check. Default Level and Group by use the same field vocabulary. Common components above are real owners.
- Comparator: Phase 1B V-10 and CAP-17 MultiCombobox callers; no new comparator image was separately accepted in this batch.
- Impact/confidence: low remediation value; high confidence for inspected default Loki shell, medium cross-source visual comparison.
- Images/commit: loki-builder-desktop.png and selector-loki-options-desktop.png, provenance E1 below.
- Direction: retain primitives; do not create a universal Builder or merge source-specific resource semantics.

### VC18-02 — Independent Level filter and indexed grouping

- IDs: L07/L08. Classification: **intentional difference**, component-test confirmed; selected native visuals **unverified**.
- Observed behavior: executed parameterized UI tests retain grouping while filtering and retain indexed severity grouping through remount. Level matches an indexed label; grouping changes derived volume semantics.
- Comparator: PromqlBuilderPanel and promqlBuilder aggregation/grouping versus LokiBuilderPanel/LokiExplorer/buildLokiTrendExpressions.
- Impact/confidence: high regression impact, high test/source confidence; no new defect.
- Images: E1 shows default controls only, not populated coexistence. Proposed cap18-level-group-desktop.png is **not captured**.
- Direction: preserve #385; execute proposed native coexistence transitions before accepting advanced VV.

### VC18-03 — Builder representability and advanced validation boundary

- IDs: L05/L06/L09/L10. Classification: **unverified UX limitation**; confirmed source/generator distinctions, not a confirmed native defect.
- Observed: equality-oriented value UI preserves unsupported matcher expressions; line input replaces arrays with one contains filter; existing parsers/fields are editable, creation originates from inspector promotion. Local grammar accepts negative-only selectors and invalid regex contents while rejecting invalid field names/malformed stages.
- Comparator/owners: LokiBuilderPanel versus buildLokiQuery/logqlResultKind; SQL Builder typed predicates and PromQL matching have different contracts.
- Impact/confidence: medium risk of surprising restored-filter editing or provider errors; high source/probe confidence, low native UX/provider confidence.
- Images: E1 collapsed Advanced shell only; proposed composition/parser/invalid images **not captured**. Generating production base is the metadata SHA above.
- Direction: execute saved matcher/multi-line transitions, regex/provider rejection and visible validation scenarios; establish intended fresh-stage workflow. No production fix or generic predicate editor proposed here.

### VC18-04 — Existing raw formatter ownership defect

- ID: L02. Classification: **confirmed defect**, inherited UX-05; not a newly discovered issue.
- Observed: both preserved expected-failure tests reproduce outdated formatter completion replacing a newer draft or writing into another active tab. They remain expected failures and passed as such in the executed suite.
- Comparator: guarded generated-format revision in LokiExplorer and QueryEditor applyFormattedQuery; shared QueryCodeEditor does not own asynchronous response publication.
- Impact/confidence: high correctness impact/confidence from deterministic component assertions.
- Images: no new raw formatter race screenshot; E1 does not demonstrate the race.
- Direction: retain earlier Phase 1B recommendation; eventual bounded caller fix with captured tab/profile/generation/draft. This audit implements none.

### VC18-05 — Shared range picker, source-owned retrieval limit

- ID: L11. Classification: **intentional difference**; custom picker/limit interactions **unverified** natively.
- Observed: baseline toolbar shows committed custom UTC range and Limit 1000. Executed tests verify bounded request fields and transport limit+one/truncation. Source clamp and range-refresh policy are described above.
- Comparator: shared TimeRangeField and Prometheus bounds; SQL time predicates and row limits have separate semantics.
- Impact/confidence: medium request/resource impact; high test/source confidence, baseline visual confidence only.
- Image: loki-builder-desktop.png, E1. Proposed cap18-time-limit-desktop.png **not captured**.
- Direction: verify custom/relative commit, invalid-range cancellation, repeated execution bounds, fractional/restored limit behavior and call counts; no new common limit abstraction.

## E. CI/evidence provenance

### E1 — Reused integration baseline, inspected in this batch

- PR #406 Visual preview run **38756041452**, audit artifact **11983063809**, `datakoala-ux-audit-pr-406`; archive downloaded successfully.
- `measurements.json.sourceHead` is exactly **2525623335f3aa6c4bd946d653135bba6b5fcda8**, matching the run artifact's workflow_run.head_sha. Timezone UTC.
- Individually opened at original resolution: **loki-builder-desktop.png**, **selector-loki-options-desktop.png**. Both actual PNG dimensions 1440×900; observations confirm viewport [1440,900], zoom 1 and scale 1.
- Builder toolbar target x248/y40/1192×48; query-panel parent 1192×300. Selected Builder, custom 16:00–17:00, Limit 1000, selected service_name chip, empty Line contains, All levels, No grouping, collapsed Advanced and Generated sections were visually inspected. The timeout text is a placeholder, not a selected filter.
- Selector target x268/y160/344.203125×129.25; popup parent x262/y154/356.203125×141.25, 5px padding, 1px border, z1000. Search, Clear all, environment/service_name and selected check visually inspected.
- These are **PR #406 ancestor/base images**, not CAP-18 advanced screenshots and not PR #412 images. Every other baseline PNG is unreviewed in this batch unless explicitly named.

### Local checks and attempted isolated execution

- Node 24.19.0, pnpm 11.25.0; frozen dependency install succeeded. No local lint/format/Prettier/ESLint/Stylelint command run.
- `node --experimental-strip-types --test src/shared/loki-builder.test.ts src/shared/loki-trend.test.ts src/main/gcx-loki-transport.test.ts src/main/adapters/loki-adapter.test.ts`: **36 passed**.
- `pnpm exec vitest run --config vitest.ui.config.ts src/renderer/src/components/workspaces/loki/LokiExplorer.ui.test.tsx src/renderer/src/lib/useLokiLabelsResource.ui.test.tsx src/renderer/src/lib/lokiMetadata.ui.test.tsx`: **3 files passed, 81 ordinary passes + 2 preserved expected failures**.
- `pnpm exec electron-vite build`: passed main/preload/renderer bundling. This was not the full package/SQLite preparation command; full Production build is checked in CI separately.
- `node --check scripts/visual-preview/audit-batches/cap-18.mjs`: passed syntax only.
- `pnpm typecheck`: main/web checks passed, test-project check failed TS2352 at `src/renderer/src/components/query/PresetManagerAction.test.tsx:490`: a PostgreSQL-shaped fixture cast to Prometheus lacks required transport. That file is identical to the integration base and untouched by CAP-18. CI typecheck was skipped after the earlier formatting failure; do not claim a green full typecheck.
- Temporary launcher copied capture.mjs beside itself and replaced its two static audit imports with the isolated module. No tracked shared file was edited. Native Electron headless attempts failed with SIGSEGV/display initialization errors before scenarios ran. Downloaded/extracted scratch Xvfb could not open any local/unix listening socket in this environment. **No CAP-18 screenshot or interaction was successfully captured locally.** No provider credentials were used.
- The module's five filenames are proposals, not evidence. It has not passed semantic execution; integration must debug/validate it rather than assuming it works.

### E2 — Temporary PR execution verification

- PR #412 scenario head **052bbe0536dfdaede7d205efbeacfcfd0b0fb8e5**; CI checkout merge **ebff2d0d44fb817cbd75f333d75e0fb9475eab47**, parent integration base as recorded above. GitHub Actions checkout is a synthetic PR merge; sourceHead identifies the PR head.
- Visual preview run **38759722543** was actually launched for `audit/*` targeting the non-main integration branch. It executes the canonical audit, **not cap-18.mjs**. The run completed successfully; audit artifact **11985521623** and ordinary artifact **11984049700** were generated.
- Core CI run **38759722270**: Unit tests, UI tests, Production build and macOS runtime/package checks passed. Quality failed at **Check formatting**, naming only inherited `docs/architecture/ux-convergence-coverage-register.md`; subsequent lint/CSS/typecheck steps skipped. Renderer controls, dead-code checks, import boundaries and changed-file whitespace passed. The sole failing job is Quality, for inherited register formatting.
- Documentation site run **38759722174** passed.
- Audit artifact **11985521623** was downloaded (first connector download attempt returned a service 500; retry succeeded). `measurements.json.sourceHead` exactly matches **052bbe0536dfdaede7d205efbeacfcfd0b0fb8e5**, matching workflow_run.head_sha and the checked merge parents. Both `loki-builder-desktop.png` and `selector-loki-options-desktop.png` were individually reopened at original 1440×900 resolution. Viewport [1440,900], zoom 1, scale 1; both PNGs are byte-identical to E1, with the same observed controls/geometry. The archive contains **no cap18 PNGs**, confirming the isolated scenarios were not executed. No other PNG is newly accepted by this review.
- No CI success is treated as proof that the isolated module ran. The report-only successor may produce a separate run; do not attribute earlier artifacts to a later commit.

## F. Open questions and integration needs

1. **Missing shared runner extension:** capture.mjs statically imports installAuditIpc and runVisualAudit from audit.mjs at its two audit dispatch points. audit.mjs has a fixed scenario sequence; audit-fixtures.mjs owns a strict screenshot manifest. There is no audit-batches loader. Merely adding cap-18.mjs does not execute it or include its PNGs in artifacts.
2. **Narrow proposed integration patch (not applied):** integration owner may add an explicit allowlisted CAP-18 dispatch in capture.mjs, after the ordinary audit sequence, install its handler overrides only for its isolated run, and supply an isolated capture closure/output directory. Prefer a separate CAP-18 invocation/output under `visual-audit/batches/CAP-18/`, preserving the canonical flat manifest, captions, existing images and report. Use the same Electron launcher/window/preload/waits/dragDivider, set DATAKOALA_AUDIT_HEAD to the actual generating PR head, and upload the isolated measurements/PNGs under the existing artifact's subdirectory. Do not accept user-controlled dynamic module names or raw renderer expressions. An explicit integration-owner authorized workflow step/dispatcher is required; no shared patch was made on this branch.
3. The proposed module exports installAuditIpc/runVisualAudit and reuses existing public fixture profiles/range/results, data encoder and base synthetic IPC. It asserts five bounded states, exact expression/request and calls, independent grouping, invalid field guard and explicit handoff. **It is unexecuted** and does not yet exercise native raw formatting, every parser kind, exclusions or empty/no-fallback metadata. Integrator must validate/fix, then extend those interactions within the five-image cap as needed.
4. Capture no more than five new states: composition, selected Level/grouping, populated parser/field, invalid guarded field and custom range/limit. Obtain real artifact IDs, sourceHead/checkout provenance and inspect each actual 1440×900 PNG individually before upgrading advanced visual cells.
5. Verify negative-only selector/regex semantic rejection with a deterministic lower transport fixture or appropriately authorized live provider; grammar acceptance is not semantic acceptance. Decide intended behavior of an incomplete filter falling back to service_name and restored multi-line edits before classifying a product defect.
6. Review all nine inventory IDs against the original acceptance criteria. Import report findings into authoritative documents only as the integration owner. Preserve prior findings, aliases, 168/175 represented-row caveat and release boundaries. The final Atlas remains mandatory after all 37 batches; this branch does not generate it.

## G. Completion disposition

**PARTIAL.** All nine IDs have explicit source/test ownership and a bounded baseline visual disposition. Two baseline images were actually inspected with verified provenance; focused unit/UI tests pass and inherited formatter defects are preserved. Advanced native interactions and the five additional visual states are missing because the shared harness has no isolated module hook and local Electron execution failed before scenarios. The published module is a proposal with syntax validation only. Do not import these missing states as VV/BV or mark CAP-18 EVIDENCE_COMPLETE.

Stop after CAP-18. No CAP-19, other batch, production remediation, Phase 2, merge, release or final Atlas work performed.
