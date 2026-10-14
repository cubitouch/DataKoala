# Visual audit renderer execution boundary

Review of PR #406 at `ee763c31c121a287fa8a7d42c15283f61984061c`, followed
by harness-only hardening. Production UX, audit conclusions and both Loki
formatter expected-failure tests remain unchanged.

## Evidence and access limits

All six Advanced Security comments and their original/current anchors were
inspected. The previous head's CodeQL check reports six new medium-severity alerts.
The connected GitHub API does not expose private alert/instance/SARIF endpoints
or check-annotation details. The paths below are **source-reconstructed**, not
inspected private SARIF paths. Exact assignment of the two serialization sources
at each paired anchor (#8/#9 and #12/#13) is unavailable; no dismissal or claim
about that ordering is warranted.

The [CodeQL query implementation](https://github.com/github/codeql/blob/main/javascript/ql/lib/semmle/javascript/security/dataflow/ImproperCodeSanitizationCustomizations.qll)
defines `JSON.stringify()` output itself as a source, and a concatenation leaf
following function-like text as its sink. It does not establish external input
control, or make `executeJavaScript` the reported query sink. The latter is the
actual downstream execution boundary here. The [query help](https://codeql.github.com/codeql-query-help/javascript/js-bad-code-sanitization/)
also covers source embedded in HTML, where `</script>` is dangerous.

## Individual alert review

Lines refer to `ee763c3`. Every reconstructed path below continues from its IIFE
through local `evaluate(expression)` to `webContents.executeJavaScript(expression)`.

| Alert | Reconstructed complete paths at the anchor | Origin / external reachability | Original protection and remediation |
| --- | --- | --- | --- |
| [#8](https://github.com/cubitouch/DataKoala/security/code-scanning/8), 87 | `type(input, text)` caller → fixed input selector → `select` → `JSON.stringify(selector)` → querySelector fragment → input-setting IIFE; fixed text → `JSON.stringify(value)` → setter argument in same IIFE. Both branches reviewed; #8 assignment unavailable | `[data-popover-overlay] input` and `no-matching-audit-option`; no provider/DOM/CLI/environment input | Complete JSON literals already protect direct JS quotes/backslashes; no HTML parser here, no injection reproduced. Both sources now use hardened encoder; not dismissed |
| [#9](https://github.com/cubitouch/DataKoala/security/code-scanning/9), 87 | Same two paths, independently reviewed at second comment, including `type` caller, `select` return, IIFE and evaluator; #9 assignment unavailable | Same fixed inputs; parameters could be broadened in future | Harden both instead of depending on constants or dismissing one comment |
| [#10](https://github.com/cubitouch/DataKoala/security/code-scanning/10), 165 | Fixed `rowSelectors[list]` → `row` → `select(row)` → serialized selector → geometry IIFE → evaluator → coordinates used in native pointer events | Three fixed list names and selectors; DOM coordinates never interpolated back into source | Complete JSON literal safe in direct JS; no HTML interpretation or current injection. Harden selector encoding, preserve real pointer sequence |
| [#11](https://github.com/cubitouch/DataKoala/security/code-scanning/11), 178 | Fixed `rowSelectors[list]` → `row` → `select(row)` → serialized selector → scroll IIFE → evaluator; scroller expression selected from three literal fragments | Fixed map/list loop; no arbitrary scroller expression accepted | JSON selector plus trusted branch source. No current injection. Harden selector, retain distinct scroll targets |
| [#12](https://github.com/cubitouch/DataKoala/security/code-scanning/12), 246 | Fixed metadata loop → status conversion → `JSON.stringify(...)` → `status:` in store-update IIFE; same loop → fixed message/null → `JSON.stringify(...)` → `error:` in same IIFE. Both paths reviewed; #12 assignment unavailable | `loading/error/settled` and fixed synthetic error; renderer-local profile ID used as computed property, never main-process source interpolation | Complete JSON property values prevent statement escape. Harden both data sources, preserve injected states |
| [#13](https://github.com/cubitouch/DataKoala/security/code-scanning/13), 246 | Same two paths at second comment, through serialization, property values, IIFE and evaluator; #13 assignment unavailable | Same finite loop/message/null | Same contextual protection; both sources remediated without suppression/dismissal |

## Small hardening change

`renderer-value.mjs` JSON-serializes a value, encodes the JSON text as a
double-quoted JS string literal, escapes `<`, `>`, U+2028/U+2029, and emits only
a fixed `JSON.parse(...)` call. JSON already escapes quotes, backslashes and
controls. Runtime JSON parsing treats decoded contents as data, never eval or
Function input. Markup cannot terminate a script element in generated source.
`__proto__` stays an own JSON property, not object-literal prototype syntax.
Unsupported/cyclic JSON values fail. This is data encoding, not an HTML sanitizer
or generic RPC mechanism.

All audit data interpolations use it. `clickText` now accepts a CSS selector or
null (document), replacing its raw JavaScript scope parameter. The entire selector
is encoded before querySelector sees it. Invalid CSS may throw or select nothing;
it cannot become a JS statement. Encoding does not authorize selector targets;
source-owned audit callers continue to choose fixed selectors.

Neighbor review:

- Seed wait strings and raw-editor selectors formerly inserted finite enums
  inside single quotes; now whole strings/selectors use the encoder.
- Canonical `capture.mjs` divider selectors formerly used unescaped single-quote
  interpolation. Current callers are fixed, but a future quote-containing selector
  could escape that context. This helper now uses the encoder; the only canonical
  capture change.
- Other canonical mode/view/label interpolations have fixed literal callers;
  existing chart fixtures and assertion selectors use complete JSON literals.
  No provider/environment/DOM value becomes an executable expression there.
- `evaluate` and shared `waitFor` remain private source-owned operation plumbing,
  not endpoints accepting arbitrary expressions. Output paths/head metadata affect
  files/reports, not expressions.
- Contact HTML uses fixed group names, captured PNG data URLs and numeric crop
  dimensions. Captions/head metadata receive HTML encoding; it is never used as
  JavaScript encoding.

## Regression and visual verification

Four targeted tests join the existing preview assertion suite in `pnpm test`.
They execute only fixed operations with encoder output, never an intentionally
unsafe implementation. They verify exact round trips, no sentinel execution,
nested fixtures/prototype keys, exact selector/input arguments,
and unsupported/cyclic rejection. Inputs cover both quote styles, backticks,
backslashes, newlines/NUL, Unicode/separators, JS-looking strings, HTML, empty and
100,000-character strings. A querySelector spy verifies the JS-to-DOM argument
boundary without conflating it with CSS parser acceptance or native input
normalization; real selector/input interactions are executed by the Electron
capture. These helper tests use Node built-ins only.

Fixtures, 172 state filenames, six scale-1 sheets, 220 observations, viewports,
strict manifests and review index are preserved. Final-head workflow/CodeQL
results, artifact equivalence and observed differences are recorded in PR #406
after capture review. A green Actions job alone proves neither alert removal
nor image equivalence. Private alert state remains subject to the access limit
above. No scanner is disabled; no alert is manually dismissed.
