# #496 — BigQuery provider guidance

Manual acceptance: **Pending** on the consolidated v0.2.1 RC.

## Diagnosis and boundaries

The adapter's existing friendlyError prefixed guidance to raw SDK messages, and
only connection testing/classified query failures consistently used it. Metadata
and discovery could expose bare errors; the connection picker then discarded
project/dataset discovery diagnostics. Numeric string status codes and structured
OAuth errors also missed classification. Unknown object query errors lost their
message as `[object Object]`.

A BigQuery-only utility now reads message, status and reason fields, including
Gaxios OAuth error codes. Auth guidance explains ADC and how to renew/configure it;
disabled API, project, permission, billing, location, quota, network and unknown
outcomes have distinct guidance. Permission/resource/location/provider messages
remain useful diagnostic Details text. Do not stringify SDK request config,
headers, response bodies or credentials. Auth's opaque upstream text is omitted
because it adds no corrective step. This is a UX policy, not proof of credential
leakage or a general redaction/security boundary (#495 remains separate).

Metadata/discovery reuse this guidance without double wrapping. Query validation
and read-only checks retain their contracts; connection failures retain their
classification, including cardinality probes. An explicit invalidQuery/400 stays
a query error even when its column name contains credential vocabulary. No
provider requests are retried, no writes are added, and no fallback region is used.
The BigQuery form retains actionable discovery causes after leading IPC cleanup,
while preserving manual project entry and request-revision guards. Silent optional
default-project discovery stays optional when project listing/manual entry works.

Synthetic tests cover representative SDK/Gaxios fields, malformed/unknown shapes,
connection testing, namespaces/relations/columns, discovery, query/probe failures,
existing failure-envelope serialization and renderer API classification, plus
connection-form guidance and retry. The boundary test uses structuredClone and the
production serialization functions; it is not a native Electron transport test.
Existing NON03 assertions still verify their original cause/data-preservation
properties; the raw synthetic-marker characterization is explicitly superseded by
the approved auth-message policy. No real credentials were used.

## Manual BigQuery smoke (all Pending; RC-02/04/10/13/17/20/21/22)

1. Record exact RC package/SHA, OS, credential type, billing/data project and dataset
   region. Use authorized read-only data and a separate test connection. Configure
   Google Application Default Credentials (user ADC via
   `gcloud auth application-default login`, or an approved ADC credential file).
   Open discovery, Test, save/connect, browse datasets/tables/columns and run
   `SELECT 1 AS value`; expect success. Plain `gcloud auth login` alone is not ADC.
2. In an isolated app process/test environment, point GOOGLE_APPLICATION_CREDENTIALS
   to a nonexistent test file. Open project/dataset discovery and Test. Expect
   ADC-specific corrective guidance, no primary Electron exception, preserved
   form values and manual ID entry. Restore valid ADC and repeat Test/connect;
   expect recovery without recreating the connection.
3. If an authorized expired/revoked test credential is available, repeat discovery,
   Test and SELECT. Expect renewal guidance. Do not revoke a working credential
   merely to manufacture this case; otherwise record it Untested.
4. Enter an invalid project ID; then a project/dataset the test identity cannot
   access. Expect distinct project/access guidance with useful resource details.
   Return to the authorized IDs and retry. With a test billing project lacking
   active billing/jobs permission, expect billing/job-creation guidance; Data
   project should continue to mean dataset selection.
5. If a test project with disabled BigQuery API is available, expect enable-API
   guidance, not generic permission text. Do not disable a production API.
6. Set a conflicting location for a known dataset. Expect location guidance or
   the exact provider query diagnostic, no retry in another region. Correct or
   clear the override and rerun successfully.
7. Run a SELECT with an unknown column/table and try a prohibited write. Expect
   query/validation errors and preserved read-only protection, not an ADC error.
   Briefly disconnect network where safe, run SELECT, restore network and retry;
   expect an accurate provider/network failure and recovery.
8. Repeat after tab/profile switching and packaged restart: no wrong-tab message,
   automatic Run, lost draft, or implicit write retry. Cover a Builder cardinality
   preflight on an authorized dataset after auth recovery.

Live BigQuery and packaged native provider acceptance remain Pending. Controlled
unit/UI fixtures and green packaging CI do not count as live manual acceptance.
