# Tempo performance baseline (issue #96)

Phase 0 records observability only: the measurements deliberately include the current
search, ERROR and OK root-status enrichment, adaptive exhaustive traversal, and
unbounded trace retrieval behavior.

## Capture

Launch the development app with the narrow opt-in flag and retain both main-process and
renderer console output:

```sh
DATAKOALA_TEMPO_PERF=1 pnpm dev 2>&1 | tee tempo-perf.log
```

Extract the machine-readable one-line events with:

```sh
rg '^\[tempo-perf\]' tempo-perf.log > tempo-perf-events.jsonl
```

Events share an opaque `requestId`. `gcxWallMs` is the complete gcx/provider boundary
(process startup, authentication/context work, network, Grafana proxy, Tempo work, and
transfer), not pure Tempo backend latency. Provider `metrics` are optional and are kept
per invocation; do not interpret sums across overlapping windows as unique work.

## Method

1. Use the same Tempo datasource and TraceQL criteria and record the exact range duration.
2. Run every representative scenario at least three times.
3. Identify the first/cold run; do not silently discard it.
4. Report the median of repeated warm runs where appropriate and note substantial variance.
5. Never compare different datasets or ranges as equivalent.
6. For trace opens, record span count and whether the source was a search result or direct ID.
7. Disable the flag afterward and confirm no `[tempo-perf]` events are emitted.

## Recording template

| Scenario | First useful result | Final UI | gcx calls | gcx wall | Parse | Normalize | Root enrichment | Rows/spans | Inspected bytes | Notes |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Sample 250 / 1h | | | | | | | | | | |
| Sample 100 / 1h | | | | | | | | | | |
| Sample 500 / 1h | | | | | | | | | | |
| All / representative range | | | | | | | | | | |
| Normal trace from search | n/a | | | | | | n/a | | | |
| Large trace from search | n/a | | | | | | n/a | | | |
| Direct pasted trace ID | n/a | | | | | | n/a | | | |

For searches also record `inspectedTraces`, `totalBlocks`, `completedJobs`, and
`totalJobs` where provided.

## Dominant-latency conclusion

For each search report renderer completion and first rows, gcx wall across the recorded
call count, root enrichment, parse plus normalization, and the measured dominant
component. For each trace report result receipt, render-visible milestone, gcx wall,
parse, normalization, spans, and `boundedTraceLookup`.

Calculate gcx wall / total, root enrichment / total, parse + normalization / total, and
renderer-after-result / total where meaningful. Keep the gcx boundary label honest and
do not call it Tempo backend latency.
