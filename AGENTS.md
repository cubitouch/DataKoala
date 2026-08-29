# DataKoala architecture guide

These rules apply to the whole repository.

## Renderer boundaries

- Compose existing query/workspace primitives before creating a workspace. Never copy an explorer to add a datasource.
- All standard query action bars use `components/query/QueryToolbar`; extend its composition slots instead of creating a datasource-specific toolbar.
- All normal editable query surfaces use `components/query/QueryCodeEditor`. Do not instantiate another standard CodeMirror wrapper.
- `GeneratedQueryPanel` is the sole generated-query disclosure.
- Metadata hierarchies use the generic recursive/lazy metadata tree and datasource adapters; do not create datasource-specific tree mechanics.
- Keep SQL, PromQL, LogQL, and TraceQL builders domain-specific, but compose shared builder form/field primitives and the existing UI field chrome.
- Keep reusable domain rules in pure library modules, outside React components.
- Reuse generic table/chart result presentation. Loki's list and Tempo's trace views are intentional specialist views.
- Domain code must use `TextInput`, `Combobox`, `MultiCombobox`, and other named UI primitives. Never add native textual/numeric/search inputs or native selects there. Extend a shared primitive when capability is missing.
- Extract a coherent responsibility before extending an already-large component. Prefer composition/adapters to generic components with datasource boolean flags.
- Delete replaced implementations, styles, tests, and exports; do not retain parallel alternatives or TODO migrations.

## Required checks

Run `pnpm check:renderer-controls` and `pnpm check:dead-code` after renderer migrations, as well as typechecking and relevant tests.
