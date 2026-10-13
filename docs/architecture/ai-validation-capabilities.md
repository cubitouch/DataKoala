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
