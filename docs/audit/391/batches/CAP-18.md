# CAP-18 — Loki Builder advanced predicates

## A. Metadata

- Date: 2026-10-15. Authoring context: Codex, independent parallel audit, synthetic provider/clipboard only.
- Inventory: **L02, L03, L05, L06, L07, L08, L09, L10, L11**.
- Integration base used to create the batch: `2525623335f3aa6c4bd946d653135bba6b5fcda8`.
- Branch: `audit/391-cap-18-loki-builder`; PR: https://github.com/cubitouch/DataKoala/pull/412, targeting `audit/391-ux-convergence`.
- Original partial report commit: `de8918057bf1ac333396f79de1213c7bf3670cda`; its historical evidence and limitations remain traceable there. This report supersedes its missing-harness disposition.
- Separately committed generic harness: **`a10e22e9622f88561b33ac08de9eb36278098da9`**.
- Executed CAP-18 scenario commit: **`34753c046b18ba838331a5c3652b8ac429ed7b89`**.
- Generating checkout: synthetic merge **`680c3b830bbda9397e75562dea85a7823be242f0`**, combining the scenario head with integration base **`369061f0641cd3ae86c79e9c85998dcef97c8412`**, as confirmed by checkout logs. The PR connector's base metadata still reported the earlier base; actual checkout provenance takes precedence.
- Completion/report revision: the commit containing this file. No self-referential SHA is invented. Its final small loader cleanup hardening/test change does not change the CAP-18 scenario or production source used for the inspected evidence.
- Scope extension explicitly authorized by the user: generic shared runner/workflow support on **#412 only**. Existing canonical scenarios, fixtures, flat manifests and ordinary/public preview conventions are preserved. No production file, authoritative coverage register/inventory/audit, other batch report or #406 branch write was made.

## B. Coverage matrix

**VV** means the named actual PNG was individually inspected; **BV** means an executed deterministic assertion, with native Electron versus component/generator evidence distinguished. Every row is scoped evidence completion, not all possible input/provider acceptance. Images below are under `batches/CAP-18/` in artifact E3 unless stated canonical.

Renderer paths below are relative to `src/renderer/src/`; shared/main prefixes are explicit.

