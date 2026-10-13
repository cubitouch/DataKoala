import {
  parseWorkspaceDraft,
  serializeWorkspaceDraft,
  type WorkspaceDraft,
  type WorkspacePersistableState,
} from './workspaceFormat.ts'
import { migrateWorkspaceV1 } from './workspaceMigrations.ts'

export const WORKSPACE_STORAGE_KEY = 'datakoala.workspace.v2'
const LEGACY_DATAKOALA_WORKSPACE_STORAGE_KEY = 'datakoala.workspace.v2'
export const LEGACY_WORKSPACE_STORAGE_KEY = 'datakoala.workspace.v1'
const SAVE_DELAY_MS = 150

export interface WorkspaceStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

interface WorkspaceEventTarget {
  addEventListener(
    type: 'beforeunload' | 'pagehide',
    listener: () => void,
  ): void
  removeEventListener(
    type: 'beforeunload' | 'pagehide',
    listener: () => void,
  ): void
}

interface StartWorkspacePersistenceOptions {
  storage?: WorkspaceStorage | null
  target?: WorkspaceEventTarget | null
  delayMs?: number
}

export function browserStorage(): WorkspaceStorage | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage
  } catch {
    return null
  }
}
function browserEventTarget(): WorkspaceEventTarget | null {
  if (typeof window === 'undefined') return null
  return {
    addEventListener: (type, listener) =>
      window.addEventListener(type, listener),
    removeEventListener: (type, listener) =>
      window.removeEventListener(type, listener),
  }
}
function safeRead(
  storage: WorkspaceStorage | null,
  key: string,
): string | null {
  if (!storage) return null
  try {
    return storage.getItem(key)
  } catch {
    return null
  }
}

export function readWorkspaceDraft(
  storage: WorkspaceStorage | null = browserStorage(),
): WorkspaceDraft | null {
  return (
    parseWorkspaceDraft(safeRead(storage, WORKSPACE_STORAGE_KEY)) ??
    parseWorkspaceDraft(
      safeRead(storage, LEGACY_DATAKOALA_WORKSPACE_STORAGE_KEY),
    ) ??
    parseWorkspaceDraft(
      migrateWorkspaceV1(safeRead(storage, LEGACY_WORKSPACE_STORAGE_KEY)),
    )
  )
}

export function startWorkspacePersistence(
  getState: () => WorkspacePersistableState,
  subscribe: (
    listener: (state: WorkspacePersistableState) => void,
  ) => () => void,
  options: StartWorkspacePersistenceOptions = {},
): () => void {
  const storage =
    options.storage === undefined ? browserStorage() : options.storage
  if (!storage) return () => undefined
  const target =
    options.target === undefined ? browserEventTarget() : options.target
  const delayMs = options.delayMs ?? SAVE_DELAY_MS
  let lastSerialized = safeRead(storage, WORKSPACE_STORAGE_KEY)
  let timer: ReturnType<typeof setTimeout> | null = null

  const write = () => {
    timer = null
    const serialized = serializeWorkspaceDraft(getState())
    if (serialized === lastSerialized) return
    try {
      storage.setItem(WORKSPACE_STORAGE_KEY, serialized)
      lastSerialized = serialized
    } catch {
      // Local persistence is best-effort. A quota/storage failure must never block editing or query execution.
    }
  }
  const flush = () => {
    if (timer !== null) clearTimeout(timer)
    timer = null
    write()
  }
  const schedule = () => {
    if (timer !== null) clearTimeout(timer)
    timer = setTimeout(write, Math.max(0, delayMs))
  }

  const unsubscribe = subscribe(schedule)
  target?.addEventListener('beforeunload', flush)
  target?.addEventListener('pagehide', flush)
  return () => {
    flush()
    unsubscribe()
    target?.removeEventListener('beforeunload', flush)
    target?.removeEventListener('pagehide', flush)
  }
}
