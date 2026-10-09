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

## Trust boundaries and fork pull requests

All workflows use least-privilege `GITHUB_TOKEN` permissions. Untrusted pull
request code may be installed, built, or tested **only with read-only token
permissions and without repository secrets**. We use `pull_request`, not
`pull_request_target`, to validate forked changes.

| Workflow             | PR from fork                                                          | Write access                                                                                 |
| -------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `ci.yml`             | Quality, tests, and build after required GitHub approval              | None                                                                                         |
| `pages.yml`          | Build docs + downloadable artifact after required GitHub approval     | Only `deploy` on a push to `main` (`pages: write`, `id-token: write`)                        |
| `visual-preview.yml` | Capture images + downloadable artifact after required GitHub approval | Only `publish`, and only for same-repository PRs (`contents: write`, `pull-requests: write`) |
| `release-macos.yml`  | Not triggered by PRs; runs on pushed `v*.*.*` tags                    | Only `publish-draft-release` (`contents: write`)                                             |

The visual-preview `capture` job no longer skips fork PRs. For fork PRs,
`publish` deliberately skips: it does **not** push to `visual-previews` or
post PR comments. Review the image artifact in Actions instead. Existing
same-repository PR preview publishing/comment behavior is unchanged.

PR checkouts and release-build checkout disable persisted git credentials.
The separate preview publisher checks out only the trusted `visual-previews`
branch and needs git credentials to publish.

### Required owner configuration — not enforceable in workflow YAML

For this **public** repository, open **Settings → Actions → General →
Approval for running fork pull request workflows from contributors**, select
**Require approval for all external contributors**, and save. This is
**stronger than** the default first-time-contributor policy: external
contributors still need approval after an earlier PR was merged. See
[GitHub's documentation](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/managing-github-actions-settings-for-a-repository).

When an external fork opens or updates a PR, review **Files changed**,
especially workflow files, install scripts, dependencies, and build/test
scripts, then use **Approve workflows to run** if safe. Approval allows
*untrusted code* to execute in a read-only, no-secrets CI context; it is not
an endorsement of the changes or permission to merge. See
[GitHub's approval guidance](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/approve-runs-from-forks).

GitHub allows **any maintainer with write access** to approve these runs;
it cannot guarantee the repository owner is the *only* approver if others
have write access. Keep write permissions restricted accordingly.

Also consider setting **Settings → Actions → General → Workflow permissions**
to the read-only default. It is defense in depth, not a replacement for
job-level permissions. Publishing jobs above explicitly request the
permissions they require.

### Guardrails

- Do not use `pull_request_target` to build, install, run, or otherwise
  execute code from a fork with write tokens or secrets.
- Do not grant write permissions or secrets to PR build/test/capture jobs.
- Keep publication/deployment in distinct, narrowly privileged jobs guarded
  by trusted source/event conditions.
- Do not automatically publish externally provided artifacts from privileged
  workflows; treat all fork PR output as untrusted.
- Approval of an Actions run and approval/merging of code are separate
  decisions. Tag-triggered releases and `main` deployments remain subject
  to GitHub branch/tag protections and environment rules configured outside
  workflow YAML.