| ID | Visual evidence | Behavioral evidence | Implementation ownership and named evidence | Remaining verification boundaries |
| --- | --- | --- | --- | --- |
| L02 | **VV** canonical `loki-raw-desktop.png` and generated disclosures in composition/parser PNGs | **BV native** CodeMirror select-all/insertText; Format applies synthetic response; Copy exact formatted payload; failed Format preserves draft; handoff preserves displayed expression and does not run. Two inherited expected failures remain preserved | LokiExplorer async formatter/draft owner; shared QueryCodeEditor, QueryToolbar, GeneratedQueryPanel, CopySqlButton; GcxLokiTransport format endpoint; LokiExplorer.ui.test.tsx | Real formatter service, OS clipboard and every caret/IME path UV; known formatter ownership defect remains confirmed by tests |
| L03 | **VV** canonical default Builder plus composition, level-group, parser-field, invalid PNGs | **BV native** actual form events update generated LogQL, raw draft retained until explicit Open in LogQL mode, exact request on Run | LokiExplorer orchestration; LokiBuilderPanel; shared BuilderForm/BuilderRow/FormField; executed cap-18.mjs | Fresh/restored initial arrays are controlled fixture setup, not evidence of creation through arbitrary UI |
| L05 | **VV** canonical `selector-loki-options-desktop.png` plus composition values/chips | **BV native** exact single/multi-value generation; saved `!=`, `=~`, `!~` warning/preservation; incomplete selection uses bounded positive fallback; missing safe metadata anchor disables Run with zero dispatch. **BV unit** escaped literal/regex values and metadata anchors | LokiBuilderPanel ValueControl; MultiCombobox; lokiMetadata/useLokiLabelsResource; src/shared/loki-builder.ts and tests | Custom/high-cardinality value-entry and authenticated selector/RE2 acceptance UV; fallback behavior is explicit below |
| L06 | **VV** composition line text and exact escaped generated query | **BV native** contains input serializes quote/backslash text; restored excludes/regex filters serialize exactly, then editing visible Line contains replaces the array with one `|=`. **BV unit** all four line operators | LokiBuilderPanel single input; src/shared/loki-builder.ts ordered line pipeline; pattern-promotion UI tests retained | Restored arrays are injected setup; native UI has no general line-operator editor. Do not describe that as language support absence |
| L07 | **VV** level-group PNG: ERROR/WARN while grouping includes Level/environment | **BV native** selecting Level while retaining grouping and changing grouping while retaining Level values; exact case-insensitive severity matcher. **BV unit/UI** unavailable severity and label resolution | resolveIndexedSeverityLabel; LokiBuilderPanel Level; builder.labelMatchers | No native unavailable-severity PNG added; index mapping tests support that substate. Unindexed severity is not matched |
| L08 | **VV** level-group PNG, both independent selections visible | **BV native** group state `severity` survives changing Level; adding environment grouping retains ERROR/WARN matcher. **BV unit/UI** trend/probe generation, remount and parameterized indexed grouping | Separate session.lokiGroupBy; LokiBuilderPanel onGroupByChange; LokiExplorer loadTrend; src/shared/loki-trend.ts | Chart/provider cardinality acceptance UV. #359/#385 remains delivered; no reopened decoupling |
| L09 | **VV** parser-field PNG: expanded json stage/expression control and ordered preview | **BV native** existing stage changed json→pattern→regexp→logfmt→json, expressions edited, empty regexp rejected with zero Run calls. **BV UI** inspector parser promotion/removal | LokiBuilderPanel edits stage arrays; LokiExplorer resultFilter introduces required parser; generator orders parsers before fields | Initial parser/field injected; inspector creation is executed component-test evidence, not new native promotion. Server parser semantics UV |
| L10 | **VV** parser-field and invalid PNGs: attempt `!=` 4, then bad-field, disabled Run/Copy/handoff and visible reason | **BV native** all `=`, `!=`, `=~`, `!~` field operators chosen; invalid field and invalid parser cause zero dispatch; stage precedes field. **BV unit/probe** quoted numeric/empty values and regex grammar boundary | LokiBuilderPanel field text/operator controls; LokiExplorer generation/execution; src/shared/loki-builder.ts identifier and grammar guards | Invalid regex content can be grammar-valid; runtime/server regex validation not inferred. Only string operators are offered |
| L11 | **VV** time-limit PNG: open custom picker, Aug 19 16:00–17:00 UTC and toolbar Limit 1234 | **BV native** clamp 9000→5000, 0→1; explicit request; custom start edit to16:15 triggers one refresh; invalid Clear disables Confirm, Cancel preserves committed range; Last hour triggers one refresh. **BV transport tests** limit+one/truncation | Shared TimeRangeField/prometheusRangeBounds; LokiExplorer interval/limit; GcxLokiTransport/normalizeLokiQuery | Native invalid range has no separate sixth PNG; malformed persisted/fractional limits and real result sizing UV |

### Native execution assertions

The complete successful module has **four query calls**: explicit custom Run, changed custom range auto-refresh, Last hour auto-refresh, and explicit safe-fallback Run. All have step30s and limit1234. Control selection, formatting/copy/handoff and invalid states make no extra query calls. All replies are synthetic; this is not authenticated Loki acceptance.

```logql
{service_name="example-service", environment=~"^(?:production|staging)$", severity=~"(?i)^(?:ERROR|WARN)$"} |= "a\"b\\c" | json | attempt!="4"
```

