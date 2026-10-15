# NON-06 — AI metadata context discovery security and correctness

## A. Metadata and scope

- **Parent:** #391, Phase 1C; **inventory contract:** S26 — AI metadata context expansion (SQL4).
- **Integration:** draft PR #406, branch `audit/391-ux-convergence`.
- **Verified integration base:** `834f7b4befbc78467754bbcdffe619bb1d2c37de` (read by SHA before creating the branch).
- **Isolated branch:** `audit/391-non-06-ai-discovery`.
- **Temporary draft PR:** https://github.com/cubitouch/DataKoala/pull/417 — targets `audit/391-ux-convergence`, not main.
- **Implementation:** audit-only; production behavior, shared harness, workflows and central coverage register untouched.
- **Scope:** initial SQL context, metadata catalog, one-time expansion, provider validation, asynchronous ownership, proposal review/application and #365 Phase 6A/6B contracts. No native Electron captures or actual OpenRouter/database connections.

## B. Independent S26 evidence disposition

| Dimension | Status | Evidence and ownership |
| --- | --- | --- |
| Behavioral | **BV (synthetic, conditional on CI confirmation)** / **SO** for unexecuted branches | New deterministic assertions in `non06.context.test.ts`, `non06.workflow.test.ts`, `non06.discovery.test.ts`; existing `context.test.ts` and `ai.test.ts`; source inspection of query/repair hooks |
| Visual | **N/A** | This contract is security/metadata behavior, not screen layout; no screenshots claimed |
| Implementation | **HYBRID / capability-specific** | Shared SQL4 context handling in renderer `context.ts`/`workflow.ts`, main `validation/query.ts`, OpenRouter provider; actual dialect/connection metadata differs |
| Trust boundary | **PARTIAL** | Ingress/egress validation source-reviewed; synthetic provider rejected hostile step; stale metadata revision/connection identity end-to-end not established |
| Live provider/database | **UV** | No authenticated DB, cross-project BigQuery, real connection churn or real-model calls |
| Current completion disposition | **PARTIAL** | CI results and unresolved stale-profile revision invariant; no claim of complete security acceptance |

### Exact new named tests

`src/main/ai/non06.discovery.test.ts`:
1. `NON06 model discovery accepts bounded semantic terms and rejects malformed or command-bearing steps`.
2. `NON06 characterization: duplicate semantic discovery terms are accepted, not canonicalized`.
3. `NON06 request validation enforces aggregate relation and column caps and strips untrusted fields`.
4. `NON06 provider rejects malicious discovery before returning a step; no real provider involved`.
5. `NON06 characterization: syntactically valid SQL proposals are not SQL authorization checks`.

`src/renderer/src/lib/ai/non06.context.test.ts`:
1. `NON06 initial and discovery budgets apply to actual JSON and preserve structurally valid context`.
2. `NON06 oversized metadata is truncated by serialized JSON budget, not by slicing JSON text`.
3. `NON06 zero remaining slots and duplicates never request more column metadata`.
4. `NON06 unknown terms and system-schema relations cannot expand the local metadata catalog`.
5. `NON06 characterization: duplicate SQL references can consume initial relation slots`.

`src/renderer/src/lib/ai/non06.workflow.test.ts`:
1. `NON06 EXPECTED FAILURE: discovery must refuse columns resolved after the originating profile metadata is replaced` (Vitest `test.fails`: guard is absent at this layer).
2. `NON06 expansion remains tied to the original profile ID rather than the newly active profile`.

Existing relevant coverage: renderer `context.test.ts` tests initial slot reservation, 140-column/18k cap, 8-relation/200-column/24k global cap, no credential/result-row serialization, system relations and SQL dialects; main `ai.test.ts` covers request allowlist, model response envelopes, validation, cancellation and request IDs. Those existing tests were **read**, not retroactively counted as executed in this run.

## C. Context budget matrix

