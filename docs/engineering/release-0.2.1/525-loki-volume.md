# Retain Loki optional volume — #525

Base: `673650015b828d6c0b44a163f1672f348010eb66`.

Confirmed causes: rolling-range cache identity was rebuilt with the current clock and component-local state was lost on tab remount. Store only runtime volume/result/error/pending ownership on the query session. Identity includes tab/profile/generation/query-context/primary-operation/expression/range/grouping; resolve rolling bounds once. Loaded/pending returns reuse the owned result/request, including completion while inactive. Explicit Run retires it; stale token/generation/primary failure cannot publish over newer work. Closing/resetting a tab releases its state. Explicit workspace serialization omits the runtime field.

Optional failure preserves primary logs and now offers Retry log volume. Existing view-return retry remains usable. Request-count regressions cover loaded/pending switches, inactive completion, rerun invalidation, explicit failure/retry and stale probe/volume completions. The previous test expecting a redundant second volume after remount is replaced by a single-request ownership assertion, reflecting the new requirement.

Retest canonical L/RC-08/09/11, alongside row layout once: loaded and pending Log volume → List/Patterns/Table → Log volume, counting primary/probe/volume separately. Check prompt return, query/group/range/new-generation invalidation and optional failure/retry. Real rendered/native evidence and human acceptance Pending (local Electron sockets blocked).
