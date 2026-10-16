# Deferred maintenance — visual audit harness

**Low priority. Not a Phase 1C closeout requirement or Phase 2 gate.** This is a discoverable maintenance note for a separate future engineering task; **do not refactor now**.

Existing CAP-numbered modules under `scripts/visual-preview/audit-batches/` are executable regressions, not historical text. A later dedicated refactor may group modules by feature area (connections/settings, SQL/Builder, Prometheus/Loki/Tempo, result table/chart), deduplicate only genuinely shared fixture setup and clarify each module's independent contract. Preserve isolated Electron-process execution for each scenario, provider-specific fixtures, assertions, screenshot capture, measurement JSON, sourceHead/provenance and failure characterization. Keep the ability to run one CAP module and a full suite; prove equivalent focused and full-suite behavior and images **before** any historical module removal.

The existing runner/loader, IPC simulation, batch modules, Visual Preview GitHub Actions workflow and related tests stay in place. Any change to a known-defect characterization must accompany a separate passing production regression test—not be silently accepted by changing its expected value. Consult the existing architectural/convergence record and PR #406 discussion for the original deferred-maintenance context.

[Return to final report](final-report.md).