- First request: `2026-08-19T16:00:00.000Z`–`2026-08-19T17:00:00.000Z`.
- Confirming custom Start time16:15: same expression/limit, start `2026-08-19T16:15:00.000Z`; end unchanged.
- Last hour resolves at execution: `2026-10-15T14:50:09.877Z`–`2026-10-15T15:50:09.877Z` (exactly3600000ms). These clock-dependent endpoints are recorded evidence, not a fixed fixture claim.
- Explicit fallback request: `{service_name=~".+"}`, `14:50:10.150Z`–`15:50:10.150Z`, same date/limit/step. With a metadata fixture lacking service_name, Run is disabled and no call occurs.
- Restored operators produce exactly `{service_name="example-service", environment!="dev", pod=~"api-.+", region!~"test|local"} != "noise" |~ "error.*"`. An actual Line contains edit changes only the line pipeline to `|= "replacement"`, preserving all four label matchers.
- Native raw editing/Format/Copy produces `{service_name="cap18-raw"}` then newline then `|= "needle"`; exact clipboard payload checked. The synthetic format-error case retains its original draft.

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
- Line input renders only `lineFilters[0].value`; changing it replaces the whole array with one `|=` filter or clears it. The generator supports ordered `|=`, `!=`, `|~`, `!~` arrays. Native E3 interactions confirm that restored multi-filter editing replaces the array; its intended UX contract remains unresolved, not proof those operators are missing from the language implementation.
- Existing parser controls support json/logfmt/pattern/regexp and optional expression text. No Add parser/field control was found in LokiBuilderPanel. The actual inspector `resultFilter` creates a parser when required, deduplicates by kind and creates/replaces a field predicate, then enters Builder mode. Source and executed component tests establish this path; a fresh arbitrary-stage workflow was not executed.
- Serialization is fixed: indexed selector, line filters, all parsers in order, then all field predicates. UI supports edits/removal, not arbitrary interleaving/reordering. Identifier guards plus the LogQL grammar parser reject malformed generated syntax. Strings are JSON escaped; field values remain strings, not SQL typed literals. Parser validity does not establish regex compilation, Loki RE2 semantics or server acceptance.

### Level, grouping and requests

`lokiGroupBy` is independent session state; Level is a matcher in `lokiBuilder.labelMatchers`. Grouping controls can include the indexed severity label displayed as Level, without selecting a Level filter. The base log expression is not wrapped by changing grouping. Optional volume/probe expressions are generated by buildLokiTrendExpressions: grouping belongs to derived count_over_time aggregation, unlike grouping an arbitrary PromQL metric calculation. #359/#385 is delivered; this report does not reopen the completed decoupling.

LokiExplorer owns Run, expression classification, current operation publication and optional trend requests. It invokes runLoki with expression/start/end/step/limit. Time range and retrieval limit are request fields rather than appended SQL LIMIT/time predicates. `prometheusRangeBounds` is deliberately shared with Prometheus for UTC/custom and execution-time rolling bounds. `interval` selects a step for the range. A confirmed changed range can rerun after an earlier result (`hasRun`); changing a field or limit does not itself use that range-refresh effect.

The numeric Limit control clamps Number(text) to 1–5000; source-only: it does not explicitly round to an integer. Main db.runLokiQuery checks provider identity and delegates through LokiAdapter; GcxLokiTransport classifies expression again and constructs argv without shell interpolation. Logs request limit+1, then normalizer orders globally newest-first, truncates and reports a notice. Metrics use a different transport route and normalization; this is not a shared SQL row-cap contract. The two expression checks protect different process/transport entry points and are not automatically removable duplication.

## D. Visual Convergence Atlas candidates

All five IDs are retained from the partial report, with stronger evidence; none is a production remediation.

| Candidate | IDs/pattern | Classification and observed behavior | Comparator / owners | Impact/confidence | Inspected images / source / limits | Future direction |
| --- | --- | --- | --- | --- | --- | --- |
| VC18-01 | L03/L05/L07/L08; fields/selectors | **Already converged** shared search/options/chips/field shell | Canonical Loki and Prometheus selector PNGs inspected; FieldChrome, MultiCombobox, Popover, BuilderRow/FormField | Low remediation value; high bounded visual/source confidence | E3 canonical selectors + composition/level-group; source34753c0 | Keep primitives and source-owned resource policies; no universal Builder |
| VC18-02 | L07/L08; Level versus grouping | **Intentional difference**: independent Level ERROR/WARN and grouping Level/environment; changing either retains the other | LokiBuilderPanel/LokiExplorer/buildLokiTrendExpressions versus PromqlBuilderPanel/promqlBuilder | High regression impact; high native/test confidence | level-group, source34753c0; real volume/cardinality provider UV | Preserve #385 and distinct count_over_time semantics |
| VC18-03 | L05/L06/L09/L10; representability/validation | **Unverified** product intent, with native-observed representability difference: saved label operators are preserved/disclosed; editing single Line contains replaces a restored multi-filter array. Field identifiers/parser syntax fail locally; regex semantic compilation remains provider-owned | LokiBuilderPanel versus buildLokiQuery/logqlResultKind; SQL typed predicates and PromQL are different contracts | Medium UX impact; high synthetic native/source confidence, product intent of restored-line edit unresolved | composition/parser-field/invalid, source34753c0; restored pipeline transition is measured behavior without a sixth PNG | Decide whether restored multi-line editing needs clearer disclosure; do not remove domain validation or invent shared predicate semantics |
| VC18-04 | L02; async raw formatting | **Confirmed inherited defect UX-05**: two preserved expected-failure tests reproduce late formatter replacing newer/other-tab draft. Normal successful/failing format/copy additionally passes natively | LokiExplorer raw format versus generated revision guard and QueryEditor applyFormattedQuery | High correctness impact/confidence | Canonical raw34753c0 establishes shell, not race pixels; existing tests establish race | Keep prior recommendation for bounded caller ownership fix; not implemented here |
| VC18-05 | L11; range/retrieval limit | **Intentional difference**: shared picker but Loki request bounds/limit; committed range refreshes after earlier Run, limit changes alone do not fetch | TimeRangeField/prometheusRangeBounds; LokiExplorer/GcxLokiTransport versus SQL predicates/row limit | Medium request impact; high native/source confidence | time-limit, source34753c0; synthetic transport only | Preserve adapters; fractional/restored-limit follow-up if required; no common SQL-limit assumption |

