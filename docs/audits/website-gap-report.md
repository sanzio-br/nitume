# Website gap report (signed-in app parity, issues #5–#18)

- Surface: `apps/website` (Angular 22, standalone components, signals, Vitest through `@angular/build:unit-test`).
- Authority to build: **BOARD row W-Q0** (owner, 2026-10-28, given in conversation; recorded by the orchestrator on branch `docs/board-website-parity`, commit `44eaa7a`). The owner's words:

  > "lets create every feature that is present in the runner and customer app to be present website create issues on github and start working on them"

  This is the website equivalent of BOARD row 84 for admin. `web-parity` may build **only** the items recorded in this report, each tagged **approved extension, W-Q0**. Anything not listed here is out of scope until a later section of this report adds it.
- **This report is cumulative.** It holds one section per GitHub issue, #5 to #18, added as each issue's web spec is written. A new issue adds a new section; earlier sections are kept and updated in place at re-audit (verdict and findings). Item ids carry the issue number (`G5-n` for #5, `G6-n` for #6, and so on) so they stay unique across sections.
- Common rules for every section: the public marketing pages and their styles stay unchanged; colours only through the `--nitume-*` token layer; Fira Sans for UI text and Fira Code for numeric data only; six category display names; task states exactly as `Nitume_System_Design.md` §3.3; no wallet/escrow wording; the three payment flows stay separate.
- Paths below are relative to `apps/website/` unless they start with `docs/`, `apps/api/`, `packages/` or `.gitignore` (repo root).
- Re-audit command (every section): `cd apps/website && npx ng test --watch=false` (0 failures) and `npx ng build` (succeeds, marketing budget unchanged).

---

## Issue #5 — ui-kit

- Spec: `docs/specs/website/ui-kit.md` (commit `250940e`, branch `feat/website-ui-kit`). Section numbers below (§n) refer to that spec.
- Baseline audited: `apps/website` on `feat/website-ui-kit` at `bca50c2` (website code identical to `main` `8df4356`; only docs changed on this branch).
- Builder: `web-parity`, branch `feat/website-ui-kit`, commit scope `angular-website`.
- Every item G5-1 … G5-41 is **approved extension, W-Q0**.

### Verdict: PASS (re-audit 2, 2026-10-28, `feat/website-ui-kit` at `8d9c7e9`)

Both re-audit 1 findings are closed. All 41 items pass. Only `apps/website/src/app/core/realtime/realtime.service{,.spec}.ts` and `apps/website/src/app/shared/map/live-map.component{,.spec}.ts` changed after `9bd8c16`, in two commits:
- `376199d` fix(angular-website): showReconnecting counts only while trying and is removed with its caller (G5-30)
- `8d9c7e9` fix(angular-website): centre a single map point at zoom 15 like Flutter cameraFor (G5-32)

**Build health (re-run by the auditor)**

```
$ cd apps/website && npx ng test --watch=false
 Test Files  14 passed (14)
      Tests  73 passed (73)
exit 0
$ npx ng build
main-OU62VUCR.js      | main          | 311.62 kB
polyfills-5CFQRCPP.js | polyfills     |  34.59 kB
styles-3NFIVCKS.css   | styles        |   4.71 kB
                      | Initial total | 350.92 kB
$ npx tsc -p tsconfig.app.json --noEmit && npx tsc -p tsconfig.spec.json --noEmit -> clean
```

There are 73 tests: the 68 numbered §12 cases, the new `58 (stub provider)` case, 2 existing app cases and 2 extras. Each numbered case 1–68 still appears exactly once. The bundle is identical to re-audit 1.

**Finding 1 (G5-30): closed.**
- `realtime.service.ts` `showReconnecting(delayMs, destroyRef?)` now counts only `connecting`/`reconnecting`. On `connected` or `disconnected` it clears the timer and sets false. This matches corrected spec §6.3 / §6.6 and Flutter `jobs_tab.dart:178-194`.
- The listener and timer are removed through the given `DestroyRef`, or else through the caller's injection-context `DestroyRef`.
- Test 58 covers:
  - never connected: no notice after 10 s
  - a 5 s reconnect: shown
  - `connected`: hidden again
  - a short blip: never shown
  - `disconnect()` while shown: hidden at once and stays hidden
  - a destroyed component caller: its signal never turns true, while a live listener still works
  - an explicit `DestroyRef`
  - `RECONNECTING_COPY` is the single U+2026 character
- The new `58 (stub provider)` case checks that the #5 stub ends `disconnected`, opens no socket and never shows the notice.

**Builder caveat: called outside an injection context with no `DestroyRef`.** **Accepted, not a FAIL.** In that case the listener is never removed and nothing reports it. It is still acceptable for four reasons:
- (a) The contract in spec §6.3 is met for both supported call paths, and the JSDoc on the method states how to call it.
- (b) The only planned callers are the views in #9 (customer `v-track`) and #14 (runner `v-jobs`). Both read a connection signal for a template, which is naturally a field initializer (an injection context).
- (c) What leaks is one closure and at most one 5 s timer per misplaced call. There is no socket, subscription or DOM leak, and the visible behaviour is unchanged.
- (d) Throwing in dev would be stricter, but the spec does not require it.

Carried forward to the #9 and #14 view audits: they check that `showReconnecting` is called in a field initializer or constructor, or with an explicit `DestroyRef`. A call from `ngOnInit`, an effect or an event handler without a `DestroyRef` is a FAIL there. Optional hardening for a later kit change (not required): `isDevMode()` warning when neither a `DestroyRef` nor an injection context is found.

**Finding 2 (G5-32): closed.** `live-map.component.ts:35` sets `SINGLE_POINT_ZOOM = 15`. `BASE_OPTIONS.zoom` stays 14 for the initial camera, as in Flutter `google_tracking_map.dart:216` and `:282`. Test 63 asserts `setZoom(15)` for a single point and `options.zoom === 14`.

Item table update: **G5-30 PASS**, **G5-32 PASS**, all other items unchanged (PASS). The re-audit 1 record follows.

### Re-audit 1 (2026-10-28, at `6e6c053`): FAIL, 2 minor findings, both from spec defects (closed at re-audit 2)

Re-audit 1 of `feat/website-ui-kit` at `6e6c053` (18 `web-parity` commits `bb9ace9` … `6e6c053` on top of `3e6c7c9`). 39 of 41 items pass. G5-30 and G5-32 fail on one point each. In both cases the builder followed the spec as written, but the spec contradicted the Flutter source it ports. The spec is corrected in `ebd1325` (`docs(specs): ui-kit single-point zoom 15 and showReconnecting only while trying (Flutter parity)`). Both fixes are small and need no new widget, endpoint or owner decision.

**FAIL list (back to `web-parity`)**

