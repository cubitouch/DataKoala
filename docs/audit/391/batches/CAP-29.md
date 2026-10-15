# CAP-29 — AI Settings, model selection and nested Escape

Disposition: **PARTIAL**. X01 only; audit-only, no production correction.

## A. Execution metadata

- Integration base: `88c8ba58c95a2ab4faadfc07a8227cbb9b2ade85`, fetched before branch creation.
- Isolated branch: `audit/391-cap-29-ai-settings`.
- Draft PR: [#435](https://github.com/cubitouch/DataKoala/pull/435), targeting `audit/391-ux-convergence`.
- Scenario: `f1ca5d6715973ee52f84ad4ad25abcb30dfbca96`; initial scenario `50c7afbc8215013aa27b2cdfb7c5bde1e15feba4` superseded before audit execution.
- Accepted Visual Preview: [38814864167](https://github.com/cubitouch/DataKoala/actions/runs/38814864167), **success**, capture job 116696873047 and publish job 116698618078.
- CI: [38814864181](https://github.com/cubitouch/DataKoala/actions/runs/38814864181); documentation: [38814864185](https://github.com/cubitouch/DataKoala/actions/runs/38814864185).
- Accepted audit artifact: **12009723643**, `datakoala-ux-audit-pr-435`; ordinary preview artifact 12010088127 is not used for new CAP-29 visual acceptance.
- Generating sourceHead: **f1ca5d6715973ee52f84ad4ad25abcb30dfbca96**. GitHub synthetic merge checkout: **9acc17857f86a232906bcae07464a11e320e22b0**, combining that source with the integration base; these SHAs are not interchangeable.
- Archive SHA-256: `a04b070d45dbb60290cba6dd9ddb62799240f3bd23735c0d3e53e482175792c8`, matched the artifact digest after download.
- Scenario and this report are separate commits. This report cannot embed its own eventual SHA; the final PR metadata/commit list identifies it. Subsequent report-only runs do not replace the inspected scenario evidence above.

## Scope and implementation ownership

The inventory defines X01 as **AI settings / OpenRouter setup**, all-app setting, manual verification **Save/error/unconfigured**. X02 secure credential persistence belongs to NON-03 and is not silently certified by this UI audit.

`AiSettingsAction.tsx` owns the real Settings trigger and conditional mount. `AiSettingsModal.tsx` owns loading, model/key drafts, configured placeholder, save/test/remove operations and error text. It maps catalog IDs to Combobox options and retains an unavailable saved model as **Currently configured**. This fallback is intentional, not evidence that arbitrary new models can be typed into this selector.

Shared `ui/Modal.tsx` portals the Settings dialog, focuses the dialog itself, traps boundary Tab, listens on document for Escape and schedules focus return to Settings. `Combobox.tsx` owns search/active-option/selection behavior; its React Escape handler closes its child state. `ui/Popover.tsx` owns the portaled child, positioning, top-popover coordination and document Escape listener. Modal does not participate in that popover coordinator. Both CSS layers use z-index 1000; successful stacking must be checked by actual paint/hit testing, not inferred from unequal z-index numbers.

`src/main/ai/ipc.ts` routes the supported settings channels to AiService; settingsInput validates model text (256 characters) and optional key text. `AiSettingsStore` persists only model/provider/version in ai-settings.json, and delegates secrets to the shared store. `createElectronEncryption` uses Electron safeStorage and rejects Linux basic_text/unknown backends. These are **SO** boundaries here, not new native OS tests.

Required root guidance, inventory, convergence architecture, coverage register, visual documentation and standalone loader conventions were read. No nested AGENTS.md exists. Existing V-02/V-03 and CAP-12/13 modal/focus findings were consulted. The central register and earlier findings remain untouched.

## Evidence method

The standalone loader starts a fresh actual Electron renderer. All settings/model handlers are replaced at the existing IPC boundary. Configured status is a boolean only: no secret value is supplied, inspected, retained or screenshot. The visible dots are the production placeholder. Synthetic catalog: synthetic/alpha (current), synthetic/beta (alternative), and a 230-character long ID. Native keyboard input uses webContents.sendInputEvent for Tab, Shift-Tab, ArrowDown, Home, Enter and Escape. UI opening/selection/save/cancel uses actual DOM controls; no independent overlay-close calls substitute for Escape.

A WeakMap distinguishes parent and child DOM identities without adding production attributes. The ledger records visible overlay counts, model draft, active-element descriptor, native Escape capture count, sanitized IPC calls and save counts. Native capture observes an Escape event before its bubble handlers. Individual React/document dismissal callbacks are not instrumented; attributing each callback invocation remains **SO/UV**, separate from measured DOM disappearance. Measurements do not claim that observing one DOM removal proves two independent dismissal callbacks ran.

## B. X01 coverage matrix

| Substate | Visual | Behavior | Product acceptance |
| --- | --- | --- | --- |
| Unconfigured Settings | VV: first image, blank password/model, readable actions/privacy copy | BV: real trigger, initial focus dialog, Save disabled, native Tab help→Cancel boundary checks | PASS for inspected desktop state |
| Configured selector | VV: second image, placeholder dots, Alpha check/highlight, three synthetic options | BV: catalog identity, original parent retained, native search focus, ArrowDown/Home active options, no implicit save | PASS for selection/stacking; automatic focus is qualified below |
| First/second nested Escape | VV: third image has no dialog/popover and focuses Settings | BV: twice, first Escape removes both; second does nothing | **FAIL**, VC29-01 / existing V-02 |
| Select/Cancel/save/reopen | No additional image; UV visual state | BV: Beta draft cancelled→Alpha; Beta saved→reopened Beta; failed Alpha save→Beta still stored; retry→Alpha | PASS for synthetic non-secret persistence only |
| Loading/empty/unmatched search | UV visual state, no screenshot within budget | BV: gated loading→3 options; empty catalog→0; unmatched Enter retains long selected ID | PASS for executed bounded states |
| Save error/focus | UV visual state | BV: exactly one specific alert, parent/draft retained; active element BODY after busy Save | Focus acceptance **FAIL in observed synthetic invocation**, VC29-03; retry remains possible |
| Secure storage / provider auth | SO / N/A screenshot | SO: settings/service/encryption and named tests; no OS/provider execution | Not certified by X01 |

VV = individually inspected native screenshot. BV = actual executed Electron assertion or measured transition. SO = source/test support without this native execution. UV = not verified. N/A means no screenshot can establish an OS encryption property.

## C. Settings-state matrix

| Fixture | Observed result | Evidence / limits |
| --- | --- | --- |
| Unconfigured, empty model, no key | Empty password, choose-model prompt; Save/Test disabled, Cancel available | VV first PNG; BV initial assertions |
| Configured Alpha, key-presence boolean | Production password placeholder, selected Alpha; no actual key exists | VV second PNG; BV both trials |
| Catalog loading | Real listbox has aria-busy=true while IPC response is explicitly gated; releasing it produces all 3 options | BV `catalog-loading`; no loading screenshot/VV |
| Empty catalog, no saved model | No matching options, zero options | BV `empty-catalog`; no invented model-discovery requirement |
| Missing credentials, selected Alpha | Test connection disabled | BV `missing-credentials`; no provider request |
| Save error | One alert: “Synthetic settings save unavailable. Try again.”; draft Alpha retained, stored Beta unchanged | BV `failed-save`; focus BODY, not treated as usable-focus PASS |
| Retry | Save succeeds, closes; reopen reads Alpha | BV `save-retry-reloaded` |
| Long ID | 230-character catalog ID selectable; short friendly name used in closed control | BV `long-identifier-draft`; long option subtitle visibly ellipsized in second PNG |
| Arbitrary unmatched search | 0 options, Enter does not replace the selected long ID | BV `invalid-search-no-commit`; main malformed/oversized validation remains SO |
| Whole-settings-load rejection, catalog failure, removal, real keychain failure | Not executed | UV runtime; source behavior/test support only |

## D. Nested-overlay matrix and event/focus ledger

There are **26** ledger entries. Parent/child identities are WeakMap numbers, not reused selectors asserted to be identities.

| Transition | Parent / child | Focus | Counts / persistence |
| --- | --- | --- | --- |
| Initial unconfigured | parent 1 / no child | dialog DIV, role=dialog, tabindex=-1 | 1 overlay; Escape count 0 |
| Native Tab wrap | parent 1 / no child | Cancel→API key help; Shift-Tab→Cancel | stays inside parent |
| Trial 0 configured / child open | parent 2 retained / child 3 | dialog remains active immediately after programmatic trigger activation | 2 overlays; automatic child focus is **not** claimed passed |
| Native search pointer, ArrowDown/Home | parent 2 / child 3 | INPUT “Search Model”; active Beta then Alpha, selected Alpha unchanged | 0 saves; exact 3 options; native hit-test proves child paints above parent |
| Trial 0 first Escape | neither remains | Settings button | overlays 2→0; Escape 0→1; no save |
| Trial 0 second Escape | neither remains | Settings button | overlays 0; Escape 1→2; no further dismissal possible |
| Trial 1 open | parent 4 retained / child 5 | dialog initially; native pointer places focus in Search Model | same selection/options/navigation |
| Trial 1 first Escape | neither remains | Settings button | overlays 2→0; Escape 2→3; no save |
| Trial 1 second Escape | neither remains | Settings button | overlays 0; Escape 3→4 |

The critical expected first-Escape state is **child closed, same parent open, focus on model control**. Actual: child overlay/listbox, parent dialog and backdrop all disappear; focus returns to Settings. Second Escape is a no-op because the first already removed the parent. This is not a passing two-level dismissal contract.

The native document-capture ledger saw one Escape targeting “Search Model” with both parent and child present for each first press; it saw no overlays on each second press. Individual dismissal callback delivery is **SO/UV**, not directly instrumented. Source explains the composition: Combobox closes child on React Escape, Modal's document listener closes parent, and Popover's coordinator does not own Modal. Do not infer that both document listeners necessarily executed just because both DOM elements vanished.

The known-defect assertion requires **exactly** `{modal:false,popover:false,overlayCount:0,escapeDelta:1,focus:'Settings'}`. Arbitrary outcomes fail. A future production fix must change that expectation and add positive parent-identity/model-draft preservation and model-trigger focus assertions. Passing characterization keeps **product acceptance FAIL** and disposition **PARTIAL**.

## E. Model selection and persistence matrix

| Action | Draft / stored outcome | Saves |
| --- | --- | --- |
| Navigate Beta then Home | active option changes; selected/stored Alpha unchanged | 0 |
| Select Beta, Cancel, reopen | draft Beta discarded; Alpha read back | 0 |
| Select Beta, Save, reopen | canonical `synthetic/beta` persisted by fixture; modal closes and reload reads Beta | successful save 1 |
| Select Alpha, failing Save | draft Alpha retained; stored Beta unchanged; one alert; focus BODY | failed attempt 2 |
| Retry Save, reopen | canonical `synthetic/alpha` read back | successful save 3 |
| Long model / unmatched Enter / Cancel | draft long ID remains during no-match Enter; no new save | total remains 3 |

Sanitized IPC ledger: **29 calls = 16 get + 10 models + 3 save**; no cancel/provider-test/proposal/secret-removal call. Get includes startup and settings-change refresh consumers, not solely dialog opens. Each Save submitted `apiKey:''`; no secret is retained in measurements. UI save and configuration reload are distinct from selection commit and child dismissal. Navigation and Cancel do not silently persist unrelated state. Fixture model changes deliberately seed configured/unconfigured conditions through the IPC boundary; they are not claimed as user saves.

Disk durability, encrypted credential storage, key removal/migration and real provider model validation remain **SO/UV**, outside this synthetic persistence proof. Existing Ai.test.tsx cases cover hidden saved-key placeholder, missing catalog model preservation, draft Test-versus-Save, removal and canonical model ID; main `ai.test.ts` covers blank-key/model preservation and store recreation. Those named tests supplement, not replace, native evidence and do not prove a real OS keychain here.

## F. Screenshot manifest and chain of custody

All three files were opened **individually at original 1440 × 900** resolution using original-image display. Exactly 3 CAP-29 PNGs; **DPR 1, zoom 1**. SourceHead on measurements/status/index is **f1ca5d6715973ee52f84ad4ad25abcb30dfbca96**. The existing `verifyBatchEvidence` accepted the downloaded exact manifest, PNG headers/dimensions, semantic targets and provenance. `status.json` is success; `batches/index.json` records all 11 discovered batches successful at the same head. This is characterization execution success, not product acceptance.

| File | Positive target x,y,w,h | Individual inspection |
| --- | --- | --- |
| `cap29-dialog-settings-desktop.png` | 270,253.5,900,393 | VV: centered Settings/AI heading, blank password/model, OpenRouter label/privacy copy and disabled Test/Save readable. Cancel distinct. No clipping/secret. Initial focus is dialog, which has no prominent visible ring by its source style. |
| `cap29-nested-settings-options-desktop.png` | 291,485.5,858,182.4375 | VV: placeholder dots only; Alpha selected/checkmarked, Beta and long option readable; long subtitle ellipsized with full DOM/title value. Search and list above modal. Child extends below parent but stays inside viewport; expected portal behavior. |
| `cap29-nested-settings-escape-desktop.png` | 0,40,240,860 | VV: actual failure state, parent and child both absent; Settings trigger has visible yellow focus ring. Positive target is surviving sidebar, not a fabricated modal target. |

No loading/error screenshots were added; those states remain visual UV. Successful workflow does not imply all artifact images were reviewed: only these three new CAP-29 images and the named reused comparison frames are VV here.

## G. Visual Convergence Atlas candidates

### VC29-01 — CONFIRMED_DEFECT, nested Escape removes Settings

- Scope **X01**; owners `AiSettingsModal` → shared `Modal` + `Combobox`/`Popover` event composition.
- Evidence: new options/escape PNGs; `escapeTrials[0..1]`, ledger `before/after-first/second-Escape-*`; reused V-02 Settings/Loki frames.
- Expected child-only dismissal with parent preserved; observed both removed twice, focus Search Model→Settings. **Product acceptance FAIL**.
- Impact high for keyboard dismissal/unsaved work; confidence high for this deterministic Electron path. This revalidates **existing V-02**, not an additional independent defect count.
- Future direction: smallest shared overlay ownership correction; test native first/second Escape, retained parent identity/draft, model focus, reset/presets and nested popovers. Update characterization after production correction; no modal framework rewrite in audit.

### VC29-02 — UNVERIFIED, automatic nested focus under native opening

- Scope **X01**; owners `Combobox` open/search-ref effect and portaled `Popover` mount timing.
- Evidence: `nested-open-0/1` records parent dialog active, not child search, after programmatic control activation. `nested-search-native-focus-*` proves explicit native pointer can focus Search Model; subsequent navigation succeeds. Options screenshot is after this explicit pointer, not proof of automatic focus.
- Expected appropriate child focus on keyboard/native opening is **not certified**; no silent PASS. Impact medium; high confidence recorded focus, limited confidence this represents a normal native trigger opening.
- Future direction: reproduce native mouse and Enter/ArrowDown opening separately before classifying a general product defect; preserve this qualified observation. No extra screenshot required to investigate focus.

### VC29-03 — CONFIRMED_DEFECT in scoped invocation, failed Save loses focus

- Scope **X01**; owners `AiSettingsModal.run` busy/error state and shared `Modal` focus policy.
- Evidence: `failed-save` ledger: same parent identity 8, draft Alpha, single alert, stored Beta, active **BODY**, focusInParent=false. Error visual **UV**, no fourth screenshot. Save was actually focused/activated through the real control; busy disables it, and no focus restoration is observed after the synthetic failure.
- Expected error recovery keeps usable focus in Settings; observed focus leaves the modal. **Product focus acceptance FAIL for this measured synthetic operation**; successful pointer retry does not cure that failure.
- Impact medium keyboard/accessibility; high confidence observed state, medium root-cause/generalization confidence (one controlled failure, not a live keychain error).
- Future direction: reproduce native keyboard Save and delayed IPC rejection, then restore appropriate dialog/error/action focus without losing draft or duplicating alerts. No production fix here.

### VC29-04 — ALREADY_CONVERGED, shared modal and selector chrome

- Scope **X01**; owners shared `Modal`, `FieldChrome`, `Combobox`, `Popover` and Settings content CSS.
- Evidence: all three new PNGs, positive target/stacking assertions, canonical Settings/Loki comparison frames and V-03. The 900px Settings versus 520px connection form width is legitimate content sizing; broad custom/shared backdrop/keyboard differences remain existing V-03.
- Observed common field/search/selected-check presentation and readable desktop framing; no new competing selector shell. **Product visual acceptance PASS for inspected desktop states**, while VC29-01 keyboard composition fails separately.
- Impact low maintenance; confidence high within these frames. Retain shared primitives and source-specific settings content; do not infer full accessibility convergence from common chrome.

## H. CI, acceptance and limits

- **Visual Preview 38814864167: SUCCESS**, both capture and publish. Canonical audit and all existing standalone modules also passed without changes.
- **CI 38814864181:** Unit tests, UI tests, Production build and DuckDB macOS runtime/package **success**. Quality **fails Check formatting**; subsequent lint/CSS/typecheck steps are skipped, not passed. The current inspected Quality log (116696873770 at f1ca5d6) lists 30 inherited files and no CAP-29 module; no inherited file was changed to repair formatting.
- **Documentation 38814864185: SUCCESS**, deployment skipped as expected for PR.
- Relevant existing UI suites passed: `Ai.test.tsx` 58, `Combobox.test.tsx` 14, `Popover.test.tsx` 8; UI run at prior scenario 7370ed4 logged 989 passes and 6 preserved expected failures. Current named suite execution is supported by the successful UI job, not a claim all focus composition was previously tested.
- Local node syntax check passed. Existing standalone loader/evidence/failure tests: **11 passed**; downloaded evidence verified with the existing verifier. **No local linting or formatting**.
- Initial Visual Preview 38813296181 was auto-cancelled before CAP-29. Setup failures below are retained transparently and not accepted as completed standalone evidence.

**Final X01 disposition: PARTIAL.** The primary nested-Escape acceptance fails reproducibly. Error-recovery focus also fails in the recorded synthetic invocation; native opening autofocus remains qualified/UV. Configured/unconfigured visuals, bounded selector/navigation and synthetic save/cancel/reload/error behavior have the specific VV/BV evidence above. No `EVIDENCE_COMPLETE` claim.

Remaining gaps: native keyboard/mouse trigger opening autofocus, internal dismissal-callback delivery, screen readers/IME, backdrop click and full nested Tab traversal, whole-settings loading rejection/catalog errors, real provider authentication/model discovery, actual key removal, disk restart persistence and OS encryption/migration. These gaps are not hidden behind workflow success. No production correction, merge, integration-branch write, shared harness/fixture/workflow change, central-register edit, CAP-30, Phase 2 or final Atlas.

## Reused V-02 / V-03 comparison evidence

Artifact **12009961710**, run **38813431959**, canonical measurements sourceHead **44abaa263eaec1e8add2a1cfd47365f5ce4fcc34**, was downloaded and extracted. The following pre-existing canonical images were individually opened at original **1440 × 900** resolution: `dialog-settings-desktop.png`, `nested-settings-options-desktop.png`, `nested-settings-escape-desktop.png`, `nested-loki-options-desktop.png`, `nested-loki-escape-desktop.png`. These are accepted comparison evidence from a successful canonical audit step, despite the later CAP-29 Tab-assertion failure. They are not passed off as completed standalone CAP-29 evidence.

Settings uses a centered 900 × 393 px shared modal with a 72% dark/2px blurred backdrop. The Loki custom form is 520 × 529.4375 px with a 55% unblurred backdrop. Different content widths are intentional; broad custom/shared keyboard differences remain V-03. The canonical nested-overlay ledger records childClosed=true for both, parentRemains=true for Loki and false for Settings. The inspected Loki post-Escape frame retains its form and visibly focuses its datasource trigger; the Settings post-Escape frame shows the workspace and Settings trigger focus. These corroborate existing V-02 rather than establish a new independent defect count.

Visual judgment: Settings labels/actions/privacy copy fit without clipping in this desktop state. Its unconfigured model placeholder, disabled Test/Save and usable Cancel are apparent. The nested search/list shell matches the shared Loki selector chrome, but its modal ownership differs. Neither canonical configured credentials nor model persistence is claimed from these images.

### Scenario setup failures, not accepted standalone evidence

- Run 38813431959 / source 44abaa2 / partial artifact 12009961710: first screenshot generated, then the audit incorrectly expected forward Tab to land on the password input. The real first focusable control is the field's `API key help` button. Correction checks actual first-control identity and preserves reverse Tab to Cancel.
- Run 38814162077 / source 7370ed4 / partial artifact 12009573192: both boundary Tab assertions passed, with native forward focus on API key help and reverse focus on Cancel. The scenario then timed out on its assumed immediate search-input focus. The next revision records automatic focus without manufacturing a pass, and uses a native pointer to the search input before the keyboard test. These partial runs do not establish completed CAP-29 acceptance.
