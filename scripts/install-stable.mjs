import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const releaseUrl =
  'https://api.github.com/repos/cubitouch/DataKoala/releases/latest'
const upstream = 'https://github.com/cubitouch/DataKoala.git'
const stableTagPattern = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/

export function publishedStableTag(release) {
  if (
    !release ||
    typeof release !== 'object' ||
    release.draft !== false ||
    release.prerelease !== false ||
    typeof release.tag_name !== 'string' ||
    !stableTagPattern.test(release.tag_name)
  ) {
    throw new Error('GitHub did not return an approved stable version tag.')
  }
  return release.tag_name
}

export function assertCleanWorktree(status) {
  if (status.trim()) {
    throw new Error(
      'Your working tree has local changes or untracked files. Commit, stash, or remove them before changing versions. Nothing was changed.',
    )
  }
}

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    stdio: 'inherit',
    ...options,
  })
}

async function latestApprovedTag() {
  let response
  try {
    response = await fetch(releaseUrl, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'DataKoala-stable-install',
      },
      signal: AbortSignal.timeout(12000),
    })
  } catch (error) {
    throw new Error(
      `Cannot reach GitHub to verify the latest approved release: ${error.message}`,
    )
  }
  if (response.status === 404) {
    throw new Error(
      'No stable DataKoala release has been published yet. Continue with pnpm install --frozen-lockfile for development.',
    )
  }
  if (!response.ok) {
    throw new Error(
      `Cannot verify the latest stable release (GitHub HTTP ${response.status}); repository unchanged.`,
    )
  }
  return publishedStableTag(await response.json())
}

export async function installStable() {
  const rootPath = run('git', ['rev-parse', '--show-toplevel'], {
    stdio: ['ignore', 'pipe', 'inherit'],
  }).trim()
  if (resolve(rootPath) !== root) {
    throw new Error('Run this command from the DataKoala repository checkout.')
  }

  const status = run(
    'git',
    ['status', '--porcelain', '--untracked-files=normal'],
    { stdio: ['ignore', 'pipe', 'inherit'] },
  )
  assertCleanWorktree(status)

  const tag = await latestApprovedTag()
  console.log(`\nDataKoala: approved source release ${tag}\n`)
  console.log(
    'Fetching the approved tag from the official DataKoala repository...',
  )
  // Fetch a specific tag only, without switching branches, pulling main or
  // overwriting another local tag. Git rejects conflicting local tag refs.
  run('git', [
    'fetch',
    '--no-tags',
    upstream,
    `refs/tags/${tag}:refs/tags/${tag}`,
  ])
  run('git', ['switch', '--detach', tag])

  const packageVersion = JSON.parse(
    readFileSync(resolve(root, 'package.json'), 'utf8'),
  ).version
  if (`v${packageVersion}` !== tag) {
    throw new Error(
      `Tagged source has package version ${packageVersion}, expected ${tag}. Dependencies were not installed.`,
    )
  }

  const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
  console.log('\nInstalling dependencies for this exact release...')
  run(pnpm, ['install', '--frozen-lockfile'])
  console.log('\nInstalling/repairing the Electron runtime...')
  // The README's workaround for skipped Electron postinstall scripts.
  run(pnpm, ['exec', 'install-electron', '--no'])
  const electronBinary = createRequire(resolve(root, 'package.json'))(
    'electron',
  )
  if (typeof electronBinary !== 'string' || !existsSync(electronBinary)) {
    throw new Error(
      'Electron binary is still unavailable after reinstall. See README troubleshooting.',
    )
  }
  console.log(`\nDataKoala ${tag} is ready. Run: pnpm dev`)
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  installStable().catch((error) => {
    console.error(`\nStable installation failed: ${error.message}`)
    process.exitCode = 1
  })
}
