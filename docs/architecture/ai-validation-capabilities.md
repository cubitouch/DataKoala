# AI validation capability boundaries (Phase 6A)

Base: `a9ab2f4` (merged #400 and #401). Scope: #365 Phase 6A, release #382.
No Phase 5B persistence code or Phase 6B caller consolidation is included.

## Responsibility map

Previously `src/main/ai/validation.ts` owned all contracts below. It now re-exports
exactly the same thirteen runtime exports from capability modules. Existing
callers continue to import the facade; no orchestration, prompts or wire types
change.

| Module under `src/main/ai/validation/` | Existing exports                                               | Responsibility                                                                                                          |
| -------------------------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `primitives.ts`                        | `AiError`, `record`, `textValue`, `requestId`, `settingsInput` | Shared object/string parsing, error identity, request IDs and settings input                                            |
| `query.ts`                             | `proposalRequest`, `queryStep`                                 | Generation/repair schema context, repair error sanitization, query proposal and bounded discovery steps                 |
| `builder.ts`                           | `builderProposalRequest`, `builderStep`                        | Builder state/patch allowlists, column/type references, temporal constraints and existing count-over-time normalization |
| `anomaly.ts`                           | `anomalyAnalysisRequest`, `anomalyAnalysis`                    | Bounded line-chart samples, coverage, finite points, unique grounded finding references                                 |
| `plan.ts`                              | `planAnalysisRequest`, `planAnalysis`                          | Captured plan sanitization, execution mode, hint allowlists and supplied node references                                |

Settings input remains beside its primitive dependencies; it does not need a
separate capability abstraction. Query generation and repair share their actual
schema contract, with repair retaining its stricter request-field rules.
Builder's exact-key checks differ from anomaly's exact-key checks in required
fields and error messages. They remain private to their capabilities. No shared
schema engine or generalized allowlist was introduced. Only the original shared
primitives are shared; constants/types remain in existing `src/shared` modules.
Each capability imports primitives and existing shared domain helpers, never
another capability or the facade. There is no new import cycle.

## Export and caller compatibility

- `AiService` consumes all four request validators, settings input, request IDs
  and `AiError`. Validation still precedes provider work, with identical error
  codes/messages, owner-scoped cancellation, duplicate IDs and timeout cleanup.
- `OpenRouterProvider` consumes all four response validators and shared parsing
  primitives/error identity. Outer JSON parsing, 100,000-character structured
  response cap, HTTP normalization and provider schemas stay in that module.
- `AiSettingsStore` consumes `record`/`textValue`; settings and secrets storage
  are unchanged. Existing `instanceof AiError` behavior is preserved.
- `ipc.ts` registers the same service methods; preload channels and shared
  request/response types are unchanged. AI handlers produce proposals/analysis,
  not database execution. Renderer review/application/run paths are unchanged.
- `ai.test.ts` and `builder.test.ts` keep testing the facade. The added export
  test verifies the exact public export set and direct implementation identities.

## Security and privacy invariants

Every original validator declaration is preserved verbatim in meaning. Limits
remain `AI_LIMITS`, including schema relation/column/catalog/character caps,
query/prompt bounds, Builder context budgets, chart series/point sampling caps,
and plan text/node/hint caps. Required/optional/null fields, enum checks, exact
keys versus filtered properties, nested normalization and all error boundaries
are unchanged. No logging, provider payload, prompt, settings, IPC, secret,
cancellation, SQL execution or persistence code changes.

Generation reconstructs an allowlist and filters extras; repair rejects extras
at its existing request/context boundaries and sanitizes error text. Anomaly
requests reject extras and inconsistent sample coverage; findings reference
only submitted points without duplicates. Plans are sanitized by the existing
shared plan sanitizer; hints require supplied node IDs without duplicate IDs
within a hint. Builder proposals validate allowed patches, known columns,
numeric/temporal types and supported time ranges against submitted metadata.
Existing Builder normalization remains capability-specific.

Do not mistake query shape validation for a SQL security parser: the baseline
query validator bounds SQL strings but does not independently reject arbitrary
SQL statements or verify every SQL identifier. Existing read-only prompt rules,
restricted discovery search terms, and explicit user review/run separation are
preserved. This refactor neither adds nor removes a SQL execution safeguard.
Unsafe discovery text (`SELECT secret`, `orders; DROP TABLE users`, credentials)
and SQL fields injected into Builder/analysis responses are rejected in tests.
Changing SQL acceptance or adding a new parser requires separate scoped work.

## Regression proof

Before extraction, all 66 existing main AI tests passed. The 13 new contract
tests were run against both the original `a9ab2f4` implementation and the
extracted facade: **79/79 passed on each**. They assert concrete accepted values
and rejection codes, not snapshots. A TypeScript AST comparison of every
non-import declaration found exact equality after printing without comments;
only imports, module ownership and formatting differ. The original module is
not retained as a second production implementation.

Additional facade identity coverage protects all thirteen exports. Existing
provider tests protect malformed inner/outer JSON, HTTP failures, repair error
sanitization, settings/secrets, timeouts and cancellation. Existing renderer AI
tests protect explicit Apply/Accept versus Run, Reject, Builder review, repair,
plan hints, chart sampling and stale-result behavior.

The added contract cases cover minimal requests/responses, individual missing
required fields, wrong primitives, unknown response fields, capability
confusion, request IDs, bounded prompts/queries/assumptions, maximal Builder
column count, unknown/type-invalid column references, invalid time enums/ranges,
maximal chart samples/findings/text, nested non-finite/invalid points, duplicate
or out-of-range references, maximal plan nodes/hints/text and unknown node IDs.
Maximal payloads obey the combined context budget; independent field maxima
must not be interpreted as permission to exceed it. Existing tests retain the
aggregate schema/context-budget and sanitization negative cases.

## Release handoff and Phase 6B

Extend #382 RC-03 and RC-05B on the frozen candidate. All manual checks remain
pending: query proposal, invalid model output, Accept/Reject with separate Run,
repair, anomaly/plan analysis, Builder review, provider failure and recovery.
Record candidate SHA, platform, test provider/model, actions and evidence.
Automatic contract checks do not count as manual acceptance.

Phase 6B may consolidate caller imports/tests and reconsider unused utilities
only with demonstrated benefit. Keep privacy, IPC/provider limits and renderer
approval/cancellation coverage; do not broaden contracts or introduce another
validator framework. No Phase 6B work is performed here.

## Phase 6B end-to-end assessment

Audited base: `56bc003` (merged #400, #401, #402 and #403). This phase
changes tests and documentation only. The thirteen-export facade remains the
public import path; no obsolete caller or compatibility adapter was found.

### Final ownership and ingress map

| Capability                | Renderer owner / review                                                                              | Preload and IPC                                        | Main request boundary                                   | Provider response boundary                                                                |
| ------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| SQL generation and repair | `useAiQueryCopilot`, `useAiQueryRepair`, `workflow.ts`; diff review and explicit Apply, separate Run | `api.ai.proposeQuery` → `AI_PROPOSE`                   | `AiService.proposeQuery` → `proposalRequest`            | `OpenRouterProvider.proposeQuery` → `queryStep`                                           |
| SQL Builder               | `useAiBuilderCopilot`, `builderWorkflow.ts`; atomic reviewed patch, separate Run                     | `api.ai.proposeBuilder` → `AI_PROPOSE_BUILDER`         | `AiService.proposeBuilder` → `builderProposalRequest`   | `OpenRouterProvider.proposeBuilder` → `builderStep` against submitted state/columns       |
| Chart anomaly analysis    | `useChartAnomalyAnalysis`; explicit analysis of bounded samples, no query mutation                   | `api.ai.analyzeAnomalies` → `AI_ANALYZE_ANOMALIES`     | `AiService.analyzeAnomalies` → `anomalyAnalysisRequest` | `OpenRouterProvider.analyzeAnomalies` → `anomalyAnalysis` against submitted series/points |
| Execution-plan hints      | `useAiPlanAnalysis`; captured plan identity and explicit analysis, node inspection only              | `api.ai.analyzePlan` → `AI_ANALYZE_PLAN`               | `AiService.analyzePlan` → `planAnalysisRequest`         | `OpenRouterProvider.analyzePlan` → `planAnalysis` against sanitized submitted node IDs    |
| Settings / connectivity   | settings modal; draft test separate from Save                                                        | settings, models, test, key-remove and cancel channels | `settingsInput` / `requestId`; secure settings store    | provider HTTP/model-list normalization; connectivity test has no proposal                 |

Preload supplies TypeScript contracts, **not runtime validation**. IPC takes
`unknown` and delegates to the service. All four capability request validators
run before settings/key reads and before provider construction/execution.
`AiService.run` owns request IDs per `event.sender.id`, duplicate rejection,
16-request concurrency budget, timeout and cleanup. IPC installs one destroyed
listener per sender and cancels that sender's requests. Cancellation IDs are
validated and cannot cancel another sender's identical ID.

The production provider owns response validation. Its `complete` method parses
the outer envelope and bounded inner JSON before dispatching to the capability
validator; only the normalized result reaches `AiService.result` and IPC.
`AiProvider` is an internal typed interface: replacing it with another provider
requires implementing the same response-validation guarantees. The service does
not independently validate an injected provider's typed return value. Adding a
second validator here would duplicate the existing boundary, not protect an
additional untrusted ingress in the current production wiring.

Main cancellation races the operation and returns a safe error even if transport
ignores abort. Renderer hooks additionally own flight/snapshot identity and
suppress obsolete success, failure and cleanup after edits, replacement,
cancellation or unmount. Main-process ownership is per sender, not per tab;
renderer ownership supplies tab/result/plan isolation. Neither AI IPC nor the
provider invokes database execution. Apply updates a reviewed draft or Builder
state; Run remains a separate user action. Analysis publishes annotations or
hints, not an executable action.

### Duplication decisions

- Retain the facade: every production consumer (`service.ts`, `openrouter.ts`,
  `settings.ts`) uses it deliberately; its identity test guards the original
  exports. Direct capability imports would create another caller convention.
- Retain capability-private key checks: Builder distinguishes allowed and
  required fields and accepts documented optional/flat temporal fields; anomaly
  requires an exact field set and preserves different request diagnostics.
- Retain four explicit service methods: each names its request validator,
  provider operation and configuration error. The short common orchestration
  is visible and stable; a dispatch framework would couple unrelated contracts.
- Retain query/Builder assumptions parsing and response error wrappers locally:
  similar field limits do not imply interchangeable response schemas or errors.
- Keep request allowlisting and renderer context construction: the main boundary
  must independently protect disclosure, even when the renderer already cleans
  metadata. Plan and repair sanitizers likewise run again in main.
- Keep small independent fixtures in field-level and integration tests. New IPC
  fixtures intentionally exercise real service/provider wiring, while existing
  validator fixtures isolate contracts. Sharing them would obscure which
  boundary is being exercised; no redundant production implementation exists.

No production mechanism was removed. No further extraction is justified before
v0.2.1: remaining similarities have distinct contracts or are small explicit
orchestration. A universal schema/dispatch framework would increase coupling.

### Regression evidence and coverage boundaries

`src/main/ai/ipc.vitest.ts` adds 21 deterministic tests through registered IPC
handlers, the real service, the real provider and the extracted validators.
Only Electron registration/encryption, settings reads and HTTP transport are
stubbed; no real secret, network request or database execution is required.
The existing renderer Vitest configuration now discovers main AI Vitest tests.

These tests verify malformed IPC rejection before settings/transport work;
nested budgets and capability-specific unknown request fields; every pair of
cross-capability responses; unknown response fields; exact capability response
messages and HTTP authentication errors; explicit recovery with the same ID;
duplicate IDs; cancellation with an abort-ignoring transport and late invalid
completion during retry; sender destruction and distinct-owner isolation;
repair error redaction and generation allowlisting at actual serialization;
unknown Builder columns, ungrounded chart points and plan nodes; malformed outer
JSON and the 100,000-character inner-content cap.

`ExplainPane.test.tsx` adds late success/failure after plan replacement and
explicit recovery against the replacement SQL/mode. Existing AI UI tests already
exercise query and repair Apply without execution, Reject, keyboard submission,
limited discovery/retry, Builder atomic Apply and stale review, and anomaly
session/revision isolation. Existing main tests cover timeouts, secret storage,
HTTP normalization and extensive negative validator cases. No field-level
negative tests were deleted or made expected failures.

### Known limits retained

- Query output is a bounded SQL string, not a SQL safety AST. It does not prove
  read-only statements or identifier grounding. Discovery search restrictions
  and Builder column grounding are separate contracts; changing SQL acceptance
  belongs in a separate review.
- Generation/plan requests rebuild allowlists; repair rejects extra top-level
  and context fields; Builder/anomaly use their stricter existing schemas. Do
  not turn those intentional differences into a uniform acceptance rule.
- Plan sanitization bounds/truncates accepted text and removes fields, rather
  than rejecting every oversized optional value. SQL, prompts and allowed plan
  expressions may themselves contain user-entered sensitive literals; error
  redaction is not a general-purpose SQL/prompt scrubber.
- Grounding proves reference membership, not the factual accuracy of narrative
  claims or causality. Chart analysis covers only submitted samples.
- The structured inner-content limit is checked after transport JSON parsing;
  this is not an HTTP streaming/body-size limit. No new transport limit is
  introduced by this architectural assessment.
- Abort does not guarantee stopped remote computation or avoided charges.
  Tests use a fake Electron sender and HTTP responses; packaged Electron,
  preload serialization and a real provider/model remain RC acceptance work.

### Release handoff

Keep #382 **RC-03 and RC-05B pending**. Existing scenarios already cover proposal,
repair, invalid output, Accept/Reject versus separate Run, Builder validation,
chart/plan grounding and provider recovery; no additional large matrix is needed.
On the frozen candidate, record its full SHA, platform, provider/model, fixture,
exact actions and outcomes. Specifically replace a captured plan while its AI
analysis is pending, allow the old response/error to settle, then explicitly
reanalyze: no obsolete hint/error should appear and the new request must use the
replacement SQL/mode. Deduplicate with the existing stale-analysis checks.
A draft PR head is not a frozen release candidate; no manual result is claimed.

### Local validation (2026-10-13, Linux x64 / Node 24.19.0)

- Focused main AI tests: **80 passed**, no skips; IPC integration: **21 passed**;
  focused Explain UI: **6 passed**, including both new stale cases.
- `pnpm test`: Node **477 passed / 5 skipped / 0 failed** (482 discovered),
  renderer/main Vitest **642 passed** (81 files), script tests **13 passed**.
  The five existing `connString.e2e.test.ts` tests skip because no PostgreSQL
  test database is reachable. The first attempt's SQLite integration failure
  was resolved by `pnpm prepare:sqlite-extension`; the full rerun passed.
- `pnpm test:ui`: **964 passed** (100 files), no skips.
- Typecheck, lint (TypeScript/React and CSS), formatting, renderer controls,
  import boundaries and both dead-code configurations passed. Knip reports
  only three existing redundant-entry configuration hints per configuration.
- Advisory duplication: **39 clones / 1.31% lines** across 277 production files;
  no production changes in this PR. Findings are not a reason to couple the
  capability contracts described above.
- Production build, documentation build and `docs:verify` passed. Documentation
  verification reports 13 absent local screenshots; no new screenshots claimed.
- `docs:screenshots` attempted after building: Electron exits with missing X
  server / `$DISPLAY` (SIGTRAP); no local visual capture is available. The
  repository renderer smoke script targets a macOS Electron binary, and this
  environment has no Docker/PostgreSQL fixture. These packaged/display/database
  checks require CI or the frozen-candidate acceptance environment.
- Final-head GitHub CI and visual-preview results are recorded in the draft PR.
  This local report does not substitute for those results or manual acceptance.