## E. CI/evidence provenance

### E3 — Successful standalone execution and actual visual review

- Temporary PR **#412**, Visual preview run **38763236819**, capture job **116519858832**.
- Audit artifact **11986523589**, `datakoala-ux-audit-pr-412`, archive downloaded and extracted. Ordinary artifact **11986543510** is generated separately; ordinary PNGs are not claimed individually reviewed in this batch.
- Artifact workflow_run.head_sha, canonical measurements, `batches/index.json`, `batches/CAP-18/status.json` and batch measurements all identify **`34753c046b18ba838331a5c3652b8ac429ed7b89`**. Batch status is success. Checkout log confirms merge680c3b8 with base369061f and scenario34753c0 (full SHAs in A).
- Canonical audit: **225 PNGs / 307 measured states/interactions**, exact existing manifest asserted. Standalone adds exactly **five PNGs**, under `batches/CAP-18/`, for **230 PNGs** total. Canonical fixture/scenario/manifest files were not changed. Ordinary preview manifest validation passed unchanged.
- Individually opened using original full resolution: `cap18-composition-desktop.png`, `cap18-level-group-desktop.png`, `cap18-parser-field-desktop.png`, `cap18-invalid-desktop.png`, `cap18-time-limit-desktop.png`. Actual PNGs 1440×900; every batch observation width1440, height900, DPR1, zoom1, positive live workspace target. Query-call snapshots0/0/0/0/1. Final measurements record all four calls and five named behavior groups.
- Composition visibly shows service/environment chips, production/staging, escaped line text and populated generated preview. Level/group image shows ERROR/WARN alongside Level/environment grouping. Parser image shows json, editable expression, attempt `!=`4 and ordered query. Invalid image shows bad-field, blank generated expression, disabled Run/Copy/handoff and `Invalid Loki field name: bad-field` below the query region. Time image shows full picker/calendar, 16:00/17:00, explicit Confirm/Cancel and Limit1234 behind it. No new clipping or missing target was observed at this viewport.
- Also individually inspected from E3: canonical `loki-raw-desktop.png`, `loki-builder-desktop.png`, `selector-loki-options-desktop.png` and comparator `selector-prometheus-options-desktop.png`, all1440×900. They establish raw editor shell, baseline/chip/search presentation and shared selector vocabulary. They do not turn every canonical PNG into VV.
- Root screenshot measurements retain the canonical300px query region; batch screenshots deliberately use a real divider interaction to640px so the advanced form and generated preview fit. This is an audit layout action, not production UX change or a claim of identical shell height across states.

### Tests and workflow results

