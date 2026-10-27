# Chart brush initialization — #524

Base: `673650015b828d6c0b44a163f1672f348010eb66`.

Confirmed lifecycle gap: the ref/effect enabled the cursor on an early ECharts instance, whereas echarts-for-react finishes asynchronous initialization before invoking onChartReady. That callback only marked readiness; it did not activate brushing or rebind hover cleanup to the final instance. Initialize those responsibilities on the actual ready instance. Preserve revision guards, brush clear/reactivation and local membership.

A deterministic regression replaces the provisional chart with a distinct ready instance and requires its brush cursor and event bridge before any picker click. This test fails on base. It establishes the missing ready callback behavior, not the full intermittent owner report.

Native repro matrix remains Pending: SQL temporal Line/Area/Bar, Loki Log volume and Tempo Scatter at initial completion, result replacement, tab away/back, same-type click and type changes. Drag only after true readiness, before any type click; repeat clear/drag, count primary/secondary requests and check unchanged time pickers. Local Electron cannot launch (OS sockets blocked), so no real rendered first-drag result or universal provider fix is claimed. This remains a draft investigation until native evidence verifies the affected transitions.

Retest canonical C/RC-05/05A alongside the Tempo/Loki/SQL stops. Keep #522 viewport fitting separate. Human acceptance Pending.
