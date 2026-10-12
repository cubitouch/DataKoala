# DataKoala documentation

This directory contains product, architecture, engineering, and release documentation. Start with the maintained references below; investigation reports record a *point-in-time* analysis, not necessarily the current implementation.

## Maintained references

| Document | Purpose |
| --- | --- |
| [Feature overview](features.md) | Concise description of the currently available workflows; consult the inventory for detail |
| [Datasource feature inventory](architecture/datasource-feature-inventory.md) | Source-guided feature matrix, implementation entry points, UX ownership decisions, and verification gaps |
| [Releases](releases.md) | Source releases, tagging, installation, and upgrade process |
| [Visual documentation](visual-documentation.md) | Screenshots, visual previews, and site-publishing workflow |
| [Styling](styling.md) | CSS ownership and component-scoping conventions |
| [Code duplication](engineering/code-duplication.md) | jscpd baseline and interpretation |

## Architectural and performance investigations

These are evidence and design records. Read the baseline/date and subsequent appendices before using a finding as a statement of current behavior.

| Document | Scope |
| --- | --- |
| [Connection lifecycle audit](architecture/connection-lifecycle-audit.md) | Issue #370, connection ownership and race conditions |
| [Query lifecycle audit](architecture/query-lifecycle-audit.md) | Issue #371, in-flight queries, tab switching and lifecycle parity |
| [Series cardinality performance](series-cardinality-performance.md) | Issue #324, provider-specific cardinality probes and historical manual checks |
| [Tempo performance baseline](development/tempo-performance-baseline.md) | Issue #96, measurement methodology and instrumentation |
| [Market benchmark](market-benchmark.md) | Historical positioning research, last reviewed August 2026 |

## Maintenance guidelines

- Update the feature overview when a user-visible datasource or major workflow changes.
- Update the detailed inventory when capabilities, UX ownership, or test coverage change. Its **Present** designation means a code entry point was found, not end-to-end validation.
- Date research and audits, distinguish historical observations from current behavior, and link the implementing PR or issue where useful.
- Preserve original investigation evidence; annotate or append later outcomes rather than rewriting the historical findings.
- Keep links working when relocating files. Documentation-only cleanup should not silently break tooling or release instructions.
