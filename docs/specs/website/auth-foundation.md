# Website signed-in app: sign-in, session, roles, guards and shell frame (`auth-foundation`)

- Issue: GitHub #6, "[Website] Foundation: phone + OTP sign-in, roles and signed-in app shell". Builder: `web-parity`. Build branch: `feat/website-auth-shell`. Depends on #5 (`docs/specs/website/ui-kit.md`, branch `feat/website-ui-kit`).
- This file holds what the eight #6 views share: routes, layouts, session and token handling (WQ-8), the HTTP interceptor, guards, role routing, the OTP policy, the new #6 components, configuration, the required Vitest list and the open questions. The view specs hold layout, copy and states:

| Surface | View | Spec |
|---|---|---|
| customer | `v-auth-phone` | `customer-v-auth-phone.md` |
| customer | `v-auth-otp` | `customer-v-auth-otp.md` |
| customer | `x-name-capture` | `customer-x-name-capture.md` |
| customer | `shell` | `customer-shell.md` |
| runner | `v-auth-phone` | `runner-v-auth-phone.md` (differences from the customer spec) |
| runner | `v-auth-otp` | `runner-v-auth-otp.md` (differences) |
| runner | `x-name-capture` | `runner-x-name-capture.md` (differences) |
| runner | `shell` | `runner-shell.md` |

- There is **no web mockup**. Sources, in order of authority: owner answers (BOARD rows, OA-n, WQ-3 and WQ-8 decided 2026-10-28), `docs/design/nitume_design_system.html` (styling), the web UI kit spec (components and tokens, never redefined here), the mobile specs (`docs/specs/customer/{v-auth-phone,v-auth-otp,x-name-capture,_shared}.md`, `docs/specs/runner/{v-auth-phone,v-auth-otp,x-name-capture,_shared}.md`), the built Flutter screens (`apps/customer_app/lib/src/{screens/auth,screens/shell,services/session.dart}`, `apps/runner_app/lib/src/{screens/auth,screens/shell,services/session.dart,services/onboarding_routing.dart}`, `packages/nitume_core/lib/src/{auth/otp_policy.dart,widgets/otp_code_field.dart,widgets/otp_resend_line.dart,widgets/brand.dart,widgets/nitume_tab_bar.dart}`) and the mockups (`docs/design/nitume_customer_app.html` lines 128–142, 317–341; `nitume_runner_app.html` lines 294–313).
- **(web adaptation)** marks a layout or browser choice the mobile sources do not make. It never changes content, copy, tokens or the component set. **(proposed)** marks copy the auditor wrote for a state the sources do not cover.

---

## 1. What exists in `apps/website` today and what #6 does with it