| Contract | Initial stage | Expansion/global stage | Implementation/qualification |
| --- | --- | --- | --- |
| Detailed relation count | 6 by default; can be **8** if current SQL references at least 8 | 8 unique-detail capacity by intended contract | `selectAiRelations` dynamically sets `min(8, max(6, referenced.length))`; `appendAiContext` caps final length at 8 |
| Columns per relation | 40 | 40 | Each `load` result sliced to first 40 |
| Aggregate columns | 140 | 200 | Actual accepted columns counted incrementally; **60 reserved** ordinarily |
| Serialized context | 18,000 characters | 24,000 characters | `JSON.stringify(context).length` measured at every relation/column candidate; no invalid mid-JSON character slicing |
| Names-only relation catalog | 200 entries | 200 entries | Catalog names max 256 chars each and JSON catalog cap 12,000 chars; total context still capped at 24,000 |
| Discovery step | One model-initiated expansion locally | A second context-request terminates with explanation | Enforced by `useAiQueryCopilot` and `useAiQueryRepair`, **not** by stateless `queryStep` |
| Model search terms | 1–5 | 1–5 | Max 80 chars each; restricted punctuation and blocked command/secret keywords |
| Model reason | up to 1,000 chars | same | `queryStep` requires nonempty text |
| Prompt / current query | 8,000 / 40,000 chars | same | Main request validation; string size is not a token budget |
| Output envelope | Structured query-step schema | same | Provider limits parsed inner JSON content to 100,000 chars |

**Reservation caveat:** 2 relation slots may disappear when 8 current-query references are prioritized; the initial column/character budgets remain lower independently. Relation catalogs also occupy the global character limit. A short initial context does not establish token-level model budgeting.

**Failure boundaries:** Exceeding a serialized limit causes the last column/relation to be popped; if a relation cannot fit, further relation iteration stops. Empty-column relations can still be included when permitted by the budget. Main validation separately rejects overlong names, oversized payloads and invalid dialects rather than silently trusting renderer output. Malformed or fabricated metadata catalog entries can be accepted only as schema-shaped fields at the main boundary, because it does not query the database to authenticate them.

## D. Trust-boundary and ownership map

```text
active SQL tab (tabId/profileId/SQL) + local per-profile metadata catalog
  -> renderer selectAiRelations / buildAiContext / withAiRelationCatalog
  -> preload api.ai.proposeQuery (typed API; NOT a runtime validator)
  -> IPC AI_PROPOSE (unknown input, owner = event.sender.id)
  -> AiService.proposeQuery -> proposalRequest (allowlist, sizes, dialect)
  -> OpenRouterProvider (structured JSON + 100k response cap)
  -> queryStep (strict six keys; either bounded context-request or proposal)
  -> renderer checks response
     -> first context-request only: expandAiQueryContext (local eligible
        relations from snapshot.profileId) -> ensureRelationColumns
        (profile+generation-scoped describeTable, cache and return checks)
     -> second validated proposal OR second context-request (stop)
  -> reviewed proposal (snapshot/query guard)
  -> explicit Apply changes draft SQL; Run is a separate user action
```

- **Local metadata is not itself a model instruction.** Extra profile, credential and row fields are excluded during renderer construction and stripped by the main request validator. No query rows are fetched by context discovery. SQL and column names can still contain prompt-injection strings; source prompts instruct the model to treat them as data, but no live-model resistance test is claimed.
- **Model output becomes usable only after `queryStep` normalization.** Unknown keys, wrong shape, numeric/SQL-like search terms and oversized arrays fail with `invalid-response`; duplicated *valid* search terms remain allowed. `AiService` trusts its internal typed `AiProvider` contract; the current production `OpenRouterProvider` validates raw output.
- **Model search terms are not direct DB object IDs.** They rank local eligible metadata, excluding system schemas; `expandAiRelations` excludes already-disclosed identities and enforces remaining slots. Exact schema/name of selected relations comes from local metadata, not an untrusted model-provided identifier.
- **Cross-datasource isolation relies on the renderer's `snapshot.profileId` and the lazy loader's profile/generation checks.** Expansion does not call a different active profile. However `AiQuerySnapshot` has no metadata revision/connection generation, and the expansion function does not recheck the original profile metadata revision after awaiting column lookup.
- **IPC is not a DB authorization endpoint.** It bounds and filters a supplied context but does not look up or verify relation identity against a database. That is acceptable for an outbound model *proposal* request only insofar as renderer and database access remain appropriately scoped; do not label it database-level authorization.
- **One expansion per user request** is a renderer state-machine invariant; it is not a per-requestId quota in the main process. Replaying a syntactically valid AI request via IPC may invoke the model again, but does not itself trigger renderer metadata expansion or database query execution.

