# Batch 4 dialogs — #484 / #485 / #489

**Implementation merged:** PR #506, `38bac2bd526e83bb53464c531a15ff109e7b135c`, 2026-10-21 (Europe/Paris). **All consolidated manual acceptance remains Pending.**

Base: `09df6c957f7db113ed04f8a9a48f9affb872d628`. Three issues share one shell/focus contract and were implemented together in PR #506. No dependency upgrades, persistence changes or provider cancellation.

## Inventory and characterization

| Surface                                              | Before                                                                                                                  | Final ownership / preserved differences                                                                                                                                                                       |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Settings, presets, JSON cell inspector, Reset        | Existing `Modal` portal, 1000 layer, labelled container; Settings has a child model popover                             | Existing common backdrop/container retained; child capture-phase Escape consumes the first key; Settings draft and its dialog-first focus remain                                                              |
| Connection picker                                    | Separate 50-layer backdrop, arrow navigation, no focus trap/initial focus                                               | `Modal`, meaningful first radio focus, same arrow navigation, contained native Tab, Cancel/Escape/outside dismissal                                                                                           |
| Seven create forms                                   | Separate shells; visited forms kept mounted under display:none; PostgreSQL/BQ already invalidate selected Test requests | Only the active form renders a portal/listeners. Draft state stays mounted through Back. All seven now invalidate Test/Save delivery on hide/unmount and gate rapid repeated activation                       |
| Seven edit forms                                     | Provider-specific fields and inherited fixed-kind policy                                                                | Same provider content; keyed profile identity prevents a pending callback or draft from transferring to a replacement profile                                                                                 |
| Delete connection                                    | Cancel-first focus and #498 focus return correct; closed before async remove finished                                   | Shared `ConfirmationDialog` retains the captured ID and stays open on failure; locks pending Confirm/Cancel/Escape; retry clears prior error; successful removal focuses the surviving new-connection trigger |
| Reset exploration                                    | Existing captured tab ID and synchronous reset, Cancel leaves state intact                                              | Shared confirmation; original clear/preserve semantics retained; tab/profile change invalidates the confirmation; checks target and running state again at Confirm                                            |
| Native preset-delete/tab-close/interruption confirms | Synchronous OS confirmation, distinct domain policies                                                                   | Retained; no forced conversion of native confirmations or popovers into modals                                                                                                                                |

Reproduced/source-confirmed defects: missing connection focus ownership, inactive portal risk upon shell migration, obsolete Save delivery, and Delete dismiss-before-failure. Requested convergence: common container/backdrop and Reset/Delete component. VIS-11's missing screenshot is an evidence gap, not a claimed historical visual defect.

`Modal` adds optional `describedBy`, optional captured origin, and controlled focus-return suppression for a wizard step. Only the last active modal owns Tab/Escape. Native buttons, hidden/disabled controls and nested popover ownership are preserved. `ConfirmationDialog` composes title, description, action label and contextual retry error on that shell; callers capture target identity. A disappeared deletion target cancels without selecting a different ID.

Field edits invalidate Test results independently of Save ownership. PostgreSQL
edits can invalidate a pending Test and permit a new test; they do not revoke a
pending Save's captured profile or suppress its completion/error cleanup. Test
and Save are disabled during that Save. BigQuery keeps both actions disabled
until the owned Test/Save settles, even when the draft changes. An edited Test's
obsolete result is hidden, but its completion releases busy state. Failed Save
keeps the edited draft available for an explicit retry; successful Save delivers
the profile captured at submission. Hiding or replacing a form still invalidates
delivery into that form.

## Automated and native evidence

`pnpm verify`: renderer controls, dead code, imports, format, lint, typecheck, 548 main/shared tests (5 skipped), 691 renderer/integration tests including real SQLite, 32 script tests, and build passed. It then stops at `pnpm smoke`: `spawn node_modules/electron/dist/Electron.app/Contents/MacOS/Electron ENOENT` on Linux. The first run lacked the prepared SQLite binary; preparing the compatible signed extension resolved that environmental failure before this result. The later full UI-suite and final-HEAD CI results are recorded in the PR.

Local native execution is unavailable: Electron's headless Ozone attempt exits with SIGSEGV; no Xvfb/display is installed. No local native acceptance or visual parity is claimed. `Batch 4 Dialog Regression` captures the **actual PR base** first with the same observation module, then asserts the head using Electron `sendInputEvent` Tab/Shift-Tab/Escape. It records active-element ownership, all seven create/edit forms, Back/draft retention, deletion failure/retry, reset, narrow containment and obsolete pending Save delivery. Original-resolution images and measurements are uploaded as `batch4-dialog-evidence`. Existing Settings Escape/failed Save and #498 Delete native workflows remain required adjacent regressions. Inspect their actual status/artifacts at final HEAD; fixtures do not constitute human acceptance.

## Consolidated owner checks — all Pending

Reuse RC-04/10/18/19/20/21/22. Record exact package/full SHA, OS, provider, Pass/Fail/Untested and evidence once on #382.

1. Open the picker by keyboard; Tab/Shift-Tab and arrow through it. Visit all seven forms in create mode, then each available saved profile in edit mode. Expected: one visible/named dialog; meaningful focus; traversal remains inside; hidden forms do not appear to accessibility tools.
2. Enter a recognizable draft, Back, visit another provider, then revisit. Expected: original draft retained; no background focus flash, duplicate backdrop or surprise provider request.
3. Open a nested selector and press Escape twice. Expected: child closes first and restores its trigger; the next eligible Escape closes the parent and returns to the original invoker. Repeat Settings with an unsaved model draft, then failed Save/retry.
4. Start Test/Save using a safe provider; repeat the action rapidly, go Back/Cancel or replace a profile where allowed, then complete the old request. Expected: no duplicate submit, obsolete error/result or close of the replacement form. PostgreSQL Cancel test invalidates delivery and permits retry; no remote cancellation is promised.
   While PostgreSQL Save is pending, edit Host, then complete or safely fail the
   Save: success delivers the submitted profile; failure ends Saving, reports
   the error and permits retry with the edited Host. While BigQuery Test is
   pending, edit a field/reference/billing limit: Test and Save stay disabled
   until settlement, obsolete feedback stays hidden, then both work with the
   current draft. Repeat edits during BigQuery Save and check failure/retry.
5. Reset a populated tab; Cancel/Escape first, then Confirm. Expected: Cancel changes nothing; Confirm clears query/Builder/results once, keeps connection/time range. Switch tab/profile while open: no reset of another target or resurfacing old confirmation.
6. Delete a disposable saved connection; Cancel/Escape returns to the exact Delete control. Inject a recoverable storage failure where available: confirmation retains its named target/error, then retry removes only that ID once. Success focuses new connection; if the original target disappears, no other target is substituted.
7. Repeat at narrow width, with long target names, removed invoking controls and busy operations. Expected: readable scrolling, accessible actions and contained focus; no loss of unrelated drafts. Run the packaged upgrade/restart checks under RC-19/21 separately.

Implementation is merged; no release has been published. All manual acceptance remains Pending.
