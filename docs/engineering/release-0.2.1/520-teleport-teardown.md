# Teleport owned-process teardown — #520

Base: `673650015b828d6c0b44a163f1672f348010eb66`.

Confirmed controlled defect: a tunnel readiness failure sent TERM then set `managed.child = null`, bypassing bounded escalation. A TERM-resistant real listener survived. The new process-boundary test fails on the base and passes with retained ownership and TERM/KILL cleanup. Health replacement now also awaits teardown. Cleanup only signals the owned child/process group, never a process found by port. Obsolete failure cannot delete a newer manager entry.

PostgreSQL close, cancellation and shutdown now clean tunnels in finally blocks if adjacent database cleanup rejects. Existing generation guards remain. The test creates an unused ephemeral loopback port, records the owned PID, exercises stop/stopAll/readiness failure with real TCP probes, and checks listener absence beyond grace and again for restart. Sixteen focused manager/adapter/shutdown tests passed locally. This is Linux/helper evidence, not macOS acceptance.

The owner's exact red-window-close versus Cmd+Q failure was not reproduced; it is not established by the original observation. Native app acceptance remains Pending.

Canonical T11 retest: reconnect separately before Disconnect, connected-profile Delete and Cmd+Q. Record actual PID/process-group/command and configured port before each action; verify full Quit exits the app. Run `lsof -nP -iTCP:<port> -sTCP:LISTEN` and `ps -p <pid> -o pid=,ppid=,command=` before cleanup and beyond its grace period, then check again for restart. Capture evidence before any manual kill. Distinguish red-window close explicitly. Relaunch must restore only non-secret settings without starting a tunnel. Reuse T02/T03 from #517 for spacing. No human acceptance passed.