1. **G5-30 `showReconnecting` counts `disconnected` as reconnecting** (minor). File: `apps/website/src/app/core/realtime/realtime.service.ts:186-205`.
   - Design (spec §6.3 / §6.6 as corrected; Flutter `apps/runner_app/lib/src/screens/jobs/jobs_tab.dart:178-194` `_syncReconnecting`): the signal turns true only after `delayMs` of **trying**, meaning `connecting` or `reconnecting`. `connected` **and** `disconnected` hide it and reset the timer. A deliberate `disconnected` (before `connect()`, after log out, or the #5 stub provider returning `null`) never shows `Reconnecting…`. The customer app shows its line only for `reconnecting` (`live_updates.dart:53-55`).
   - Code: `onState` treats every state except `connected` as down, and it runs once at once for the current state. So `showReconnecting(5000)` turns true 5 s after creation while the service is `disconnected`. That happens on every page until #6 replaces the stub, and after every log out. It then stays true, because `disconnected` never clears it. The view would show `Reconnecting…` when nothing is reconnecting. The service also adds one listener to the root service on every call and never removes it, so views that call it per instance leak listeners.
   - Fix: count only `connecting`/`reconnecting`. On `connected` **or** `disconnected`, clear the timer and set false. Remove the listener when the caller's `DestroyRef` fires (`inject(DestroyRef, { optional: true })` inside the call, or take a `DestroyRef` argument). Extend test **58** with: false and no timer while `disconnected` before `connect()`; false again right after `disconnect()` while visible; stub provider (`null`) never shows it. Use `RECONNECTING_COPY` in the test instead of the literal.
2. **G5-32 single-point camera zoom is 14, Flutter uses 15** (minor). File: `apps/website/src/app/shared/map/live-map.component.ts:34` (`SINGLE_POINT_ZOOM = 14`); test `live-map.component.spec.ts:279`.
   - Design (spec §7.3 / test 63 as corrected; Flutter `packages/nitume_core/lib/src/widgets/google_tracking_map.dart:276-283` `cameraFor`): one point (or all points equal) → centre at **zoom 15**. The initial camera before any fit stays zoom 14 (`google_tracking_map.dart:216`), which `BASE_OPTIONS.zoom: 14` already matches.
   - Code: the single-point fit uses 14, because the original spec said 14.
   - Fix: `SINGLE_POINT_ZOOM = 15`. Test 63 asserts `setZoom(15)` for a single point and keeps `zoom: 14` in the map options.

Everything else is closed. The evidence is under "Re-audit 1 evidence" below.

### Baseline (before the build, 2026-10-28, at `bca50c2`)

The website had only marketing code. None of the kit existed: no `src/styles/` folder, no `--nitume-*` tokens, no `nm-` components, no `shared/{ui,status,format,map}/`, no `core/realtime/`, no `socket.io-client` or `@angular/google-maps` dependency, no `mapsApiKey`, no Fira Code 700, and no kit tests.

### Re-audit 1 evidence (`feat/website-ui-kit` at `6e6c053`, worktree `nitume-feat-website-ui-kit`)

**Build health (run by the auditor)**

```
$ cd apps/website && npx ng test --watch=false
 Test Files  14 passed (14)
      Tests  72 passed (72)
exit 0

$ npx ng build
Initial chunk files   | Names         |  Raw size | Estimated transfer size
main-OU62VUCR.js      | main          | 311.62 kB |                81.83 kB
polyfills-5CFQRCPP.js | polyfills     |  34.59 kB |                11.33 kB
styles-3NFIVCKS.css   | styles        |   4.71 kB |                 1.26 kB
                      | Initial total | 350.92 kB |                94.43 kB

$ npx tsc -p tsconfig.app.json --noEmit   -> clean
$ npx tsc -p tsconfig.spec.json --noEmit  -> clean
```

Baseline `main` (`8df4356`) builds to an initial total of 350.09 kB (`main` 311.61 kB, `styles` 3.89 kB). The difference of +0.83 kB is the `:root` token block in `styles` (+0.82 kB) and `mapsApiKey` (+0.01 kB). The kit components, `socket.io-client` and `@angular/google-maps` are tree-shaken until #6 routes use them. The 500 kB warning and 1 MB error budgets are unchanged.

**Test count (69 vs 68).** Both counts are right, and no case is missing. §12 numbers 69 items. Items 1–68 are Vitest cases, and item 69 (§12.12, build health) is the `ng test` + `ng build` run above, not an `it(...)`. The G5-40 text already said "every numbered case 1–68 is its own `it(...)`". Only the heading "69 cases" was loose, and it is corrected below. The auditor's grep finds exactly one `it('N. …')` for each N = 1…68, with no duplicates and no `.skip`/`.only`/`.todo`/`xit`. The 72 tests are those 68, the 2 existing `app.spec.ts` cases, and 2 extras (`field.spec.ts:164` nm-form-card, `overlay.spec.ts:262` overlay content gets ref and data).

**Correction to the G5-3 grep (auditor error).** The G5-3 evidence command searched all of `src/app/shared` and `src/app/core`. That includes the unchanged marketing components (`shared/footer`, `shared/header`, …), which set `font-size`/`font-family` themselves. The kit is not responsible for those hits. The command is now scoped to kit paths, as the G5-4 and G5-6 scans already were:
`rg -n "font-(size|family)\s*:" apps/website/src/app/shared/{ui,status,format,map} apps/website/src/app/core/realtime` returns **no hits**. All font sizes come through `nm-type(...)` in `_tokens.scss`. A few components pass a size or weight override to the mixin where the Flutter widget sits between two named styles (nm-tag 11/600, compact chip 11/700, step-card title 13/600, timeline title 12.5/400, ETA chip Code 11.5/700, money/phone Code 14.5/400). These match spec §4 and are not literals in component CSS.

**Marketing unchanged.** `git diff --name-only main...HEAD` outside the kit folders lists only `.gitignore`, `angular.json`, `package.json`, `package-lock.json`, `src/environments/{environment.ts, environment.local.example.ts}`, `src/index.html`, `src/styles.scss`, `src/styles/{_tokens.scss, tokens.spec.ts}`, `src/testing/{css.ts, node-shim.d.ts}`, `tsconfig.app.json` and docs. None of `src/app/pages/**`, `src/app/shared/{header,footer,category-card,profile-card,proof-item,ticket}/**` or `app.routes.ts` changed.
- `styles.scss`: one added first line, `@use 'styles/tokens';`. Test 3 also checks that the marketing `--blue` … `--r-l: 22px` values are unchanged.
- `index.html:13`: `Fira+Code:wght@400;500;600` → `400;500;600;700`. Nothing else changed.
- `.gitignore:19`: `apps/website/src/environments/*.local.ts` is added. The old line 18 stays. `git check-ignore -v …/environment.local.ts` reports line 19, and `environment.local.example.ts` is not ignored.
- `angular.json`: adds only `build.configurations.local` (development options + `fileReplacements` environment.ts → environment.local.ts) and `serve.configurations.local`. Budgets and the other configurations are unchanged.
- `package.json`: `@angular/google-maps ^22.1.0` and `socket.io-client ^4.8.4` go in dependencies, and `@types/google.maps ^3.66.8` in devDependencies (plus a trailing newline). The lockfile adds only those packages and their transitive deps (`engine.io-client`, `engine.io-parser`, `socket.io-parser`, `@socket.io/component-emitter`, `ws`, `xmlhttprequest-ssl`). `npm ls` resolves all three.

**Scans (kit paths = `apps/website/src/app/shared/{ui,status,format,map}`, `apps/website/src/app/core/realtime`)**

| Check | Result |
|---|---|
| G5-6 raw colour / shadow / named colour | no hits |
| Checklist 2, `Color\(0x\|#[0-9A-Fa-f]{6}` under `src/app` minus marketing | no hits |
| G5-4 unprefixed marketing variables | no hits |
| G5-3 font literals (scoped, see correction) | no hits |
| G5-9 `neutral` / admin labels in `src/app/shared` | no hits |
| G5-24 `.num` class / `font-family` in kit | no hits |
| G5-25 `KES` | no hits |
| G5-27 `AuthStore` / `localStorage` in `core/realtime` | no hits |
| G5-29 event-name literals outside `realtime.events.ts` and specs | no hits. The 16 names in `realtime.events.ts` equal the set in `apps/api/src/realtime/*.ts` |
| G5-38 bare `outline: none/0` | no hits |
| G5-39 `wallet` / `escrow` | no hits |
| G5-37 `OnPush` | every kit `@Component` (21, including the `nmNum` attribute component) is `OnPush` with signal inputs. Only spec-file test hosts are not |
| G5-34 key | `git grep -nE "AIza[0-9A-Za-z_-]{20,}" feat/website-ui-kit` and the commit messages return nothing. `git ls-files apps/website/src/environments` = `environment.local.example.ts`, `environment.ts` |

**Builder's declared deviations**

| # | Deviation | Verdict | Reason |
|---|---|---|---|
| D1 | `joinErrand` keeps the room on ack timeout | **PASS** | Matches spec §6.3 ("false (room kept for re-join)") and G5-29 ("10s ack timeout → `false`, room kept"). A refused ack forgets the room (test 50) |
| D2 | Single-point zoom 14 (spec) vs Flutter 15 | **FAIL** (finding 2) | The builder matched the spec. The spec was wrong against `cameraFor` and is corrected to 15 |
| D3 | `nmNum` as an attribute component (`selector: '[nmNum]'`) | **PASS** | Same selector and API as §5.1 (`<span nmNum>`, `[nmNum]="'meta'"`, `nmNumLabel`). A directive cannot carry the component stylesheet that applies the `nm-type` mixins, and the alternative would be global CSS classes. Limit to note for views: it cannot sit on an element that already hosts a component (use a wrapping `<span nmNum>`) |
| D4 | Hover only under `(hover: hover)` | **PASS** | Web adaptation within §8. Hover appears only where defined (buttons, clickable card border), and there is no sticky hover on touch |
| D5 | Pipes render `—` for `null`/`undefined` | **PASS** | §5.2 copy rule "`—` for a missing value" (Flutter `kMissingValue`). `kesSpoken` returns `''` (an aria label, not visible copy) |
| D6 | `showReconnecting` counts the starting `disconnected` state | **FAIL** (finding 1) | It matched the spec's loose wording "non-connected", but Flutter shows the notice only while trying. The spec is corrected |
| D7 | Test 18 Space key simulated via `click()` | **PASS** | The control is a focusable native `<input type="checkbox">`, so the browser maps Space to activation (click). jsdom has no keyboard activation. The test asserts the native type, focus and the 48×48 input before clicking |
| D8 | `src/testing/` excluded from `tsconfig.app.json` | **PASS** | Spec-only helpers (`css.ts`, Node typings shim) stay out of the app compile. The app `tsc` and build are clean |
| D9 | `@types/google.maps` devDependency | **PASS** | Allowed by G5-36 ("if the build needs it"). It is also a peer of `@angular/google-maps` (deduped) |
| D10 | `src/styles/tokens.spec.ts` outside `src/app/` | **PASS** | It holds the reference hex table for test 1, which test 2 forbids under `src/app/`. The test runner picks it up (14 files) |
| D11 | Task refs written `#NT-10482` in specs | **PASS** | That is the real reference format (§2.4, §5.2 copy rule, OA), not a workaround. A bare `#10482` would also be wrong copy |

**Item verdicts**

| Item | Verdict | Evidence |
|---|---|---|
| G5-1 tokens file + `@use` | PASS | `src/styles/_tokens.scss`. `styles.scss` line 1. Tests 1, 3 |
| G5-2 16 colour tokens | PASS | Values verbatim. Test 1 compiles the SCSS and asserts exactly these 16 colour names |
| G5-3 families + 29 type mixins | PASS | `$nm-type-styles` has all 29 rows with line-height 1.4/1.3. Scoped grep has no hits (see correction) |
| G5-4 spacing + radius | PASS | `--nitume-r-l: 20px`, `--nitume-tap: 48px`. No unprefixed vars in the kit |
| G5-5 breakpoints + mixins | PASS | `$nm-bp-*`, `nm-up`, `nm-type`, `nm-hit-area`, `nm-focus-ring` (+ `nm-hover`, `nm-reduced-motion`). Used by button small, checkbox, field. Tests 6, 18, 22 |
| G5-6 no raw colour / shadow | PASS | Test 2 + scoped scan |
| G5-7 Fira Code 700 | PASS | One-token change on `index.html:13` |
| G5-8 `nm-button` | PASS | Five variants, destructive on outline/text only with a dev warning on fills, small with a 48 hit area, disabled, loading (`aria-busy`, label kept at `opacity:0` so width and name stay), `href` → `<a>`, `type="button"`. Tests 4–9 |
| G5-9 `nm-status-chip` | PASS | Row 33 blue label, tone dot, three sizes, `numericSuffix` in `nmNum`, `customerStatus`/`runnerStatus` inputs. Tests 10, 11, 13–16 |
| G5-10 `nm-tag` | PASS | Blue on blue-050, 11/600, 6px 11px. Test 17 |
| G5-11 `ErrandStatus` + customer map | PASS | 17 states in §3.3 order, exhaustive `never` switch, `parseErrandStatus` → `null`. Tests 10, 12, 16 |
| G5-12 `runnerStatus` | PASS | Every row as §4.2.4. Test 11 |
| G5-13 `nm-checkbox` | PASS | Test 18 (D7) |
| G5-14 list group + item | PASS | Tests 19, 20 |
| G5-15 `nm-step-card` | PASS | Test 21 |
| G5-16 card + section label | PASS | Tests 22, 23 |
| G5-17 field + form card | PASS | Real `<label for>`, error a11y, multiline 3→6, money `KSh ` prefix digits-only, phone tel, counter, CVA. Tests 24–28 |
| G5-18 timeline | PASS | Test 29 |
| G5-19 states + `friendlyError` | PASS | Tests 30–33 |
| G5-20 dialog + `confirm()` | PASS | 335px at every width, outline confirm first / primary cancel second, inert, scroll lock, focus in/trap/return. Tests 34–36 |
| G5-21 panel | PASS | Bottom sheet below 768px, centred max 560px from 768px (WQ-3), handle `aria-hidden`, safe area. Test 37 |
| G5-22 toast | PASS | Test 38 |
| G5-23 notice | PASS | Test 39 |
| G5-24 `nmNum` | PASS | Test 43 (D3) |
| G5-25 formatters + pipes | PASS | Every §5.2 vector asserted. EAT uses `getTime()+3h` and `getUTC*`. Test 41 also runs under New York, Nairobi and Tokyo. Tests 40–42 (D5) |
| G5-26 `categoryName` | PASS | Test 44 |
| G5-27 connection + token stub | PASS | Origin via `new URL(apiBaseUrl).origin`, `/socket.io`, websocket, `reconnection:false`. The stub provider returns `null` and never opens a socket. Tests 45, 48 |
| G5-28 lifecycle + backoff | PASS | Tests 46–48, 55–57 |
| G5-29 API + 16 events | PASS | Tests 49–54 (D1) |
| G5-30 `showReconnecting` | **FAIL** at re-audit 1 → **PASS** at re-audit 2 | Finding 1, fixed in `376199d` |
| G5-31 `MapsLoaderService` | PASS | Empty key → `unavailable` with no `<script>`. `loading=async`, no `libraries=`. Test 66 |
| G5-32 `nm-live-map` | **FAIL** at re-audit 1 → **PASS** at re-audit 2 | Finding 2, fixed in `8d9c7e9` (everything else passes: map once, glide, mid-glide restart, `null` removal, self route, reduced motion, colours from tokens; tests 59–65, 67, 68) |
| G5-33 placeholder | PASS | Blue-050, `role="img"` + label, ETA and overlay still shown, and the same on script error. Test 66 |
| G5-34 key config | PASS | `mapsApiKey: ''`, example file, `local` build/serve configs, no key anywhere |
| G5-35 `.gitignore` | PASS | Line 19 |
| G5-36 deps | PASS | See "Marketing unchanged" (D9) |
| G5-37 layout + marketing untouched | PASS | Folders as §11 plus `ui/index.ts` and `status/index.ts` barrels. No gallery route |
| G5-38 responsive + a11y | PASS | No bare outline removal. Hit areas through `--nitume-tap`. Safe-area insets on dialog, panel and toast. Motion (150 ms fades, spinner, glide) off under reduced motion. Tests 6, 18, 34, 37, 38, 67 |
| G5-39 domain rules | PASS | Six names, five for customers, exhaustive maps, no wallet/escrow, no money-flow component |
| G5-40 Vitest cases | PASS | 1–68 present once each (see test count) |
| G5-41 build health | PASS | Output above. 18 conventional commits with scope `angular-website` (`build`/`feat`). `angular.json` changes only `local` |

Open owner questions WQ-2, WQ-4, WQ-5, WQ-6 and WQ-8 are not decided in code beyond the spec defaults (checklist 3). WQ-1 is still open, so the map shows the placeholder.

### Owner decisions that apply to this section (GitHub #5 comment, owner, 2026-10-28)

| Id | Decision | Where it lands |
|---|---|---|
| WQ-7 | **Approved.** Add the Fira Code 700 weight to the existing Google Fonts link. | G5-7 |
| WQ-3 | **Approved as proposed.** From 768px wide, bottom sheets become a centred panel (max-width 560px). Dialogs stay at 335px. | G5-20, G5-21 |
| WQ-1 | **Still with the owner** (Maps browser key). `LiveMapComponent` shows its no-key placeholder until a key is configured locally. No key goes into source, tests, docs or commits. | G5-33, G5-34 |

Still open, and the builder uses the spec default without deciding anything beyond it: WQ-2 (customer times: local for activity, EAT for deadlines, G5-25), WQ-4 (no web push; the kit has nothing for it), WQ-5 (marketing drift is left untouched, G5-1), WQ-6 (issue #15, nothing in the kit), WQ-8 (token storage; the kit reads tokens only through `REALTIME_TOKEN_PROVIDER`, G5-27).

### Current-state evidence (baseline)

| Fact | Evidence |
|---|---|
| No token layer | `src/styles/` does not exist. `src/styles.scss:1-30` declares only unprefixed `--blue` … `--r-l: 22px` (marketing). The header comment on line 2 says "mirrors admin --nitume-* tokens", but no `--nitume-*` property exists |
| No kit components | `src/app/shared/` has only `category-card`, `footer`, `header`, `profile-card`, `proof-item`, `ticket` |
| No realtime/map | `src/app/core/` has only `api-types.ts`, `auth/`, `services/` |
| Fira Code 700 missing | `src/index.html:13` `family=Fira+Code:wght@400;500;600` |
| No maps key config | `src/environments/environment.ts` has `{ apiBaseUrl }` only; there is no `environment.local*.ts`; `angular.json` has no `fileReplacements` and no `local` configuration (line 33, `configurations` only has `production`/`development`) |
| Wrong ignore path | `.gitignore:18` `web/environments/*.local.ts` (that path does not exist) |
| Deps missing | `package.json` dependencies: `@angular/{common,compiler,core,forms,platform-browser,router}`, `rxjs`, `tslib`, `zone.js` only |
| Existing raw colours | 41 matches of `/#[0-9a-fA-F]{3,8}\b\|rgba?\(\|box-shadow/` under `src/app/`, all in marketing files (`shared/{header,ticket,profile-card,category-card}`, `pages/*`). Marketing is excluded from the kit's static check (§12 test 2) and must not be changed |

### Items

Each item gives: **severity**, **current** state in `apps/website`, **target** (spec §), **evidence at re-audit** (what the auditor checks, including the §12 test numbers that must exist and pass as separate `it(...)` cases).

#### A. Token layer

**G5-1 `_tokens.scss` file and wiring** (blocker, missing)
- Current: no `src/styles/_tokens.scss`; `src/styles.scss` has no `@use`.
- Target: §2.1. New `src/styles/_tokens.scss` is the only file in the signed-in app that holds a hex or `rgba()` value. `src/styles.scss` gains `@use 'styles/tokens';` as its **first line** and nothing else changes in it (marketing `--blue` … `--r-l: 22px`, `.btn`, `.card`, `.input`, `.check`, `.num`, `:focus-visible` all stay as they are; WQ-5 open).
- Evidence: `git diff main -- apps/website/src/styles.scss` shows the single added `@use` line. Tests §12 **1** and **3**.

**G5-2 Colour tokens** (blocker, missing)
- Current: none (`--nitume-*` absent).
- Target: §2.2. Exactly 16 properties: `--nitume-blue #0B2545`, `-white #FFFFFF`, `-slate #F4F6F9`, `-green #04AF4D`, `-blue-700 #08192F`, `-blue-050 #E9EDF3`, `-slate-line #E2E7EF`, `-slate-600 #5C6B85`, `-slate-400 #8C97AC`, `-green-050 #E3F8EA`, `-green-700 #038A3D`, `-amber #B8860B`, `-amber-050 #FBF3E1`, `-red #C1433C`, `-red-050 #FBEAE9`, `--nitume-scrim rgba(11, 37, 69, 0.5)`. No other colour token: no neutral and no grey.
- Evidence: values compared verbatim in test §12 **1**; `rg -n "\-\-nitume-[a-z0-9-]+:" apps/website/src/styles/_tokens.scss` lists exactly these colour names.

**G5-3 Type families and type-style mixins** (blocker, missing)
- Current: none. Fonts are set only by marketing rules.
- Target: §2.3 `--nitume-font-ui`, `--nitume-font-num`. §2.4 mixin `nm-type($name)` with all 29 styles (`h1` … `num-progress`), with the family, size, weight, colour and letter-spacing in the table. Line-height is 1.4 for Sans and 1.3 for Code. Components never set `font-size`/`font-family` literals.
- Evidence: test §12 **1** (families); `rg -n "font-(size|family)\s*:" apps/website/src/app/shared/{ui,status,format,map} apps/website/src/app/core/realtime` returns no hits (scope corrected at re-audit 1: the earlier unscoped command also matched the unchanged marketing components); each component test that checks a type style (tests 6, 19, 26, 29, 43, 65) passes.

**G5-4 Spacing and radius tokens** (blocker, missing)
- Current: marketing only has `--r-s 8px`, `--r-m 14px`, `--r-l 22px` (`styles.scss:27-29`). The design system says 20px for `--r-l`.
- Target: §2.5 `--nitume-space-{xs 4, sm 8, md 16, lg 24, xl 32, screen 20}px`, `--nitume-tap 48px`. §2.6 `--nitume-r-s 8px`, `--nitume-r-m 14px`, `--nitume-r-l 20px`, `--nitume-r-pill 999px`. Kit components never read the unprefixed marketing variables. Component-internal paddings that are off this scale stay as literal `px` values (allowed).
- Evidence: test §12 **1**; `rg -n "var\(--(r-|blue|green|slate|white|amber|red)" apps/website/src/app/shared/{ui,status,format,map} apps/website/src/app/core/realtime` returns no hits.

**G5-5 Breakpoints and helper mixins** (blocker, missing)
- Current: none.
- Target: §2.7 `$nm-bp-min 360px`, `$nm-bp-md 768px`, `$nm-bp-lg 1024px`, `$nm-bp-xl 1280px`, `--nitume-content-max 1180px`; mixins `nm-up($bp)`, `nm-type($name)`, `nm-hit-area` (48×48 via `::before`), `nm-focus-ring` (2px `--nitume-green` outline, offset 2px; 1px on fields).
- Evidence: the mixins exist in `_tokens.scss` and are used by `nm-button` (small), `nm-checkbox` and `nm-field`; tests §12 **6**, **18**, **22**.

**G5-6 No raw colour and no shadow in app code** (blocker, missing guard)
- Current: no guard exists. The 41 existing hits are marketing-only (see baseline).
- Target: §2.1, §9. No hex, `rgb()`/`rgba()`, `hsl()`/`hsla()`, named colour or `box-shadow` in any file under `src/app/` except marketing paths listed in §1. Marker SVG colours are read at runtime from the custom properties (G5-32).
- Evidence: test §12 **2** (Vitest globs `src/app/`, excludes marketing by path) passes; auditor runs `rg -n "#[0-9A-Fa-f]{3,8}\b|rgba?\(|hsla?\(|box-shadow|\b(white|black)\b\s*;" apps/website/src/app/shared/{ui,status,format,map} apps/website/src/app/core/realtime` and expects no hits.

**G5-7 Fira Code 700 font weight (WQ-7, owner approved)** (blocker, missing)
- Current: `src/index.html:13` loads `Fira+Code:wght@400;500;600`.
- Target: §1 fonts row, WQ-7. The same link becomes `Fira+Code:wght@400;500;600;700`. No other change to the link: Fira Sans stays `400;500;600;700`, `display=swap`, no second `<link>`.
- Evidence: `git diff main -- apps/website/src/index.html` is a one-token change on line 13.

#### B. Components

**G5-8 `nm-button`** (blocker, missing)
- Current: only the global marketing `.btn`, `.btn-primary`, `.btn-outline` (`styles.scss`). There is no secondary, text, link, destructive, loading or small variant.
- Target: §4.1. Variants `primary | secondary | outline | text | link` with the fill/label/border/hover table. `destructive` applies to outline and text only (red label); on fills it is ignored with a dev-mode warning; there is no red fill. Sizes regular (12px 22px, min-height 48) and small (9px 16px, `button-sm`, 48px hit area). Disabled, loading (spinner, `aria-busy`, width kept), `href` renders `<a>`, `type` defaults to `button`, leading icon slot, `nm-focus-ring`. Does not use the marketing `.btn` classes.
- Evidence: tests §12 **4, 5, 6, 7, 8, 9**.

**G5-9 `nm-status-chip`** (blocker, missing)
- Current: only the marketing `.tag-chip` and `.status-pill` (always amber, animated). Neither may be reused.
- Target: §4.2.1. Inputs `label`, `tone (success|info|pending|danger)`, `size (regular|compact|tag)`, `showDot`, `numericSuffix` (after ` · `, in `nmNum`). Convenience inputs `customerStatus` and `runnerStatus` + `offerAccepted`; renders nothing when the map returns `null`. Row 33 high contrast: the label is blue on every tint and only the dot carries the tone colour. Sizes and paddings as the table. `<span>`, not interactive, dot `aria-hidden`. Does not copy the admin `status-chip` (it has a `neutral` tone and admin labels).
- Evidence: tests §12 **10** (render half), **11** (render half), **13, 14, 15, 16**; `rg -n "neutral|'Assigned'|'Settled'|'Confirmed'" apps/website/src/app/shared` returns no hits.

**G5-10 `nm-tag`** (blocker, missing)
- Target: §4.2.2. Blue text on blue-050, pill, no dot, 11/600, padding 6px 11px, never green, not focusable.
- Evidence: test §12 **17**.

**G5-11 `ErrandStatus`, `customerStatus()`, `customerTimelineTitle()`** (blocker, missing)
- Current: no state type on the website (`core/api-types.ts` covers OTP only).
- Target: §4.2.3, §4.2.5. File `src/app/shared/status/status-presentation.ts`. `ErrandStatus` is a union of the 17 §3.3 wire values in order, plus `ERRAND_STATUSES`. The customer table covers all 17 states (for example `RUNNER_ASSIGNED` → `Finding a runner` info, `RUNNER_EN_ROUTE` → `En route` pending, `CANCELLED` → danger, `EXPIRED` → info, `CONFIRMED`/`SETTLED` → `Completed`). Exhaustive `switch` with `const _: never`. A parser returns `null` for unknown wire strings. `customerTimelineTitle`: `RUNNER_ASSIGNED` → `null`, `RUNNER_EN_ROUTE` → `Runner assigned`, otherwise the label.
- Evidence: tests §12 **10** (all 17 rows), **12**, **16**.

**G5-12 `runnerStatus()`** (blocker, missing)
- Target: §4.2.4. All 17 states. `DRAFT`, `REQUESTED`, `QUOTED`, `ACCEPTED` → `null`. `PAYMENT_CONFIRMED` → `New offer`. `RUNNER_ASSIGNED` → `New offer` (`offerAccepted: false`) or `Accepted` (default `true`). `RUNNER_EN_ROUTE` → `On the way` (pending). `AWAITING_CUSTOMER` → `Waiting for the customer`. `SETTLED` → `Paid`. The remaining states use the shared labels. No admin labels.
- Evidence: test §12 **11** (17 states + `offerAccepted: false`).

**G5-13 `nm-checkbox`** (blocker, missing)
- Current: only the marketing `.check` (18px green box). It does not match the design system and must not be reused.
- Target: §4.3.1. 22px box, radius 6px, 2px slate-line border, white fill. Checked: green fill and border with a white 12px check. Hit area 48×48. A native `<input type="checkbox">` is visually hidden under the box. Space toggles. `disabled`. An optional `label` makes the whole row clickable.
- Evidence: test §12 **18**.

**G5-14 `nm-list-group` + `nm-list-item`** (blocker, missing)
- Target: §4.3.2. The group is a `<ul role="list">` with a white fill, slate-line border, r-m radius, and hairlines between items but none after the last. Item padding 16px 18px, gap 14px. Title `list-title`; when done it is slate-600 with a slate-line strike-through. Meta is Fira Code `num-meta-lg`. The progress counter `num-progress` comes from `formatCounter` and is green-700 only when `done === total`. Inputs `title`, `meta`, `progress`, `done`, `clickable` (→ `activated`), `checkable` (→ `checkedChange`). Accessible name `title, meta, 3 of 5, completed`.
- Evidence: tests §12 **19, 20**.

**G5-15 `nm-step-card`** (blocker, missing)
- Target: §4.3.3. White card, r-m, slate-line border, padding 13px 15px, gap 12px. Leading display-only `nm-checkbox`. Title 13/600 Sans. Subtitle Fira Code 11 slate-600. An optional trailing small **secondary** `nm-button`; when present, the whole card runs the action. Accessible names as the spec.
- Evidence: test §12 **21**.

**G5-16 `nm-card` + `nm-section-label`** (blocker, missing)
- Current: only the marketing `.card` (padding 22). It must not be reused.
- Target: §4.4. Card: white, slate-line border, r-m, padding 16 (overridable), `border: solid | dashed` (+ `dashedWidth`), `clickable` → button/anchor wrapper with focus ring and a blue border on hover, no shadow. Section label: `section-label` style, uppercase through CSS only (the DOM keeps sentence case), padding `6px 20px 10px` (`inset`), heading level from an input (default `h2`).
- Evidence: tests §12 **22, 23**.

**G5-17 `nm-field` + `nm-form-card`** (blocker, missing)
- Current: only the marketing `.input` (slate fill, 10px radius). This contradicts Q12/OA-12 and must not be reused.
- Target: §4.5. The label is a real `<label for>`. White fill, slate-line border, r-s, padding 11px 14px, placeholder slate-400. Focus: green border + 2px outline offset 1px. Error: red border, `error` message with `role="alert"`, `aria-invalid`, `aria-describedby`. Kinds `text`, `multiline` (3→6 rows), `money` (persistent Fira Code `KSh ` prefix, digits only, `inputmode="numeric"`), `phone` (Fira Code, `type="tel"`, `inputmode="tel"`, `autocomplete="tel"`). Optional `maxLength` Fira Code `n/max` counter. `ControlValueAccessor`. `nm-form-card` = `nm-card` + a `card-label` heading.
- Evidence: tests §12 **24, 25, 26, 27, 28**.

**G5-18 `nm-timeline`** (blocker, missing)
- Target: §4.6. `<ol>`. A 22px left column with a 9px dot (done green, pending slate-400) and a 1px slate-line connector, except on the last step. Title 12.5/400 blue Sans. Time in `num-meta` Fira Code. Gap 18px. `aria-label` = `title, time, done|pending`, inner text `aria-hidden`.
- Evidence: test §12 **29**.

**G5-19 `nm-empty-state`, `nm-error-state`, `nm-skeleton-card`, `friendlyError()`** (blocker, missing)
- Target: §4.7. Empty state: optional title (heading level input), a required `muted` message, and an optional primary action that emits `action`. Error state: message in a `role="alert"` region, outline retry button (default `Try again`) that emits `retry`. `friendlyError`: network failure (HTTP 0 / fetch `TypeError`) → `Check your connection and try again.`; anything else → `Something went wrong. Please try again.`. Skeleton: white, slate-line, r-m, padding 14px 15px, two static slate bars (60%/35%, 12px/10px), `role="status"`, `aria-label="Loading"`, `height` input (default 72), no shimmer.
- Evidence: tests §12 **30, 31, 32, 33**.

**G5-20 `NmDialogService` + `nm-dialog` + `confirm()` (WQ-3: dialogs stay 335px)** (blocker, missing)
- Target: §4.8, WQ-3. `--nitume-scrim` backdrop. White card, r-l 20px, padding 20px, **max-width 335px at every width**, width `calc(100% - 40px)`, no shadow. Title `dialog-title` `<h2>`, body `body` in slate-600, then a full-width vertical action stack with 10px gaps and an optional `error` line. `confirm()`: confirm label first as **outline** (red label when `destructive`), cancel second as **primary**. It resolves `true` only on confirm. `dismissible: false` blocks scrim and Escape. `role="dialog"`/`alertdialog`, `aria-modal`, focus to the title or first action, focus trap, focus returned to the opener, background `inert`, scroll lock.
- Evidence: tests §12 **34, 35, 36**.

**G5-21 `NmPanelService` + `nm-panel` (WQ-3: centred panel from 768px)** (blocker, missing)
- Target: §4.9, WQ-3. Below 768px: docked to the bottom, full width, top corners r-l 20px, max-height 90vh with internal scroll, padding `16px 20px 10px` + `env(safe-area-inset-bottom)`, 32×4 slate-line drag handle `aria-hidden`. **From 768px: bottom-anchored, horizontally centred, `max-width: 560px`** (owner-approved, not a side drawer). Scrim, optional `dialog-title`, and the same focus/inert/Escape/scroll-lock rules as the dialog.
- Evidence: test §12 **37** (viewport stubbed at both widths).

**G5-22 `NmToastService` + `nm-toast-host`** (blocker, missing)
- Target: §4.10. Blue-700 fill with white `body` text, r-s, padding 14px 16px, max-width 560px, bottom-centre 16px + safe area, optional offset. One toast at a time (a new one replaces the old). Auto-dismiss after 4s; hover/focus pauses the timer. No action button. `role="status"`, `aria-live="polite"`. Template variant for `nmNum` parts. The host is placed by #6, not by this issue.
- Evidence: test §12 **38**.

**G5-23 `nm-notice`** (blocker, missing)
- Target: §4.11. White, slate-line border, r-m, padding 12px 14px, `muted` 13px text, optional 18px slate-600 info icon, optional trailing small outline button slot. `tone: 'danger'` swaps in a red error icon only; there is no coloured fill.
- Evidence: test §12 **39**.

#### C. Numeric data, formatters, pipes, directive

**G5-24 `nmNum` directive** (blocker, missing)
- Current: only the marketing `.num` class. It must not be used inside `/app`.
- Target: §5.1, §5.3. `<span nmNum>` switches to `--nitume-font-num`. `[nmNum]="'amount-lg'|'amount'|'num'|'sm'|'meta-lg'|'meta'|'progress'"` applies the named style. With no value, only the family changes. `nmNumLabel` sets `aria-label` (with `kesSpoken` for signed ledger amounts).
- Evidence: test §12 **43**; `rg -n "class=\"[^\"]*\bnum\b|font-family" apps/website/src/app/shared/{ui,status,format,map}` returns no hits.

**G5-25 `formatters.ts` + one pure pipe per function** (blocker, missing)
- Target: §5.2. `src/app/shared/format/formatters.ts` exports `formatKes` (with `signed`), `formatKesOrDash`, `formatAmount`, `formatKesLedger` (U+2212), `kesSpoken`, `formatClock`, `formatDayTime`, `formatRelativeShort`, `formatShortDate`, `formatMonthYear`, `formatEta`, `formatCountdown`, `formatCounter`, `formatRating`, `formatClockEat`, `formatDayTimeEat`, `formatDeadlineEat`, `formatRelativeShortEat`, `eatDayKey`, `eatWeekday`, `eatWeekStart`, `formatDistanceKm`, `formatDurationMin`, `formatPhoneIntl`. Each has a standalone pure pipe of the same name. Money is handled on the decimal string (no float). EAT functions use `getTime() + 3h` and `getUTC*` only. Local functions take an injected `now`. Copy: `KSh`, never `KES`; `—` for a missing value. WQ-2 is open, so use the default: customer activity times are local and deadlines are EAT; runner times are EAT everywhere.
- Evidence: tests §12 **40** (every vector in the §5.2 table, one assertion each), **41, 42**; `rg -n "'KES|KES " apps/website/src/app/shared` shows no user-facing hits.

**G5-26 `categoryName` pipe + `CUSTOMER_MVP_CATEGORIES`** (blocker, missing)
- Target: §5.4. Maps the six wire values to `Buy For Me`, `Get It For Me`, `Check It For Me`, `Go There For Me`, `Wait For Me`, `Business Tasks`, in that order. Unknown values give an empty result. `CUSTOMER_MVP_CATEGORIES` holds the first five (no `business`).
- Evidence: test §12 **44**.

#### D. `RealtimeService`

**G5-27 Connection, auth handshake and `REALTIME_TOKEN_PROVIDER` stub** (blocker, missing)
- Current: no socket client. `core/auth/auth.store.ts` holds tokens in `localStorage` (WQ-8 open).
- Target: §6.1, §6.2. `src/app/core/realtime/realtime.service.ts` (+ a tokens file). It connects to the API **origin** `environment.apiBaseUrl` (not `/api/v1`) with `path: '/socket.io'`, `transports: ['websocket']`, `auth: { token }`, `reconnection: false`, `autoConnect: true`. `SOCKET_IO_FACTORY` defaults to `io`. `REALTIME_TOKEN_PROVIDER: InjectionToken<() => Promise<string | null>>` is declared in this issue. Issue #6 supplies the real provider (fresh access token via `POST /api/v1/auth/refresh`). Until #6 lands, this issue ships a **stub** default that returns `null`, so `connect()` ends in `disconnected` and never opens a socket without a token. The service never imports `AuthStore` and never reads `localStorage`.
- Evidence: test §12 **45** (fake factory + fake provider); `rg -n "AuthStore|localStorage" apps/website/src/app/core/realtime` returns no hits; the stub provider and a test of its `null` path (part of test **48**) exist.

**G5-28 Lifecycle, reconnect and backoff** (blocker, missing)
- Target: §6.2. States `disconnected | connecting | connected | reconnecting`. On disconnect or `connect_error`, the service closes the socket, waits the backoff, then reconnects with a **fresh** token. A `null` token → `disconnected`. Backoff is `min(30000, 1000·2^(n−1))` × jitter [0.8, 1.2], injectable through `REALTIME_BACKOFF`. A window `online` event triggers an immediate retry while `reconnecting`. Events from a stale socket are ignored. `disconnect()` stops retries and clears rooms.
- Evidence: tests §12 **46, 47, 48, 55, 56, 57**.

**G5-29 Public API, rooms and the 16-event contract** (blocker, missing)
- Target: §6.3, §6.4. `state` signal, `connect`, `disconnect`, `joinErrand` (ack `ok`; 10s ack timeout → `false`, room kept), `leaveErrand`, `sendLocationPing` (`{ ok:false, sent:false }` when offline or no ack in 10s; `forbidden`/`not_live` flagged as stop). There are 13 hot, no-replay observables, one per server event: `location:update`, `errand:status_changed`, `evidence:uploaded`, `price_change:requested`, `quote:reissued`, `merchant_details:updated`, `merchant_details:changed`, `quote:requested`, `errand:access_revoked`, `job:offered`, `job:offer_withdrawn`, `price_change:decided`, `price_change:difference_paid`. The client sends `errand:join`, `errand:leave`, `location:ping`. Event names and payload types live only in `realtime.events.ts` (ISO dates parsed to `Date`, prices kept as strings). Malformed payloads and unknown `status` values are dropped silently. `errand:access_revoked` removes the room before emitting. The client never joins `runner:{id}:status` and never uses `admins`. No other event name is allowed.
- Evidence: tests §12 **49, 50, 51** (all 13 events, two subscribers), **52, 53, 54**; `rg -n "'(errand|location|job|quote|price_change|merchant_details|evidence):" apps/website/src/app --glob '!**/realtime.events.ts' --glob '!**/*.spec.ts'` returns no hits.

**G5-30 `showReconnecting(delayMs)` and the `Reconnecting…` copy** (blocker, missing)
- Target: §6.3, §6.6 (corrected in `ebd1325`). A signal that is true once the service has been trying (`connecting` or `reconnecting`) for `delayMs`, and false on `connected` and on `disconnected` (Flutter `_syncReconnecting`). Its listener is removed with the caller. The copy uses the single U+2026 character. View placement (customer line under the map, runner `nm-notice` after 5s) belongs to issues #9/#14.
- Evidence: test §12 **58**.

#### E. `LiveMapComponent` and maps loading

**G5-31 `MapsLoaderService`** (blocker, missing)
- Target: §7.5. Loads the Maps JavaScript API once per page with the configured key (`…/maps/api/js?key=…&loading=async` or `@googlemaps/js-api-loader`), no extra libraries. `ready: Signal<'idle' | 'loading' | 'ready' | 'unavailable'>`. Empty key → `unavailable` without a network request.
- Evidence: test §12 **66** (script never requested without a key).

**G5-32 `nm-live-map` behaviour** (blocker, missing)
- Target: §7.1–§7.3. Inputs: `start`, `end`, `runner`, `routeTo`, `etaLabel`, `height` (default 220), `ariaLabel`, `moveDurationMs` (1200), `fitPadding` (40), plus the `[nmMapOverlay]` slot. Frame: r-m, slate-line border, `overflow:hidden`. ETA chip: white pill with a hairline, Fira Code 11.5/700 blue, padding 6px 10px, no shadow. The map is created **once** with `disableDefaultUI`, `clickableIcons: false`, `gestureHandling: 'cooperative'`, `keyboardShortcuts: true`. Markers: blue start pin, green end pin, 16px green runner dot with a 3px white ring, built from CSS custom properties at runtime. Route: dashed blue straight polyline (self variant runner → `routeTo`). Camera fit/refit rules as specified: single point → zoom 15 (Flutter `cameraFor`, spec corrected in `ebd1325`); initial camera zoom 14. The runner marker glides with `requestAnimationFrame` (first point placed directly, a mid-glide update restarts from the current position, `null` removes at once and keeps nothing). `prefers-reduced-motion` jumps without gliding.
- Evidence: tests §12 **59, 60, 61, 62, 63, 64, 65, 67, 68** (fake `google.maps` namespace).

**G5-33 No-key / load-failure placeholder (WQ-1 open)** (blocker, missing)
- Target: §7.4, WQ-1. With `mapsApiKey` empty or the loader `unavailable`, the frame shows a blue-050 fill (no grid or image), the ETA chip and overlay still render, and it carries `role="img"` with `ariaLabel`. No error text. Because WQ-1 is still with the owner, this is the state every environment shows until a key is configured locally.
- Evidence: test §12 **66**.

**G5-34 Maps key configuration (never committed)** (blocker, missing)
- Current: `src/environments/environment.ts` has `apiBaseUrl` only; `angular.json` has no `fileReplacements`.
- Target: §7.6, §1. The `Environment` interface and `environment.ts` gain `mapsApiKey: ''` (always empty in git). Add a committed `src/environments/environment.local.example.ts` with an empty key. The gitignored `src/environments/environment.local.ts` is swapped in by a `fileReplacements` entry in a new `local` build configuration (and a matching `serve` configuration). No key in source, tests, docs or commit messages.
- Evidence: `git grep -nE "AIza[0-9A-Za-z_-]{20,}" feat/website-ui-kit` returns nothing; `angular.json` has `configurations.local.fileReplacements` → `environment.local.ts`; `git ls-files apps/website/src/environments` lists `environment.ts` and `environment.local.example.ts` only.

**G5-35 `.gitignore` line** (blocker, missing)
- Current: root `.gitignore:18` `web/environments/*.local.ts` (that path does not exist).
- Target: §7.6. Add `apps/website/src/environments/*.local.ts` to the root `.gitignore`. The existing line may stay. The new pattern must not match `environment.local.example.ts`, which it does not, because that name ends in `.example.ts`.
- Evidence: `git check-ignore -v apps/website/src/environments/environment.local.ts` reports the new root line; `git check-ignore apps/website/src/environments/environment.local.example.ts` reports nothing.

**G5-36 npm dependencies** (blocker, missing)
- Current: `apps/website/package.json` has neither package.
- Target: §6.1, §7. Add `socket.io-client` (^4) and `@angular/google-maps` (^22, matching `@angular/core`) to `dependencies`. `@types/google.maps` goes in devDependencies if the build needs it. `@googlemaps/js-api-loader` is optional (§7.5). No other new runtime dependency. `package-lock.json` is updated in the same commit.
- Evidence: `git diff main -- apps/website/package.json` shows only these additions; `npm ls socket.io-client @angular/google-maps` resolves in `apps/website`.

#### F. Layout, rules and health

**G5-37 File layout and marketing untouched** (blocker, missing)
- Target: §11. Folders `src/styles/_tokens.scss`, `src/app/shared/ui/{button,status-chip,list,card,field,timeline,states,overlay,notice}/`, `src/app/shared/{status,format,map}/`, `src/app/core/realtime/`. Selector prefix `nm-`. Every component is standalone, `OnPush`, and uses signal inputs. Marketing files (`pages/*`, `shared/{header,footer,category-card,profile-card,proof-item,ticket}`, existing `styles.scss` rules, `app.routes.ts` marketing routes) are not modified. A kit gallery route is optional; if one exists it sits under the guarded `/app` tree and is not linked from marketing.
- Evidence: `git diff --stat main -- apps/website/src/app/pages apps/website/src/app/shared/{header,footer,category-card,profile-card,proof-item,ticket}` is empty; `rg -n "changeDetection" apps/website/src/app/shared/ui` shows `OnPush` on every component.

**G5-38 Responsive and accessibility rules** (blocker, missing)
- Target: §8. No horizontal scroll from 360px. Hit areas ≥ 48×48. A visible focus ring on every interactive element and no bare `outline: none`. Hover only where defined. Overlays respect `env(safe-area-inset-*)`. Live regions as specified. Motion is limited to the glide, the spinner and 150–200ms overlay fades, all off under `prefers-reduced-motion`.
- Evidence: `rg -n "outline:\s*(none|0)" apps/website/src/app/shared` shows only lines that also set a replacement ring; tests **6, 18, 34, 37, 38, 67**.

**G5-39 Domain rules in kit defaults** (blocker, missing)
- Target: §9. Six display names only (five for customers). Exhaustive state maps with no invented or admin labels. No wallet/escrow wording in any default copy. The kit has no money-flow component. Amber and red appear only as chip-sized accents.
- Evidence: `rg -ni "wallet|escrow" apps/website/src/app/shared apps/website/src/app/core/realtime` returns no hits; tests **10, 11, 44**.

**G5-40 Required Vitest cases (§12 cases 1–68; case 69 is the build-health run, G5-41)** (blocker, missing)
- Current: no kit spec files.
- Target: §12. Every numbered case 1–68 is its own `it(...)`. Colour assertions check the custom-property **name**, never a hex. The coverage table below must be complete at re-audit.
- Evidence: the auditor greps the spec files for each case and runs the suite.

| §12 cases | Item |
|---|---|
| 1, 3 | G5-1, G5-2, G5-3, G5-4 |
| 2 | G5-6 |
| 4–9 | G5-8 |
| 10 | G5-9, G5-11 |
| 11 | G5-9, G5-12 |
| 12 | G5-11 |
| 13–16 | G5-9 (16 also G5-11) |
| 17 | G5-10 |
| 18 | G5-13 |
| 19, 20 | G5-14 |
| 21 | G5-15 |
| 22, 23 | G5-16 |
| 24–28 | G5-17 |
| 29 | G5-18 |
| 30–33 | G5-19 |
| 34–36 | G5-20 |
| 37 | G5-21 |
| 38 | G5-22 |
| 39 | G5-23 |
| 40–42 | G5-25 |
| 43 | G5-24 |
| 44 | G5-26 |
| 45 | G5-27 |
| 46–48, 55–57 | G5-28 (48 also covers the G5-27 stub `null` path) |
| 49–54 | G5-29 |
| 58 | G5-30 |
| 59–65, 67, 68 | G5-32 |
| 66 | G5-31, G5-33 |
| 69 | G5-41 |

**G5-41 Build health** (blocker, to verify)
- Target: §12.12 case 69. `cd apps/website && npx ng test --watch=false` gives 0 failures and `npx ng build` succeeds. The marketing `initial` budget (`angular.json:38-39`, 500kb warning / 1mb error) is unchanged and not exceeded: kit code is tree-shaken or in lazy chunks until #6 routes use it. Conventional commits are on `feat/website-ui-kit` with scope `angular-website`.
- Evidence: the PR body pastes the test summary and build output; `git diff main -- apps/website/angular.json` changes only the `local` configuration (G5-34).

### Re-audit checklist for #5 (auditor)

1. G5-1 … G5-41 each closed with the evidence above.
2. Token scan: `rg -n "Color\(0x|#[0-9A-Fa-f]{6}" apps/website/src/app --glob '!**/pages/**' --glob '!**/shared/{header,footer,category-card,profile-card,proof-item,ticket}/**'` returns no hits.
3. Spec §13 open questions (WQ-2, WQ-4, WQ-5, WQ-6, WQ-8) are not decided in code beyond the spec default.
4. Verdict PASS → `SCREEN_MAP.md` row #5 status `matches-design`.

---

## Issue #6 — sign-in, session, roles and app shell

- Specs: `docs/specs/website/auth-foundation.md` (cited F§n) and the eight view specs `customer-{v-auth-phone,v-auth-otp,x-name-capture,shell}.md`, `runner-{v-auth-phone,v-auth-otp,x-name-capture,shell}.md`. First written in `5d608ac`; updated in `7bc8222` for the owner answers and the web auth API (this section audits against `7bc8222`).
- Baseline audited: `apps/website` on `feat/website-auth-shell` at `77e34f0` (merge of `feat/website-ui-kit`; website code identical to the #5 tip `ae9403a`, which re-audit 2 of #5 passed). No #6 code exists yet.
- Builder: `web-parity`, branch `feat/website-auth-shell`, commit scope `angular-website`.
- Every item G6-1 … G6-46 is **approved extension, W-Q0**.

### Verdict: PASS (re-audit 3, 2026-10-29, `feat/website-auth-shell` at `32ea1a1`)

The owner allowed a third round after two FAILs. Fix audited: `32ea1a1` `fix(angular-website): restore the marketing title after leaving /auth or /app`. `git diff c1e7edd..32ea1a1` touches only `apps/website/src/app/app.routes.ts` (+2 lines) and `apps/website/src/app/app.routes.spec.ts` (+13 lines). Nothing else changed.

- **Finding 5: closed.** The marketing parent route in `app.routes.ts:12` now has `title: "Nitume — Someone there, when you can't be."`. Its bytes are identical to `src/index.html:5` (em dash and straight apostrophe compared with `od -c`). No marketing component changed.
- **F9.66** (`app.routes.spec.ts`): `/auth` → `/`, and `/app/customer/sign-in` → `/business`, each assert the `Sign in · Nitume` title and then the `index.html` title.
- **Mutation check:** in a detached scratch worktree at `c1e7edd` (code without the fix) with only the new spec file applied, F9.66 **fails** (`expected 'Sign in · Nitume' to be 'Nitume — Someone there, when you can't be.'`; 1 failed, 7 passed). The scratch worktree was removed afterwards. With the fix it passes.
- **Auditor re-run at `32ea1a1`:** `npx ng test --watch=false` → **48 files, 412 tests, 0 failures**. `npx ng build --stats-json` → succeeds, **initial total 351.44 kB raw** (≤ 352.00, WQ-33) / 96.31 kB transfer. The initial chunks (`main-UGHPN2MT.js`, `chunk-CpY1PwP9.js`, `polyfills-5CFQRCPP.js`) contain no `core/auth`, `core/realtime`, `app-area` or `shared/ui` input. Their packages are `@angular/{core,common,router,platform-browser}`, `rxjs`, `tslib`, `zone.js`.
- G6-1 … G6-46 all closed; re-audit 1 findings 1–4 and re-audit 2 finding 5 all closed. SCREEN_MAP #6 rows → `matches-design`. Merge still waits for PR #20, #22, #25 and #26 (merge preconditions below).
- **Owner WQ-34 (2026-10-29), for later sections:** issues #7–#18 have a **hard cap of 360 kB raw** on the website initial total. #6 stays under its own 352.00 kB limit (WQ-33). Every later section's build item checks the initial total against 360 kB raw and repeats the WQ-33 framework-weight and eager-graph checks (re-audit 2 note).

### Re-audit 2 (2026-10-29, `feat/website-auth-shell` at `2dcec7f`): FAIL, 0 blockers, 1 minor (finding 5, closed at re-audit 3)

Fixes audited: `c752f27`, `a6f5d7a`, `e69e1cf`, `7870511`, `2dcec7f`. Auditor re-run in the worktree:
- `npx ng test --watch=false` → **48 files, 411 tests, 0 failures**.
- `npx ng build --stats-json` → succeeds, **initial total 351.39 kB raw** (limit 352.00) / 96.31 kB transfer.

Findings 1–4 of re-audit 1 are **closed**. One new minor regression comes from the title change (finding 5). It is the only open item and the fix is about one route line plus a test. This is the second FAIL on #6, so it goes to the orchestrator under its two-FAIL rule.

#### Re-audit 1 findings: closure

| # | State | Evidence |
|---|---|---|
| 1 | closed | `splash.component.scss` applies `nm-visually-hidden`; F9.61 (`app-area/styles.spec.ts`) asserts `clip-path: inset(50%)`, `width: 1px`, `position: absolute`. The build output contains no `@include`, `@use` or `@mixin` (scan of every `.js`/`.css` file in `dist`) |
| 2 | closed | `sign-in-message.component.scss` uses `nm-type(error)`; F9.62 asserts `color: var(--nitume-red)`, `font-size: 12.5px`, weight 400. F9.60 (`styles/auth-static.spec.ts`) rejects `@use`/`@include`/`@mixin`/`$var` in any inline `styles` under `src/app/` |
| 3 | closed | F9.63 `guards.spec.ts` (dropSession, allowed, no signOut); F9.64 `session.store.spec.ts` (no second refresh after `signedOut`, refresh again after `failed`); F9.65 `auth-otp.page.spec.ts` (boxes cleared and field enabled on not-allowed; `name?returnUrl=…` then the `returnUrl` after the save) |
| 4 (G6-46, WQ-33) | closed | WQ-33 evidence 1–5, below |

WQ-33 evidence (re-audit 1, finding 4):
1. **Size:** "Initial total" 351.39 kB raw ≤ 352.00. Pass.
2. **Stats inputs:**
   - `main-SHL2ZQIL.js`: `main.ts`, `app.config.ts` (62 B), `app.routes.ts`, `app.component.ts`, `environments/environment.ts`, `core/lazy-session/lazy-session.ts` (1147 B), `core/lazy-session/realtime-session.tokens.ts` (244 B), plus the marketing layout, pages and shared marketing components.
   - `chunk-CpY1PwP9.js` and `polyfills`: only packages.
   - Packages present: `@angular/{core,common,router,platform-browser}`, `rxjs`, `tslib`, `zone.js`.
   - No `core/auth/**`, `core/realtime/**`, `app-area/**` or `shared/ui/**` file. Pass.
3. **Import-graph test:** `styles/auth-static.spec.ts`:
   - "F9.50. the eager import graph…" walks static `import`/`export … from` from `src/main.ts` (skipping `import()` and `import type`) and asserts nothing matches `^app/(core/auth|core/realtime|app-area|shared/ui)/`.
   - "F9.50 (walker check)" injects `import { SessionStore } from './app/core/auth/session.store'` into `app.config.ts` and asserts the walker reports it.
   - The auditor read the regex: it handles multi-line imports and `export * from`. Pass.
4. **Full run:** 411/411. Every F9.1 … F9.65 case and every view T-case is still present. Pass.
5. **Lazy path:**
   - `auth.interceptor.spec.ts` now runs F9.20 … F9.29 "through the lazy shim" from a cold start (`resetLazySessionForTests()`, asserts the chunk is not loaded before the first API request and is loaded after it).
   - `lazy-session.spec.ts`: an asset request goes out at once without loading the chunk; the first API request waits, then gets the real rules; the legacy keys are removed at start.
   - `app.config.spec.ts` F9.56: the realtime providers resolve to the session, loaded on demand.
   - F9.4: titles. F9.57/F9.58: chooser and `/app` restore, through `openApp` with `provideLazySession()`.
   - Pass.

Item status at re-audit 2: G6-1 … G6-46 closed except **G6-4** (titles, reopened by finding 5). G6-11, G6-20, G6-34, G6-35, G6-36 and G6-46, which were open at re-audit 1, are now closed.

#### Findings (re-audit 2)

5. **minor. A marketing page keeps the last signed-in title after in-app navigation.** `apps/website/src/app/app.routes.ts:8-18` (marketing parent route has no `title`), with the `NitumeTitleStrategy` removal in `7870511`.
   - Design: F§1 says marketing pages and their output do not change. F§2 adds titles only for `/auth` and `/app/**`. The removed strategy kept "the page's original title" for routes without one (re-audit 1 G6-4).
   - Code: Angular's default `TitleStrategy` sets a title only when the route has one. Untitled marketing routes therefore keep the previous document title. Reproduction: open `/`, click the header `Log in` (`routerLink="/auth"`, `shared/header/header.component.ts:23`), then press browser Back. The home page's tab now reads `Sign in · Nitume` instead of `Nitume — Someone there, when you can't be.` (`src/index.html:5`). The same happens through the chooser wordmark link to `/` (`nm-wordmark href="/"` follows in-app) and after any `/app` page.
   - Fix: give the marketing parent route in `app.routes.ts` `title: "Nitume — Someone there, when you can't be."` (the exact `index.html` text; it applies to all four children; a few bytes, inside the 352.00 kB limit). Add F9.66: `/auth` then `/`, and `/app/customer/sign-in` then `/business`, each restore the `index.html` title. Do not touch the marketing components.

#### Side effects of the WQ-33 fix (auditor ruling)

| | Change | Ruling | Reason |
|---|---|---|---|
| (a) | `NitumeTitleStrategy` replaced by route `title` strings | **FAIL (minor), finding 5** | The `/auth` and `/app/**` titles are exact (F9.4 passes). The regression is on the marketing pages only, and a one-line route title fixes it without a custom strategy |
| (b) | `withComponentInputBinding` dropped | **PASS** | No routed component reads router inputs. The marketing pages and layout have no `@Input`/`input()`. The #6 pages read `ActivatedRoute.snapshot`, and their only `input()`s belong to child components bound in templates (`splash`, `sign-in-message`). Behaviour is the same as before. Guarded by the F9.50 framework-weight test |
| (c) | #5 kit: `nm-button` dev warning moved from `effect` to `ngOnChanges`; `nmTemplateOutlet` replaces `NgTemplateOutlet` in `nm-button`, `nm-toast-host`, `nm-wordmark`; new `nmFieldValue` | **PASS** | No #5 spec file changed since the #5 tip `ae9403a` except the additive `tokens.spec.ts` (no removed lines), and all pass. The warning condition is identical and fires on input change (signal inputs trigger `ngOnChanges`). None of the three call sites passes a context or injector, so a plain `createEmbeddedView` matches; it is tested in `template-outlet.spec.ts`. `nmFieldValue` is additive and does not change `nm-field`/`nm-otp-field`, which stay `ControlValueAccessor`s (tested in `field-value.spec.ts`). Rendered markup, classes and tokens are unchanged |
| (d) | #6 pages avoid reactive forms, `afterNextRender`, `viewChild` (static test "F9.50 (framework weight)") | **PASS** | Focus still follows F§7.3 and the view specs. `AppAreaComponent` and the chooser move focus to the `h1` with `setTimeout` after render (F9.5, chooser test). `focusPageHeading` skips when the page already focused a control, so the code screen keeps the OTP input focused (`ngAfterViewInit` autofocus runs in the render pass, before the timeout). Wrong code / resend / refusal refocus the input after the field is re-enabled (T5, F9.65). `Skip to content` focuses `main#content` (customer-shell tests). The phone prefill, typing that clears errors, and read-only while loading are unchanged (phone T2, T4, T16; name T1–T8). Realtime connects once in `ngAfterViewInit` (shell T8 / runner T5) |
| (e) | Legacy-key cleanup eager (`provideEnvironmentInitializer(removeLegacyStorageKeys)`) and again in `SessionStore` | **PASS** | F§1 asks for it "on app start". Its cost is inside the 1.08 kB tolerance and it is tested (`lazy-session.spec.ts`). The storage scan shows only `removeItem` of the three legacy keys |

Note for the orchestrator (not a #6 finding): WQ-33 holds only while later issues (#7–#18) stay off `effect()`, `afterNextRender`, `viewChild`, `NgTemplateOutlet`, reactive forms and `withComponentInputBinding`, and off static imports of session/kit code from the eager graph. esbuild keeps framework code used by lazy chunks in the shared Angular modules that `main` loads. The F9.50 static tests apply to #6 folders and the eager graph only, so each later issue needs the same checks.

#### Re-audit 3 checklist (done)

1. Finding 5 fixed; F9.66 present and passing.
2. Initial total still ≤ 352.00 kB raw; tests 0 failures.

### Re-audit 1 (2026-10-29, `feat/website-auth-shell` at `d2d0fc9`): FAIL, 3 blockers (incl. G6-46 after owner WQ-33), 1 minor (all closed at re-audit 2)

Built by `web-parity` in 15 commits `9f7af20` … `d2d0fc9` on top of the spec/audit commits. Auditor re-run in the worktree `nitume-feat-website-auth-shell`: `npx ng test --watch=false` → **44 files, 398 tests, 0 failures**; `npx ng build` → **succeeds**, initial total **379.20 kB raw / 103.78 kB transfer** (was 350.92 kB at #5). 42 of 46 items close as built. G6-46 fails on the owner's WQ-33 decision (finding 4). Two components put SCSS in inline `styles`, which this project compiles as plain CSS, so their mixins never reach the browser (findings 1 and 2). That fails G6-11, G6-20 (splash), G6-34 and G6-35 (error line). Every other check passes: copy, storage, routes, tokens, fonts, contrast, the #5 kit and the marketing pages.

#### Findings

1. **blocker. Splash `Loading` text is visible.** `apps/website/src/app/app-area/splash.component.ts:16-22`.
   - Design: F§4.6, the splash is the wordmark plus a **visually hidden** `role="status"` `Loading`.
   - Code: the inline `styles` start with `@use '../../styles/tokens' …` and give `.status` `@include nm-visually-hidden;`. `apps/website/angular.json` sets no `inlineStyleLanguage`, so the inline styles are compiled as CSS. The production build emits the text literally (`chunk-DvpXlm88.js`: `.status[_ngcontent-%COMP%]{@include nm-visually-hidden;}`), the browser drops the unknown at-rule, and `Loading` shows as a 16px navy line under the wordmark. This happens on `/app` and on `/auth` while the session restores. The chooser test (`auth-chooser.page.spec.ts:62`) checks only the text and role, not that it is hidden.
   - Fix: move the rule to `splash.component.scss` (`styleUrl`), keep `@include nm-visually-hidden`, and add F9.61.
2. **blocker. The "other error" line of both sign-in screens loses its `error` style.** `apps/website/src/app/app-area/sign-in/sign-in-message.component.ts:41-56`.
   - Design: `customer-v-auth-phone.md` and `customer-v-auth-otp.md` Layout, plus the runner variants: the other-error line uses the `error` style (Fira Sans 12.5/400, `--nitume-red`), centred on the code screen. G6-40 says red is used only for errors, and errors are red.
   - Code: same mechanism as finding 1. The build emits `.message[_ngcontent-%COMP%]{@include nm-type(error);margin:0}` (`chunk-BM3ONoH5.js`), so the line renders in the body style (16px, `--blue`, line-height 1.5). This affects every non-field error on the phone and code screens for both roles: hourly/IP limit, WQ-17 verify limit, delivery failed, suspended, the WQ-14 not-allowed line, the wrong-account line, network and generic errors. The copy is correct; only the style is lost.
   - Fix: move the styles to `sign-in-message.component.scss` (`styleUrl`), and add F9.62 and the static check F9.60 (no `@use`/`@include`/`@mixin`/`$var` in inline `styles` under `src/app/`). A scan of every #6 `.ts` file found only these two components with SCSS-only syntax inline.
3. **minor. The accepted builder choices have no tests.**
   - `core/auth/guards.spec.ts` F9.33 does not cover a customer session on `/app/runner/sign-in`: `dropSession()` called, route allowed, no `signOut`.
   - `core/auth/session.store.spec.ts` F9.11 does not assert that a second `ensureRestored()` after `signedOut` makes no refresh call.
   - `app-area/sign-in/auth-otp.page.spec.ts` T15 does not assert that the not-allowed refusal clears the boxes, and no view test follows a `returnUrl` through the name screen. Only the pure `resolveDestination` case F9.36 covers it.
   - Fix: add F9.63, F9.64 and F9.65 (spec §9.11, added at this re-audit).

4. **blocker. G6-46: the marketing initial bundle grew; owner WQ-33 (2026-10-29) requires the #5 baseline.**
   - Design (WQ-33, owner, relayed by the orchestrator 2026-10-29): the marketing initial bundle stays at the #5 baseline (350.92 kB raw). The session layer must load lazily: interceptor, `SessionStore`, `AuthApi`, title strategy, realtime token providers, and the router/HTTP code they pull in. The owner accepts that the first API call waits for that chunk.
   - Code: initial total **379.20 kB raw** (+28.28 kB), 103.78 kB transfer. `ng build --stats-json` puts these #6 `src/app` inputs in the initial chunks (`main-4YZPZHAV.js`, `chunk-h7ewk44d.js`): `core/auth/{session.store 5667 B, role-routing 3042, otp-policy 1784, auth-api 1435, auth.interceptor 1055, auth.tokens 505, realtime-session 244}`, `core/realtime/realtime.session-tokens 249`, `app-area/title.strategy 542`, `layout/marketing-layout 414`. That is about 14.9 kB, pulled eagerly by `app.config.ts` (`withInterceptors([authInterceptor])`, `TitleStrategy`, `provideRealtimeSession()`). The remaining ~13 kB is Angular framework code those providers reach.
   - The builder's narrower claim is **confirmed**: no `app-area/**` view, page, shell, stub or splash, no `shared/ui/**` component, and no `socket.io-client`, `engine.io-client`, `@angular/google-maps` or `@angular/forms` is in the initial chunks. The only packages are `@angular/{core,common,router,platform-browser}`, `rxjs`, `tslib` and `zone.js`.
   - **Fix target (all required):**
     a. **Size.** `npx ng build` "Initial total" at or below **352.00 kB raw**. That is the #5 baseline 350.92 kB plus a tolerance of **1.08 kB** (about 0.3%) for the eager shims that lazy loading needs, such as a thin `HttpInterceptorFn` that dynamically imports the real interceptor for `${apiBaseUrl}/api/v1/` URLs only and passes every other request through synchronously. Transfer size is recorded but not gated.
     b. **Eager graph.** None of these is reachable from `main.ts` / `app.config.ts` / `app.routes.ts` through static imports: `core/auth/{session.store,auth-api,auth.interceptor (the full one),role-routing,otp-policy,guards,realtime-session,sign-in-flow.store,restored-destination}`, `core/realtime/**`, `app-area/**` (including `title.strategy`), `shared/ui/**`. Dynamic `import()` is allowed. Titles may use Angular's default strategy with route `title` strings set in the lazy route files, or a lazily provided strategy; either way they read exactly as F§2.
     c. **Behaviour unchanged.** Every F9 and view-spec test still passes. The interceptor tests F9.20 … F9.29 run through the lazy path, so the first API request waits for the chunk and then gets the Bearer, the credentials rule and the 401 handling. A request outside `/api/v1/` is not delayed and never loads the chunk. `REALTIME_TOKEN_PROVIDER` / `REALTIME_ACCOUNT_SUSPENDED` still resolve to the session (F9.56) when provided from the lazy `/app` tree or the lazy session chunk. The `/auth` chooser restore and the cross-tab `signed-out` broadcast work once the session chunk has loaded. The legacy-key cleanup (F§1) may stay eager inside the tolerance or run when the session chunk first loads; record which.
     d. **Tests proving it.** Extend `styles/auth-static.spec.ts` F9.50. It walks the static import graph from `src/main.ts` (following `import … from` and `export … from`, skipping `import()`) and asserts that no file in (b) is reached. Add a test that a non-API `HttpClient` request (for example an asset URL) completes without loading the session module.
   - Evidence the auditor will check at re-audit 2:
     1. `npx ng build --stats-json`: "Initial total" ≤ 352.00 kB raw.
     2. The stats inputs of every initial chunk list no file from (b) and no package beyond `@angular/{core,common,router,platform-browser}`, `rxjs`, `tslib`, `zone.js`.
     3. The extended F9.50 test is present and fails if `app.config.ts` statically imports `session.store.ts` (the auditor checks the assertion logic).
     4. `npx ng test --watch=false` passes with 0 failures and every F9 / T case is still present.
     5. Titles, the interceptor, the realtime providers and the chooser restore are covered by tests that run through the lazy path.

#### Builder choices the spec did not settle (auditor ruling)

| # | Choice | Ruling | Reason |
|---|---|---|---|
| 1 | Customer session on `/app/runner/sign-in` → `dropSession()`, then the runner phone screen shows (`guards.ts` `guestGuard`) | **PASS** | F§6.2 row 2 prescribes `dropSession()` for a customer on the runner flow. The wrong-account line belongs to the code screen and the phone screen has no slot for it. A redirect to the customer home would block the runner path the chooser offers. Recorded in F§6.1. Test missing (finding 3) |
| 2 | A tab that restored as signed out skips later refresh calls until a reload or a sign-in (`session.store.ts` `ensureRestored`) | **PASS** | Matches the apps' restore-once-per-launch. §4.4 says tabs share only the sign-out broadcast. A `failed` restore is still retried, as §6.7 requires. `dropSession` revoked the cookie anyway. Recorded in F§4.2. Test missing (finding 3) |
| 3 | The not-allowed refusal clears the code boxes; a valid `returnUrl` is carried to the name screen (`auth-otp.page.ts` `refuse`, `role-routing.ts` row 4) | **PASS** | It mirrors the specified wrong-account refusal (G6-35: "boxes cleared, field enabled"). The `returnUrl` is validated (F§6.5) before it is carried and again after the name save, so there is no open redirect. Recorded in F§6.2. Test missing (finding 3) |
| 4 | Kit additions: `nm-button` `target`/`rel`/`ariaLabel`/`inline`, `nmNum` `otp`/`resend`, the `nm-visually-hidden` mixin, the resend-line stale-second fix (`linkedSignal` on `cooldownEndsAt`) | **PASS** | All additive with #5 defaults unchanged (`null`/`false`, no attribute rendered; `button-link.spec.ts` "defaults add no target, rel or aria-label"). `target`/`rel`/the new-tab name are what G6-31 requires. `inline` keeps the 48×48 `::before` hit area and the focus ring. `otp`/`resend` are the G6-21 `num-*` styles. The countdown fix corrects a real stale second (test `otp-resend-line.spec.ts`). No new colour. Recorded in F§7.1 |
| 5 | `REALTIME_TOKEN_PROVIDER` and `REALTIME_ACCOUNT_SUSPENDED` declared in `realtime.session-tokens.ts` and re-exported from `realtime.tokens.ts` | **PASS** | The spec asks for them "next to `REALTIME_TOKEN_PROVIDER`". They are together, the public import path (`realtime.tokens`) is unchanged, and the split keeps `socket.io-client` out of the initial bundle (confirmed under finding 4). Under WQ-33 both tokens may stay in this file, which has no socket import; their session-backed providers must move off the eager path (finding 4b) |

#### Item status at re-audit 1

| Item | Status | Evidence (auditor) |
|---|---|---|
| G6-1 | closed | `MarketingLayoutComponent` template/styles equal `main:app.component.ts`. `git diff main` on `pages/{home,business,diaspora,runner}` and `shared/{header,footer,category-card,profile-card,proof-item,ticket}` is empty. #6 does not touch `styles.scss` or `index.html` (their `main` diff is #5's). F9.1 |
| G6-2 | closed | the legacy scan has no hits; old page deleted in its own commit `c4bbdf1`; `AuthStore`/`ApiService` in `1db0b94`; F9.9 |
| G6-3 | closed | `app.routes.ts` lazy `auth` + `app`; `app-area.routes.ts`, `customer.routes.ts`, `runner.routes.ts` separate lazy chunks; stub has no TODO/Lorem; F9.2, F9.3 |
| G6-4 | closed | `NitumeTitleStrategy`; F9.4 |
| G6-5 | closed | exactly one `<nm-toast-host` (`app-area.component.ts:21`); F9.5 |
| G6-6 … G6-10 | closed | `otp-policy.ts`, `session.store.ts`, `auth-api.ts`; storage scan → only the legacy-key removal (`session.store.ts:79`); no mobile route or `AUTH_COOKIE_MODE`/`X-Nitume-Client`; F9.6 … F9.19, F9.45, F9.46, F9.51 … F9.54 |
| G6-11 | **open (finding 1)** | the offline page and `Try again` are correct; the splash shows `Loading` visibly |
| G6-12, G6-13 | closed | `auth.interceptor.ts`; `realtime.service.ts` final `account_suspended`; `app.config.ts` providers; F9.20 … F9.29, F9.55, F9.56; the #5 realtime suites pass unchanged |
| G6-14 | closed | no `showReconnecting(` caller outside `core/realtime` |
| G6-15 … G6-19 | closed | `guards.ts`, `role-routing.ts`, `sign-in-flow.store.ts`; F9.30 … F9.44 |
| G6-20 | **open (finding 1)** | chooser copy is exactly WQ-24 (`Sign in to Nitume` / `Choose how you use Nitume.` / `I need tasks done` / `I'm a Runner or want to become one`), links and `href`s correct, outside the marketing layout; its restoring state uses the faulty splash |
| G6-21 … G6-23 | closed | five type styles added; colour-token line count 30, the same as at #5; field inputs additive; `normalizeKenyanPhone`; F9.47 |
| G6-24 … G6-33 | closed | components under `shared/ui/`; icon file carries the Apache-2.0 notice, no package added; nav white (`--nitume-white`) and kept on pushed routes from 768px (WQ-15, WQ-16); F9.59; one spec file per component |
| G6-34 | **open (finding 2)** | copy, states, numeric fields and accessibility correct; the other-error line renders without the `error` style |
| G6-35, G6-36 | **open (finding 2)** | WQ-14 and WQ-17 sentences verbatim in `core/auth/auth-copy.ts`; `… later.` fallback per WQ-24; same style defect on the line that shows them |
| G6-37 | closed | name screens: copy per role, 2–60 validation, save error through `nm-field` (kit styles) |
| G6-38, G6-39 | closed | five / four items in order with the icon pairs; Earnings uses `add-circle`; realtime `connect()` once; no geolocation |
| G6-40 | closed (with findings 1–2 fixed) | colour/`box-shadow`/font scans: no #6 hits; F9.48, F9.49 |
| G6-41, G6-42 | closed | no wallet/escrow; no bare `outline: none`; skip link visible on focus |
| G6-43, G6-44 | closed except finding 3 | every F9.1 … F9.59 case named in a spec file; view T-cases complete for both roles |
| G6-45 | closed | 15 conventional commits, scope `angular-website`; every new component `OnPush` except `MarketingLayoutComponent`, which F§1 requires verbatim from the old `AppComponent` (accepted) |
| G6-46 | **open (finding 4, WQ-33)** at re-audit 1; closed at re-audit 2 (351.39 kB) | 379.20 kB raw against the 352.00 kB target; session layer eager |

#### Owner-decision copy and behaviour check

WQ-12 chooser at `/auth`: met. WQ-13 customer flow + runner → runner destination with `fresh` kept (`role-routing.ts` row 3; F9.43): met. WQ-14 line on the code screen and in the `signedOut=not-allowed` toast: met. WQ-15 and WQ-16: met. WQ-17 `Too many attempts. Try again in N min.` (N in `nmNum`): met. WQ-18: nothing client-side sets a lifetime: met. WQ-24 chooser copy and `Too many attempts. Try again later.`: met. WQ-8: the access token lives only in the private `#token`, no storage writes (F9.6, F9.7), credentials only on `/auth/web/*`: met.

#### Re-audit 2 checklist (done)

1. Findings 1–4 fixed; F9.60 … F9.65 and the extended F9.50 present and passing.
2. `npx ng build` output: `rg -o "@include|@use" dist/**/*.js` finds nothing.
3. Re-run tests and build; finding 4 evidence 1–5.

### Baseline verdict: FAIL (not built, 2026-10-28)

Nothing of #6 is built: there is no `/app` route, no session layer, no guard, no interceptor, no #6 component, and the old `/auth` page still writes tokens to `localStorage`. The items below are the build list. Severity is **blocker** for every item unless it says minor.

### Merge preconditions (not build items)

| Precondition | State on 2026-10-28 | Effect on #6 |
|---|---|---|
| PR #26 (#5 kit) | open; merged into this branch at `77e34f0` | #6 must not be merged before #26 |
| PR #20 `feat/api-web-refresh-cookie` (`/auth/web/*`, `nitume_rt`, `WEB_ORIGINS`) | open, reviewer READY | #6 calls these routes; unit tests fake HTTP, so the build can proceed; merge after #20 |
| PR #22 `fix/api-refresh-suspended` (`account_suspended` on refresh) | open, stacked on #20 | as above |
| PR #25 `feat/api-suspended-access` (`account_suspended` on any route and on the socket handshake) | open, stacked on #22 | as above |
| Board WQ-9 (production domains vs `SameSite=Strict`) | open with the owner | deployment only; no #6 code change |

API contract verified by the auditor on `origin/feat/api-web-refresh-cookie` (`af5f70a`) and `origin/fix/api-refresh-suspended`: `apps/api/src/auth/web/web-auth.controller.ts` (`@Controller('auth/web')`, `@UseGuards(WebOriginGuard)`; `otp/verify` returns `{ user, tokens: { accessToken } }` and sets the cookie; `refresh` reads the cookie, 401 `refresh_cookie_missing` without one, maps an uncoded 401 to `refresh_invalid` and keeps coded ones such as `account_suspended` (PR #22), clears the cookie on any failure; `logout` is `@Public`, cookie-authenticated, clears the cookie); `refresh-cookie.service.ts` (`nitume_rt`, `HttpOnly`, `SameSite=Strict`, `Secure` unless development, `Path=/api/v1/auth/web`, `Max-Age` = `JWT_REFRESH_TTL`, default `30d`); `web-origin.guard.ts` (403 `web_origin_not_allowed`); `config/web-origins.ts` (dev default `http://localhost:4200`, fail-closed elsewhere). PR #25 `realtime.gateway.ts`: handshake middleware answers `connect_error` with `message: 'account_suspended'` and `data: { statusCode: 401, code: 'account_suspended', message }`.

### Owner decisions that apply to this section (GitHub #6 comments, owner, 2026-10-28)

| Id (board) | Spec's first id | Decision | Where it lands |
|---|---|---|---|
| WQ-8 | — | Access token in memory only, refresh token in an httpOnly cookie, through the dedicated `/auth/web/*` routes (PR #20) | G6-7 … G6-11, G6-14 |
| WQ-12 | WQ-9 | `/auth` becomes a role chooser | G6-20 |
| WQ-13 | WQ-10 | Runner signing in through the customer flow goes to the runner area | G6-16 |
| WQ-14 | WQ-11 | `This number can't be used to sign in here. Use another number, or contact support.` | G6-10, G6-36 |
| WQ-15 | WQ-12 | Side nav stays visible on pushed screens from 768px | G6-32 |
| WQ-16 | WQ-13 | Side nav is white | G6-32 |
| WQ-17 | WQ-14 | `Too many attempts. Try again in N min.` | G6-6, G6-36 |
| WQ-18 | WQ-15 | Sessions last 30 days (API refresh lifetime; nothing to build client-side) | G6-7 (evidence only) |
| WQ-4 | — | FCM web push, added by #11/#18; #6 ships a no-op sign-out hook | G6-10 |

Still open, build uses the spec default: **Q6-1** (chooser wording, F§11; board number to be assigned) → G6-20 uses the proposed copy.

### Current-state evidence (baseline)

| Fact | Evidence |
|---|---|
| All routes eager, `/auth` is the old page | `src/app/app.routes.ts:2-14` imports five page components eagerly; `{ path: 'auth', component: AuthComponent }` |
| Header/footer wrap every route | `src/app/app.component.ts` template `<app-header /> <main><router-outlet /></main> <app-footer />` |
| Tokens in `localStorage` | `src/app/core/auth/auth.store.ts:4-6` keys `nitume.ws.user|access|refresh`; `:28-30` writes all three, including the refresh token |
| Mobile auth routes, no credentials | `src/app/core/services/api.service.ts:23,30,39` call `/auth/otp/request`, `/auth/otp/verify`, `/auth/register`; no `withCredentials` |
| Old page off-system | `src/app/pages/auth/auth.component.ts:44-52` Google button stub, `:70,84` `box-shadow`, `:101` raw `#fff`, `:182` navigates to `/` (no role routing) |
| User role typed as a closed union; mobile token shape | `src/app/core/api-types.ts:12-13` `role`/`status` unions; `:17-20` `TokenPair` with `refreshToken` |
| No interceptor, no title strategy | `src/app.config.ts` providers are `provideHttpClient(withFetch())` and `provideRouter(routes, withComponentInputBinding())` only |
| Token provider is the #5 stub, comment names the mobile refresh | `src/app/core/realtime/realtime.tokens.ts:32` mentions `POST /api/v1/auth/refresh`; `:35-38` default returns `null` |
| `connect_error` always retries | `src/app/core/realtime/realtime.service.ts:278-280` `s.on('connect_error', () => { if (current()) this.scheduleRetry(); })` |
| Toast host placed nowhere | `rg -n "<nm-toast-host" apps/website/src` → only the component's own spec |
| Kit type styles missing for #6 | `src/styles/_tokens.scss:78-104` has `auth-heading`, `top-bar-title`, `pushed-title`, `list-title`, `muted`, `field-label`, `error`, `tab-label`, `num-meta`; no `resend`, `wordmark-suffix`, `greeting`, `num-otp`, `num-resend` |
| `nm-field` lacks #6 inputs | `src/app/shared/ui/field/field.component.ts:30-40`: `label`, `kind`, `placeholder`, `error`, `maxLength`, `counter`, `readonly`, `disabled`, `autocomplete`; no `hideLabel`, `autocapitalize`, `spellcheck` |
| No phone normaliser | `src/app/shared/format/formatters.ts:305-313` has `formatPhoneIntl` and a private `KENYAN_PHONE` regex; no exported `normalizeKenyanPhone` |
| Environment | `src/environments/environment.ts` has `apiBaseUrl`, `mapsApiKey`; no `links` |
| Build health | Not re-run at baseline (no `node_modules` in this worktree). The website code equals `ae9403a`, whose #5 re-audit 2 run was 14 files / 73 tests passing and `ng build` succeeding |

### Items

Each item gives the **current** state, the **target** (spec section) and the **evidence at re-audit**. Test numbers `F9.n` are auth-foundation §9 case n; `<view> Tn` is case n in that view spec's "Required tests". Every listed case is its own `it(...)`.

#### A. App frame and routes (F§1, F§2)

**G6-1 Marketing layout split, bare `AppComponent`**
- Current: `app.component.ts` renders header/footer around every route.
- Target: F§1. `MarketingLayoutComponent` holds today's `AppComponent` template and styles verbatim and parents `''`, `business`, `diaspora`, `runner`. `AppComponent` is a bare `<router-outlet />`. Marketing page components, header and footer unchanged.
- Evidence: F9.1; `git diff main -- apps/website/src/app/pages/{home,business,diaspora,runner} apps/website/src/app/shared/{header,footer,category-card,profile-card,proof-item,ticket}` is empty; the moved template/styles compare equal to `main:apps/website/src/app/app.component.ts`.

**G6-2 Legacy auth removed**
- Current: `core/auth/auth.store.ts`, `core/services/api.service.ts`, `pages/auth/auth.component.ts` exist and write tokens to `localStorage`.
- Target: F§1. All three deleted (the old page in its own commit, F§1 row). `SessionStore` deletes the legacy keys `nitume.ws.user|access|refresh` on first construction. `api-types.ts` drops `TokenPair`, `OtpVerifyResult`, `RegisterResult`.
- Evidence: F9.9; `rg -n "AuthStore|ApiService|AuthComponent|localStorage\.setItem|sessionStorage" apps/website/src/app --glob '!**/*.spec.ts'` returns no hits; `git log --oneline` shows a separate commit deleting `pages/auth/`.

**G6-3 Lazy `/app` tree, route data and stubs**
- Current: no `/app` route.
- Target: F§2. One lazy `app` entry (`loadChildren`), separate lazy customer and runner chunks, every path of the F§2 tree with its guards; `onboarding/id|selfie` outside the runner shell and `onboarding/pending` inside; route `data { role, navKey?, pushed?, title }`; `ViewStubComponent` for #7–#18 paths (label `h1` or `nm-skeleton-card` only, no other copy); `/app/customer` → `home`, `/app/runner` → `jobs`, `/app/**` → `/app`; navigation after sign-in, name save and sign-out with `replaceUrl: true`.
- Evidence: F9.2, F9.3; customer-shell T11; runner-shell T7; `rg -n "TODO|Coming soon|Lorem" <ViewStubComponent file>` returns no hits.

**G6-4 Document titles** (minor)
- Current: none.
- Target: F§2 titles through a `TitleStrategy` provider (customer `… · Nitume`, runner `… · Nitume Runner`, chooser `Sign in · Nitume`).
- Evidence: F9.4.

**G6-5 `AppAreaComponent`: canvas, toast host, focus**
- Current: no `/app` parent; `nm-toast-host` is placed nowhere (#5 handoff need).
- Target: F§7.3. Slate canvas, `min-height: 100dvh`, the **single** `<nm-toast-host>` of the website, focus moved to the page `h1` (`tabindex="-1"`, no ring on programmatic focus) after each `/app` navigation.
- Evidence: F9.5; `rg -n "<nm-toast-host" apps/website/src/app --glob '!**/*.spec.ts'` returns exactly one hit, in the `AppAreaComponent` template.

#### B. OTP policy and session (F§3, F§4)

**G6-6 `otp-policy.ts`**
- Current: none.
- Target: F§3. Constants (6 digits, 300 s, 5 attempts, 60 s cooldown, 5/hour), `otpErrorKind()` for the eight OTP codes and the uncoded fallbacks, `isAccountSuspended`, `isRoleMismatch`, `retryAfter`, `minutesFrom` (clamp 1…999). `otp_ip_rate_limited` → hourly-limit copy on request, WQ-17 copy on verify. `refresh_cookie_missing`, `refresh_invalid`, `web_origin_not_allowed` are not OTP kinds.
- Evidence: F9.45, F9.46.

**G6-7 `SessionStore` (memory only, WQ-8)**
- Current: `AuthStore` persists tokens.
- Target: F§4.2. Signals `status`, `user`, `hasName`; `accessToken()` from a private field; `ensureRestored()` single-flight with the F§4.2 outcome rules (no toast on a silent restore failure); `completeSignIn` keeps only `tokens.accessToken`, falls back to the verify user when `GET /users/me` fails, sets the fresh flag; `saveDisplayName` trims; `freshAccessToken()` with the 30 s `exp` margin and the sign-out on `rejected`/`suspended` while signed in; `takeFreshSignIn()` once. No storage of any kind. Session length is the API's 30 days (WQ-18): nothing in the client sets a lifetime.
- Evidence: F9.6, F9.7, F9.8, F9.11, F9.12, F9.13, F9.54; `rg -n "localStorage|sessionStorage|indexedDB|document\.cookie" apps/website/src/app --glob '!**/*.spec.ts'` returns only the legacy-key removal in `session.store.ts`.

**G6-8 `AuthApi` on the web routes and `api-types.ts`**
- Current: `ApiService` calls the mobile routes without credentials.
- Target: F§4.3. `requestOtp` → `POST /auth/otp/request` (no credentials); `verifyOtp` → `POST /auth/web/otp/verify { phone, code, role }`; `refresh` → `POST /auth/web/refresh` with no body; `logout` → `POST /auth/web/logout` with no body and no Bearer; all `/auth/web/*` with `withCredentials: true`; `me`, `updateDisplayName`, `runnerMe`, `runnerVerifications` with Bearer and no credentials. Never the mobile `/auth/otp/verify`, `/auth/refresh`, `/auth/logout`. `api-types.ts`: `displayName`, `WebSession`, `WebRefreshResult`; `role`/`status` as `string`, narrowed by `roleOf()`. `web_origin_not_allowed`: generic error on verify, `rejected` on refresh, ignored on logout, one dev-mode `console.error` naming `WEB_ORIGINS`.
- Evidence: F9.10, F9.51, F9.52; `rg -n "auth/(otp/verify|refresh|logout)'" apps/website/src/app --glob '!**/*.spec.ts'` shows only `auth/web/...` paths; `rg -n "AUTH_COOKIE_MODE|X-Nitume-Client" apps/website/src` returns no hits.

**G6-9 Refresh: single-flight, cross-tab lock, outcome mapping**
- Current: none.
- Target: F§4.4. One in-flight refresh per tab; `navigator.locks.request('nitume-auth-refresh', …)` when available; mapping 2xx → `ok`, 401 `account_suspended` → `suspended`, 401 `refresh_cookie_missing` / `refresh_invalid` / other 401 / any 403 → `rejected`, status 0 / timeout / 5xx → `network`.
- Evidence: F9.11 (two concurrent calls, one request), F9.14, F9.22, F9.52.

**G6-10 `signOut`, `dropSession`, broadcast, `SIGN_OUT_HOOK` (WQ-4), sign-in toasts**
- Current: none.
- Target: F§4.2 hook, F§4.5. Single-flight `signOut(reason, role)`: (1) `SIGN_OUT_HOOK(reason)` best effort, at most 3 s, default no-op provider declared in #6 for #11/#18; (2) `POST /auth/web/logout` best effort for every reason; (3) clear token and user, `RealtimeService.disconnect()`; (4) `BroadcastChannel('nitume-session')` `{ type: 'signed-out' }`; (5) `WINDOW.location.replace('/app/<role>/sign-in[?signedOut=expired|suspended|not-allowed]')`. `dropSession()` = steps 2–3 only. Other tabs follow the broadcast (not on a sign-in page). Sign-in page toasts: `Please sign in again.`, `This account can't sign in. Contact support.`, the WQ-14 line; the parameter is stripped; unknown values show nothing.
- Evidence: F9.15, F9.16, F9.17, F9.18, F9.19, F9.53; customer-v-auth-phone T12.

**G6-11 Splash and restore-failed page**
- Current: none.
- Target: F§4.6. `/app` `AppEntryPage` (wordmark + visually hidden `role="status"` `Loading`) and `/app/offline` (`nm-wordmark`, runner suffix when `returnUrl` starts with `/app/runner`, `nm-error-state` `Check your connection and try again.` / `Try again`, retry re-runs `ensureRestored()` then the validated `returnUrl` or `/app`). `/app` signed out → `/auth` (F§6.4).
- Evidence: F9.30 (restore failed → `/app/offline?returnUrl=…`), F9.58; plus one test of the offline page's `Try again` (re-runs `ensureRestored()`, then the validated `returnUrl`), required here although F§9 does not number it.

#### C. Interceptor and realtime (F§5)

**G6-12 `authInterceptor`**
- Current: none.
- Target: F§5 items 1–6. Scope `${apiBaseUrl}/api/v1/` only; `withCredentials` on `/auth/web/*` only; Bearer except on `/auth/otp/request` and `/auth/web/*`; 401 handling except `/auth/otp/*` and `/auth/web/*`: `account_suspended` → `signOut('suspended')` without refresh; otherwise one shared refresh → retry once (`ok`), `signOut('expired')` (`rejected` or a second 401), `signOut('suspended')`, or rethrow without sign-out (`network`); role from the URL, else the user, else `customer`; 403 and other statuses untouched. Registered with `withInterceptors` in `app.config.ts`.
- Evidence: F9.20 … F9.29.

**G6-13 Real `REALTIME_TOKEN_PROVIDER` and the suspended socket (#5 handoff need, PR #25)**
- Current: the #5 stub (`null`) is the only provider; `connect_error` always retries (`realtime.service.ts:278-280`).
- Target: F§5 items 7–8, ui-kit §6.1/§6.2 as amended in `7bc8222`. `app.config.ts` provides `REALTIME_TOKEN_PROVIDER` as `() => session.freshAccessToken()` and `REALTIME_ACCOUNT_SUSPENDED` as `() => session.signOut('suspended', role)`. `realtime.tokens.ts` declares `REALTIME_ACCOUNT_SUSPENDED: InjectionToken<() => void>` (default no-op) and its stub comment names `POST /api/v1/auth/web/refresh`. `RealtimeService` treats a `connect_error` with `message === 'account_suspended'` or `data.code === 'account_suspended'` as final (no retry, `disconnected`, rooms cleared, handler called once); every other `connect_error` and every `disconnect` keep the #5 backoff. The shells call `connect()` once on first render.
- Evidence: F9.55, F9.56; customer-shell T8, runner-shell T5; all existing #5 realtime tests (§12 cases 45–58 of ui-kit) still pass unchanged.

**G6-14 `showReconnecting` injection-context rule** (minor)
- Current: no #6 caller.
- Target: F§5 item 9. #6 adds no caller (the shells show nothing for reconnecting). Any caller in #6 code is in a component field initialiser or constructor, or passes a `DestroyRef`.
- Evidence: `rg -n "showReconnecting\(" apps/website/src/app --glob '!**/core/realtime/**' --glob '!**/*.spec.ts'` returns no hits, or each hit is a field initialiser/constructor line or passes a `DestroyRef` argument.

#### D. Guards and role routing (F§6)

**G6-15 Guards**
- Current: none.
- Target: F§6.1. `authGuard`, `roleGuard(role)` (other app role → its home; `other` → `signOut('not-allowed')`), `hasNameGuard`, `needsNameGuard`, `guestGuard`, `otpStepGuard`; role homes `/app/customer/home`, `/app/runner/jobs`. An unverified runner is allowed into the shell.
- Evidence: F9.30 … F9.34; customer-shell T9; runner-shell T6; customer-x-name-capture T7; customer-v-auth-otp T17.

**G6-16 `resolveDestination` (WQ-13)**
- Current: none.
- Target: F§6.2 rows 1–6, pure and table-tested: `other` role → refusal + `dropSession()` (or `signOut('not-allowed')` from `guestGuard`); runner flow + customer role or `role_mismatch` → wrong-account refusal; **customer flow + runner role → runner destination with `fresh` kept (WQ-13)**; blank name → `/app/<role>/name`; fresh runner → onboarding step; else validated `returnUrl` or the role home.
- Evidence: F9.36 … F9.38, F9.40 … F9.44.

**G6-17 `runnerOnboardingStep`**
- Current: none.
- Target: F§6.3 (port of `onboarding_routing.dart`): `verified` → shell; `level2Missing` rules; fallback to `GET /runners/me/verifications` with the row-268 rule when `level2Missing` is absent; never throws (failure → shell).
- Evidence: F9.39 (every listed case); runner-v-auth-otp T5, T6.

**G6-18 `returnUrl` validation**
- Current: none.
- Target: F§6.5: same-origin path under `/app/<resolved role>/`, not `sign-in`, `name` or `offline`, no `//` or scheme; anything else dropped silently.
- Evidence: F9.35; runner-v-auth-otp T7.

**G6-19 `SignInFlowStore`** (minor)
- Current: none.
- Target: F§6.6. Memory only, per role `{ phone, cooldownEndsAt }`, kept on Back, cleared after sign-in, lost on reload.
- Evidence: customer-v-auth-phone T5, T6; customer-v-auth-otp T16, T17.

**G6-20 `/auth` role chooser (WQ-12)**
- Current: `/auth` is the old login/sign-up page (`pages/auth/auth.component.ts`).
- Target: F§6.7. `AuthChooserPage` at `pages/auth-chooser/auth-chooser.page.ts`, top-level lazy `loadComponent` route outside `MarketingLayoutComponent`; restore first (splash while restoring; signed in → `resolveDestination`, not fresh, `replaceUrl`; signed out or failed → chooser); `nm-auth-frame` with `nm-wordmark href="/"`, `h1` `Sign in to Nitume`, sub `Choose how you use Nitume.`, primary link `I need tasks done` → `/app/customer/sign-in`, 12px gap, outline link `I'm a Runner or want to become one` → `/app/runner/sign-in` (copy proposed, Q6-1 open). Marketing CTAs unchanged.
- Evidence: F9.57, F9.58.

#### E. Kit additions and new components (F§7)

**G6-21 Type styles** (F§7.1)
- Current: absent (baseline table).
- Target: add to the `_tokens.scss` type map: `resend` (Sans 12.5/400 slate-600), `wordmark-suffix` (Sans 12/600 slate-600), `greeting` (Sans 12/400 slate-600), `num-otp` (Code 18/600 blue), `num-resend` (Code 12.5/400 slate-600). No new colour token.
- Evidence: the #5 token test (ui-kit §12 case 1) extended with the five names, or a new #6 token test; `rg -n "\-\-nitume-[a-z0-9-]+:" apps/website/src/styles/_tokens.scss` still lists exactly the 16 colour tokens.

**G6-22 `nm-field` inputs `hideLabel`, `autocapitalize`, `spellcheck`**
- Current: none of the three (`field.component.ts:30-40`).
- Target: F§7.1. `hideLabel` keeps `<label for>` visually hidden; `autocapitalize` and `spellcheck` bind the native attributes (`null` = absent; defaults unchanged so #5 views and tests are unaffected).
- Evidence: field tests for the three inputs; customer-v-auth-phone accessibility checks (accessible name `Phone number`); customer-x-name-capture T8.

**G6-23 `normalizeKenyanPhone`**
- Current: missing (only `formatPhoneIntl`).
- Target: F§7.1. Exported from `shared/format/formatters.ts`, strips spaces and hyphens, returns `+2547…`/`+2541…` or `null`.
- Evidence: F9.47; customer-v-auth-phone T3.

**G6-24 `nm-icon`**
- Current: none.
- Target: F§7.2. Typed registry of the 14 names, inline SVG, `fill="currentColor"`, `size` input (21), `aria-hidden="true"`, Apache-2.0 notice in the file header, no icon font, no dependency.
- Evidence: component test (renders each name, `aria-hidden`); `git diff main -- apps/website/package.json` adds nothing for icons.

**G6-25 `nm-wordmark`**
- Current: none.
- Target: F§7.2. Green dot 9px, 9px gap, `Nitume` in `auth-heading`, optional `suffix` in `wordmark-suffix`; accessible name `Nitume` / `Nitume Runner`; optional `href` renders a link with that name.
- Evidence: runner-v-auth-phone T1; runner-shell T3; F9.57 (link to `/`).

**G6-26 `nm-back-button` and `nm-pushed-header`**
- Current: none.
- Target: F§7.2. Back: 32px white circle, slate-line border, 16px `arrow-back` blue, 48×48 hit area, name `Back`, focus ring, `back` output, default `history.back()` inside `/app` else `fallback`. Pushed header: height 56, padding `2px 20px 6px 12px`, optional `pushed-title` `h1`, optional `Step n of m` in `num-meta`, trailing slot.
- Evidence: component tests (F§9.8 list: render, inputs, accessible name, focus-ring class, token names); customer-v-auth-otp T16.

**G6-27 `nm-top-bar`**
- Current: none.
- Target: F§7.2. Padding `8px 20px 14px`, optional `greeting`, `top-bar-title` `h1`, empty title renders no heading, trailing actions slot (gap 10). Used by the route stubs.
- Evidence: component test; customer-shell T11.

**G6-28 `nm-auth-frame`**
- Current: none.
- Target: F§7.4. Full-viewport slate, safe-area padding, header slot (top of viewport below 768px; inside the column 16px above the heading from 768px), column max 400px, padding 28px, vertically centred, no card; heading block `auth-heading` + `muted`, gaps 8px / 26px.
- Evidence: component test (both breakpoints with stubbed `matchMedia`); no horizontal scroll at 360px (G6-42).

**G6-29 `nm-otp-field`** (customer-v-auth-otp §Components)
- Current: none.
- Target: one real input over six `aria-hidden` boxes (44×52, gap 8, radius `--nitume-r-s`), `inputmode="numeric"`, `autocomplete="one-time-code"`, digits only, paste keeps the first six, `completed` once, `•` placeholders in slate-400, green borders when filled, every border red with `error`, focus ring on the next box, `ControlValueAccessor`, `aria-describedby`/`aria-invalid`.
- Evidence: customer-v-auth-otp T2, T5.

**G6-30 `nm-otp-resend-line`**
- Current: none.
- Target: clock-based countdown from `cooldownEndsAt`, `formatCountdown` in `nmNum`/`num-resend`, `Resend code` link at zero (disabled while sending), live region only at start and at zero.
- Evidence: customer-v-auth-otp T8, T9, T12, T13.

**G6-31 `nm-legal-line`**
- Current: none.
- Target: customer-v-auth-phone §Components. `resend` style, link parts as `nm-button` link small `<a target="_blank" rel="noopener noreferrer">` with 48×48 hit area and ` (opens in a new tab)` suffix; plain text when the URL is empty or not `http(s):`/`mailto:`/`tel:`.
- Evidence: customer-v-auth-phone T11; runner-v-auth-phone T2, T4.

**G6-32 `nm-app-nav` and `nm-app-shell` (WQ-15, WQ-16)**
- Current: none.
- Target: F§7.3. One `<nav aria-label="Main">` with a `<ul>` of `<a routerLink>` items, layout switched by CSS at 768px. Below 768px: C-13 bottom bar (white, slate-line top border, `4px 8px` + safe-area padding, 52px items, icon 21, `tab-label`, inactive slate-400, active green-700 + filled icon, hidden on `data.pushed` routes, `<main>` padded). From 768px: **white** 220px sticky side nav (WQ-16), wordmark link, 48px items, `list-title`, inactive slate-600, active green-700 + filled icon, hover slate fill, **kept on pushed routes with the parent item active (WQ-15)**. `aria-current="page"`, `Skip to content` first, `<main id="content">`, content max 1180px, padding 24px (20px below 768px). No `role="tablist"`.
- Evidence: customer-shell T1 … T7, T10; runner-shell T1 … T4, T8; F9.59.

**G6-33 Configuration links** (F§8)
- Current: `environment.ts` has no `links`.
- Target: `links.customer|runner.{termsUrl, privacyUrl, supportUrl}`, empty in git; the `Environment` interface and `environment.local.example.ts` gain the same shape; only `http(s):`, `mailto:`, `tel:` rendered.
- Evidence: customer-v-auth-phone T11; customer-v-auth-otp T14; runner-v-auth-otp T2.

#### F. Views

**G6-34 `AuthPhonePage` (customer and runner `v-auth-phone`)**
- Current: none (the old `/auth` card is not this view).
- Target: `customer-v-auth-phone.md` and `runner-v-auth-phone.md`: one component configured by route `data.role`; layout, exact copy (`Someone there, when you can't be.` / `Earn on your own schedule.`, subs, `+254 7XX XXX XXX`, `Send code`, legal lines), every state (invalid, loading, cooldown → code screen, hourly/IP limit with N in `nmNum`, delivery failed, network, other, `signedOut` toast), numeric fields in Fira Code, accessibility rules.
- Evidence: customer-v-auth-phone T1 … T14 as one suite parameterised over both roles; runner-v-auth-phone T1 … T4; `rg -c "class AuthPhonePage" apps/website/src/app` = 1.

**G6-35 `AuthOtpPage` (customer and runner `v-auth-otp`)**
- Current: none.
- Target: `customer-v-auth-otp.md` and `runner-v-auth-otp.md`: one component; back header; `Enter the code`; sub with the formatted number in `nmNum`; `Verify & continue`; auto-submit; every OA-17 state; verify through `POST /auth/web/otp/verify` with the flow role; routing through `resolveDestination` with `fresh: true` and `replaceUrl`; runner wrong-account refusal (boxes cleared, field enabled, `dropSession()`), `Contact support` link from the role's `supportUrl`.
- Evidence: customer-v-auth-otp T1 … T19 parameterised over both roles; runner-v-auth-otp T1 … T7; `rg -c "class AuthOtpPage" apps/website/src/app` = 1.

**G6-36 Code-screen copy decided by the owner (WQ-14, WQ-17)**
- Current: none.
- Target: not-allowed line `This number can't be used to sign in here. Use another number, or contact support.` (both flows and the restored-session toast); per-IP verify limit `Too many attempts. Try again in N min.` (N in `nmNum`; `Too many attempts. Try again later.` without `retryAfterSeconds`); verify 403 `web_origin_not_allowed` → `Something went wrong. Please try again.`
- Evidence: customer-v-auth-otp T15 (admin), T18; runner-v-auth-otp T4; F9.18, F9.52. The two owner sentences appear verbatim: `rg -n "can't be used to sign in here|Too many attempts. Try again" apps/website/src/app --glob '!**/*.spec.ts'`.

**G6-37 `NameCapturePage` (customer and runner `x-name-capture`)**
- Current: none.
- Target: `customer-x-name-capture.md` and `runner-x-name-capture.md`: one component; visible label; copy per role; validation (2–60 after trim, messages `Enter your name.` / `Keep it under 60 characters.`); save error `Couldn't save your name. Try again.`; `autocomplete="name"`, `autocapitalize="words"`, `spellcheck="false"`; exit through `resolveDestination` (runner fresh → onboarding step; restored → no `GET /runners/me`).
- Evidence: customer-x-name-capture T1 … T8 parameterised; runner-x-name-capture T1 … T3.

**G6-38 Customer shell**
- Current: none.
- Target: `customer-shell.md`: five items in order (`Home`, `New task`, `Track`, `History`, `Profile`) with the icon pairs and targets; `track/:errandId` keeps Track active; `new/**` active from 768px; realtime connect once; suspension paths (interceptor, token provider, socket) end in the suspended sign-out.
- Evidence: customer-shell T1 … T11.

**G6-39 Runner shell**
- Current: none.
- Target: `runner-shell.md`: four items (`Jobs`, `Active`, `Earnings` with `add-circle`, `Profile`), `Nitume Runner` wordmark, `onboarding/pending` inside the shell with Jobs active, `onboarding/id|selfie` without nav, unverified runner allowed, no geolocation started.
- Evidence: runner-shell T1 … T8; `rg -n "geolocation" <#6 shell and route files>` returns no hits.

#### G. Rules, tests and health

**G6-40 Tokens, typography and contrast in #6 files**
- Target: no hex / `rgb(a)` / `hsl(a)` / named colour / `box-shadow` in #6 files; colours only through `--nitume-*`; Fira Code only through `nmNum` and the `num-*` styles; white text on blue/green fills only; green only for the primary button, active nav item, filled OTP borders and the focus ring; red only for errors.
- Evidence: F9.48, F9.49; `rg -n "#[0-9A-Fa-f]{3,8}\b|rgba?\(|hsla?\(|box-shadow" apps/website/src/app --glob '!**/pages/{home,business,diaspora,runner}/**' --glob '!**/shared/{header,footer,category-card,profile-card,proof-item,ticket}/**'` returns no hits; `rg -n "font-family|Fira Code" apps/website/src/app --glob '!**/*.spec.ts'` returns no #6 hits.

**G6-41 Domain and security rules**
- Target: no wallet/escrow wording; no task state shown on these screens; display names only; no token, user or phone in any storage, URL or broadcast message; no open redirect; no refresh token ever read; credentials only on `/auth/web/*`.
- Evidence: F9.6, F9.7, F9.35, F9.51; `rg -ni "wallet|escrow" apps/website/src/app --glob '!**/pages/**'` returns no hits.

**G6-42 Responsive and accessibility**
- Target: no horizontal scroll from 360px (304px OTP row fits; five 68px nav columns); 48×48 targets; focus ring on every interactive element and no bare `outline: none`; safe-area insets; live regions as specified; labels always visible in the nav.
- Evidence: customer-shell T5, T7; customer-v-auth-otp T13; `rg -n "outline:\s*(none|0)" apps/website/src/app --glob '!**/pages/**'` shows only lines that also set a replacement ring.

**G6-43 Component test minimum for every new #6 component** (F§9.8)
- Target: each of `nm-icon`, `nm-wordmark`, `nm-back-button`, `nm-pushed-header`, `nm-top-bar`, `nm-auth-frame`, `nm-otp-field`, `nm-otp-resend-line`, `nm-legal-line`, `nm-app-nav`, `nm-app-shell` has tests for: renders, inputs, accessible name, focus-ring class, token use (custom-property names, never hex). Colour assertions name the custom property.
- Evidence: one spec file per component; the auditor greps each for the five checks.

**G6-44 Required Vitest cases: coverage table**
- Current: no #6 spec files.
- Target: F§9 cases 1–59 and every view-spec case, each its own `it(...)`. Customer and runner view suites run parameterised over both roles.
- Evidence: the auditor greps the spec files for each case and runs the suite.

| Cases | Item |
|---|---|
| F9.1 | G6-1 |
| F9.2, F9.3 | G6-3 |
| F9.4 | G6-4 |
| F9.5 | G6-5 |
| F9.6, F9.7, F9.8, F9.12, F9.13 | G6-7 |
| F9.9 | G6-2 |
| F9.10 | G6-8 |
| F9.11 | G6-7, G6-9 |
| F9.14 | G6-9 |
| F9.15 … F9.19 | G6-10 |
| F9.20 … F9.29 | G6-12 (F9.22 also G6-9) |
| F9.30 … F9.34 | G6-15 (F9.30 also G6-11) |
| F9.35 | G6-18 |
| F9.36 … F9.38, F9.40 … F9.44 | G6-16 |
| F9.39 | G6-17 |
| F9.45, F9.46 | G6-6 |
| F9.47 | G6-23 |
| F9.48, F9.49 | G6-40 |
| F9.50 | G6-46 |
| F9.51 | G6-8, G6-41 |
| F9.52 | G6-8, G6-9, G6-36 |
| F9.53 | G6-10 |
| F9.54 | G6-7 |
| F9.55, F9.56 | G6-13 |
| F9.57 | G6-20, G6-25 |
| F9.58 | G6-11, G6-20 |
| F9.59 | G6-32 |
| customer-v-auth-phone T1 … T14, runner-v-auth-phone T1 … T4 | G6-34 (T3 also G6-23, T11 also G6-31, T12 also G6-10) |
| customer-v-auth-otp T1 … T19, runner-v-auth-otp T1 … T7 | G6-35 (T2/T5 G6-29, T8/T9/T12/T13 G6-30, T15/T18 G6-36) |
| customer-x-name-capture T1 … T8, runner-x-name-capture T1 … T3 | G6-37 (T8 also G6-22) |
| customer-shell T1 … T11 | G6-38 (T1–T7, T10 also G6-32) |
| runner-shell T1 … T8 | G6-39 (T1–T4, T8 also G6-32) |
| F§9.8 component minimum | G6-43 |

**G6-45 Commits and file layout** (minor)
- Target: conventional commits on `feat/website-auth-shell`, scope `angular-website`; the old `/auth` page removed in its own commit; #6 code under `src/app/core/auth/`, one folder for the `/app` frame and routes (the builder names it once and uses it consistently), `src/app/pages/auth-chooser/`, new components under `src/app/shared/ui/`; standalone, `OnPush`, signal inputs, `nm-` prefix.
- Evidence: `git log --oneline main..feat/website-auth-shell`; `rg -n "changeDetection" <new component files>` shows `OnPush` on each.

**G6-46 Build health**
- Target: F9.50. `cd apps/website && npx ng test --watch=false` 0 failures (the 73 #5 tests included); `npx ng build` succeeds; the marketing `initial` total does not grow by `/app` code (only lazy chunks; compare with the #5 figure, 350.92 kB initial). **Re-audit 1 (WQ-33, owner 2026-10-29):** initial total ≤ 352.00 kB raw and the session layer lazy; see finding 4 for the target and the evidence.
- Evidence: the PR body pastes the test summary and the build table; the auditor re-runs both.

### Re-audit checklist for #6 (auditor)

1. G6-1 … G6-46 each closed with the evidence above.
2. Token scan of G6-40 returns no hits; storage scan of G6-7 returns only the legacy-key removal.
3. No call to the mobile `/auth/otp/verify`, `/auth/refresh`, `/auth/logout` from website code (G6-8).
4. Open item Q6-1 is not decided in code beyond the proposed copy.
5. Verdict PASS → `SCREEN_MAP.md` #6 rows (auth-foundation, the eight views, `page-auth` → chooser) status `matches-design`. Merge still waits for PR #20, #22, #25 and #26.

---

## Issue #7 — customer home and create-task wizard

- Specs: `docs/specs/website/customer-v-home.md` (cited H), `customer-v-new-category.md` (NC; it also holds the wizard foundation NC§W0–§W10), `customer-v-new-details.md` (ND), `customer-v-new-review.md` (NR). First written in `cae824c`; updated in `8feae7e` for the owner decisions and the #6 build. The baseline audits against `8feae7e`; re-audit 1 (2026-10-29) audits the build at `dd95c1a` against `b98ca6e` (owner WQ-2, attribution clear space, Places Details session).
- Baseline audited: `apps/website` on `feat/website-customer-create-task` at `8feae7e`. Its website code is identical to the #6 PASS tip `32ea1a1`: `git diff --stat 32ea1a1 55af009 -- apps/` is empty. It includes the #5 kit. No #7 code exists yet.
- Builder: `web-parity`, branch `feat/website-customer-create-task`, commit scope `angular-website`.
- Every item G7-1 … G7-40 is **approved extension, W-Q0**.
- Views: customer `v-home`, `v-new-category`, `v-new-details`, `v-new-review` (SCREEN_MAP #7 rows).

### Verdict: FAIL (re-audit 1, 2026-10-29, `feat/website-customer-create-task` at `dd95c1a`): 2 blockers, 1 minor

Built by `web-parity` in 34 commits `303c0b6` … `dd95c1a` on top of the spec/audit commits. The branch also carries the #6 tip `ed8f7b5` through merge `a0db2db`. That commit is a #6 test-only change: it freezes the clock in `auth-otp.page.spec.ts` and makes T12 and T13 assert exact values, so it strengthens #6 assertions and is not a #7 matter. Specs re-audited against `b98ca6e` (this re-audit's spec update, see "Spec updates at re-audit 1").

**Auditor re-run in the worktree** (`npm ci`, then):
- `npx ng test --watch=false` → **73 files, 612 tests, 0 failures**. This matches the builder.
- `npx ng build --stats-json` → succeeds, **initial total 354.17 kB raw** / 96.89 kB transfer. That is ≤ 360.00 (WQ-34) and +2.73 kB on #6's 351.44.
- The initial chunks have clean stats inputs:
  - `main-VODTCODL.js`: the marketing files, `app.config.ts`, `app.routes.ts`, `app.component.ts`, `core/lazy-session/{lazy-session,realtime-session.tokens}.ts`; packages `@angular/{common,platform-browser,router}`.
  - `chunk-RDpGQkek.js`: `@angular/core`, `rxjs`, `tslib`.
  - `polyfills`: `zone.js`.
  - No `core/auth`, `core/realtime`, `app-area`, `shared/ui`, `shared/places` or `shared/map` input, and no `@angular/google-maps`, `@angular/forms` or `socket.io-client`. **G7-39 PASS.**

37 of 40 items close as built. The three findings below hold G7-25, G7-26, G7-31 and G7-33 open; G7-3 and G7-37 are open only for the deadline part of finding 1.
- Every copy string in the four specs' "Copy (exact)" sections is present verbatim.
- All required cases are present as their own `it(...)`: H T1–T19, NC T1–T10, ND T1–T23 (T11 in `shared/places/places.spec.ts`, T16 in `shared/kit-additions-7.spec.ts`, T17 in `task-draft.store.spec.ts`), NR T1–T17 (T16 in `shared/ui/receipt/receipt.spec.ts`), NC§W9.1–W9.17.
- The #7 static spec (`src/styles/customer-static.spec.ts`) computes "#7 code" from the route entry points' import graph, so it includes the kit files the routes reach. It runs (a)–(f), the inline-style check, the memory-only scan and the G7-13 token count. The forbidden pattern includes `shared/places`, and the walker self-check is present.
- None of the #5/#6 kit spec files changed (`card`, `overlay`, `field`, `back-button`, `pushed-header`, `map`, `realtime`, `template-outlet`), and all pass. That closes G7-8, G7-9, G7-10, G7-11 and G7-14.
- Marketing paths are unchanged against `55af009`. Every new component is `OnPush`. Every commit message is conventional with scope `angular-website`.

**Per-commit health (noted, not failed, per the orchestrator):** commits `1ae2dae` … `db87eba` fail `tokens.spec` case 2, and `eec45ba` does not compile. The tip is green. The orchestrator handles this with a squash merge. Formally it breaks AGENTS.md rule 4 for those intermediate commits.

#### Spec updates at re-audit 1 (`b98ca6e`)

1. **Owner WQ-2 (answered 2026-10-29, #7 issue comment, after the baseline report):**
   - Activity times (greeting, Recent) use the browser's local time. Home is unchanged and already does this.
   - **Deadlines use EAT and are labelled as EAT.** `Today`/`Tomorrow` = 23:59 EAT of the EAT calendar date, independent of the browser zone (ND Rules).
   - Proposed label: a caption under the chips, `Due today, 23:59 EAT.` / `Due tomorrow, 23:59 EAT.` (`23:59` in Fira Code). This is **Q7-5** for the owner. ND T17 now runs under two browser zones, and ND T21a is new.
   - G7-33 is amended (below).
2. **Google attribution clear space:** the spec said 8px above and below. Google's attribution guidelines ask for at least 10 dp left, right and top and at least 5 dp below. **Ruling: where Google's minimum is stricter, Google's minimum applies.** ND Places and ND T22 now say at least 10px left, right and top and at least 5px below, counting the list panel's padding.
3. **Places Details session (spec defect):** the spec told the builder to pass `sessionToken` in the `Place` constructor options. `PlaceOptions` has no such field. The Maps JS API carries the session into Details through `placePrediction.toPlace()`. ND Places and ND T11 are corrected. The builder followed the spec as written, so finding 3 is a spec-caused defect.

#### Findings (re-audit 1)

1. **blocker. Deadlines use the browser's zone and are not labelled as EAT (owner WQ-2).** `apps/website/src/app/app-area/customer/new-task/task-draft.store.ts:44-50`; `new-details.page.html` (deadline card); `task-draft.store.spec.ts:116-150`.
   - Design (ND Rules, owner WQ-2):
     - `Today` → 23:59 EAT of today's EAT date, as UTC ISO (`…T20:59:00.000Z`); `Tomorrow` → the next EAT date.
     - Independent of the browser zone.
     - Labelled `Due today, 23:59 EAT.` / `Due tomorrow, 23:59 EAT.` while that chip is selected (proposed copy, Q7-5).
   - Code:
     - `deadlineAt()` builds `new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset, 23, 59)` in the **browser's** zone. A London browser choosing `Today` sends 23:59 London, which is 02:59 EAT the next day.
     - No caption is shown for `Today`/`Tomorrow`.
     - ND T17 stubs `TZ=Etc/GMT-3`, which equals EAT, so the test cannot see the difference (`dd95c1a`).
   - Fix:
     - Compute the EAT calendar date with the kit EAT helpers (`eatDayKey` / the `…Eat` family in `shared/format/formatters.ts`) and send 23:59 EAT of that date (and of the next date) as UTC. No hand-written offset in the view.
     - Add the Today/Tomorrow caption in the Flexible caption's place and style (`nm-type(greeting)`, `23:59` in `nmNum`).
     - Update ND T17 to two zones (`Europe/London` and `Africa/Nairobi`, including 22:30 London on 1 Nov → `2026-11-02T20:59:00.000Z`) and add ND T21a.
     - Update the `clock.ts` comment so `CUSTOMER_NOW` is described as the clock, not as the deadline zone.
     - If the owner answers Q7-5 with other words, only the caption copy changes.
2. **minor. Google attribution has less clear space than Google requires.** `apps/website/src/app/shared/ui/place-field/places-attribution.component.ts:13-16` (`padding: 8px 0`) inside `place-field.component.scss:11` (panel `padding: 0 4px`).
   - Design: ND Places (re-audit 1 ruling) requires at least 10px left, right and top and at least 5px below.
   - Code: 4px left and right, 8px top, 8px bottom.
   - Fix: give `nm-places-attribution` the space, e.g. `padding: 10px 10px 5px` counted together with the panel's 4px. Move it to a `styleUrl` `.scss` if a token mixin is used. Extend ND T22 with the `declared()` clear-space assertion. Update the component's header comment.
3. **blocker. Place Details is not tied to the autocomplete session (WQ-25 "session tokens").** `apps/website/src/app/shared/places/google-place-search.ts:108` (`new places.Place({ id: placeId, sessionToken: … })`); `places.spec.ts:37-43,88-91`.
   - Design (ND Places, corrected in `b98ca6e`): Details is `placePrediction.toPlace().fetchFields({ fields: [...] })`. `toPlace()` carries the request's session token, which closes the billing session. `PlaceOptions` has no `sessionToken`. A pick from the list always has its prediction in hand.
   - Code: passes `sessionToken` as a `Place` constructor option. The Maps JS API does not define that option, so in a real browser the Details call is likely billed outside the session. Each autocomplete request then likely bills on its own, which is the cost WQ-25 is meant to avoid. The fake library in `places.spec.ts` accepts the option, so the tests pass. This cannot be confirmed without a key (WQ-1), but the documented path is `toPlace()`.
   - Fix:
     - Keep each Google suggestion's `placePrediction` in the per-session cache next to the mapped suggestion (memory only, same cap and lifetime).
     - `details()` calls `toPlace()` on it, then `fetchFields` with the four fields. Fall back to `new Place({ id })` only when no prediction is held.
     - Update the fake (`placePrediction.toPlace` returning a recorded fake `Place`) and ND T11: no `sessionToken` key on any `Place` constructor call.
   - Origin: spec defect (my first ND text); this is not a builder error.

#### Builder choices and extras (auditor ruling)

| # | Choice | Ruling | Reason |
|---|---|---|---|
| a | #5/#6 test-file edits: `icon.spec.ts` (list gains the 10 #7 names), `format.pipes.spec.ts` (`formatHours` row, case count 24 → 25), `app-shell.page.spec.ts` T11 (label-less stub now checked on `/app/customer/notifications`), `app.routes.spec.ts` F9.5 (Home `h1` is now the first name `Achieng`), `testing/app-harness.ts` (`providers` option) | **PASS** | Each is the minimum change the #7 spec makes necessary: §W9a adds the icons and the pipe; §W1 replaces the `new` stub, so another skeleton-only stub is used; H gives Home's `h1` as the first name. No assertion was weakened or removed. Each test still checks what it checked before. The harness option is additive (default empty) |
| b | Deadline `nm-choice-chip-group` labelled with `[ariaLabel]="Deadline"` instead of `aria-labelledby` the card heading | **PASS** | The kit `nm-form-card` heading has no `id` (`form-card.component.ts:11`), so `aria-labelledby` would need a kit change. `ariaLabel` gives the identical accessible name. The group supports both inputs, and `labelledBy` wins when set |
| c | `nmTemplateOutlet` gains `nmTemplateOutletContext` (used by `nm-dialog`) | **PASS** | Additive with a `null` default, so #6 call sites are unchanged. The unchanged #5 dialog spec renders a `let-ref` template (`shared/ui/overlay/overlay.spec.ts:189`), which exercises the context. Unlike `NgTemplateOutlet`, a changed context recreates the view rather than updating it in place. The dialog's `ref` and `data` are fixed for a dialog's life, so behaviour is the same |
| d | `--nm-cta-scroll-margin` set by `nm-wizard-frame` (bar height + 16) and read by `nm-field` (`scroll-margin-bottom: var(--nm-cta-scroll-margin, 0px)`) | **PASS** | It implements NC§W4 ("a focused field is never hidden under it") without a view query. It is a layout length, not a colour. It uses the kit's private `--nm-` prefix like `--nm-toast-offset`. The `0px` fallback leaves `nm-field` unchanged outside the wizard, and the #5 field tests pass unchanged |
| e | `QUOTE_PREVIEW_ENABLED` and `CUSTOMER_NOW` injection tokens | **PASS** | Test seams whose defaults are exactly the spec values (`environment.quotePreviewEnabled`; `new Date()`), the same pattern as #5 `MAPS_API_KEY` and #6 `APP_LINKS`. `CUSTOMER_NOW` is the clock only; the deadline zone is finding 1 |
| f | Place Details `sessionToken` as a `Place` option | **FAIL (finding 3)** | Not a documented Maps JS option. The mechanism came from the spec and is corrected there |
| g | G7-26 evidence grep `rg -n "maps.googleapis|places" …` hits `replaces` / `places` in comments and the place-field imports | **PASS** | The baseline grep was too broad (auditor error). Corrected evidence: `rg -n "maps\.googleapis|google\.maps|importLibrary\(" apps/website/src/app --glob '!**/*.spec.ts'` hits only `shared/map/maps-loader.service.ts`, `shared/places/google-place-search.ts` and the #5 `shared/map/live-map.component.ts`. No Google call is made outside the loader and `shared/places`, and there is no Places route in `apps/api` |
| h | `dd95c1a` reshapes tests so the G7-3, G7-5 and G7-33 greps run clean: memory-only scan moved into `customer-static.spec.ts`, `sendsCredentials()` helper, `Etc/GMT-3` instead of `Africa/Nairobi` in the `toRequest` stub, one comment reworded | **PASS, with a note** | The assertions are unchanged. The `Etc/GMT-3` stub equals EAT, so it hides finding 1. The finding-1 fix must test two zones (ND T17 as amended) |

#### Item status at re-audit 1

| Item | Status | Evidence (auditor) |
|---|---|---|
| G7-1, G7-2 | closed | `customer.routes.ts:46-109`: componentless `new` parent with `providers`, entry guard and three titled children; five #7 stubs with `navKey: 'home'`, `pushed: true`. `customer-links.ts` paths equal NC§W1; no hard-coded `/app/customer/` elsewhere in the customer area or `shared/`; NC§W9.1, NC§W9.11 |
| G7-3 | closed except the deadline (finding 1) | store and memory-only scan; NC§W9.4–W9.6, W9.9 |
| G7-4, G7-5, G7-6 | closed | NC§W9.2, W9.3, W9.7, W9.8, W9.10, W9.15; no `withCredentials`/interceptor in the customer area; flag `false` in both environment files |
| G7-7 … G7-14 | closed | `kit-additions-7.spec.ts`; #5/#6 kit spec files unchanged and passing; `_tokens.scss` unchanged against `55af009`; no `NgTemplateOutlet`/`viewChild` left in `card`, `section-label` or `dialog.component` |
| G7-15 … G7-24, G7-27, G7-28 | closed | one spec file per component, each with render, inputs, accessible name, focus ring and token checks (`testing/css.ts` `declared`, `tokensOnly`, `noShadow`) |
| G7-25 | **open (finding 2)** | combobox, debounce, pick and attribution placement correct; clear space short |
| G7-26 | **open (finding 3)** | region, language, cache, fallback and no-proxy correct; Details session wrong |
| G7-29, G7-30, G7-32 | closed | H T1–T19, NC T1–T10, NR T1–T17; copy verbatim; WQ-29 no ETA and no `locationUpdates$` (`home.page.ts` uses `statusChanges$`, `onStateChange`, one `setInterval`). G7-32's request body inherits finding 1 through `toRequest` and re-checks with it |
| G7-31 | **open (finding 1; Places via findings 2–3)** | all other ND rules met |
| G7-33 | **open (finding 1)** | WQ-25/26/29 met as recorded; WQ-2 deadline part not met |
| G7-34 … G7-36, G7-38, G7-40 | closed | NC§W9.17(a)–(f) pass; scans in the evidence lines return no hits; marketing diff empty; `OnPush` on every new component; conventional commits |
| G7-37 | closed except ND T17 / T21a (finding 1), ND T11 (finding 3), ND T22 (finding 2) | coverage complete for the original lists |
| G7-39 | closed | 354.17 kB raw ≤ 360.00; stats inputs clean |

#### Re-audit 2 checklist

1. Findings 1–3 fixed. ND T11, T17, T21a and T22 as amended in `b98ca6e` are present and pass.
2. `npx ng test --watch=false` 0 failures; `npx ng build --stats-json` initial total ≤ 360.00 kB raw with clean inputs.
3. Owner Q7-5 (EAT label words): if answered before re-audit 2, the caption matches the answer; otherwise the proposed copy.

### Baseline verdict: FAIL (not built, 2026-10-29)

None of the four views exists. `/app/customer/home` and `/app/customer/new` are #6 `ViewStubComponent` routes. `new/details` and `new/review` do not exist, and nor do the wizard store, guards, errands API, Places search or any of the 13 new #7 components. The items below are the build list. Every item is a **blocker** unless it says minor.

### Merge preconditions (not build items)

| Precondition | State on 2026-10-29 | Effect on #7 |
|---|---|---|
| #6 (`feat/website-auth-shell`, re-audit 3 PASS at `32ea1a1`) and its own preconditions (PR #20, #22, #25, #26) | open | #7 is stacked on #6. It must not be merged before #6 |
| #8 (`feat/website-customer-checkout`) | specced, not built | #7 builds `nm-fixed-cta`, `nm-choice-chip` and the receipt parts once (NC§W9b). #8 reuses them. If #8 lands first, #7 reuses #8's versions instead, and this report is updated at re-audit |
| Owner WQ-1 (production Maps key with Places API (New) enabled) | open (deployment) | No code change. Without a key the saved-address fallback runs (WQ-25) |

### Owner decisions that apply to this section

| Id (board) | Spec's first id | Decision (owner) | Where it lands |
|---|---|---|---|
| WQ-25 | Q7-2 | Places runs in the browser through the Maps JS API with the WQ-1 key (Places API (New)). Session tokens, 300 ms debounce, per-session cache, Kenya only. Saved addresses without a key. No API proxy (2026-10-28) | G7-10, G7-25, G7-26, G7-31 |
| WQ-26 | Q7-3 | Google's attribution under the suggestion list on the web; the apps follow in #27 (2026-10-28) | G7-25, G7-33 |
| WQ-29 | Q7-4 | Home active card follows the built app: no ETA (2026-10-29) | G7-23, G7-29, G7-33 |
| WQ-34 | — | Marketing initial bundle ≤ 360 kB raw (`npx ng build` "Initial total"). The PR reports the figure. Signed-in code stays lazy, with the same static checks as #6 (2026-10-29) | G7-38, G7-39 |
| WQ-33 | — | (#6) Session layer lazy. The framework-feature rules from the #6 re-audit 2 note apply to every later issue | G7-14, G7-38 |
| WQ-15, WQ-16 | — | (#6) Side nav kept on pushed routes from 768px, and white | G7-1 (route data) |

**WQ-2** was open at the baseline. **Answered by the owner on 2026-10-29** (#7 issue comment): activity times (greeting, Recent) use the browser's local time; deadlines use EAT and are labelled as EAT. Applied at re-audit 1 (G7-33 amended, finding 1). Still open: **Q7-5** (EAT label words; build default = the proposed caption).

### Current-state evidence (baseline)

| Fact | Evidence |
|---|---|
| Home and wizard are #6 stubs | `src/app/app-area/customer.routes.ts:45` (`home`, `stubLabel: 'Home'`, stub), `:47` (`new`, `navKey: 'new'`, `pushed: true`, stub, no `title`); no `new/details`, `new/review`, `tasks/…`, `notifications` route |
| No #7 folders | `src/app/app-area/` has no `customer/`; `src/app/shared/ui/` has no `wizard-frame`, `stepper`, `fixed-cta`, `category`, `choice-chip`, `receipt`, `notification-bell`, `avatar`, `search-entry`, `active-task-card`, `task-row`, `place-field`, `shopping-list`; no `src/app/shared/places/` |
| Icon registry lacks the #7 names | `src/app/shared/ui/icon/icons.ts:8-34`: 14 #6 names only. `location` and `person` exist and are reused (NC§W9a) |
| Back button cannot be disabled | `src/app/shared/ui/back-button/back-button.component.ts`: inputs `fallback` only; `nm-pushed-header` has no `backDisabled` |
| `nm-field` lacks the place-field inputs | `src/app/shared/ui/field/field.component.ts:30-46`: no `leadingIcon`, `busy` or combobox attributes |
| `nmFieldValue` writes the initial value only | `src/app/shared/ui/field/field-value.directive.ts:16` (`ngOnInit` only) |
| Maps loader cannot load Places | `src/app/shared/map/maps-loader.service.ts:55` imports `maps` and `marker` only; no public `importLibrary` |
| No public realtime state listener | `src/app/core/realtime/realtime.service.ts:117` `stateListeners` is private; only `showReconnecting` uses it |
| No `formatHours` / `initialsFor` | `rg -n "formatHours|initialsFor" apps/website/src/app` → no hits |
| Kit files #7 reaches use WQ-33-costly features | `shared/ui/card/section-label.component.ts:3,8` and `card.component.ts:3,8` (`NgTemplateOutlet`); `shared/ui/overlay/dialog.component.ts:3,43` (`NgTemplateOutlet`) and `:73-74` (`viewChild`) |
| No preview flag | `src/environments/environment.ts`: no `quotePreviewEnabled` |
| No third-party asset folder | `src/assets/` holds `app-icon-192.png`, `app-icon.svg` only |
| #6 static tests scope | `src/styles/auth-static.spec.ts:11` `FORBIDDEN_EAGER` (`core/auth`, `core/realtime`, `app-area`, `shared/ui`); `:48-64` `ISSUE_6_DIRS` (includes `app-area`, so #7 files under `app-area/customer/` are covered by F9.48–F9.50; new `shared/ui/*` and `shared/places` folders are not) |
| Build health | Not re-run at baseline: this worktree has no `node_modules`. The code equals `32ea1a1`, where the #6 re-audit 3 ran 48 files / 412 tests with 0 failures and an initial total of 351.44 kB raw / 96.31 kB transfer. That is the #7 reference figure; the WQ-34 headroom is 8.56 kB |
| API (on this branch) | `apps/api/src/errands/errands.controller.ts`: `GET /errands` (`:62`, multi-status), `GET /errands/defaults` (`:85`), `POST /errands` (`:51`), `POST /errands/:id/submit` (`:208`), `PATCH /errands/:id/status` (`:236`, `Idempotency-Key` optional); `customer-accounts.controller.ts:28` `GET /customers/me/addresses`; `notifications.controller.ts:26` `GET /notifications/unread-count`. All exist. No Places endpoint, and none is to be added (WQ-25) |

### Items

Each item gives the **current** state, the **target** (spec section) and the **evidence at re-audit**. `H Tn`, `NC Tn`, `ND Tn` and `NR Tn` are the cases in each view spec's "Required tests". `NC§W9.n` is foundation case n. Every listed case is its own `it(...)`.

#### A. Routes, links and wizard foundation (NC§W0–§W8)

**G7-1 Customer routes: Home and the wizard replace the #6 stubs**
- Current: `customer.routes.ts:45,47` load `ViewStubComponent`.
- Target: NC§W1. `home` loads `HomePage` (`app-area/customer/home/home.page.ts`), keeps `title: 'Home · Nitume'` and `navKey: 'home'`, and drops `stubLabel`. `new` becomes a componentless parent with `data { role, navKey: 'new', pushed: true }`, `providers: [TaskDraftStore]` and `canActivate: [wizardEntryGuard]`. It has three lazy children: `''`, `details`, `review`. Their `title` strings are `New task · Nitume`, `Task details · Nitume` and `Review · Nitume`, read by Angular's default `TitleStrategy` (no custom strategy, WQ-33). The children carry the step and leave guards.
- Evidence: NC§W9.1; `rg -n "ViewStubComponent|stub\b" apps/website/src/app/app-area/customer.routes.ts` shows the stub only on the five NC§W1 stub paths and the #6 `track`, `history` and `profile` routes.

**G7-2 `customerLinks` and the #7 stub routes**
- Current: none. The #8 spec names `/tasks/:errandId/quote` and `/tasks/:errandId/payment`. The first #7 spec draft used `/pay`, which `8feae7e` corrected.
- Target: NC§W1 table, in `app-area/customer/customer-links.ts`. Paths match the #6 routes (`/home`, `/new`, `/track`, `/track/:errandId`, `/history`, `/profile`, the same as `CUSTOMER_NAV`) and the #8 A§1 routes. `ViewStubComponent` stubs are declared for `tasks/:errandId`, `tasks/:errandId/quote`, `tasks/:errandId/payment`, `tasks/:errandId/evidence` and `notifications`, each with `pushed: true`, `navKey: 'home'`, no `stubLabel` and no `title`. Every Home and wizard link uses `customerLinks`; no view hard-codes `/app/customer/…`.
- Evidence: NC§W9.11; `rg -n "'/app/customer/" apps/website/src/app/app-area/customer apps/website/src/app/shared --glob '!**/*.spec.ts'` hits only `customer-links.ts`.

**G7-3 `TaskDraftStore`**
- Current: none.
- Target: NC§W2. `@Injectable()` provided by the `new` parent route. Signals, memory only. It has every field and computed value in the listing, including `submitting`, plus `start`, `changeCategory` (Flutter rules), `reset`, `finish` and `toRequest`. No storage, no `effect()`.
- Evidence: NC§W9.4, NC§W9.5, NC§W9.6, NC§W9.9; ND T17; `rg -n "localStorage|sessionStorage" apps/website/src/app/app-area/customer` → no hits.

**G7-4 Wizard guards, leaving, tab close, orphan DRAFT**
- Current: none.
- Target: NC§W3, NC§W8.
  - `wizardEntryGuard`: fresh start only from outside `/app/customer/new`; `?category` validated, with an invalid value removed by a `replaceUrl` `UrlTree`.
  - `wizardStepGuard(n)`: redirects to step 1 or to `openerUrl` after a submit.
  - `wizardLeaveGuard`: no prompt without data, after a submit or between steps; discard confirm otherwise; blocked silently while submitting.
  - Step 1 Back confirms before navigating, through `NmBackEvent.preventDefault()`.
  - A `window:beforeunload` host listener on `nm-wizard-frame` while `hasData && !submitted`.
  - `cancelDraft` best effort when leaving with an unsubmitted DRAFT.
- Evidence: NC§W9.2, NC§W9.3, NC§W9.7, NC§W9.8, NC§W9.10; NC T9; NR T15.

**G7-5 Customer data services and `apiErrorOf`**
- Current: none.
- Target: NC§W5. `CustomerErrandsApi` (`list`, `defaults`, `create`, `submit`, `cancelDraft`), `CustomerAddressesApi` (`GET /customers/me/addresses`) and `NotificationsCountApi` (`GET /notifications/unread-count`), all under `app-area/customer/data/`. Each uses `HttpClient` through the #6 lazy interceptor, with no `withCredentials` and no extra interceptor. `apiErrorOf` reads `code`, `pointType`, string or array `message`, and status 0. Only existing endpoints are used (the issue's common criterion).
- Evidence: NC§W9.15; H T6; ND T21; NR T6; `rg -n "withCredentials|HTTP_INTERCEPTORS|withInterceptors" apps/website/src/app/app-area/customer` → no hits; `rg -n "places" apps/api/src --glob '*.controller.ts'` → no hits (no proxy, WQ-25).

**G7-6 `environment.quotePreviewEnabled`** (minor)
- Current: absent.
- Target: NC§W6. Committed as `false`, added to the `Environment` interface and `environment.local.example.ts`. No other environment change.
- Evidence: NR T2, NR T4 (both flag values); `git diff 55af009 -- apps/website/src/environments` adds only this key.

#### B. Kit additions (NC§W9a)

**G7-7 `nm-icon` entries**
- Current: 14 #6 names (`icons.ts:8-34`).
- Target: add `search`, `notifications`, `shopping-bag`, `local-shipping`, `fact-check`, `hourglass`, `bookmark`, `close`, `add` and `remove` (Material paths; the existing Apache-2.0 header covers them). Reuse `location` for Go There For Me and the place fields, and `person` for the avatar fallback. No `place` and no `business-center`. `categoryIcon(wire)` sits next to `categoryName`.
- Evidence: NC§W9.16 (icons); NC T7; `git diff 55af009 -- apps/website/package.json` adds no icon package.

**G7-8 `nm-back-button` `disabled`, `nm-pushed-header` `backDisabled`**
- Current: not supported.
- Target: NC§W9a. Renders the `disabled` attribute and `aria-disabled="true"`, with no emission and no navigation; the arrow is slate-400. Defaults unchanged, so the #6 tests pass unchanged.
- Evidence: NC§W9.13, NC§W9.16; NR T7; the #6 `back-button` and `pushed-header` spec files are unchanged and passing.

**G7-9 `nm-field` place-field inputs and `nmFieldValue` updates**
- Current: `field.component.ts:30-46` has neither; `field-value.directive.ts:16` writes only in `ngOnInit`.
- Target: NC§W9a.
  - New inputs: `leadingIcon`, `busy` (spinner `aria-hidden`, input `aria-busy`, no spin under reduced motion), and `role`, `ariaAutocomplete`, `ariaExpanded`, `ariaControls`, `ariaActivedescendant` (absent by default).
  - `nmFieldValue` writes a changed input after init, unless it equals the value the control last emitted (no caret jump).
  - #5 and #6 defaults unchanged.
- Evidence: NC§W9.16; ND T6, ND T12; the #5 `field` and #6 `field-value` spec files pass unchanged.

**G7-10 `MapsLoaderService.importLibrary` (WQ-25)**
- Current: `maps-loader.service.ts:55` loads `maps` and `marker` only.
- Target: NC§W9a. Adds `importLibrary('places')`: `load()` first; `null` when unavailable or rejected; never a script without a key. `load()` itself is unchanged.
- Evidence: NC§W9.16; ND T10, ND T11; the #5 maps-loader tests pass unchanged.

**G7-11 `RealtimeService.onStateChange`**
- Current: `realtime.service.ts:117` `stateListeners` is private.
- Target: NC§W9a. A public `onStateChange(listener, destroyRef): () => void` over the same set. `showReconnecting` behaviour is unchanged.
- Evidence: NC§W9.16; H T16; the #5 and #6 realtime suites pass unchanged.

**G7-12 `formatHours` (+ pipe) and `initialsFor`**
- Current: absent.
- Target: NC§W9a, in `shared/format/formatters.ts` and `format.pipes.ts` (added to `FORMAT_PIPES`).
- Evidence: ND T16; NC§W9.16 (`initialsFor` cases); H T2.

**G7-13 No new type style, no new colour** (minor)
- Current: the `_tokens.scss` type map is #5 plus the #6 five.
- Target: NC§W9a. No entry is added to the type map and no `--nitume-*` colour token is added. In-between Flutter styles use the `nm-type` overrides listed in the NC§W9a table (`row-title` 11.5 or 13, `body` 13, `greeting` for captions, `card-title` white, `num-meta-lg` slate-400, `button-sm` white). Amounts and quantities use `<span nmNum>` (family only). `NumStyle` is unchanged.
- Evidence: `git diff 55af009 -- apps/website/src/styles/_tokens.scss` is empty; `rg -n "\-\-nitume-[a-z0-9-]+:" apps/website/src/styles/_tokens.scss | wc -l` is unchanged from `55af009`.

**G7-14 WQ-33 conversions in kit files the #7 routes reach**
- Current: `NgTemplateOutlet` in `card.component.ts:3,8`, `section-label.component.ts:3,8` and `dialog.component.ts:3,43`; `viewChild` in `dialog.component.ts:73-74`.
- Target: NC§W9a last row, NC§W10 item 3. `NgTemplateOutlet` → the #6 `nmTemplateOutlet`; dialog `viewChild` → an `ElementRef` lookup in the same hook. Rendered markup, classes, focus trap and tests are unchanged (precedent: #6 re-audit 2, ruling (c)). The panel (`panel.component.ts`) and `list-item` may stay as they are while no #7 route reaches them.
- Evidence: NC§W9.16 (the three #5 spec files pass unchanged: `git diff 55af009 -- apps/website/src/app/shared/ui/card/*.spec.ts apps/website/src/app/shared/ui/overlay/*.spec.ts` has no removed lines); NC§W9.17(c).

#### C. New shared components (NC§W9b; built once, reused by #8, #10, #11 and #12)

All of them: standalone, `OnPush`, signal inputs, `nm-` prefix, under `shared/ui/<folder>/`; mixins only in `styleUrl` `.scss` files (F9.60); colours through `--nitume-*` only; focus ring via `nm-focus-ring`; hover via `nm-hover`.

**G7-15 `nm-wizard-frame` and `nm-stepper`**
- Current: none.
- Target: NC§W4.
  - Frame: the #6 `nm-pushed-header` (`title`, `step`, `steps` 3, `fallback`, `backDisabled`), the stepper, the body, then `nm-fixed-cta` with the `[nmWizardAbove]` and `[nmWizardCta]` slots. Max 640px and centred from 768px. The `beforeunload` host listener (G7-4).
  - Stepper: three 4px segments, gap 6, green done / slate-line empty, `role="img"` `Step n of 3`.
  - The frame reuses the #6 header; it does not copy a header.
- Evidence: NC§W9.12, NC§W9.13; NC T1, NC T2; NR T1.

**G7-16 `nm-fixed-cta` (shared with #8)**
- Current: none (specified in `customer-x-awaiting-quote.md` §Components for #8).
- Target: NC§W4. Below 768px: fixed, slate background, `8px 20px 6px` + safe-area inset, content padded so nothing hides under it. From 768px: inline. The `above` slot sits 10px above the button. Toast offset = bar height below 768px. No `box-shadow`.
- Evidence: NC§W9.14; NR T8 (toast offset).

**G7-17 `nm-category-tile` and `nm-category-grid`**
- Current: none (the kit leaves the tile to #7, K§3; the marketing `app-category-card` is not reused).
- Target: NC §Components.
  - Grid: 3 columns at every width, 5 tiles in canonical order, an empty sixth cell.
  - Tile: white with a slate-line border, `r-m`; icon box 32 in `green-050` with a blue icon; label `nm-type(row-title, 11.5px)` with line-height 1.3.
  - Selected state: green border plus a 2px inset `green-050` ring via outline or a second border, never `box-shadow`. Hover border blue.
  - `select` mode is a `radiogroup` with roving tabindex and `aria-posinset`/`setsize`; `link` mode renders `<a>` to `customerLinks.newTask(wire)`.
- Evidence: NC T1 … T7, NC T10; H T5.

**G7-18 `nm-choice-chip` and `nm-choice-chip-group` (shared with #8)**
- Current: none.
- Target: ND §`nm-choice-chip`. Pill, `8px 13px`, `chip` type. Unselected: slate fill, slate-line border, blue text. Selected: blue fill and border with **white** text, never green. 48px hit area. `disabled` input (the #8 saving state). The group is a radiogroup with roving tabindex and arrow keys. Values match `customer-x-awaiting-quote.md` §Components so #8 needs no second chip.
- Evidence: ND T14.

**G7-19 `nm-receipt-row`, `nm-receipt-caption`, `nm-receipt-group` (shared with #8)**
- Current: none.
- Target: NR "Receipt parts".
  - Row: label `nm-type(body, 13px)`; amount `formatKesOrDash` in `<span nmNum>`. `isTotal` adds 700, a slate-line top border, margin-top 6 and padding `10px 0 6px`. `amountLabel` gives the accessible name.
  - Caption: the `greeting` values, padding-top 8.
  - Group: a hairline, 10px margin and 4px padding above.
  - Values match the #8 spec.
- Evidence: NR T16, NR T3, NR T4.

**G7-20 `nm-notification-bell` (shared with #11)**
- Current: none (the kit assigns it to #11; Home needs it first).
- Target: H §Components. A 48×48 link followed in-app (`followInAppLink`). Inside: a 36px white circle with a slate-line border and an 18px blue `notifications` icon. When unread > 0: a 7px `--nitume-red` dot with a 1.5px white ring (OA-13; red is a status accent here, not a fill). Accessible name `Notifications, N unread` / `Notifications`.
- Evidence: H T3.

**G7-21 `nm-avatar` (shared with #10, #11, #12)**
- Current: none.
- Target: H §Components. A blue circle at 36, 60 or 70px; white 700 initials (13, 20 or 24px) from `initialsFor`; `person` icon fallback. As a link: 48×48 hit area with an accessible name from the input. White on blue only.
- Evidence: H T2; component tests for the three sizes.

**G7-22 `nm-search-entry`**
- Current: none.
- Target: H §Components. A **link** styled as a field (not an input). White, slate-line border, `r-m`, padding `13px 16px`, min-height 48. `search` icon 15 slate-400, gap 10. Placeholder text `body` in slate-400, which is also the accessible name. Hover border blue.
- Evidence: H T4.

**G7-23 `nm-active-task-card` (WQ-29)**
- Current: none.
- Target: H §Components.
  - Blue fill, `r-m`, padding 18, no shadow; the card itself is not clickable.
  - Compact info chip with the category name and the `#reference` suffix in `nmNum`.
  - Title `nm-type(card-title, $color: white)`.
  - Meta `nm-type(num-meta-lg, $color: slate-400)` plus `nmNum`; never an ETA (WQ-29).
  - Primary small button rendered as `<a>`.
- Evidence: H T10, H T11, H T12.

**G7-24 `nm-task-row` (shared with #11 History)**
- Current: none.
- Target: H §Components. The whole row is an `<a>`: white, slate-line border, `r-m`, padding `13px 15px`. Title `nm-type(row-title, 13px)` with ellipsis. Meta `formatDayTime` in `nmNum="meta"`. Trailing regular `nm-status-chip` from `[customerStatus]`. Hover border blue.
- Evidence: H T14, H T15.

**G7-25 `nm-place-field` and Google attribution (WQ-25, WQ-26)**
- Current: none.
- Target: ND §`nm-place-field`, ND §Places.
  - Built on `nm-field` (G7-9) as an ARIA 1.2 combobox with a `listbox`. Leading icon `location`.
  - Search: 2-character minimum, 300 ms debounce, only the latest answer used. Saved addresses are listed on focus with empty text.
  - A pick holds only while the text matches it; the pick writes the text through `nmFieldValue`.
  - Search failure shows `Couldn't search places. Check your connection.` through the field `error`.
  - Keyboard: Arrow, Enter, Escape. Focus, blur and keys come from bubbling host listeners; `focusRequest` acts from `ngOnChanges`.
  - **Attribution:** `img[alt="Google Maps"]` with `src` `assets/third-party/google-maps-attribution.svg`, Google's unmodified asset, 16px high, placed after the options and outside the `listbox`. Shown only while Google suggestions are listed. The asset file sits in `src/assets/third-party/` with a README line giving its source URL.
- Evidence: ND T6 … T10, ND T12, ND T22; NC§W9.17(a) (the asset is the only excepted path).

**G7-26 `PLACE_SEARCH`, `GooglePlaceSearch`, `SavedPlaceSearch` (WQ-25)**
- Current: none.
- Target: ND §Places, under `shared/places/`.
  - Token factory: a key gives Google; no key gives saved addresses.
  - Google goes through `MapsLoaderService.importLibrary('places')`. `AutocompleteSuggestion.fetchAutocompleteSuggestions` with `includedRegionCodes: ['ke']`, `language: 'en'` and an `AutocompleteSessionToken`. `Place.fetchFields` asks for exactly `id`, `displayName`, `formattedAddress`, `location`, with the same token.
  - Per-session cache keyed on token + normalised query, cap 200, dropped after Details. A new token after each pick. `composeAddressText`. A place without a location rejects. A library-load failure gives the search-failure line.
  - Saved search: label or address contains, only entries with `lat`/`lon`, `placeId: null`.
  - No key: no script, plus the C-40 notice.
  - **No API proxy** and no Nitume token sent to Google.
- Evidence: ND T7, ND T9, ND T10, ND T11; `rg -n "maps\.googleapis|google\.maps|importLibrary\(" apps/website/src/app --glob '!**/*.spec.ts'` shows only the kit loader, `shared/places/` and the #5 live map (corrected at re-audit 1; the baseline grep matched the word "replaces"); no new `apps/api` route. Re-audit 1: Details through `placePrediction.toPlace()` (finding 3).

**G7-27 `nm-shopping-list`**
- Current: none.
- Target: ND §`nm-shopping-list`.
  - Rows with hairlines between them. The name field has `maxlength` 80 and the names `Item n`.
  - Stepper: 32px circles in 48px hit areas; value `<span nmNum>` at 13/600 blue; range 1–99; disabled ends with `aria-disabled`. Names `Decrease/Increase quantity of <item>`.
  - Remove: `close` with the name `Remove item <name>`, hidden for a single row.
  - `+ Add item` link: hidden at 30 rows, and it focuses the new row.
  - Error `Add at least one item.`
- Evidence: ND T13, ND T3 (list error).

**G7-28 Component test minimum for every new #7 component** (F§9.8 rule)
- Target: each component in G7-15 … G7-27 has its own spec file covering: renders, inputs, accessible name, focus-ring class, and token use (custom-property names, never hex).
- Evidence: one spec file per component; the auditor greps each for the five checks.

#### D. Views

**G7-29 `HomePage` (`v-home`)**
- Current: the #6 stub (top bar `Home` only).
- Target: `customer-v-home.md`.
  - Header and entry points:
    - Greeting by local hour (WQ-2 default).
    - First name as the `h1`, or a visually hidden `h1` `Home` when there is no name.
    - Bell and avatar; search row.
    - `Categories` grid in link mode.
  - Tasks region:
    - Loading: 140px skeleton plus two 72px skeletons.
    - Error: `Couldn't load your tasks.` + `Try again`.
    - Empty: nothing below the categories, and no empty message.
    - `In progress`: the first active errand, `+N more in progress`, the per-state meta, button and target table.
    - `Recent`: up to two rows.
  - Data: the two list calls plus unread, in parallel.
  - Realtime: join and leave the room, reload on the status change and on reconnect through `onStateChange`, never `location:update`.
  - 30 s poll while disconnected and visible.
  - Layout: CSS-only layouts at 768 and 1024.
  - `Pay now →` is a plain link; #8 adds the intent.
- Evidence: H T1 … T19; the issue's feature criterion "empty home state" is H T8.

**G7-30 `v-new-category` page**
- Current: the #6 stub (skeleton).
- Target: `customer-v-new-category.md`. `New task`, `Step 1 of 3`, `What do you need done?`, five tiles (no Business Tasks), `Continue →` disabled until a tile is chosen, `?category` preselection, and the discard dialog copy and order.
- Evidence: NC T1 … T10.

**G7-31 `v-new-details` page**
- Current: none.
- Target: `customer-v-new-details.md`.
  - The per-category card matrix, with exact headings, labels and placeholders.
  - Every validation message: shown after the first `Continue →`, then live. Focus on the first error.
  - Deadline chips with the Flexible caption from `GET /errands/defaults` (`formatHours`, hidden on failure).
  - Budget rules (row 45), `toRequest` (local 23:59 as UTC, `lon`, no `urgency`), `focusOnReturn`.
  - Places as G7-25 and G7-26.
  - `<form novalidate>` with no forms module.
- Evidence: ND T1 … T23. The issue's feature criteria "per-category field rules" and "validation errors" are ND T1 and ND T3 (with T4, T5, T18).

**G7-32 `v-new-review` page**
- Current: none.
- Target: `customer-v-new-review.md`.
  - Variant A notice (no estimate call), plus the item-budget card when the budget is > 0.
  - Variant B behind the flag: `QUOTE_ESTIMATE`, whose default makes no HTTP request.
  - `Submit task →`: create, then submit. Retry submits only, never a second create.
  - Error table: generic toast; 400 on create → API message and back to step 2; 400 on submit → generic. 422 `location_outside_service_area` → no toast, cancel the DRAFT if one exists, the notice plus `Change location` above the CTA, CTA disabled until a re-pick.
  - Success → `replaceUrl` to `/app/customer/tasks/<id>/quote`, then `finish()`.
  - Submitting state disables Back.
- Evidence: NR T1 … T17. The issue's feature criteria "estimate request" and "submit success/failure paths" are NR T2, T4, T5 and NR T6 … T14.

**G7-33 Owner-decision behaviour (WQ-25, WQ-26, WQ-29, WQ-2)** (cross-check item; **amended at re-audit 1** for owner WQ-2, answered 2026-10-29: activity times local, deadlines EAT and labelled EAT)
- Target (as amended): WQ-25, WQ-26 and WQ-29 as below. **WQ-2:** greeting and Recent times in browser local time. `Today`/`Tomorrow` deadlines are 23:59 EAT of the EAT date, whatever the browser zone, with the EAT caption (ND Rules, proposed copy Q7-5). EAT helpers (`eatDayKey`, `…Eat` formatters) are **allowed in `app-area/customer` for deadline code only** (the store's `deadlineAt` / `toRequest` and the deadline caption); greeting, Recent and every other activity time keep the local formatters.
- Evidence (as amended): ND T17 (two zones), ND T21a; H T1, H T14 (local); `rg -n "Africa/Nairobi|Eat\b|eatDayKey|formatDeadlineEat|formatDayTimeEat" apps/website/src/app/app-area/customer --glob '!**/*.spec.ts'` hits only deadline code (store `deadlineAt`, the deadline caption in `new-details.page.*`).
- Baseline target (superseded for WQ-2):
  - WQ-25: browser path only, Kenya, 300 ms, session tokens, per-session cache, saved-address fallback, no proxy.
  - WQ-26: attribution shown under Google suggestions only.
  - WQ-29: no ETA and no `location:update` on Home.
  - WQ-2: browser local time everywhere it applies, with no EAT-only code path added. Each is decided only as recorded.
- Evidence: ND T7, ND T10, ND T11, ND T22; H T10, H T16; `rg -n "Africa/Nairobi|formatDayTimeEat|formatDeadlineEat" apps/website/src/app/app-area/customer` → no hits.

#### E. Rules, tests and health

**G7-34 Tokens, typography and contrast in #7 code**
- Target:
  - No hex, `rgb(a)`, `hsl(a)`, named colour, `box-shadow` or marketing variable in #7 code (the Google attribution asset excepted by exact path, WQ-26).
  - Fira Code only through `nmNum` and the `num-*` mixins, on every numeric field the four specs list: step counters, reference, active meta, `+N`, Recent times, budget input and prefix, quantities, `{duration}`, amounts.
  - White text on the blue card, the blue avatar, the selected chip and the green buttons.
  - Green only for the primary buttons, the selected tile border, done stepper segments, the active nav item and the focus ring. Red only for errors and the unread dot. Amber is not used.
- Evidence: NC§W9.17(a)(b); H T12; NR T16; `rg -n "#[0-9A-Fa-f]{3,8}\b|rgba?\(|hsla?\(|box-shadow" <#7 files>` → no hits.

**G7-35 Domain rules**
- Target:
  - Five MVP display names only, never wire values in the UI, never `Business Tasks`.
  - States through `customerStatus()` / `parseErrandStatus`, with unknown values dropped. DRAFT is never listed. RUNNER_ASSIGNED reads `Finding a runner` with no runner name.
  - No wallet or escrow wording, no `KES`.
  - Item budget is never added to a fee total; service fee, runner fee and merchant payment stay separate.
- Evidence: H T5, H T10, H T15, H T19; NC T1, NC T4; NR T4, NR T17; `rg -ni "wallet|escrow" apps/website/src/app/app-area/customer apps/website/src/app/shared --glob '!**/*.spec.ts'` → no hits.

**G7-36 Responsive and accessibility**
- Target:
  - No horizontal scroll at 360px; uses the width at ≥ 1280px (the Home two-column grid).
  - 48×48 targets.
  - Focus ring everywhere, and no bare `outline: none`.
  - Radio semantics for tiles and chips. Combobox semantics for place fields.
  - `role="alert"` errors; `role="status"` skeletons.
  - Visually hidden `h1` on Home without a name.
  - The fixed CTA never hides the focused field.
  - Focus on entry follows the #6 `focusPageHeading` rule (`ngAfterViewInit` for field focus).
- Evidence: H T7, H T18; NC T5; ND T12, ND T20; NR T7; NC§W9.17(f).

**G7-37 Required Vitest cases: coverage table**
- Current: no #7 spec files.
- Target: every case below is its own `it(...)`; `cd apps/website && npx ng test --watch=false` has 0 failures, and the 412 #5/#6 tests still pass.

| Cases | Item |
|---|---|
| NC§W9.1 | G7-1 |
| NC§W9.2, NC§W9.3, NC§W9.7, NC§W9.8, NC§W9.10 | G7-4 |
| NC§W9.4, NC§W9.5, NC§W9.6, NC§W9.9 | G7-3 |
| NC§W9.11 | G7-2 |
| NC§W9.12, NC§W9.13 | G7-15 |
| NC§W9.14 | G7-16 |
| NC§W9.15 | G7-5 |
| NC§W9.16 | G7-7 … G7-12, G7-14 |
| NC§W9.17 | G7-38 (also G7-34, G7-36) |
| NC§W9.18 (build, not Vitest) | G7-39 |
| NC T1 … T10 | G7-30 (T1–T7, T10 also G7-17) |
| H T1 … T19 | G7-29 (T2 G7-21, T3 G7-20, T4 G7-22, T10–T12 G7-23, T14–T15 G7-24) |
| ND T1 … T23 | G7-31 (T6–T12, T22 G7-25/G7-26; T13 G7-27; T14 G7-18; T16 G7-12) |
| NR T1 … T17 | G7-32 (T16 G7-19) |
| Issue #7 feature criterion | per-category field rules ND T1; validation errors ND T3–T5, T18; estimate request NR T2, T4, T5; submit success/failure NR T6–T14; empty home H T8 |

**G7-38 WQ-33 static checks for #7 code (WQ-34 "same static checks as #6")**
- Current: the #6 checks cover `app-area/**` and the #6 folders only (`auth-static.spec.ts:48-64`).
- Target: NC§W10 items 2–5, in a new `src/styles/customer-static.spec.ts`:
  - (a) colour patterns;
  - (b) font literals;
  - (c) none of `effect(`, `afterNextRender`, `afterRender`, `viewChild`, `viewChildren`, `contentChild`, `NgTemplateOutlet`, `ngTemplateOutlet`, `ReactiveFormsModule`, `FormControl`, `FormGroup`, `FormsModule`, `ngModel`, `toObservable` in #7 code, meaning the files #7 adds plus every kit file a #7 route component imports (at least `shared/ui/card/*`, `shared/ui/overlay/dialog.component.ts`, `shared/ui/field/*`, `shared/ui/status-chip/*`, `shared/ui/states/*`, `shared/ui/notice/*`, `shared/map/maps-loader.service.ts`);
  - (d) no import from the `shared/ui` or `shared/map` barrels in #7 code;
  - (e) F9.50 eager walker, with `shared/places` added to `FORBIDDEN_EAGER`, plus a walker self-check;
  - (f) no bare `outline: none`.
  - `app.config.ts` still has no `withComponentInputBinding(` (F9.50 framework weight keeps passing).
- Evidence: NC§W9.17. The auditor reads the regexes and checks that each fails when one forbidden line is injected (as at #6 re-audit 2). `rg -n "effect\(|afterNextRender|viewChild|NgTemplateOutlet|ReactiveFormsModule|FormsModule|ngModel|toObservable" <#7 files>` → no hits.

**G7-39 WQ-34 bundle check**
- Current: 351.44 kB raw (#6 re-audit 3, identical code).
- Target: NC§W10 item 1. `npx ng build` "Initial total" **≤ 360.00 kB raw**. The PR body reports raw and transfer next to 351.44 kB. If the figure exceeds 360.00, it goes to the owner; the cap is not raised in code. The initial chunks contain no `core/auth`, `core/realtime`, `app-area`, `shared/ui` or `shared/places` input, and no `@angular/google-maps`, `@angular/forms`, `socket.io-client` or `engine.io-client`.
- Evidence at re-audit:
  1. `npx ng build --stats-json`: Initial total ≤ 360.00 kB raw.
  2. The stats inputs of every initial chunk list only the marketing files, the #6 shims (`core/lazy-session/**`, `app.config.ts`, `app.routes.ts`) and the packages `@angular/{core,common,router,platform-browser}`, `rxjs`, `tslib`, `zone.js`.
  3. The PR body figure matches the auditor's run.

**G7-40 Commits, layout, marketing unchanged** (minor)
- Target:
  - Conventional commits on `feat/website-customer-create-task`, scope `angular-website`. Kit additions (G7-7 … G7-14) go in their own commits, before the components that need them.
  - #7 view code under `app-area/customer/{home,new-task,data}/` plus `customer-links.ts`. New components under `shared/ui/<folder>/`. Places under `shared/places/`.
  - Every new component is `OnPush`.
  - Marketing pages, layout, header, footer, `styles.scss` and `index.html` are unchanged.
- Evidence: `git log --oneline 8feae7e..HEAD`; `git diff 55af009 -- apps/website/src/app/{pages,layout} apps/website/src/app/shared/{header,footer,category-card,profile-card,proof-item,ticket} apps/website/src/styles.scss apps/website/src/index.html` is empty; `rg -n "changeDetection" <new component files>` shows `OnPush` on each.

### Re-audit checklist for #7 (auditor)

1. G7-1 … G7-40 each closed with the evidence above.
2. Re-run `npx ng test --watch=false` (0 failures) and `npx ng build --stats-json` (G7-39 evidence 1–3).
3. Owner decisions WQ-25, WQ-26, WQ-29 and WQ-2 (deadlines EAT, labelled) are met as recorded (G7-33, amended at re-audit 1).
4. Copy check against the four specs' "Copy (exact)" sections, including the discard dialog, every validation message, the service-area notice and the Places notice.
5. Verdict PASS → `SCREEN_MAP.md` #7 rows → `matches-design`. Merge still waits for #6 and its preconditions.

---

<!-- Sections for issues #8 to #18 are appended below as their web specs are written. -->
