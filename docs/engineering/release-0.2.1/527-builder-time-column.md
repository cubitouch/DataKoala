# Builder AI time-column boundary — #527

Base: `673650015b828d6c0b44a163f1672f348010eb66`.

Confirmed synthetic failure: renderer-generated context with a selected PostgreSQL relation, loaded temporal creation_datetime and an incomplete non-count Y setup was validated as an executable target before contacting AI. Input validation now permits legitimately incomplete controls while preserving column/type grounding, shape/caps and strict complete proposal validation. A proposal can safely complete the setup using explicit count aggregation; Apply remains separate from Run.

Oversized prompt/context errors now identify size explicitly. Invalid fields/metadata give corrective relation/axes/time-column guidance. Renderer budgeting reserves the complete request-ID envelope rather than only prompt/state/columns.

The deterministic regression constructs context with actual renderer capture/prepare functions, crosses registered main IPC and reaches a mocked HTTP provider. Non-temporal context rejects without another provider call; unsafe/incomplete proposed targets still reject. The owner's precise unseen state is not claimed reproduced. Targeted live-provider retest remains Pending.

Retest canonical Builder/AI and RC-13/05B: creation_datetime please from partial and configured states; inspect proposal, explicit Apply then separate Run, invalid temporal metadata and useful size feedback. No SQL/provider request runs automatically. Human acceptance Pending.
