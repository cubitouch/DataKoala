# Loki view-transition investigation — #542

Base: `25c19a2efbd69a7f99560b987256db07aac25b1a` (main, 27 October 2026). No existing implementation PR/branch for #542 was found. #538/#536/#534 are present; no saved owner workspace was modified.

The owner recording shows Builder, Bar selected, and a **numeric volume table** with `timestamp`, `value`, `level` (366 rows), following a five-column raw-log Table and Patterns. It does not show the exact query, grouping setting or tested build SHA. Production rows/identifiers from the recording are not copied into tests or committed.

## Confirmed defect and correction

A minimal configuration-loss regression uses the existing real volume fields: run `{app="x"}`, open Line, select `value` as X, then select Table → Patterns → Bar. Before the change, the X control returns to `timestamp` and the applied chart uses the reset mapping. The same user-level test fails against the base runtime and passes after the correction.

The raw Table fed its effective configuration (including `view: table` and raw-log columns) into the volume settings. Separately, an effect reset all volume mappings whenever the outer view changed. Table now has a separate fixed configuration, volume settings exclude `view`, and the outer picker directly supplies the chart view. Only actual grouping changes update grouping defaults. Normalization callbacks are scoped to the active tab/profile/generation/current volume result and requested view. No GenericResultExplorer rewrite, forced remount, cache/query/filter change or readiness bypass is used.

This establishes a configuration-clobbering defect at the investigated boundary. It does **not** establish that the recording's persistent selected-Bar/volume-Table symptom is reproduced or resolved on current main. Keep #542 open; the PR uses a non-closing reference.

## Targeted matrix

| Case                                                                | Observation                                                                                                                 |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Existing Raw default and Builder/newline baseline                   | Table → Patterns → Bar and repeated Line/Bar render correctly; retained as neighboring coverage                             |
| Raw, real five-column logs; cold/warm and paced/batched transitions | Requested Bar applied; table disappears                                                                                     |
| Grouped metrics, cold/warm                                          | Correct view, one primary + one probe + one volume; probe classified before `count_over_time` because probes contain it too |
| Empty/no numeric mapping and filtered cohorts                       | Explicit non-table empty/configuration state, selected Bar retained; filters preserved                                      |
| Loaded/pending tab remount and pending result replacement           | Correct final series/value, no duplicate view-only requests; obsolete completion ignored                                    |
| Chosen X mapping, then Table/Patterns/charts                        | **Fails before**, passes after: chosen valid mapping survives                                                               |

The native extension adds the recording's data shape with synthetic 1,000-row raw logs and 366 grouped metric rows, pending grouped volume/Line return, restored Table with remembered table visualization, and the changed-X regression. It compares the exact base and final source, inspects actual ECharts options/values and requested/applied fingerprints, and captures Bar images. Request counts distinguish primary/probe/volume. Final SHA, native artifact and CI links belong in the PR/issue receipt.

## Remaining owner verification

Human/live acceptance remains Pending. Reuse one Loki route: original/minimized query and mappings → Table/Patterns/Bar (selected Bar, real Bar, no table) → Line/Bar/Table including the original lifecycle condition → verify no extra primary or duplicate unchanged volume/probe work. If the original symptom persists, capture the exact tested SHA/build and the query/mode/grouping/filter state together; the recording already establishes which control and dataset are visible.

Local full `pnpm verify` is unavailable: this host cannot run native Electron sockets/root sandbox or disposable PostgreSQL prerequisites. Local focused UI, typecheck/build and repository controls are recorded separately from CI/native/macOS evidence. CI success does not imply live acceptance. No merge, tag, release or automatic issue closure.
