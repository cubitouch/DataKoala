# Code duplication analysis

DataKoala uses [jscpd](https://jscpd.dev/) to surface substantial repeated TypeScript code for engineering review. The scan is limited to production TypeScript and TSX under `src/`; tests, fixtures, generated files, declarations, build output, and screenshots are excluded. See the root `.jscpd.json` for the complete, reproducible scope and settings.

The tool is installed as `jscpd` 5.4.0, which ran successfully under the repository's Node.js 24 environment. The configuration uses the documented `typescript` (`.ts`) and `tsx` (`.tsx`) formats, mild mode, exact clone kind, and both minimums (`minLines: 10`, `minTokens: 70`). Mild mode drops whitespace tokens, but identifiers, literals, and comments remain significant; this captures formatting-only differences without treating renamed implementations as duplicates. Console, JSON, and HTML are supported reporters in this installed version.

## Baseline

Baseline recorded from `main` at `dfbfdbdfb7a0e9d4173525145d4f0333f43f662d` using the final configuration in this PR:

| Measure             | Result |
| ------------------- | -----: |
| Files analyzed      |    265 |
| Duplicated blocks   |     43 |
| Duplicated lines    |    815 |
| Overall duplication |  1.49% |

By format, the analyzer covered 166 `.ts` files (17 blocks, 336 duplicated lines, 1.07%) and 99 `.tsx` files (26 blocks, 479 duplicated lines, 2.04%). The most frequently represented files in clone pairs are `Combobox.tsx` and `MultiCombobox.tsx` (eight matches each), `gcx-tempo-progressive-transport.ts` and `gcx-tempo-sampling-transport.ts` (five each), and `AiBuilderCopilot.tsx` / `AiQueryCopilot.tsx` (four each). These counts are appearances in matched pairs, not unique blocks.

### High-signal examples

- `gcx-command.ts` and `gcx-tempo-transport.ts` share a 25-line gcx error-normalization block. This is a useful consistency check when gcx authentication and permission errors change.
- `workspacePersistence.ts` and `useStore.ts` share a 25-line query-session defaults shape used in legacy workspace migration and new session creation. Keeping those defaults aligned can prevent newly added session state from disappearing during migration or restore.
- `tabConnection.ts` and `useStore.ts` share a 22-line connection-state update. The overlap may be worth revisiting when profile-scoped connection behavior changes, while preserving the store's lifecycle semantics.
- `ChartLegend.tsx` and `ResizableDetailPanel.tsx` share a 32-line resize interaction. This may be useful to revisit if pointer, keyboard, or bounds behavior changes in either UI.
- `Combobox.tsx` and `MultiCombobox.tsx` share eight blocks, including keyboard and option-list behavior. Their single- and multi-selection semantics still need to remain clear if common behavior is changed.
- Progressive and sampled Tempo transports contain several repeated blocks (including range and response handling). They are related implementations, but their retrieval strategies and limits differ; the report is a prompt to compare behavior, not a request to force one abstraction.

### Intentional or low-priority matches

- `shared/log-patterns.ts` has a 23-line matching pair between trailing structured-constructor and trailing structured-object parsing. The scanning loops are intentionally similar, but the closing delimiters and accepted structures differ.
- Builder and raw-SQL AI copilot components and hooks repeat lifecycle and proposal-handling code. They operate on different query context and should only be shared if that reduces maintenance without hiding those differences.
- Local-file and SQLite adapters share part of their result finalization and connection cleanup, while the adapters still have datasource-specific setup and behavior.
- Connection dialogs repeat field, validation, and status UI across datasources. Those controls often have distinct schema, authentication, and validation semantics, so similar forms are not automatically a shared abstraction.

The initial calibration run also matched a `testUtils.ts` helper and `.vitest.ts` files; those are now explicitly excluded as test support. Generated declarations, fixtures, build output, and screenshots are outside the intended scope as well.

## Reading the report

- Repeated business logic that encodes one rule in multiple places may warrant extraction when the callers share the same responsibility and changes should stay synchronized.
- Datasource adapters and query builders may look similar while encoding different protocols, error handling, or user-visible semantics. Similar structure alone is not a reason to unify them.
- Small repeated code is often clearer in place than behind a helper.
- Tests, fixtures, generated code, and declarations are excluded because their repetition is expected and can obscure production findings.

## Reproduce

```sh
pnpm check:duplication
pnpm report:duplication
```

The first command prints the configured console summary. The second additionally writes JSON and HTML reports under `reports/duplication/`, a gitignored directory. CI runs the report command on pull requests and uploads the reports as a workflow artifact. The `threshold` is intentionally set to 100%, so existing findings do not fail CI; a genuine configuration or analyzer execution error still fails the command.

Reports are advisory. Any future enforcement should be considered only after reviewing the signal-to-noise ratio and agreeing on a narrow policy, such as tracking new duplicated blocks separately from the existing baseline.
