# Agent guidance

## Validation

Keep repository checks green for every source change.

- Run `pnpm lint` before considering TypeScript, React, or CSS changes complete.
- Run `pnpm format` to verify Prettier formatting.
- Use `pnpm lint:fix` and `pnpm format:fix` for safe mechanical fixes, then review the resulting diff.
- Do not disable lint rules, add broad ignores, or add suppressions just to make checks pass. If an exception is genuinely required, keep it narrow and document why.
- Run `pnpm verify` for final validation when the local environment supports the required smoke tests, and require CI to be green before merge.

During development, run the smallest relevant tests for fast feedback, but do not treat focused tests as a replacement for the repository-level checks above.

## Code duplication

- Run `pnpm check:duplication` for the console summary, or `pnpm report:duplication` to write console, JSON, and HTML reports under `reports/duplication/`.
- Treat jscpd findings as advisory. The initial report is a baseline for review, not a merge gate; duplication percentage alone does not measure code quality.
- Before adding a helper or component, compare the new implementation with existing code and consider whether shared behavior really has the same responsibility and semantics.
- Consider extracting code when duplicated business rules or maintenance-sensitive behavior must stay consistent. Keep datasource implementations separate when their semantics differ, and leave small harmless repetitions alone.
- Do not create generic abstractions only to reduce the duplication percentage, and do not require unrelated changes to eliminate existing findings.
