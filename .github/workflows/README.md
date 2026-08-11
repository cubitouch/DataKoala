# GitHub Actions workflows

`ci.yml` is the fast pull-request gate. It runs independent Ubuntu jobs for:

- TypeScript typechecking and whitespace validation
- Node unit tests
- Renderer UI/component tests
- Production application build
- DuckDB native-addon runtime checks in both development dependencies and an
  unpacked macOS application bundle

Renderer UI tests are discovered automatically through `vitest.ui.config.ts` rather than being listed in `package.json`.

Use the `*.ui.test.ts` or `*.ui.test.tsx` suffix for Vitest tests that need the renderer/jsdom environment. Existing renderer `*.test.tsx` files remain supported while they are migrated gradually. Native Node tests keep the `*.test.ts` suffix, and database-backed tests use `*.e2e.test.ts`.

The jobs intentionally use one supported Node and pnpm version to keep pull-request feedback fast. Electron smoke tests, PostgreSQL integration tests, and cross-platform packaging belong in separate follow-up workflows.