| Piece | Path | #6 decision |
|---|---|---|
| Routes: `''`, `business`, `diaspora`, `runner`, `auth`, `**` → `''`, all eager | `src/app/app.routes.ts` | Marketing routes move under a `MarketingLayoutComponent` (header + `<main>` + footer, exactly today's `AppComponent` template and styles). A new lazy `app` route is added (§2). Marketing page components and their output do not change |
| `AppComponent` renders `app-header`, `<main><router-outlet>`, `app-footer` around every route | `src/app/app.component.ts` | Becomes a bare `<router-outlet />`; the header/footer move to `MarketingLayoutComponent` so `/app/**` has neither. A test proves every marketing route still renders the header and footer (§9.1) |
| `AuthStore` keeps the user, access and refresh tokens in `localStorage` (`nitume.ws.user`, `nitume.ws.access`, `nitume.ws.refresh`) | `src/app/core/auth/auth.store.ts` | **Deleted** (WQ-8). Replaced by `SessionStore` (§4), memory only. On app start a one-time cleanup removes the three legacy keys so tokens left by the old page do not linger |
| `ApiService` (OTP request/verify, register) | `src/app/core/services/api.service.ts` | Replaced by `AuthApi` (§4.3). `register()` is not used by any view (the apps never call it) and is dropped with the old page |
| `/auth` page: login/sign-up tabs, phone + code in one card, `Full name` on sign-up, `Continue with Google` stub, writes tokens to `localStorage`, navigates to `/` | `src/app/pages/auth/auth.component.ts` | Off-system (slate inputs, 10px radius, box-shadows, raw `#fff`), no OA-17 states, no role routing, a fake Google button. What happens to it is **WQ-9** (§11): recommended replace with a role chooser; build default = the recommendation, in its own commit |
| Marketing CTAs (`Log in`, `Request a task`, `Apply to become a Runner`, `Talk to sales`, …) all link to `/auth` | `shared/header`, `pages/*` | Unchanged (marketing pages must not change). They keep pointing at `/auth`, which is why WQ-9 matters |
| `provideHttpClient(withFetch())`, `provideRouter(routes, withComponentInputBinding())` | `src/app.config.ts` | Gains `withInterceptors([authInterceptor])` (§5) and a `TitleStrategy` provider (§2); nothing else changes |
| `environment.ts` `{ apiBaseUrl }` (+ `mapsApiKey` from #5) | `src/environments/environment.ts` | Gains the link settings in §8 |

---

## 2. Routes

All signed-in and sign-in routes live under one lazy `app` entry, so the marketing bundle is unchanged. Customer and runner trees are separate lazy chunks.

```
/app                               AppEntryPage (splash) → session-based redirect (§6.4)
/app/offline?returnUrl=…           RestoreFailedPage (§4.6)
/app/customer/sign-in              customer v-auth-phone          guestGuard
/app/customer/sign-in/code         customer v-auth-otp            guestGuard, otpStepGuard
/app/customer/name                 customer x-name-capture        authGuard, roleGuard('customer'), needsNameGuard
/app/customer                      CustomerShell                  authGuard, roleGuard('customer'), hasNameGuard
    ''        → redirect 'home'
    home      v-home (#7)                                           tab Home
    new/…     v-new-category … (#7, pushed)                         nav item New task
    track     v-track (#9)            track/:errandId (#9)          tab Track
    history   v-history (#11)                                       tab History
    profile   v-profile (#12)                                       tab Profile
    …         every other customer view, pushed (#8–#12)
/app/runner/sign-in                runner v-auth-phone            guestGuard
/app/runner/sign-in/code           runner v-auth-otp              guestGuard, otpStepGuard
/app/runner/name                   runner x-name-capture          authGuard, roleGuard('runner'), needsNameGuard
/app/runner/onboarding/id          v-onboard-id (#13)             authGuard, roleGuard('runner'), hasNameGuard   (full page, no nav)
/app/runner/onboarding/selfie      v-onboard-selfie (#13)         same                                          (full page, no nav)
/app/runner                        RunnerShell                    authGuard, roleGuard('runner'), hasNameGuard
    ''        → redirect 'jobs'
    jobs      v-jobs (#14)                                          tab Jobs
    active    v-active (#15)                                        tab Active
    earnings  v-earnings (#17)                                      tab Earnings
    profile   v-profile (#18)                                       tab Profile
    onboarding/pending   v-onboard-pending (#13, pushed inside the shell; back → jobs)
    …         every other runner view, pushed (#14–#18)
/app/**                            redirect /app
```

- `v-onboard-id` / `v-onboard-selfie` are outside the shell because the runner app replaces the stack with them (no tab bar under them); `v-onboard-pending` is inside the shell because the app shows it pushed over `v-jobs` (runner `v-auth-otp.md` routing step 3).
- **Route stubs for later issues.** #6 declares every path in the tree above. A path whose view belongs to a later issue lazy-loads one shared `ViewStubComponent` that renders only an `h1` in the `top-bar-title` style with the nav label (`Home`, `Track`, `History`, `Profile`, `Jobs`, `Active`, `Earnings`) or, for `new` and the onboarding paths, nothing but a `nm-skeleton-card`; it has no copy of its own, no data and no TODO text on screen. Each later issue replaces its stub. The stub exists so the nav, guards and routing can be built and tested now; reviewer checks no stub is left once #7–#18 are merged.
- Route `data`: `{ role: 'customer' | 'runner', navKey?: string, pushed?: boolean, title: string }`. `navKey` decides the highlighted nav item; `pushed: true` hides the bottom bar below 768px (§7.3).
- Document titles (**proposed**; set through a `TitleStrategy`): `Sign in · Nitume`, `Enter the code · Nitume`, `Your name · Nitume`, `Home · Nitume`, `Track · Nitume`, `History · Nitume`, `Profile · Nitume`; runner `Sign in · Nitume Runner`, `Enter the code · Nitume Runner`, `Your name · Nitume Runner`, `Jobs · Nitume Runner`, `Active · Nitume Runner`, `Earnings · Nitume Runner`, `Profile · Nitume Runner`. Later issues add theirs in the same pattern.
- Navigation after sign-in, after name capture and after sign-out uses `replaceUrl: true` (the apps replace the stack, so browser Back never returns to the code screen).

---

## 3. OTP policy (OA-17) and API error codes

The server enforces everything; the client only displays it (Flutter `OtpPolicy`, `OtpErrorKind`). Export these constants and the error classifier from `apps/website/src/app/core/auth/otp-policy.ts`:

| Rule | Value |
|---|---|
| Code length | 6 digits |
| Code validity | 5 minutes (TTL 300 s). No screen states a duration |
| Verification attempts per code | 5 |
| Resend cooldown | 60 s |
| Code requests per phone/account | 5 per hour |
| Per-IP throttle | yes (`OtpThrottlerGuard`) |
| A new code invalidates the previous one | yes |

API error body (`apps/api/src/common/api-error.ts`): `{ statusCode, code, message, ...extra }`. Classifier `otpErrorKind(err: HttpErrorResponse): OtpErrorKind | null` reads `error.code`:

| `code` | Status | Extra | Kind | Needs a new code |
|---|---|---|---|---|
| `otp_incorrect` | 401 | `attemptsRemaining` | `incorrect` | no |
| `otp_expired` | 401 | — | `expired` | yes |
| `otp_attempts_exhausted` | 401 | — | `attemptsExhausted` | yes |
| `otp_not_requested` | 401 | — | `notRequested` (same copy as expired) | yes |
| `otp_resend_cooldown` | 429 | `secondsRemaining`, `retryAfterSeconds` | `resendTooSoon` | — |
| `otp_rate_limited` | 429 | `retryAfterSeconds` | `requestLimitReached` | — |
| `otp_ip_rate_limited` | 429 | `retryAfterSeconds` | `ipRateLimited` | — |
| `otp_delivery_failed` | 400 | — | `deliveryFailed` | — |
| `account_suspended` | 401 | — | not an OTP kind: `isAccountSuspended(err)` | — |
| `role_mismatch` | (RA-9, not built) | — | not an OTP kind: `isRoleMismatch(err)` | — |

- Without a `code` (older API builds) fall back exactly as Flutter `OtpErrorKind.fromApiException`: 429 + message containing `please wait` → `resendTooSoon`, other 429 → `requestLimitReached`; 401 + `too many incorrect` → `attemptsExhausted`, `expired` / `no active verification code` → `expired`, `no verification code` → `notRequested`, `incorrect verification code` → `incorrect`. An uncoded 401 that matches none of these is treated as `account_suspended` on verify (Flutter parity).
- `retryAfter(err)`: `retryAfterSeconds` (or `secondsRemaining`) as seconds; `minutesFrom(seconds) = max(1, ceil(seconds / 60))` (Flutter `minutesFrom`, clamp 1…999).
- `otp_ip_rate_limited` on **request** uses the hourly-limit copy (mobile spec: "5 requests per hour per phone/account, or IP/device throttle"). Note: the built Flutter phone screens send it to the generic error; the web follows the spec. On **verify** it uses the proposed line in WQ-14.
- `attemptsRemaining` is not shown (the built apps show `That code is incorrect. Try again.` without a count).

---

## 4. Session and token handling (WQ-8, decided 2026-10-28)

### 4.1 Rules

- The **access token lives only in memory** (a private field of `SessionStore`). The **refresh token is an httpOnly, Secure, SameSite cookie** set and read by the API; the web client never sees, stores or sends it in a body or header.
- Nothing about the session is written to `localStorage`, `sessionStorage`, IndexedDB or a readable cookie: no token, no user object, no phone. A Vitest asserts that after sign-in, refresh, name save and sign-out both storages contain no key at all set by `/app` code (§9.2).
- Auth routes are called with credentials (Angular `withCredentials: true`, i.e. fetch `credentials: 'include'`): `POST /auth/otp/verify`, `POST /auth/refresh`, `POST /auth/logout`. No other request sends credentials.
- **TBD-api** (api-contract PR in progress): the exact opt-in for cookie mode (for example a request header such as `X-Nitume-Client: web`, or separate `/auth/web/*` routes), the refresh/logout body (expected empty), the cookie name, path and SameSite value, and whether `tokens.refreshToken` is omitted from the verify/refresh response in cookie mode. The client must **ignore** any `refreshToken` field it receives and never store it. Keep the opt-in in one constant (`AUTH_COOKIE_MODE` in `auth-api.ts`) so the PR that lands the API change only edits that line.

### 4.2 `SessionStore` (`apps/website/src/app/core/auth/session.store.ts`)

Port of the two Flutter `SessionController`s with web storage rules. Signals only.

```ts
type AppRole = 'customer' | 'runner';
type SessionStatus = 'unknown' | 'restoring' | 'signedOut' | 'signedIn' | 'restoreFailed';
interface SessionUser { id: string; phone: string; displayName: string | null; role: string; status: string; }
type RefreshOutcome = 'ok' | 'rejected' | 'suspended' | 'network';
type SignOutReason = 'user' | 'expired' | 'suspended' | 'not-allowed';

readonly status: Signal<SessionStatus>;
readonly user: Signal<SessionUser | null>;
readonly hasName: Signal<boolean>;              // displayName?.trim().length > 0
accessToken(): string | null;                   // memory only
ensureRestored(): Promise<'signedIn' | 'signedOut' | 'failed'>;
completeSignIn(result: OtpVerifyResult): Promise<SessionUser>;
saveDisplayName(name: string): Promise<SessionUser>;
refresh(): Promise<RefreshOutcome>;             // single-flight + cross-tab lock (§4.4)
freshAccessToken(): Promise<string | null>;     // REALTIME_TOKEN_PROVIDER (ui-kit §6.1)
takeFreshSignIn(): boolean;                     // true once after an OTP sign-in (runner onboarding routing)
dropSession(): Promise<void>;                   // revoke + clear, no navigation (wrong account on the code screen)
signOut(reason: SignOutReason, role: AppRole): Promise<never>; // §4.5
```

- `ensureRestored()` (single-flight; later calls return the same promise until it settles): access token in memory → `signedIn`. Otherwise `refresh()`: `ok` → `GET /users/me` → `signedIn`; `rejected` or `suspended` → `signedOut`, silently (no toast: there was no session in this tab, same as the apps' restore); `network` → `restoreFailed` / `'failed'`. `GET /users/me` 401 → `signedOut`; network/5xx → `failed`.
- `completeSignIn(result)`: keep `result.tokens.accessToken` in memory (ignore any refresh token), then `GET /users/me` for the display name; on failure keep `result.user` (Flutter parity). Sets the fresh-sign-in flag. Never persists anything.
- `saveDisplayName(name)`: `PATCH /users/me { displayName }` (trimmed), replaces `user` with the response.
- `freshAccessToken()`: signed out → `null`; token missing or its `exp` (read from the JWT payload, base64url-decoded, never verified client-side) within 30 s → `refresh()` first; `ok` → the new token, anything else → `null`.
- On first construction, delete the legacy keys `nitume.ws.user`, `nitume.ws.access`, `nitume.ws.refresh` from `localStorage` (§1).

### 4.3 `AuthApi` (`apps/website/src/app/core/auth/auth-api.ts`)

Base `${environment.apiBaseUrl}/api/v1`. All exist on `main` (`apps/api/src/auth/auth.controller.ts`, `users.controller.ts`, `runners.controller.ts`); the cookie behaviour is TBD-api.

| Method | Call | Credentials | Response used |
|---|---|---|---|
| `requestOtp(phone)` | `POST /auth/otp/request { phone }` | no | `{ message }` (ignored) |
| `verifyOtp(phone, code, role)` | `POST /auth/otp/verify { phone, code, role }` (`role` = the flow: `customer` or `runner`; used by the API only when it creates the account) | **yes** | `{ user, tokens: { accessToken, refreshToken? } }` (refresh token ignored) |
| `refresh()` | `POST /auth/refresh` (body TBD-api, expected empty) | **yes** | `{ accessToken, refreshToken? }` (refresh token ignored) |
| `logout()` | `POST /auth/logout` with Bearer (body TBD-api) | **yes** | ignored |
| `me()` | `GET /users/me` | no (Bearer) | `{ id, phone, email, displayName, role, status, createdAt }` |
| `updateDisplayName(name)` | `PATCH /users/me { displayName }` | no (Bearer) | same as `me()` |
| `runnerMe()` | `GET /runners/me` | no (Bearer) | `verification { verified, checks[{ type, side, status }], level2Missing }` |
| `runnerVerifications()` | `GET /runners/me/verifications` | no (Bearer) | records (fallback only, §6.3) |

`apps/website/src/app/core/api-types.ts` gains `displayName: string | null` on the user type; `role` stays a `string` on the wire and is narrowed by `roleOf(user)` (`'customer' | 'runner' | 'other'`), so an unexpected value is never cast.

### 4.4 Refresh: single-flight and cross-tab lock

- Within a tab, concurrent callers share one in-flight `refresh()`.
- Across tabs (web adaptation): the API rotates refresh tokens and a used one is rejected at once (`token.service.ts` `rotate`: single-use, no grace window). Two tabs refreshing with the same cookie would sign one of them out. `refresh()` therefore runs inside `navigator.locks.request('nitume-auth-refresh', …)` when the Web Locks API exists (all current browsers); the second tab waits and then refreshes with the rotated cookie. Without Web Locks, refresh runs unlocked.
- Outcome mapping: 2xx → `ok`; 401 with `code: 'account_suspended'` → `suspended`; any other 401/403 → `rejected`; status 0, timeout or 5xx → `network`.

### 4.5 Sign-out

`signOut(reason, role)`:
1. Unless `reason === 'expired'` or `'suspended'` (the server already refused the session), call `logout()` best effort (errors ignored; Flutter: `AuthRepository.logout` clears local tokens even when revoke fails).
2. Clear the access token and user, call `RealtimeService.disconnect()`.
3. Post `{ type: 'signed-out' }` on `BroadcastChannel('nitume-session')` (no token, no user data).
4. **Full document navigation** (`window.location.replace`, injected as `WINDOW` for tests) to `/app/<role>/sign-in`, adding `?signedOut=expired | suspended | not-allowed` for those reasons. A full reload is used (web adaptation) so no screen or store keeps the previous account's data in this tab (shared and cybercafé computers).
5. The phone screen reads `signedOut` once, shows the toast below, and removes the parameter with `router.navigate([], { queryParams: {}, replaceUrl: true })`. Any other value is ignored (no URL text is ever rendered).

| Trigger | Reason | Toast on the sign-in page (`NmToastService`) |
|---|---|---|
| `Log out` (Profile, #12 / #18) | `user` | none |
| Refresh rejected (session expired) | `expired` | `Please sign in again.` |
| `account_suspended` on refresh or on any call | `suspended` | `This account can't sign in. Contact support.` |
| Restored session whose role is not `customer`/`runner` | `not-allowed` | `This number can't be used to sign in here. Use another number, or contact support.` (**proposed**, WQ-11) |

- Other tabs that receive `signed-out` while on an `/app` route other than sign-in do the same full navigation to their own sign-in page without a `signedOut` parameter.
- `dropSession()` (used only on the code screen for a wrong-account refusal) does steps 1–2 without broadcast or navigation: the tab has loaded nothing of the refused account.
- Push tokens: the website registers no FCM token (WQ-4 recommends no web push), so there is nothing to unregister; when WQ-4 changes, step 1 gains the unregister call before `logout()`.

### 4.6 Restore-failed page (`/app/offline`)

Port of the apps' `SplashScreen(onRetry:)`: slate canvas, centred column, `nm-wordmark` (runner suffix when `returnUrl` starts with `/app/runner`), 24px gap, `nm-error-state` with message `Check your connection and try again.` and the default `Try again` label. `Try again` re-runs `ensureRestored()` and navigates to the validated `returnUrl` (§6.5) or `/app`. The splash at `/app` (`AppEntryPage`) is the same frame with only the wordmark and a visually hidden `role="status"` `Loading` (kit skeleton wording).

---

## 5. HTTP interceptor (`authInterceptor`, functional `HttpInterceptorFn`)

File `apps/website/src/app/core/auth/auth.interceptor.ts`, registered in `app.config.ts` with `withInterceptors`.

1. **Scope**: only requests whose URL starts with `${environment.apiBaseUrl}/api/v1/`. Anything else (Google Maps, fonts, assets) passes through untouched and never gets a token.
2. **Credentials**: `withCredentials: true` for `/auth/otp/verify`, `/auth/refresh`, `/auth/logout` only (§4.1), plus the TBD-api cookie-mode opt-in.
3. **Bearer**: adds `Authorization: Bearer <access>` when a token is in memory, except on `/auth/otp/request`, `/auth/otp/verify` and `/auth/refresh`.
4. **401 handling** for every in-scope request except `/auth/otp/*`, `/auth/refresh` and `/auth/logout`:
   - Body `code === 'account_suspended'` → `signOut('suspended', role)`, rethrow.
   - Otherwise `await session.refresh()` (shared, §4.4):
     - `ok` → retry the original request **once** with the new token. If the retry is 401 again → `signOut('expired', role)`, rethrow.
     - `rejected` → `signOut('expired', role)`, rethrow.
     - `suspended` → `signOut('suspended', role)`, rethrow.
     - `network` → rethrow the **original** error, no sign-out (the view shows `Check your connection and try again.` through `friendlyError`).
   - Several requests failing with 401 together trigger one refresh and each is retried once.
5. `role` for sign-out = the role of the current URL (`/app/customer/**` or `/app/runner/**`), else the user's role, else `customer`.
6. 403 and every other status pass through unchanged (views own them).
7. `REALTIME_TOKEN_PROVIDER` (ui-kit §6.1) is provided as `() => session.freshAccessToken()`.

---

## 6. Guards and role routing

### 6.1 Guards (functional `CanActivateFn`, `apps/website/src/app/core/auth/guards.ts`)

| Guard | Rule |
|---|---|
| `authGuard` | `await ensureRestored()`. `signedIn` → allow. `signedOut` → `/app/<route role>/sign-in?returnUrl=<attempted url>`. `failed` → `/app/offline?returnUrl=<attempted url>` |
| `roleGuard(role)` | `roleOf(user)`: equal → allow. The other app role → redirect to that role's home (no sign-out; one website hosts both areas). `other` (admin, business or an unknown value) → `signOut('not-allowed', role)` |
| `hasNameGuard` | `hasName()` → allow, else `/app/<role>/name` |
| `needsNameGuard` | `!hasName()` → allow, else the role home |
| `guestGuard` (sign-in routes) | `await ensureRestored()`. `signedIn` → the destination of §6.2 for the stored user (not fresh). `signedOut` or `failed` → allow (the visitor can still sign in) |
| `otpStepGuard` | `SignInFlowStore` (§6.6) holds a phone for this route's role → allow, else `/app/<role>/sign-in` |

Role homes: customer `/app/customer/home`, runner `/app/runner/jobs`.

### 6.2 Destination after sign-in (`resolveDestination`, pure, table-tested)

Input: `user`, `flowRole` (the sign-in route the visitor used), `fresh` (OTP sign-in in this tab), `returnUrl`. Applied after `completeSignIn` on the code screen, after `saveDisplayName` on the name screen, and by `guestGuard`.

| # | Condition | Result |
|---|---|---|
| 1 | `roleOf(user) === 'other'` (admin, business, unknown) | Refuse on the code screen with the not-allowed line (§ view specs); `dropSession()`. From `guestGuard`: `signOut('not-allowed', flowRole)` |
| 2 | `flowRole === 'runner'` and role `customer`, or the API answers `role_mismatch` | Refuse with the row-127 wrong-account line; `dropSession()` |
| 3 | `flowRole === 'customer'` and role `runner` | Continue as a **runner** (rows 4–6 with role `runner`). Default pending WQ-10 |
| 4 | `displayName` blank | `/app/<role>/name` |
| 5 | role `runner` and `fresh` | `runnerOnboardingStep()` (§6.3): `id` → `/app/runner/onboarding/id`; `selfie` → `/app/runner/onboarding/selfie`; `pending` → `/app/runner/onboarding/pending`; `shell` → row 6 |
| 6 | otherwise | the validated `returnUrl` (§6.5), else the role home |

Customer with a name → `/app/customer/home` (or `returnUrl`). A restored runner session (not fresh) goes to the shell, never to onboarding (runner `SessionController.takeFreshSignIn`).

### 6.3 Runner onboarding step (`runnerOnboardingStep`, port of `onboarding_routing.dart`)

Never throws; any failure → `shell`.
1. `GET /runners/me`. `verification.verified` → `shell`.
2. `verification.level2Missing` present (on `main`):
   - `[]` → `pending`.
   - non-empty: for each entry read the matching check (`government_id` + `side: front|back`, or `selfie`) from `verification.checks`; an absent check or status `missing` = needs capture. Any ID side needs capture → `id`; else `selfie` listed and needs capture → `selfie`; else `pending`.
3. `level2Missing` absent (older API): `GET /runners/me/verifications` and the R-19 rule (newest labelled record per side; an approved unlabelled ID fills a missing side, row 268): an ID side missing → `id`; no selfie record → `selfie`; else `pending`.

### 6.4 `/app` entry

`AppEntryPage` shows the splash (§4.6), `await ensureRestored()`: `signedIn` → §6.2 (not fresh); `signedOut` → `/app/customer/sign-in` (WQ-9 may change this to the chooser); `failed` → `/app/offline?returnUrl=/app`.

### 6.5 `returnUrl` validation

Accepted only if it is a same-origin path starting with `/app/<resolved role>/`, is not a `sign-in`, `name` or `offline` path, and contains no `//` or scheme. Anything else is dropped silently. (No open redirect.)

### 6.6 `SignInFlowStore` (memory only)

Per role: `{ phone: string /* +2547… normalised */, cooldownEndsAt: number /* epoch ms */ } | null`. Set by the phone screen, read by the code screen, kept when the visitor goes Back (the phone field is prefilled), cleared after a successful sign-in. A page reload loses it and `otpStepGuard` sends the visitor back to the phone screen (the apps lose it on process death too).

---

## 7. Layouts and the new #6 components

### 7.1 Kit additions (#6 adds them to `_tokens.scss` and the kit folders; no new colour)

| Addition | Value | Flutter counterpart | Use |
|---|---|---|---|
| type `resend` | Sans 12.5 / 400, slate-600 | `NitumeTextStyles.muted.copyWith(fontSize: 12.5)` | Resend line, legal line |
| type `wordmark-suffix` | Sans 12 / 600, slate-600 | `NitumeWordmark` suffix | `Runner` after `Nitume` |
| type `greeting` | Sans 12 / 400, slate-600 | `NitumeTopBar` greeting | `nm-top-bar` |
| type `num-otp` | Code 18 / 600, blue (slate-400 for the `•` placeholder) | `OtpCodeField` digits | OTP boxes |
| type `num-resend` | Code 12.5 / 400, slate-600 | `OtpResendLine` countdown | `0:42` |
| `nm-field` input `hideLabel` | keeps the `<label for>` but visually hidden | `Semantics(label: 'Phone number')` without a visible label | phone field |

If the #5 build already provides any of these, reuse it; do not add a second one.

### 7.2 Components built in #6 (all standalone, OnPush, signal inputs, `nm-` prefix, under `apps/website/src/app/shared/ui/`)

| Component | Flutter | Status | Spec |
|---|---|---|---|
| `nm-icon` | Material icons used by the apps | **NEW (#6)** | Inline SVG from a typed registry (`home`, `home-filled`, `add-circle`, `add-circle-filled`, `location`, `location-filled`, `history`, `person`, `person-filled`, `work`, `work-filled`, `visibility`, `visibility-filled`, `arrow-back`). Paths from Google Material Symbols (Apache-2.0, licence noted in the file header). `fill="currentColor"`, size input (default 21), always `aria-hidden="true"`. No icon font, no new dependency |
| `nm-wordmark` | `NitumeWordmark` (+ R-17 suffix) | **NEW (#6)** | 9px green dot (brand mark; mobile Q1 default kept), 9px gap, `Nitume` in `auth-heading` (22/700 blue); optional `suffix` (`Runner`) after a space in `wordmark-suffix`, same baseline. Accessible name `Nitume` / `Nitume Runner` (`role="img"` + `aria-label` on the wrapper, inner text `aria-hidden`). Optional `href` makes it a link (shell side nav) |
| `nm-back-button` | `NitumeBackButton` | **NEW (#6)** | 32px white circle, 1px slate-line, 16px `arrow-back` blue, 48×48 hit area (`nm-hit-area`), accessible name `Back`, focus ring. Output `back`; default action `history.back()` when the previous entry is inside `/app`, else the `fallback` input URL |
| `nm-pushed-header` | C-10 `NitumePushedHeader` | **NEW (#6)** | Row height 56, padding `2px 20px 6px 12px`, slate; back button, optional title `pushed-title` (18/700, `h1`), optional Fira Code `Step n of m` (`num-meta`), or a trailing slot. Used by the code screen now and by every pushed view later |
| `nm-top-bar` | C-9 `NitumeTopBar` | **NEW (#6)** | Padding `8px 20px 14px`, slate; optional `greeting` above the title, title `top-bar-title` (21/700, `h1`), empty title renders no heading (BOARD Needs row 40); trailing actions slot, gap 10. Used by the route stubs now and the root views later |
| `nm-auth-frame` | `AuthFrame` (`.auth-wrap`) | **NEW (#6)** | §7.4 |
| `nm-otp-field` | C-26 `OtpCodeField` | **NEW (#6)** | `customer-v-auth-otp.md` §Components |
| `nm-otp-resend-line` | C-38 `OtpResendLine` | **NEW (#6)** | `customer-v-auth-otp.md` §Components |
| `nm-legal-line` | `_LegalLine` (phone screens) | **NEW (#6)** | `customer-v-auth-phone.md` §Components |
| `nm-app-nav` | C-13 `NitumeTabBar` | **NEW (#6)** | §7.3 |
| `nm-app-shell` | `HomeShell` / `RunnerShell` frame | **NEW (#6)** | §7.3; `customer-shell.md`, `runner-shell.md` give items and behaviour |

Reused from the kit (#5, must be merged first): `nm-button`, `nm-field`, `nm-error-state`, `nm-skeleton-card`, `NmToastService` + `nm-toast-host`, `nmNum`, `formatCountdown`, `formatPhoneIntl` (+ the ported `KenyanPhone.normalize`, exported as `normalizeKenyanPhone`), `friendlyError`, `RealtimeService`, `_tokens.scss` mixins and breakpoints.

### 7.3 App area, shell and nav (web adaptation of C-13; WQ-3 breakpoint 768px)

- `AppAreaComponent` (parent of every `/app` route): slate canvas (`--nitume-slate`), `min-height: 100dvh`, `<router-outlet>`, and the single `nm-toast-host` (so the sign-in screens can show `Please sign in again.` and `New code sent.`). Focus: after each navigation inside `/app`, focus moves to the new page's `h1` (`tabindex="-1"`, no focus ring on programmatic focus).
- `nm-app-shell` inputs: `items: NavItem[]` (`{ key, label, icon, activeIcon, link }`), `wordmarkSuffix?`, `homeLink`. Content projection for the routed view. It renders a visually hidden `Skip to content` link first (**proposed** copy; visible on focus), the nav, and `<main id="content">`.
- **Below 768px — bottom bar** (C-13 exactly): fixed to the bottom, white, 1px slate-line top border, padding `4px 8px` plus `env(safe-area-inset-bottom)`, items in equal-width columns, each a link with min-height 52px (≥ 48 tap), icon 21px, 4px gap, label `tab-label` (10/700), single line with ellipsis. Inactive icon and label slate-400; active green-700 with the filled icon variant. No indicator, no fill. `<main>` gets bottom padding = bar height + safe-area inset so nothing hides under it. On routes with `data.pushed` the bar is not rendered (pushed screens cover the tab bar in the apps).
- **768px and wider — side nav**: `<nav>` sticky on the left, full viewport height, width 220px, white, 1px slate-line right border, padding `20px 12px`. Top: `nm-wordmark` (with suffix in the runner shell) linking to the role home, 24px below it the items. Each item: a link, min-height 48px, padding `12px 14px`, radius `--nitume-r-s`, 12px gap, icon 21px, label `list-title` (14.5/600). Inactive icon and label **slate-600** (the 10px tab label's slate-400 is not used at 14.5px on white: slate-600 meets WCAG AA); active green-700 + filled icon (same rule as the tab bar); hover slate fill; focus ring. Pushed routes keep the side nav (WQ-12) with the parent item (`data.navKey`) active.
- Content column: to the right of the side nav, `max-width: var(--nitume-content-max)` (1180px) centred in the remaining width, horizontal padding 24px (20px below 768px, `--nitume-space-screen`). Views own their top bar / pushed header and inner layout.
- Semantics: `<nav aria-label="Main">` (**proposed** label) wrapping a `<ul>`; each item an `<a routerLink>` with `aria-current="page"` when active. The same `<nav>` element switches layout by CSS media query (one DOM, no duplicated markup). No `role="tablist"`: these are page links.
- No horizontal scroll from 360px; bottom bar labels ellipsise; at 360px five items are 68px wide each.

### 7.4 `nm-auth-frame` (the auth screens' `.auth-wrap`)

- Full-viewport slate page (no nav, no marketing header/footer), `min-height: 100dvh`, safe-area padding on all sides.
- Optional header slot at the top (the code screen's `nm-pushed-header` with back only). Below 768px the header sits at the top of the viewport, as the apps. From 768px (web adaptation) the back button sits inside the content column, 16px above the heading, so it stays next to the form.
- Content column: vertically centred in the remaining height, horizontal padding 28px, `max-width: 400px` (web adaptation; 304px of content at 360px, which fits the six 44px OTP boxes exactly), centred horizontally, left-aligned text. No card around it (the apps have none).
- Heading block (`AuthHeading`): `h1` in `auth-heading` (22/700 blue), 8px gap, sub in `muted` (13/400 slate-600), 26px below.

---

## 8. Configuration

`environment.ts` gains (committed, empty values allowed; values per deployment):

```ts
links: {
  customer: { termsUrl: '', privacyUrl: '', supportUrl: '' },
  runner:   { termsUrl: '', privacyUrl: '', supportUrl: '' },
}
```

Same rules as the apps' `AppConfig` (`NITUME_TERMS_URL`, `NITUME_PRIVACY_URL`, `NITUME_SUPPORT_URI`, rows 39, 131, 173): an empty link renders its words as plain text (legal line) or hides the `Contact support` link; never a placeholder URL. Links open in a new tab (`target="_blank" rel="noopener noreferrer"`, web adaptation of the apps' external `url_launcher`). Only `http(s):`, `mailto:` and `tel:` schemes are rendered; anything else is treated as empty.

---

## 9. Required Vitest tests (`cd apps/website && npx ng test --watch=false`)

Every numbered item is its own `it(...)`. HTTP through `provideHttpClientTesting()` + `HttpTestingController`; timers with `vi.useFakeTimers()`; `WINDOW`, `BroadcastChannel` and `navigator.locks` injected or stubbed. The issue's feature criterion (OTP error/resend/lockout states, role routing for customer / runner / runner applicant, guard redirects, interceptor refresh-then-retry and refresh-failure sign-out) maps to §9.4–§9.8.

### 9.1 Routes and layout
1. Every marketing route (`''`, `business`, `diaspora`, `runner`) still renders `app-header` and `app-footer` inside `MarketingLayoutComponent`; `/app/**` renders neither.
2. `/app` is lazy: the root `routes` array references `/app` only through `loadChildren` (no eager import of any `/app` component).
3. `/app/customer` redirects to `home`; `/app/runner` redirects to `jobs`; `/app/unknown` redirects to `/app`.
4. Route `data.title` produces the titles in §2.
5. Focus moves to the page `h1` after navigation inside `/app`.

### 9.2 Session store and storage (WQ-8)
6. After a successful verify, `localStorage` and `sessionStorage` have no keys set by the app, and the access token is readable only through `accessToken()`.
7. Same assertion after refresh, after `saveDisplayName`, and after `signOut`.
8. A `refreshToken` present in the verify or refresh response body is ignored (not stored, not sent later).
9. Legacy keys `nitume.ws.user|access|refresh` are removed on construction.
10. `verifyOtp`, `refresh` and `logout` requests have `withCredentials: true`; `requestOtp`, `me`, `updateDisplayName` and runner calls do not.
11. `ensureRestored()`: refresh 200 + `/users/me` 200 → `signedIn` with the user; refresh 401 → `signedOut` with no toast; refresh status 0 → `failed`; `/users/me` 401 → `signedOut`; two concurrent calls make one refresh request.
12. `completeSignIn` keeps the verify user when `GET /users/me` fails; sets the fresh flag once (`takeFreshSignIn()` true then false).
13. `freshAccessToken()`: returns the token when `exp` is more than 30 s away; refreshes when within 30 s; returns `null` when signed out or when refresh fails.
14. `refresh()` runs inside `navigator.locks.request('nitume-auth-refresh', …)` when available and still works without it.

### 9.3 Sign-out
15. `signOut('user')`: `POST /auth/logout` sent, token and user cleared, `RealtimeService.disconnect()` called, `signed-out` broadcast, `WINDOW.location.replace('/app/<role>/sign-in')`.
16. `signOut('expired')` and `signOut('suspended')` do not call logout and navigate with `?signedOut=expired|suspended`.
17. A failing logout call does not block sign-out.
18. The phone screen shows `Please sign in again.` / `This account can't sign in. Contact support.` / the not-allowed line for the three `signedOut` values, once, and strips the parameter; an unknown value shows nothing.
19. A tab receiving `signed-out` on an `/app` route navigates to its sign-in page; on a sign-in page it does nothing.

### 9.4 Interceptor
20. Adds the Bearer header to `/api/v1/**` requests, not to `/auth/otp/*`, `/auth/refresh`, nor to any URL outside `apiBaseUrl`.
21. **Refresh-then-retry**: a 401 on `GET /users/me` triggers one `POST /auth/refresh`; on 200 the original request is retried once with the new token and its result reaches the caller.
22. Three parallel 401s cause exactly one refresh and three retries.
23. **Refresh failure sign-out**: refresh 401 → `signOut('expired')`, the original error is rethrown.
24. Refresh 401 `account_suspended` → `signOut('suspended')`.
25. A protected call answering 401 `account_suspended` → `signOut('suspended')` without a refresh.
26. Retry answering 401 again → `signOut('expired')`; no second refresh (no loop).
27. Refresh network failure → original error rethrown, no sign-out.
28. 401 on `/auth/otp/verify`, `/auth/refresh`, `/auth/logout` never triggers a refresh.
29. 403 and 500 pass through untouched.

### 9.5 Guards
30. `authGuard`: signed out → `/app/customer/sign-in?returnUrl=…` (and the runner equivalent); restore failed → `/app/offline?returnUrl=…`; signed in → allowed.
31. `roleGuard('customer')` with a runner session → `/app/runner/jobs`; `roleGuard('runner')` with a customer session → `/app/customer/home`; an admin / business / unknown role → `signOut('not-allowed')`.
32. `hasNameGuard` without a name → `/app/<role>/name`; `needsNameGuard` with a name → the role home.
33. `guestGuard` with a session → the §6.2 destination; without → allowed; restore failed → allowed.
34. `otpStepGuard` without a stored phone → the phone screen.
35. `returnUrl` validation: accepts `/app/customer/history`; rejects `https://evil.test`, `//evil.test`, `/app/runner/jobs` for a customer, `/app/customer/sign-in`, `/business`.

### 9.6 Role routing (`resolveDestination`, table-driven)
36. Customer flow + customer with name → `/app/customer/home`; without name → `/app/customer/name`; with a valid `returnUrl` → it.
37. Runner flow + verified runner with name → `/app/runner/jobs`.
38. **Runner applicant**: fresh runner without name → `/app/runner/name`, then after the name save → onboarding step.
39. Onboarding step (§6.3), each a case: `verified` → shell; `level2Missing: []` → pending; `[government_id_back, selfie]` with back `missing` → id; back `pending` + selfie `missing` → selfie; all listed `pending`/`rejected` → pending; `level2Missing` absent + records fallback (approved unlabelled ID + labelled back pending + selfie) → pending; `GET /runners/me` failure → shell.
40. Restored (not fresh) runner without verification → shell, not onboarding.
41. Runner flow + customer role → wrong-account refusal and `dropSession()` (logout called, token cleared, no navigation).
42. API `role_mismatch` on verify → the same refusal.
43. Customer flow + runner role → runner destination (WQ-10 default).
44. Admin, business and an unknown role string in either flow → not-allowed refusal and `dropSession()`.

### 9.7 OTP policy helpers
45. `otpErrorKind` for each of the eight codes and the uncoded fallbacks (§3).
46. `minutesFrom`: 1 → 1, 60 → 1, 61 → 2, 3600 → 60, 0 → 1.
47. `normalizeKenyanPhone`: `0712345678`, `254712345678`, `+254712345678`, `+254 712 345 678`, `0712-345-678` → `+254712345678`; `0112345678` → `+254112345678`; `712345678` (no prefix), `0812345678`, `+25471234567`, empty → invalid. (Spaces and hyphens are stripped before matching; see `customer-v-auth-phone.md` States.)

### 9.8 Views and components
The per-view lists are in each view spec (§ "Required tests"): `customer-v-auth-phone.md`, `customer-v-auth-otp.md`, `customer-x-name-capture.md`, `customer-shell.md`, and the runner differences in the runner files. New components (§7.2) each need: renders, inputs, accessibility name, focus ring class, token use (custom property names, never hex).

### 9.9 Static checks and build
48. The ui-kit static check (no hex / `rgb(a)` / `hsl(a)` / `box-shadow` under `src/app/` except marketing files) passes for all #6 files.
49. No Fira Code outside `nmNum` and the `num-*` mixins in #6 files.
50. `npx ng test --watch=false` 0 failures; `npx ng build` succeeds; the marketing entry bundle does not grow by the `/app` code (only lazy chunks).

---

## 10. Data needed (all on `main` unless marked)

| Need | Where | Status |
|---|---|---|
| `POST /auth/otp/request`, `POST /auth/otp/verify` (codes and `retryAfterSeconds`) | `auth.controller.ts`, `otp.service.ts`, `otp-throttler.guard.ts` | exists |
| `POST /auth/refresh`, `POST /auth/logout` | `auth.controller.ts` | exist; **cookie mode TBD-api** (WQ-8 PR) |
| `GET /users/me`, `PATCH /users/me` (`displayName` 2–60) | `users.controller.ts` | exist |
| `GET /runners/me` (`verification.level2Missing`), `GET /runners/me/verifications` | `runners.controller.ts` | exist |
| `account_suspended` on verify and refresh | `auth.service.ts` | verify: exists; refresh: check in the WQ-8 PR (today `rotate` does not check user status) |
| `role_mismatch` on verify (RA-9) | — | missing; the client role check covers it |
| Socket | `RealtimeService.connect()` after sign-in, `disconnect()` on sign-out | exists (#5) |

No new socket event. No task state appears on these screens (pre-auth and frame only).

---

## 11. Questions for the owner (#6)

Numbering continues the web series (WQ-1 … WQ-8 in `ui-kit.md`).

| Id | Question | Recommendation (build default until answered) |
|---|---|---|
| WQ-9 | **The public `/auth` page.** Every marketing CTA (`Log in`, `Request a task`, `Apply to become a Runner`, `Talk to sales`) links to `/auth`. Options: (A) **replace** `/auth` with a small role chooser in the auth frame (wordmark, heading `Sign in to Nitume`, primary `I need tasks done` → `/app/customer/sign-in`, outline `I'm a Runner or want to become one` → `/app/runner/sign-in`; all **proposed** copy; a signed-in visitor is redirected to their area); the old page, its Google stub and its `localStorage` tokens go away. (B) **redirect** `/auth` to `/app/customer/sign-in`: simplest, but the `Become a Runner` CTA would then sign runner applicants up as customers, and one phone has one role (row 127), so they could not apply later with that number. (C) **keep** the old page and add links: keeps tokens in `localStorage` (against WQ-8), a fake Google button and no OA-17 states | **A** (replace with the chooser). Built in a separate commit so it can be swapped for B |
| WQ-10 | **Customer sign-in with a runner's number.** The customer app has no role check (a runner number gets a runner session in the customer app). On the website both areas exist, so the default sends a runner who used the customer sign-in to the runner area. Alternative: refuse with a line like the row-127 one | Send to the runner area (no new copy) |
| WQ-11 | **Admin or business number on the website sign-in.** The runner app shows the customer-account sentence for any non-runner; the customer app shows nothing. Proposed for the web, both flows and a restored session: `This number can't be used to sign in here. Use another number, or contact support.` (+ `Contact support` when configured) | Approve the sentence |
| WQ-12 | **Pushed screens on desktop.** In the apps a pushed screen covers the tab bar. Below 768px the web does the same; from 768px the default keeps the side nav visible with the parent item active, and the view shows its back header | Keep the side nav visible from 768px |
| WQ-13 | **Side-nav style.** The design system calls `#0B2545` the colour for "navigation surfaces"; the apps' tab bar is white with green-700 for the active item. Default: a white side nav that mirrors the tab bar (active green-700, inactive slate-600). Alternative: a blue side nav with white labels like an admin console | White side nav (parity with the tab bar) |
| WQ-14 | **Network throttle while verifying.** The API can answer `otp_ip_rate_limited` on verify (per-IP limit). The apps show the generic error. Proposed: `Too many attempts. Try again in N min.` (N in Fira Code) | Approve the sentence |
| WQ-15 | **How long a web session lasts (security).** The refresh cookie would follow the apps' 30-day refresh lifetime, so a shared or cybercafé computer stays signed in until `Log out`. Options: same 30 days (persistent cookie); a session cookie that ends when the browser closes; or a shorter web lifetime (e.g. 7 days). (§3: session/token handling) | Persistent, same lifetime as the apps, plus the cross-tab sign-out and full-reload sign-out in §4.5; revisit if support sees shared-device issues |

Answered and applied: WQ-3 (panel from 768px, dialogs 335px; #6 uses the same 768px breakpoint for the nav), WQ-8 (access token in memory, refresh token in an httpOnly cookie).

## 12. Needs from other agents

- **api-contract (WQ-8 PR, in progress)**: cookie mode on `POST /auth/otp/verify`, `POST /auth/refresh`, `POST /auth/logout` (set, read, rotate, clear; httpOnly, Secure, SameSite), the opt-in header or route, empty refresh/logout bodies, logout that works from the cookie alone when the access token has expired, and `account_suspended` on refresh for a suspended or banned user.
- **api-contract (security, same PR)**: CORS today is `origin: true, credentials: true` (`apps/api/src/main.ts:28`), which reflects any origin with credentials. With a cookie refresh this must become an allow-list of the website origin(s) for credentialed requests (plus SameSite `Strict`/`Lax` on the cookie), otherwise another site could call `/auth/refresh` with the visitor's cookie and read a fresh access token. Optional: a custom request header on cookie routes as a CSRF guard.
- **api-contract (RA-9, open)**: `role_mismatch` on verify with `role: runner` for an existing customer number, so no customer session (and cookie) is issued to the runner flow.
- **web-parity**: #5 kit merged first (components and helpers listed in §7.2).
