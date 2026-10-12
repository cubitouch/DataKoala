# Stable source releases

DataKoala is developed continuously on `main`, but merges do not create public releases. For now, a stable release is a manually approved source snapshot run with `pnpm dev`. No macOS installer, Apple Developer certificate, signing, or automatic updater is required.

## Version states

- **Development:** `main` continues moving as you merge refactoring and features.
- **Candidate:** a specific commit on `main` selected for manual testing, identified by a commit SHA. No candidate tag is necessary.
- **Approved stable:** an immutable `vX.Y.Z` Git tag and its **published GitHub Release**. The tag references the exact tested commit. GitHub supplies source archives automatically.
- **Draft:** a GitHub Release not yet approved for public use. A Git tag alone is publicly visible but does not imply approval.

## Cutting a release

1. Continue merging work into `main` without doing full release-level manual testing on each PR.
2. When ready to freeze a batch, test a chosen commit in dev mode using your real datasources and the relevant regressions.
3. Ensure `package.json` matches the intended release tag, merge the version bump and wait for CI. The initial `0.2.0` version bump is included with this release-management PR; future releases should bump the package version in a small PR. **Test the exact commit you intend to tag**, including the version change. Never tag newer untested changes.
4. Create and push an annotated tag on the verified commit. Never move or reuse a published tag.
5. Check the **Source release tag** GitHub Actions run. It verifies that `vX.Y.Z` matches `package.json` and points to a commit in `main`. It does not install dependencies or package the app.
6. Create a **draft GitHub Release** for that existing tag. Add release notes, known limitations, relevant manual test results, and compatibility warnings. Do not attach macOS installers.
7. **Publish the draft manually** only when you approve it. Publication makes the tag eligible for the `pnpm install:stable` command.

Example tag commands (replace the version and tested SHA):

```bash
git fetch origin main --tags
git tag -a v0.2.0 TESTED_COMMIT_SHA -m "DataKoala v0.2.0"
git push origin v0.2.0
```

Example draft release command (or use **GitHub → Releases → Draft a new release**):

```bash
gh release create v0.2.0 --draft --verify-tag --title "DataKoala v0.2.0" --generate-notes
```

**Important:** Wait for the tag validation check before publishing. If you discover a problem, fix and retest a new commit. Prefer a new patch version rather than moving a tag users may have fetched.

## First approved source release: v0.2.0

After merging this PR, **do not publish immediately**: first check CI and manually test the exact commit you intend to release. The repository already contains a `v0.1.0` tag and an unpublished draft; leave both unchanged.

Use the **tested commit SHA** (not simply the moving tip of `main`) to create the first approved tag:

```bash
git fetch origin main --tags
git switch --detach TESTED_COMMIT_SHA
node -p "require('./package.json').version"  # must print 0.2.0
git tag -a v0.2.0 TESTED_COMMIT_SHA -m "DataKoala v0.2.0"
git push origin v0.2.0
```

Check the **Source release tag** workflow for success. Then create a draft Release for the existing tag:

```bash
gh release create v0.2.0 --draft --verify-tag --title "DataKoala v0.2.0" --generate-notes
```

Review the source-only release notes and manually **Publish release** in GitHub's Releases UI. Do not attach installers or choose `main` as a replacement for the existing tag.

Verify the GitHub API returns the published tag:

```bash
curl -fsSL https://api.github.com/repos/cubitouch/DataKoala/releases/latest | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>console.log(JSON.parse(s).tag_name))"
```

It must print `v0.2.0`. In a **new clean clone**, run the public `pnpm install:stable` command and launch `pnpm dev`. It should show the approved version, install dependencies, repair the Electron binary and leave Git detached at the release tag. There is no automatic update afterward.

## Installing and upgrading the latest stable source version

Visitors need Git, Node 24, and pnpm. The [README setup guide](../README.md#getting-started) explains how to install pnpm with npm if it is missing; Corepack is not required. Run the same commands on the public site and in the README:

```bash
git clone https://github.com/cubitouch/DataKoala.git
cd DataKoala
pnpm install:stable
pnpm dev
```

`pnpm install:stable` is intentionally an **explicit upgrade operation**, not an auto-updater. It resolves GitHub's latest **published, non-prerelease Release**, validates the tag, fetches the tag directly from the official DataKoala repository, and checks it out in detached HEAD state. It refuses to switch if there are local modifications or untracked files. After checkout it runs `pnpm install --frozen-lockfile` and `pnpm exec install-electron --no` to ensure the Electron runtime exists, even when dependency postinstall scripts have been skipped.

If GitHub is unavailable, there is no published release, or the returned tag is malformed, the command fails instead of falling back to an untested commit on `main`. On installation failure, the chosen tag may already be checked out; fix the dependency/connection problem and run the command again. A version's dependencies remain governed by its lockfile.

Running `pnpm dev` never changes the checked-out version. To upgrade later, intentionally run `pnpm install:stable` again. To stay on the version you already have, do nothing. Users can manually pin an older published tag if desired:

```bash
git fetch --tags
git switch --detach v0.2.0  # choose a published version
pnpm install --frozen-lockfile
pnpm exec install-electron --no
pnpm dev
```

Use a separate branch for local development; `git pull` is not appropriate from a pinned detached HEAD. Back up settings before downgrading if persistence schemas have changed.

## Website and SEO

The public site displays static, copyable commands including `pnpm install:stable`; it **does not need to know or hard-code the latest version**. The installer resolves the approved tag at execution time. This prevents documentation changes or Pages deployments from being necessary on every release.

The SEO/crawlability migration (#379) is already merged. The authoritative static HTML is `docs-site/index.html`; the installer snippet is changed there, without rebuilding a second template in `main.ts` or adding a live browser lookup for GitHub Releases.

The rest of the site currently describes the evolving `main` branch, so a released source version may not yet support every feature shown. The README and release notes tied to the tag are authoritative for historical versions.

## Versioning and future packaging

Use `vMAJOR.MINOR.PATCH`. PATCH releases fix bugs, MINOR releases add compatible features, and MAJOR releases describe breaking changes, following Semantic Versioning as appropriate before 1.0. Document migration or compatibility concerns whenever local persisted data may change.

The existing `v0.1.0` GitHub Release is still a **draft**, not a published source release; it remains untouched. The previous macOS workflow has been retained as **Manual macOS packaging (optional)**, triggered only through `workflow_dispatch`. Pushing a source tag does not build macOS installers, publish a release, or require an Apple Developer account.