## E. Adversarial and failure matrix

| Scenario | Expected invariant | Observed source / new test | Confidence / limitation |
| --- | --- | --- | --- |
| 8 vs 9 relations, 200 vs 201 columns, 40 vs 41 per relation | Reject over-budget context before provider | `NON06 request validation enforces…` plus existing `ai.test.ts` | Deterministic when CI passes; does not establish runtime provider authorization |
| 6 initial detailed relations, 140 columns, 18k JSON; expansion to 8/200/24k | Reserve bounded useful capacity | `NON06 initial and discovery budgets…`, `NON06 oversized metadata…` | Synthetic, actual serialized length, not tokens |
| No spare slots / duplicate already-known relations | No unnecessary metadata load | `NON06 zero remaining slots…` | Pure context helper, no database involved |
| Missing or system-schema term | No eligible relation expansion | `NON06 unknown terms and system-schema…` | Synthetic catalog; source's `isSystemSchema` policy only |
| Malformed six-field model response, extra keys, SQL/credentials, oversize, wrong types | Reject before expansion | `NON06 model discovery accepts…`, `NON06 provider rejects malicious…` | Current provider path; a newly injected custom provider may need its own validator |
| Duplicate semantic terms | Bounded; ideally canonicalize | `NON06 characterization: duplicate semantic…` | Accepted, low severity; max five terms still holds |
| Duplicate SQL-referenced catalog relation objects | Avoid consuming reserved slots twice | `NON06 characterization: duplicate SQL references…` | Current selection duplicates when metadata contains duplicate referenced entries |
| Profile metadata replaced after discovery begins | Refuse stale columns | `NON06 EXPECTED FAILURE…` | **Known gap** within `expandAiQueryContext`; no direct live UI exploit asserted |
| Active profile switched | No lookup against newly active profile | `NON06 expansion remains tied…`; `ensureRelationColumns` profile-scoped key | Pure test; actual connection generation mismatch returns undefined |
| Second context-request | Stop and explain, no third expansion | Source `useAiQueryCopilot`/`useAiQueryRepair` | SO in this batch; existing app tests not independently executed |
| Proposed query with write SQL | No implicit execution or SQL authorization inference | `NON06 characterization: syntactically valid SQL proposals…` | Validator **does not** parse SQL read-only semantics; Apply/Run is distinct UI protection, not SQL policy |
| SQL/tab changes during provider flight | No automatic apply to wrong tab | Snapshot/stale guards in query and repair hooks | SO, no complete DOM/IPC race simulation in this batch |

## F. Findings and Visual Convergence Atlas candidates

