import type { WorkspaceDraft } from './workspaceFormat.ts'
import {
  workspaceRestorePatch,
  type WorkspaceRestorePatch,
} from './workspaceRestoration.ts'
import {
  browserStorage,
  readWorkspaceDraft,
  type WorkspaceStorage,
} from './workspaceStorage.ts'

export {
  parseWorkspaceDraft,
  serializeWorkspaceDraft,
  workspaceDraftFromState,
  type QuerySessionDraft,
  type WorkspaceDraft,
  type WorkspacePersistableState,
} from './workspaceFormat.ts'
export {
  WORKSPACE_STORAGE_KEY,
  LEGACY_WORKSPACE_STORAGE_KEY,
  readWorkspaceDraft,
  startWorkspacePersistence,
  type WorkspaceStorage,
} from './workspaceStorage.ts'
export type { WorkspaceRestorePatch } from './workspaceRestoration.ts'

/** Read, allocate cold sessions, then apply one patch through the existing caller. */
export function restoreWorkspaceDraft(
  setState: (patch: WorkspaceRestorePatch) => void,
  storage: WorkspaceStorage | null = browserStorage(),
): WorkspaceDraft | null {
  const draft = readWorkspaceDraft(storage)
  if (!draft) return null
  setState(workspaceRestorePatch(draft))
  return draft
}
