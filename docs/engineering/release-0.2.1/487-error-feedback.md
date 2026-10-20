# #487 — bounded operation error presentation

Manual acceptance: **Pending** on the consolidated v0.2.1 RC.

## Reachable inventory and final policy

| Operation/source                                         | Previous surface/gap                              | Final surface and recovery                                                          |
| -------------------------------------------------------- | ------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Query SQL/PromQL/LogQL/TraceQL text copy; browser denial | Toast prefixed arbitrary exception                | One shared actionable error toast; Details disclosure, same Copy retry/draft        |
| Grafana link copy; browser denial                        | Different raw exception toast                     | Same text-copy error semantics; reopen handoff to retry                             |
| Loki message/line/field/trace/span copy                  | Recoverable toast with raw detail in primary text | Same actionable message + disclosed detail; existing #453 selections/retry retained |
| Table CSV copy                                           | Readable toast, distinct wording/no detail        | Same copy error; sorted/filtered payload retained                                   |
| JSON inspector copy                                      | Duplicate status + alert for one failure          | One inline alert with shared language/details; modal remains open for retry         |
| Explain text/JSON/diagnostic copy                        | Failure in success-style local status             | Shared error toast; clear previous local success, preserve plan                     |
| CSV file export                                          | Rejected promise escaped event handler            | Caught error toast, silent cancellation, success status, repeat Export retry        |
| Service-map SVG export                                   | Console-only error                                | Error toast, silent cancellation, success status, same export retry                 |
| Chart image copy/PNG export                              | Existing image-specific flow                      | Owned by #490; no shared prerequisite or overlapping rewrite                        |
| Service-map image/Excalidraw copy                        | Existing contextual image/diagram toast           | Intentionally retained: distinct payload/availability, already bounded and readable |
| Query/connection errors, Settings and connection forms   | Inline, blocking or recovery-specific             | Intentionally retained: correction/reconnect belongs beside the affected state      |

The small clipboardFeedback utility serves real text-copy call sites only. It
uses existing leading transport cleanup for disclosed details; it is not a global
exception transformer. Details are plain React text, never HTML. NotificationArea
keeps one slot, alert/assertive failure and status/polite success. Its width wraps
within the viewport. Clipboard fallback now restores original focus/text selection
on success and failure. No provider operation, query or selection is retried
implicitly. JSON errors stay inside the modal so the focus boundary is respected.

## Manual steps (all Pending; RC-04/05C/11/16/18/20/21)

1. Deny text clipboard permission using a controlled fixture or OS setting. Try
   query Copy, CSV Copy, Loki Copy line/message/field and Grafana link Copy. Expect
   one actionable alert per action, useful Details, no primary IPC boilerplate,
   unchanged draft/filter/selected log. Restore permission, repeat Copy and paste
   the exact payload; no query should rerun.
2. In JSON explorer, fail Copy JSON: one inline error announcement, dialog/content
   preserved, no duplicate success-style error. Retry, close via Escape and check
   focus returns. For Explain copy, expect an error toast and unchanged plan.
3. Export CSV and service-map SVG to a safely unwritable/unavailable destination.
   Expect one accurate error, no unhandled rejection. Retry to a writable path;
   expect correct filtered/sorted CSV or SVG. Cancel Save: no new error/success.
4. At normal/narrow widths inspect wrapping and keyboard opening of Details;
   screen reader should announce one assertive error and polite success. Forms,
   connection recovery and query errors should still appear in their own context.
5. Reuse #453 release steps to check all Loki copy actions preserve selection and
   PromQL's accessible Copy label. Reuse #490 for chart screenshot outcomes.

Native `fix-87` uses rendered application controls with synthetic clipboard/Save
failures and captures desktop/narrow alerts. OS clipboard and native Save dialog
acceptance remain Pending even if its controlled CI assertions pass.