| ID / type | Capability / impact | Evidence, confidence, owner and remediation direction |
| --- | --- | --- |
| **NON06-01 — missing guard / expected-failure** | S26: context can complete from an earlier metadata revision while its originating profile metadata has changed; stale schema/model context risk, not confirmed execution | Source `workflow.ts` lacks post-await revision check; `NON06 EXPECTED FAILURE…` synthetic test. **Medium confidence; medium potential impact.** Renderer AI workflow/metadata owner: capture metadata revision/generation and check before column load and before second provider request; coordinate with lazy-loader generation rules. No production fix in this PR. |
| **NON06-02 — confirmed duplicate-selection defect** | S26: duplicate eligible records referenced by current SQL can occupy two of up to eight relation slots | `selectAiRelations` initially slices referenced records without deduping keys; `NON06 characterization: duplicate SQL references…`. **High source confidence; low-to-medium impact**, depends on malformed/duplicate source metadata. Renderer context owner: dedupe at selection, preserve priority. |
| **NON06-03 — insufficient normalization** | S26: duplicate valid `searchTerms` consume some of five term slots but do not bypass size caps | `queryStep` validates each term but does not dedupe. **High confidence, low impact.** Main query validator owner: optional dedupe/normalization with contract review. |
| **NON06-04 — intentional security separation** | S24/S26: `queryStep` parses bounded SQL text but does not enforce read-only SQL syntax | Existing architecture #365 and new `NON06 characterization: syntactically valid SQL proposals…`. **High confidence.** Do not treat proposal acceptance as query execution authorization; enforce statement safety at execution boundary, preserve explicit Apply/Run. |
| **NON06-05 — unverified provider/catalog authorization** | S26: a user-controlled IPC request can include schema-shaped relation names not verified against an active datasource by `proposalRequest`; no direct DB metadata call on that IPC path | Source main validator/service and local `workflow.ts`. **High source confidence; real authorization impact unverified.** Integration owner: characterize actual main `describeTable` source scopes, profile deletion/reconnection, BigQuery project/dataset restrictions and threat model. |
| **NON06-06 — intentional capability ownership** | AI query/repair vs Builder/anomaly/plan validators remain distinct; facade and shared primitive exports are stable | `docs/architecture/ai-validation-capabilities.md` Phase 6A/6B, `validation/query.ts`, `service.ts`, `openrouter.ts`. **High source confidence.** No extraction requested; similarity alone is not duplication. |
| **NON06-07 — discovery visibility question** | The names-only `availableRelations` list is capped, but local semantic matching searches *all* eligible profile metadata, not only displayed catalog entries | `withAiRelationCatalog` and `expandAiRelations`. **High source confidence; privacy/product semantics unverified.** Owner: decide whether local semantic search beyond names-only disclosure is intended; do not conflate same-profile match with cross-source metadata access. |

**Atlas handoff:** Reference NON06-01/02/03/05/07 as **nonvisual** security/correctness candidates; NON06-04 and NON06-06 as intentionally separated contracts. Do **not** fabricate screenshots or change the final Atlas here.

## G. CI and provenance

- **Source base:** `834f7b4befbc78467754bbcdffe619bb1d2c37de`.
- **Test commits:**
  - `7862be459288a3fb749e6882f24fb23a3050b382` — main validator/provider characterization.
  - `09ad49df4bb50ac9d18f4511d91787a9020ee861` — renderer budget/selection characterization.
  - `c3ec6f04b87ae3bac4ec343642756e3a09ed41e0` — renderer asynchronous ownership and expected-failure.
- **GitHub Actions on test HEAD `c3ec6f04…`:** CI run [38765367153](https://github.com/cubitouch/DataKoala/actions/runs/38765367153), Documentation site [38765367161](https://github.com/cubitouch/DataKoala/actions/runs/38765367161), Visual preview [38765367255](https://github.com/cubitouch/DataKoala/actions/runs/38765367255). These were **queued/in progress when this report was drafted**. The later report update must record actual conclusions and regressions.
- **Local commands executed:** none. In particular, **no linting or formatting was run**, per assignment. No local Electron runtime, model, DB or provider requests used.
- **Intended focused validation:** `node --experimental-strip-types --test src/main/ai/non06.discovery.test.ts` and `pnpm exec vitest run --config vitest.renderer.config.ts src/renderer/src/lib/ai/non06.*.test.ts`. Do not claim them executed unless CI/job output proves it.
- CI failures must be separated by path/step into baseline Quality/typecheck issues vs new NON-06 test failures.

## H. Completion and integration follow-up

**PARTIAL** pending actual scoped test/CI verification and unresolved stale-metadata boundary (NON06-01). S26 has an independent documented security evidence disposition; the integration agent should aggregate it without upgrading it to universal authenticated-provider acceptance.

Next for the integration owner: review the expected-failure and confirmed duplicate-selection cases; decide remediation work outside Phase 1C; review live profile/connection generation and provider-specific metadata access; then update S26 in the authoritative coverage register **from integration PR #406**, not from this isolated PR. No merge, further batch, Phase 2, central-register edit or final Atlas is authorized here.
