# NON-03 — Credential storage and provider authentication security

## A. Metadata

- Inventory: C04, C10, X02; parent #391; integration #406.
- Integration base: `2525623335f3aa6c4bd946d653135bba6b5fcda8`.
- Independent branch: `audit/391-non-03-credential-security`.
- Temporary draft PR: [#414](https://github.com/cubitouch/DataKoala/pull/414), targeting `audit/391-ux-convergence`, never main.
- Tested evidence commit: `1fdc3a604310622e7f99ef09ba7a6ed374c6b4ac`, introducing this report and both test files. This follow-up changes report metadata only; its final SHA is recorded in the PR/handoff (a commit cannot embed its own SHA).
- Environment: Linux container, Node 24.19.0, pnpm 11.25.0; frozen-lockfile installation with lifecycle scripts disabled. No Electron process, keychain, Google account, external authentication or real credentials used.
- Scope: characterization and audit only. Production, shared registers, manifests, fixtures and workflows unchanged. No local lint or formatting command executed, per assignment.

## B. Coverage dispositions

`BV` means executed deterministic behavior for the assertions identified here; it does not mean live authentication or OS-backed encryption was verified. `SO` is source review; `UV` is not exercised.

| ID | Behavioral evidence | Visual | Source/security ownership | Exact assertions and gaps |
| --- | --- | --- | --- | --- |
| C04 | BV scoped lifecycle/IPC and mocked platform policy; SO native encryption wiring; UV actual keychain | N/A | `ConnectionProfileStore`, `EncryptedSecretStore`, `createElectronEncryption`; PG adapter receives resolved password in main | `connections-store.test.ts`: “secure save, preserve, replace, remove, and delete never persist a password” asserts empty returned password, metadata exclusion, unchanged-secret edit, replacement and deletion; “legacy migration is verified, sanitized, and survives restart”; two `connection-profile-ipc.test.ts` tests assert no synthetic password in list/upsert/retry responses. Native keychain, filesystem permission failure and exhaustive IPC exposure remain UV. |
| C10 | BV scoped injected-client construction, failures and project distinction; SO SDK authentication delegation; UV real ADC/refresh | N/A | `BigQueryAdapter`, `BigQueryDiscoveryService`, Google SDK/ADC outside app secret store | `bigquery-adapter.test.ts`: “constructs an ADC client with only the billing project”, “uses the effective data project and always exposes every visible dataset”, “returns actionable provider errors”, “BigQuery query failures distinguish SQL errors from auth and permission failures”; new missing/revoked discovery and provider-message characterization below. No actual revoked/expired token, billing permission, gcloud installation or cache refresh tested. |
| X02 | BV scoped settings, migration/race, corrupt legacy refusal and sanitized backend errors; SO main-only key retrieval; UV OS encryption | N/A | `AiSettingsStore`, `AiService`, `OpenRouterProvider`, shared encrypted store | `ai.test.ts`: settings/blank-key/removal; migration/restart; in-flight replacement wins; existing shared key wins; failed migration retains legacy; unavailable encryption retains legacy. New corrupt-legacy test rejects key retrieval and allows explicit removal. Existing HTTP tests normalize 401/403/429/400/404/500 without provider content. Multi-process concurrency and all packaged preload paths UV. |

## C. Credential lifecycle matrix

| Lifecycle | C04 PostgreSQL | C10 BigQuery | X02 AI/OpenRouter |
| --- | --- | --- | --- |
| Entry | Password draft/pasted connection string legitimately exists in renderer; typed profile crosses preload to main Test/Save | External ADC setup; UI accepts billing/data project, dataset and location, not token | API key draft legitimately exists in renderer; settings validation bounds/trims key in main |
| Storage | `connections.json` excludes PG password/state; `secrets.json` owner `datasource`, id profile ID | ADC owned/discovered by Google libraries/environment; normal profile contains project metadata, not ADC tokens | `secrets.json` owner `ai`, id `openrouter-api-key`; `ai-settings.json` stores provider/model only |
| Retrieval | `resolveForConnection` resolves saved secret for Test/Connect/Reconnect in main; explicit transient password takes priority | SDK resolves ADC internally; discovery uses scoped GoogleAuth; app does not retrieve tokens itself | `getApiKey` used by main service/provider; renderer summary only provider/model/hasApiKey |
| Unchanged edit | Empty password with existing presence preserves secret; explicit `hasPassword=false` removes | Project edit does not change authentication identity | Blank/omitted key preserves existing key; model change separate |
| Replacement | Nonempty supplied password is stored/read-verified, then metadata persisted | Replace/revoke ADC externally; no in-app token replacement operation | Nonempty key stored then legacy file removed; saves serialized |
| Deletion | Clear saved password or remove profile; profile removal persists metadata then deletes secret | Removing app profile does not revoke/delete external ADC (intentional) | Explicit Remove deletes shared and legacy key, preserves model |
| Migration | Supported legacy PG profile/password migrated and read-verified; secure credential wins crash recovery; failed migration retains pre-existing plaintext on disk and main memory with legacy state | No app credential migration; billing-cap profile migration is metadata only | Encrypted `ai-secrets.json` migrated once; verify shared value before deleting old copy; existing readable shared key authoritative |
| Failure | New secret save refuses unavailable encryption; no new plaintext fallback. Legacy preservation is an explicit historical exception, not evidence of newly persisted plaintext | Actionable auth/permission errors; no in-app login/refresh mechanism. Provider text remains in errors (NON03-01) | Shared/legacy failures rejected; generic service fallback for unknown exceptions; malformed legacy file remains until explicit removal/replacement |

## D. Trust-boundary analysis

- Renderer is allowed to hold newly entered PG passwords/API keys and sends them through named preload methods. Masked input is presentation, not a security boundary. Saved PG list/upsert/retry responses contain empty password and presence/state; AI settings responses contain no key. There is no preload method for `getApiKey`, `SecretStore.get`, or resolved PG profiles.
- `src/main/connection-profile-ipc.ts` delegates list/upsert/retry to the store. `src/main/index.ts` resolves credentials for Test/Connect/Reconnect and removes profiles; BigQuery discovery handlers return discovery results. These handlers trust the app renderer's typed profile for several operations; TypeScript/preload typing is not runtime validation. This audit does not establish protection against a compromised renderer or arbitrary extra profile fields.
- Main owns plaintext during decryption and provider construction. `src/main/secrets/electron-encryption.ts` delegates to Electron async safeStorage. `src/main/secrets/store.ts` owns ciphertext serialization, validation, atomic writes, owner/id separation and in-process per-path queues. Base64 is an encoding of ciphertext, not encryption.
- Google SDK owns external identity, token acquisition and refresh. `BigQueryAdapter.client` supplies only billing `projectId`; requests select effective data project separately. Discovery's `GoogleAuth` asks for the BigQuery scope. No code here shells out to gcloud or installs/refreshes its configuration; README instructs external `gcloud auth application-default login`.
- Workspace `serializedSession`/`serializeWorkspaceDraft` in `src/renderer/src/lib/workspaceFormat.ts` serialize explicit session fields/profile references rather than full profile objects. This is source evidence, not proof that user SQL/prompts contain no sensitive literals. Such literals may persist as query drafts by design.
- `AiService` validates requests before settings/key/provider use; OpenRouter validates responses and normalizes HTTP errors. Existing AI IPC integration exercises owner isolation and transport/validation, not actual packaged contextBridge serialization.
- No secret logging was found in the reviewed shared store/settings code. This is not a global absence claim: PG unexpected-disconnect diagnostics explicitly log provider message text and emit it as `technicalDetail` (`src/main/adapters/postgres.ts`, `reasonOf`/`handleUnexpectedDisconnect`). See NON03-04.

## E. Platform and failure cases

- `non03-electron-encryption.vitest.ts` mocks Electron and platform: Linux `basic_text`/`unknown` are refused even if availability would be true; `gnome_libsecret` additionally requires async encryption availability. macOS/Windows depend on availability without consulting Linux backend selection. No OS keyring/keychain/DPAPI was actually exercised.
- `store.test.ts` executes refusal/no-file creation, round trip, POSIX file mode 0600, replacement/restart, unrelated-secret preservation, concurrent instances in one process, re-encryption and malformed-target/root refusal without overwriting corrupt data. Its fake cipher stores reversible JSON bytes. “No literal secret substring in serialized file” proves encoding/serialization behavior only, not cryptographic confidentiality.
- New `NON03 backend failures redact synthetic sensitive exception text and preserve ciphertext` injects availability/encrypt/decrypt exceptions, verifies returned error text excludes the marker, and verifies exact persisted bytes remain unchanged.
- New `NON03 corrupted AI legacy data is retained, cannot become a key, and can be explicitly removed` asserts `hasApiKey=true` for file presence despite corruption; retrieval rejects `invalid-persistence`, original bytes remain, explicit Remove clears it. Presence is not usability.
- New missing/revoked ADC test injects project/client acquisition rejection; both discovery operations reject with the same error before a dataset client is constructed. This establishes delegation and rejection, not Google refresh behavior.
- Ordinary SDK-managed token caching/refresh, credential source precedence, keychain lock/unlock, backend changes after startup, multi-process writers, filesystem failures and real provider permission responses remain UV. Per-path queue keys use the supplied directory path; no cross-process lock is claimed.

## F. Findings and Atlas candidates

### NON03-01 — BigQuery provider error text is exposed without redaction

- IDs: C10. Classification: confirmed error-boundary gap, conditional sensitive-data exposure; high confidence for wrapper behavior, medium impact pending realistic provider-message review.
- `src/main/adapters/bigquery-adapter.ts`, `friendlyError` (109–130), `test` (476–486), `classifyBigQueryQueryError` (189–193): guidance is prefixed to the complete upstream message. Discovery also propagates upstream exceptions unchanged (`src/main/bigquery-discovery.ts`).
- New test “NON03 characterization: BigQuery authentication errors retain synthetic provider message text” asserts a synthetic token marker remains in the adapter's returned authentication error. No real token or actual SDK disclosure is asserted; Electron serialization and UI display of that marker were not exercised.
- Future direction: define a safe diagnostic/error policy for provider messages, characterize realistic ADC failures and redact before renderer/log boundaries. Do not remove actionable project/permission guidance indiscriminately. This characterization deliberately asserts current behavior; it must change alongside future remediation rather than enshrine exposure as a desired contract.

### NON03-02 — Shared secret mechanism is already converged

- IDs: C04, X02. Classification: ALREADY_CONVERGED; high source/deterministic confidence, medium architectural importance.
- Shared `EncryptedSecretStore` + `createElectronEncryption`; namespaces keep AI and datasource records separate. Executed store lifecycle/concurrent-writes tests plus new redacted-backend-failure test support the contract.
- AI and PG migrations remain separate because AI legacy data is encrypted, PG historical data can be plaintext, and profile presence/state differs. Small duplicate base64 validation in AI legacy decoding is aligned with a historical format, not sufficient reason for a generic credential framework.
- Future direction: preserve common encryption/atomic persistence and provider-specific lifecycle adapters; verify native OS behavior separately. Atlas should cross-reference nonvisual evidence, no invented screenshots.

### NON03-03 — External ADC authentication is intentionally separate

- ID: C10. Classification: INTENTIONAL_DIFFERENCE; high source/mocked-client confidence.
- `BigQueryAdapter.client`, `BigQueryDiscoveryService`, constructor-options/project tests establish external identity and separate billing/data project selection. No Google token managed by the normal app profile flow.
- Project access failure does not imply expired credentials; identity must not be inferred from selected billing project. SDK caching/refresh is not independently verified. Keep ADC outside shared password storage; no universal credential abstraction proposed.

### NON03-04 — PG diagnostics preserve upstream message text

- ID: C04. Classification: source-reviewed diagnostic exposure lead; SO, medium confidence on practical sensitivity, not a demonstrated credential leak.
- `src/main/adapters/postgres.ts` `reasonOf`/`handleUnexpectedDisconnect` logs raw message and emits message/technicalDetail. It does not log the profile/password object at this site, but there is no message redaction there.
- Future direction: deterministic synthetic disconnect test through existing lifecycle harness and diagnostic policy review, coordinated with NON-01 owner. No shared harness edited. Do not infer that a real PostgreSQL error includes a password; that is unverified.

### NON03-05 — Credential presence is distinct from credential usability

- IDs: C04, X02. Classification: source/test-established contract with verification gap; high confidence.
- `EncryptedSecretStore.has` checks record shape/base64 without decrypting. AI summary also treats existing legacy file as presence even when corrupt. PG migration/presence states do not establish current native decryption availability.
- Existing “secure credential presence survives unavailable decryption and metadata save”, new corrupt-legacy test, and unavailable-legacy AI test distinguish these contracts. Future native failure/recovery acceptance should verify actionable feedback without declaring stored credentials usable based on presence alone.

## G. CI and provenance

Executed against the integration base plus only the two new test files:

```sh
node --experimental-strip-types --test src/main/secrets/store.test.ts src/main/connections-store.test.ts src/main/connection-profile-ipc.test.ts src/main/ai/ai.test.ts src/main/bigquery-discovery.test.ts src/main/adapters/bigquery-adapter.test.ts src/main/non03-credential-security.test.ts
pnpm exec vitest run --config vitest.renderer.config.ts src/main/adapters/non03-electron-encryption.vitest.ts src/main/ai/ipc.vitest.ts
pnpm typecheck
```

- Node: **104 passed, 0 failed, 0 skipped** (includes four new characterization tests).
- Vitest: **23 passed, 2 files** (two new platform-policy tests plus 21 existing actual AI IPC/service/provider-boundary tests).
- Typecheck: node/web stages passed; test stage fails at inherited `src/renderer/src/components/query/PresetManagerAction.test.tsx:490`, TS2352, PG fixture cast to Prometheus without transport. The exact offending code exists at the base SHA and was not modified. No security-test failure is implied; no fix made outside file ownership.
- Expected Node module-type warnings are nonfatal. No local lint/format, full suite, native Electron run or screenshots claimed.
- At tested commit `1fdc3a604310622e7f99ef09ba7a6ed374c6b4ac`, [CI 38759956034](https://github.com/cubitouch/DataKoala/actions/runs/38759956034): Unit tests, UI tests, Production build and DuckDB macOS runtime/package succeeded. Quality failed Check formatting: inherited coverage register plus all three NON-03-owned files. Subsequent lint/typecheck steps skipped. This is not a security-test failure; formatting left to owner as instructed.
- [Documentation 38759956003](https://github.com/cubitouch/DataKoala/actions/runs/38759956003) succeeded. Visual preview 38759956045 was still running at report update; no new screenshot evidence is required or accepted for NON-03. Report-only follow-up CI is distinct from these tested-commit results.

## H. Completion disposition

**EVIDENCE_COMPLETE — scoped nonvisual audit.** C04/C10/X02 have executed deterministic evidence plus explicitly bounded source/platform/provider gaps. This is not release security certification or OS/live-provider acceptance.

Integration owner: reconcile the three coverage rows as BV scoped / visual N/A, cross-reference NON03-01–05 in the future Atlas, review BigQuery error redaction and coordinate PG diagnostic verification with NON-01. Preserve OS/ADC/refresh gaps and inherited typecheck failure. No shared register edit, production remediation, merge, other batch or Phase 2 performed.