- Local focused harness suite: **29 passed** (`node --test scripts/visual-preview/*.test.mjs`); includes11 new tests for deterministic discovery, missing/error directory, spaces in paths, traversal/unknown IDs without import, import cause, exports/manifests, evidence dimensions/provenance/observations, partial failure, missing measurements, aggregate continuation and empty registry. Re-run passed after tightening cleanup to only declared module-owned files and preserving an unrelated file.
- CI **38763236759** at scenario34753c0: **Unit tests, UI tests, Production build and DuckDB macOS runtime/package passed**. Script stage passes31 tests (29 harness +2 installer); Node stage486 tests, fail0. Quality fails **Check formatting**, so later lint/CSS/typecheck are skipped. Logged formatting files: inherited authoritative register, CAP-18 report, NON-02/NON-03 reports and their test files included by the actual integration merge. Do not call CI fully green or blame those unrelated files on this branch's diff.
- Documentation **38763236863** passed. Visual preview **38763236819** capture passed, including canonical audit, standalone batch, artifact upload and ordinary manifest. Publish status is recorded in the PR handoff if still running at this revision.
- Earlier local evidence retained:36 Loki generator/trend/transport/adapter unit passes;81 ordinary UI passes +2 preserved expected failures across3 focused files; electron-vite build passed. Native local Electron/Xvfb failed before scenarios; this is superseded by successful actual CI execution, not relabeled local success.
- Earlier `pnpm typecheck` reached test-project TS2352 at PresetManagerAction.test.tsx:490 (invalid Prometheus fixture cast missing transport). That file was unchanged. This report does not claim a final green full typecheck because Quality stops earlier in CI.
- **No local lint or formatting commands were run**, including Prettier/ESLint/Stylelint.

### Historical provenance retained

The partial report inspected the default Builder and Loki selector in integration run38756041452/artifact11983063809 at source2525623 and temporary-PR run38759722543/artifact11985521623 at source052bbe0. Both pairs were1440×900, DPR/zoom1 and byte-identical. Their archives did not contain CAP-18 images. Those facts remain historical; current advanced completion uses only E3. The original report commit in A preserves its full source/test/gap record.

## F. Integration and remaining verification boundaries

The shared infrastructure blocker is resolved **on #412**. `audit-batch-loader.mjs` discovers repository-owned `<lowercase-prefix>-<two digits>.mjs` regular files, never arbitrary environment paths or symlinks; validates exports/unique flat PNG names; verifies exact image set,1440×900 header dimensions, semantic observation scale/positive target and sourceHead. `run-audit-batches.mjs` gives each module a fresh Electron process and `visual-audit/batches/<UPPERCASE-ID>/` output, writes aggregate status, continues diagnostic capture after a failed module and exits nonzero for any failure. Import/setup errors also exit nonzero. Existing artifact naming/flat canonical manifests/publication/regression behavior remain unchanged. Follow-up cleanup is limited to declared screenshots, measurements and status, preserving unrelated files.

Future modules export `installAuditIpc`, `runVisualAudit` and `screenshots`; use shared context helpers plus module-owned fixture/scenario assertions. Documentation is in `docs/engineering/visual-documentation.md`. No CAP-18-specific logic is in the loader, orchestrator, workflow or common fixtures. No further shared patch is needed to load a conforming future module.

Remaining scope limits do not block scoped evidence completion:

- No authenticated Loki provider, formatter endpoint, RE2 semantic acceptance, native OS clipboard, packaged release, screen reader, exhaustive IME/caret or high-cardinality performance acceptance.
- Existing parser/field and legacy matcher/line arrays are synthetic restored-state setup; subsequent controls are real React/Electron interactions. Inspector creation/removal is separately executed component-test evidence. Unsupported saved matcher operators are edited in raw LogQL, not a nonexistent label operator picker.
- Generator parsing is not regex compilation or server validation. Negative-only selectors/invalid regex content from the probes are not branded security bypasses. No guarantee an unfinished label selection retains its intended scope: safe service_name fallback is visibly/behaviorally deliberate and missing fallback fails closed.
- Known raw-format ownership defect and every prior CAP/Phase1B finding remain preserved. No product fix or release approval occurs here.
- Integration owner must review/import this report and the generic harness into #406, reconcile authoritative coverage and other reports, and eventually build the mandatory final Atlas after all37 batches. This agent did not update those shared audit documents or start another batch.

## G. Completion disposition

**EVIDENCE_COMPLETE — scoped CAP-18 acceptance.** All nine IDs independently disposed; actual canonical/advanced PNGs inspected with generating sourceHead checked; exact LogQL, requests, guards and state transitions verified through successful real-renderer synthetic interactions plus named tests/source boundaries. Five additional states only. This supersedes the earlier PARTIAL disposition; it is not live-provider or release acceptance.

Stopped after CAP-18. No CAP-19, production UX, #406 direct write, merge, Phase2, release or final Atlas implementation.
