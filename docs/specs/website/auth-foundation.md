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

- Updated 2026-10-28 for the owner's #6 answers (GitHub #6 comments: WQ-4, WQ-8, WQ-12 … WQ-18) and the web auth API of PR #20 (`/api/v1/auth/web/*`), PR #22 (`account_suspended` on refresh) and PR #25 (`account_suspended` on every authenticated route and on the socket handshake). Every earlier `TBD-api` is resolved below; none remains.
- There is **no web mockup**. Sources, in order of authority: owner answers (BOARD rows, OA-n, WQ-3, WQ-4, WQ-8 and WQ-12 … WQ-18 decided 2026-10-28), `docs/design/nitume_design_system.html` (styling), the web UI kit spec (components and tokens, never redefined here), the mobile specs (`docs/specs/customer/{v-auth-phone,v-auth-otp,x-name-capture,_shared}.md`, `docs/specs/runner/{v-auth-phone,v-auth-otp,x-name-capture,_shared}.md`), the built Flutter screens (`apps/customer_app/lib/src/{screens/auth,screens/shell,services/session.dart}`, `apps/runner_app/lib/src/{screens/auth,screens/shell,services/session.dart,services/onboarding_routing.dart}`, `packages/nitume_core/lib/src/{auth/otp_policy.dart,widgets/otp_code_field.dart,widgets/otp_resend_line.dart,widgets/brand.dart,widgets/nitume_tab_bar.dart}`) and the mockups (`docs/design/nitume_customer_app.html` lines 128–142, 317–341; `nitume_runner_app.html` lines 294–313).
- **(web adaptation)** marks a layout or browser choice the mobile sources do not make. It never changes content, copy, tokens or the component set. **(proposed)** marks copy the auditor wrote for a state the sources do not cover.

---

## 1. What exists in `apps/website` today and what #6 does with it

| Piece | Path | #6 decision |
|---|---|---|
| Routes: `''`, `business`, `diaspora`, `runner`, `auth`, `**` → `''`, all eager | `src/app/app.routes.ts` | Marketing routes (`''`, `business`, `diaspora`, `runner`) move under a `MarketingLayoutComponent` (header + `<main>` + footer, exactly today's `AppComponent` template and styles). `auth` becomes a top-level lazy `loadComponent` route for the role chooser, outside the marketing layout (§6.7, WQ-12). A new lazy `app` route is added (§2). Marketing page components and their output do not change |
| `AppComponent` renders `app-header`, `<main><router-outlet>`, `app-footer` around every route | `src/app/app.component.ts` | Becomes a bare `<router-outlet />`; the header/footer move to `MarketingLayoutComponent` so `/app/**` has neither. A test proves every marketing route still renders the header and footer (§9.1) |
| `AuthStore` keeps the user, access and refresh tokens in `localStorage` (`nitume.ws.user`, `nitume.ws.access`, `nitume.ws.refresh`) | `src/app/core/auth/auth.store.ts` | **Deleted** (WQ-8). Replaced by `SessionStore` (§4), access token in memory only. On app start a one-time cleanup removes the three legacy keys so tokens left by the old page do not linger |
| `ApiService` (OTP request/verify, register) | `src/app/core/services/api.service.ts` | Replaced by `AuthApi` (§4.3), which calls the web routes `/auth/web/*`. `register()` is not used by any view (the apps never call it) and is dropped with the old page |
| `/auth` page: login/sign-up tabs, phone + code in one card, `Full name` on sign-up, `Continue with Google` stub, writes tokens to `localStorage`, navigates to `/` | `src/app/pages/auth/auth.component.ts` | Off-system (slate inputs, 10px radius, box-shadows, raw `#fff`), no OA-17 states, no role routing, a fake Google button. **WQ-12 (owner, 2026-10-28): replaced by the role chooser** (§6.7). The old component, its Google stub and its `localStorage` writes are deleted, in their own commit |
| Marketing CTAs (`Log in`, `Request a task`, `Apply to become a Runner`, `Talk to sales`, …) all link to `/auth` | `shared/header`, `pages/*` | Unchanged (marketing pages must not change). They keep pointing at `/auth`, which now opens the role chooser (WQ-12) |
| `provideHttpClient(withFetch())`, `provideRouter(routes, withComponentInputBinding())` | `src/app.config.ts` | Gains `withInterceptors([authInterceptor])` (§5), a `TitleStrategy` provider (§2), the real `REALTIME_TOKEN_PROVIDER` and the `REALTIME_ACCOUNT_SUSPENDED` handler (§5 items 7–8); nothing else changes |
| `REALTIME_TOKEN_PROVIDER` stub (returns `null`) and its doc comment naming `POST /api/v1/auth/refresh` | `src/app/core/realtime/realtime.tokens.ts` (#5) | The stub default stays (tests and signed-out use); the comment names `POST /api/v1/auth/web/refresh`. #6 overrides it in `app.config.ts` (#5 handoff need) |
| `nm-toast-host` exists but is placed nowhere | `src/app/shared/ui/overlay/toast-host.component.ts` (#5) | Placed once in `AppAreaComponent` (§7.3), which wraps the shells and the sign-in screens (#5 handoff need) |
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

Outside `/app`, at the top level of `app.routes.ts` (WQ-12): `/auth` → `AuthChooserPage` (lazy `loadComponent`, not inside `MarketingLayoutComponent`, no guard; it redirects a signed-in visitor itself, §6.7).

- `v-onboard-id` / `v-onboard-selfie` are outside the shell because the runner app replaces the stack with them (no tab bar under them); `v-onboard-pending` is inside the shell because the app shows it pushed over `v-jobs` (runner `v-auth-otp.md` routing step 3).
- **Route stubs for later issues.** #6 declares every path in the tree above. A path whose view belongs to a later issue lazy-loads one shared `ViewStubComponent` that renders only an `h1` in the `top-bar-title` style with the nav label (`Home`, `Track`, `History`, `Profile`, `Jobs`, `Active`, `Earnings`) or, for `new` and the onboarding paths, nothing but a `nm-skeleton-card`; it has no copy of its own, no data and no TODO text on screen. Each later issue replaces its stub. The stub exists so the nav, guards and routing can be built and tested now; reviewer checks no stub is left once #7–#18 are merged.
- Route `data`: `{ role: 'customer' | 'runner', navKey?: string, pushed?: boolean, title: string }`. `navKey` decides the highlighted nav item; `pushed: true` hides the bottom bar below 768px (§7.3).
- Document titles (**proposed**; set through a `TitleStrategy`): chooser `Sign in · Nitume`; `Sign in · Nitume`, `Enter the code · Nitume`, `Your name · Nitume`, `Home · Nitume`, `Track · Nitume`, `History · Nitume`, `Profile · Nitume`; runner `Sign in · Nitume Runner`, `Enter the code · Nitume Runner`, `Your name · Nitume Runner`, `Jobs · Nitume Runner`, `Active · Nitume Runner`, `Earnings · Nitume Runner`, `Profile · Nitume Runner`. Later issues add theirs in the same pattern.
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
| `account_suspended` | 401 | — | not an OTP kind: `isAccountSuspended(err)`. Returned by verify, by `POST /auth/web/refresh` (PR #22) and by **any authenticated route** (PR #25) | — |
| `refresh_cookie_missing` | 401 | — | refresh only (no `nitume_rt` cookie): refresh outcome `rejected` (§4.4) | — |
| `refresh_invalid` | 401 | — | refresh only (expired, revoked or reused refresh token; the API clears the cookie): `rejected` | — |
| `web_origin_not_allowed` | 403 | — | any `/auth/web/*` call from an origin not in `WEB_ORIGINS`: a deployment error, never shown as such (§4.3) | — |
| `role_mismatch` | (RA-9, not built) | — | not an OTP kind: `isRoleMismatch(err)` | — |

- Without a `code` (older API builds) fall back exactly as Flutter `OtpErrorKind.fromApiException`: 429 + message containing `please wait` → `resendTooSoon`, other 429 → `requestLimitReached`; 401 + `too many incorrect` → `attemptsExhausted`, `expired` / `no active verification code` → `expired`, `no verification code` → `notRequested`, `incorrect verification code` → `incorrect`. An uncoded 401 that matches none of these is treated as `account_suspended` on verify (Flutter parity).
- `retryAfter(err)`: `retryAfterSeconds` (or `secondsRemaining`) as seconds; `minutesFrom(seconds) = max(1, ceil(seconds / 60))` (Flutter `minutesFrom`, clamp 1…999).
- `otp_ip_rate_limited` on **request** uses the hourly-limit copy (mobile spec: "5 requests per hour per phone/account, or IP/device throttle"). Note: the built Flutter phone screens send it to the generic error; the web follows the spec. On **verify** it uses `Too many attempts. Try again in N min.` (WQ-17, owner 2026-10-28).
- `attemptsRemaining` is not shown (the built apps show `That code is incorrect. Try again.` without a count).

---

## 4. Session and token handling (WQ-8, decided 2026-10-28)

### 4.1 Rules

- The **access token lives only in memory** (a private field of `SessionStore`). The **refresh token is the httpOnly cookie `nitume_rt`** set, rotated and cleared by the API's web routes (PR #20, `apps/api/src/auth/web/refresh-cookie.service.ts`): `HttpOnly`, `SameSite=Strict`, `Secure` everywhere except `NODE_ENV=development`, `Path=/api/v1/auth/web` (the browser sends it only to the web refresh and sign-out routes), `Max-Age` = the refresh lifetime, **30 days** (`JWT_REFRESH_TTL` default `30d`; WQ-18, owner: web sessions last 30 days like the apps). The web client never sees, stores or sends the refresh token in a body or header; the web responses do not contain it.
- Nothing about the session is written to `localStorage`, `sessionStorage`, IndexedDB or a readable cookie: no token, no user object, no phone. A Vitest asserts that after sign-in, refresh, name save and sign-out both storages contain no key at all set by `/app` code (§9.2).
- The website uses the **dedicated web routes** (PR #20), never the mobile `/auth/otp/verify`, `/auth/refresh` or `/auth/logout` (those keep the refresh token in the JSON body for the apps). Every `/auth/web/*` call is sent with credentials (Angular `withCredentials: true`, i.e. fetch `credentials: 'include'`). No other request sends credentials. `POST /auth/otp/request` is shared with the apps and is called without credentials.
- Every `/auth/web/*` request must carry an `Origin` listed in the API's `WEB_ORIGINS` (dev default `http://localhost:4200`, the `ng serve` origin); otherwise the API answers 403 `web_origin_not_allowed` before reading or setting the cookie (`web-origin.guard.ts`). Browsers add `Origin` themselves; the client sets nothing. Credentialed CORS is allowed only for those origins.
- Defensive rule kept: if a response ever contains a `refreshToken` field, the client ignores it and never stores it.

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

Sign-out hook (WQ-4, owner: FCM web push, added by #11/#18):

```ts
/** Runs first in signOut (§4.5 step 1). #6 provides the no-op; #11/#18 replace it to unregister the browser's push token. */
export const SIGN_OUT_HOOK = new InjectionToken<(reason: SignOutReason) => Promise<void>>('SIGN_OUT_HOOK', {
  providedIn: 'root', factory: () => () => Promise.resolve(),
});
```

- `ensureRestored()` (single-flight; later calls return the same promise until it settles): access token in memory → `signedIn`. Otherwise `refresh()`: `ok` → `GET /users/me` → `signedIn`; `rejected` or `suspended` → `signedOut`, silently (no toast: there was no session in this tab, same as the apps' restore); `network` → `restoreFailed` / `'failed'`. `GET /users/me` 401 → `signedOut`; network/5xx → `failed`.
- `completeSignIn(result)`: keep `result.tokens.accessToken` in memory (ignore any refresh token), then `GET /users/me` for the display name; on failure keep `result.user` (Flutter parity). Sets the fresh-sign-in flag. Never persists anything.
- `saveDisplayName(name)`: `PATCH /users/me { displayName }` (trimmed), replaces `user` with the response.
- `freshAccessToken()`: signed out → `null`; token missing or its `exp` (read from the JWT payload, base64url-decoded, never verified client-side) within 30 s → `refresh()` first; `ok` → the new token; `network` → `null` (the socket retries later); `rejected` → `null` **and**, when the status was `signedIn`, `signOut('expired', role)`; `suspended` → `null` and `signOut('suspended', role)` (role as §5 item 5). This is how a session that dies while only the socket is active (no HTTP call) still ends on the sign-in page.
- On first construction, delete the legacy keys `nitume.ws.user`, `nitume.ws.access`, `nitume.ws.refresh` from `localStorage` (§1).

### 4.3 `AuthApi` (`apps/website/src/app/core/auth/auth-api.ts`)

Base `${environment.apiBaseUrl}/api/v1`. `otp/request`, `users` and `runners` exist on `main` (`apps/api/src/auth/auth.controller.ts`, `users.controller.ts`, `runners.controller.ts`). The three web routes are in PR #20 (`apps/api/src/auth/web/web-auth.controller.ts`, branch `feat/api-web-refresh-cookie`), with PR #22 (`fix/api-refresh-suspended`) for `account_suspended` on refresh; all three PRs (#20, #22, #25) are open and must be merged before #6 can be merged (§12). Successful POSTs answer **201** (Nest default).

| Method | Call | Credentials | Bearer | Response used |
|---|---|---|---|---|
| `requestOtp(phone)` | `POST /auth/otp/request { phone }` | no | no | `{ message }` (ignored) |
| `verifyOtp(phone, code, role)` | `POST /auth/web/otp/verify { phone, code, role }` (`role` = the flow: `customer` or `runner`; optional on the wire, always sent by the website; used by the API only when it creates the account). Same OTP checks, codes and per-IP bucket as the mobile verify | **yes** | no | 201 `{ user, tokens: { accessToken } }`; the API sets `nitume_rt` |
| `refresh()` | `POST /auth/web/refresh`, **no body** | **yes** | no | 201 `{ accessToken }` (the API rotates `nitume_rt`). 401 `refresh_cookie_missing` \| `refresh_invalid` \| `account_suspended`; on any failure the API clears the cookie |
| `logout()` | `POST /auth/web/logout`, **no body, no Bearer** (authenticated by the cookie itself, so it works after a reload or with an expired access token; without a cookie it only clears) | **yes** | no | 201 `{ message }` (ignored); the API revokes the refresh session and clears `nitume_rt` |
| `me()` | `GET /users/me` | no (Bearer) | `{ id, phone, email, displayName, role, status, createdAt }` |
| `updateDisplayName(name)` | `PATCH /users/me { displayName }` | no (Bearer) | same as `me()` |
| `runnerMe()` | `GET /runners/me` | no (Bearer) | `verification { verified, checks[{ type, side, status }], level2Missing }` |
| `runnerVerifications()` | `GET /runners/me/verifications` | no (Bearer) | records (fallback only, §6.3) |

`apps/website/src/app/core/api-types.ts` gains `displayName: string | null` on the user type, `WebSession { user; tokens: { accessToken: string } }` and `WebRefreshResult { accessToken: string }`; `TokenPair`, `OtpVerifyResult` and `RegisterResult` (mobile shapes with a refresh token) are removed with `ApiService`. `role` (and `status`) become a `string` on the wire (today a closed union) and `role` is narrowed by `roleOf(user)` (`'customer' | 'runner' | 'other'`), so an unexpected value is never cast.

`web_origin_not_allowed` (403) is a deployment error (the website's origin is missing from `WEB_ORIGINS`): on verify the view shows the generic `Something went wrong. Please try again.`; on refresh it maps to `rejected` (§4.4); on logout it is ignored. In dev mode (`isDevMode()`) the client logs one `console.error` naming `WEB_ORIGINS`; nothing about it is shown on screen.

### 4.4 Refresh: single-flight and cross-tab lock

- Within a tab, concurrent callers share one in-flight `refresh()`.
- Across tabs (web adaptation): the API rotates refresh tokens and a used one is rejected at once (`token.service.ts` `rotate`: single-use, no grace window). Two tabs refreshing with the same cookie would sign one of them out. `refresh()` therefore runs inside `navigator.locks.request('nitume-auth-refresh', …)` when the Web Locks API exists (all current browsers); the second tab waits and then refreshes with the rotated cookie. Without Web Locks, refresh runs unlocked.
- Outcome mapping: 2xx → `ok`; 401 with `code: 'account_suspended'` → `suspended`; 401 `refresh_cookie_missing`, 401 `refresh_invalid`, any other 401, and 403 (including `web_origin_not_allowed`) → `rejected`; status 0, timeout or 5xx → `network`.
- The rotated cookie is shared by all tabs of the browser (one cookie jar), which is why the lock above is needed; nothing else is shared between tabs.

### 4.5 Sign-out

`signOut(reason, role)` (single-flight: a second call while one runs returns the same promise):
1. Run `SIGN_OUT_HOOK(reason)` (§4.2) best effort: errors ignored, at most 3 s waited. #6 ships the no-op; #11/#18 unregister the push token here (WQ-4).
2. Call `logout()` (`POST /auth/web/logout`) best effort for **every** reason (errors ignored; Flutter: `AuthRepository.logout` clears local tokens even when revoke fails). It needs no Bearer, and it clears `nitume_rt` even when the server already refused the session: after an `account_suspended` answer from a protected route (PR #25) the cookie is otherwise still in the browser.
3. Clear the access token and user, call `RealtimeService.disconnect()`.
4. Post `{ type: 'signed-out' }` on `BroadcastChannel('nitume-session')` (no token, no user data).
5. **Full document navigation** (`window.location.replace`, injected as `WINDOW` for tests) to `/app/<role>/sign-in`, adding `?signedOut=expired | suspended | not-allowed` for those reasons. A full reload is used (web adaptation) so no screen or store keeps the previous account's data in this tab (shared and cybercafé computers).
6. The phone screen reads `signedOut` once, shows the toast below, and removes the parameter with `router.navigate([], { queryParams: {}, replaceUrl: true })`. Any other value is ignored (no URL text is ever rendered).

| Trigger | Reason | Toast on the sign-in page (`NmToastService`) |
|---|---|---|
| `Log out` (Profile, #12 / #18) | `user` | none |
| Refresh rejected (session expired) | `expired` | `Please sign in again.` |
| `account_suspended` on refresh, on any authenticated call (PR #25) or as the socket `connect_error` (§5 item 8) | `suspended` | `This account can't sign in. Contact support.` |
| Restored session whose role is not `customer`/`runner` | `not-allowed` | `This number can't be used to sign in here. Use another number, or contact support.` (WQ-14, owner 2026-10-28) |

- Other tabs that receive `signed-out` while on an `/app` route other than sign-in do the same full navigation to their own sign-in page without a `signedOut` parameter.
- `dropSession()` (used only on the code screen for a wrong-account or not-allowed refusal) does steps 2–3 without the hook, broadcast or navigation: no push token was registered and the tab has loaded nothing of the refused account.
- Push tokens (WQ-4, owner 2026-10-28: FCM web push, added by #11/#18): #6 registers no push token and ships `SIGN_OUT_HOOK` as a no-op so #11/#18 only replace the provider. Nothing else in #6 depends on push.

### 4.6 Restore-failed page (`/app/offline`)

Port of the apps' `SplashScreen(onRetry:)`: slate canvas, centred column, `nm-wordmark` (runner suffix when `returnUrl` starts with `/app/runner`), 24px gap, `nm-error-state` with message `Check your connection and try again.` and the default `Try again` label. `Try again` re-runs `ensureRestored()` and navigates to the validated `returnUrl` (§6.5) or `/app`. The splash at `/app` (`AppEntryPage`) is the same frame with only the wordmark and a visually hidden `role="status"` `Loading` (kit skeleton wording).

---

## 5. HTTP interceptor (`authInterceptor`, functional `HttpInterceptorFn`)

File `apps/website/src/app/core/auth/auth.interceptor.ts`, registered in `app.config.ts` with `withInterceptors`.

1. **Scope**: only requests whose URL starts with `${environment.apiBaseUrl}/api/v1/`. Anything else (Google Maps, fonts, assets) passes through untouched and never gets a token.
2. **Credentials**: `withCredentials: true` for every `/auth/web/*` request and for nothing else (§4.1). (`AuthApi` also sets it; the interceptor enforces it so no other call can send it.)
3. **Bearer**: adds `Authorization: Bearer <access>` when a token is in memory, except on `/auth/otp/request` and every `/auth/web/*` route (the web routes are cookie-authenticated).
4. **401 handling** for every in-scope request except `/auth/otp/*` and `/auth/web/*`:
   - Body `code === 'account_suspended'` (any authenticated route can answer it, PR #25) → `signOut('suspended', role)`, rethrow, no refresh.
   - Otherwise `await session.refresh()` (shared, §4.4):
     - `ok` → retry the original request **once** with the new token. If the retry is 401 again → `signOut('expired', role)`, rethrow.
     - `rejected` → `signOut('expired', role)`, rethrow.
     - `suspended` → `signOut('suspended', role)`, rethrow.
     - `network` → rethrow the **original** error, no sign-out (the view shows `Check your connection and try again.` through `friendlyError`).
   - Several requests failing with 401 together trigger one refresh and each is retried once.
5. `role` for sign-out = the role of the current URL (`/app/customer/**` or `/app/runner/**`), else the user's role, else `customer`.
6. 403 and every other status pass through unchanged (views own them).
7. `REALTIME_TOKEN_PROVIDER` (ui-kit §6.1) is provided in `app.config.ts` as `() => session.freshAccessToken()` (replaces the #5 stub; #5 handoff need).
8. **Socket suspension (PR #25).** The gateway refuses a suspended or banned account's handshake with a `connect_error` whose `message` is `account_suspended` and whose `data` is `{ statusCode: 401, code: 'account_suspended', message }`, and it disconnects that user's open sockets when the account is suspended. `RealtimeService` (#5 kit, changed by #6) treats a `connect_error` with `message === 'account_suspended'` or `data.code === 'account_suspended'` as final: it stops retrying (state `disconnected`, rooms cleared) and calls the injected `REALTIME_ACCOUNT_SUSPENDED: InjectionToken<() => void>` (default no-op, declared next to `REALTIME_TOKEN_PROVIDER`). #6 provides it as `() => session.signOut('suspended', role)`. A server-side disconnect (`io server disconnect`) keeps the normal retry: the next attempt asks `freshAccessToken()`, whose refresh answers `account_suspended` and signs out (§4.2), or the next handshake answers the `connect_error` above. Every other `connect_error` keeps the ui-kit §6.2 backoff.
9. **`showReconnecting` (ui-kit §6.3).** #6 code does not call it (the shells show nothing for reconnecting). Any caller, in #6 or later, calls it in an injection context (component field or constructor) or passes its `DestroyRef`; a call from a service method, `effect` callback or event handler without a `DestroyRef` is a review FAIL.

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
| 3 | `flowRole === 'customer'` and role `runner` | Continue as a **runner** (rows 4–6 with role `runner`, `fresh` kept, so a runner applicant still gets the onboarding step). **WQ-13, owner 2026-10-28.** No message is shown; a customer-area `returnUrl` is dropped by §6.5 |
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

`AppEntryPage` shows the splash (§4.6), `await ensureRestored()`: `signedIn` → §6.2 (not fresh); `signedOut` → `/auth` (the role chooser, WQ-12: `/app` does not know which area the visitor wants); `failed` → `/app/offline?returnUrl=/app`.

### 6.5 `returnUrl` validation

Accepted only if it is a same-origin path starting with `/app/<resolved role>/`, is not a `sign-in`, `name` or `offline` path, and contains no `//` or scheme. Anything else is dropped silently. (No open redirect.)

### 6.6 `SignInFlowStore` (memory only)

Per role: `{ phone: string /* +2547… normalised */, cooldownEndsAt: number /* epoch ms */ } | null`. Set by the phone screen, read by the code screen, kept when the visitor goes Back (the phone field is prefilled), cleared after a successful sign-in. A page reload loses it and `otpStepGuard` sends the visitor back to the phone screen (the apps lose it on process death too).

### 6.7 `/auth` role chooser (`AuthChooserPage`, WQ-12)

Owner, 2026-10-28: "replace the public `/auth` page with a role chooser (send errands / run errands) that opens the matching sign-in". Every marketing CTA keeps linking to `/auth` (marketing unchanged).

- File `apps/website/src/app/pages/auth-chooser/auth-chooser.page.ts` (the old `pages/auth/auth.component.ts` is deleted). Route: top-level `auth`, lazy `loadComponent`, outside `MarketingLayoutComponent` (no header/footer), title `Sign in · Nitume`.
- On load: `await session.ensureRestored()`. `signedIn` → `resolveDestination` (§6.2, not fresh, no `returnUrl`) with `replaceUrl: true`; `signedOut` or `failed` → show the chooser (the visitor can still pick a sign-in; a failed restore is retried by the sign-in route's `guestGuard`). While restoring: the splash frame of §4.6 (wordmark + hidden `Loading`).
- Layout inside `nm-auth-frame` (§7.4), top to bottom: `nm-wordmark` (no suffix) with `href="/"` (back to the marketing home; accessible name `Nitume`), margin-bottom 30px; heading block `h1` `Sign in to Nitume` (`auth-heading`), 8px, sub `Choose how you use Nitume.` (`muted`), 26px; primary `nm-button` `expand` `href="/app/customer/sign-in"` label `I need tasks done`; 12px gap; `nm-button` variant `outline` `expand` `href="/app/runner/sign-in"` label `I'm a Runner or want to become one`. Both are links (`<a>`), not buttons. No legal line (the sign-in screens carry it).
- Copy (**proposed**; the owner described the two choices as "send errands / run errands" and did not word them; the apps' and marketing pages' user-facing word is "task": `New task`, `Request a task`): heading `Sign in to Nitume`, sub `Choose how you use Nitume.`, `I need tasks done`, `I'm a Runner or want to become one`. Open item Q6-1 (§11; board number to be assigned by the orchestrator) only confirms the wording; the layout and flow are decided.
- Components: `nm-auth-frame`, `nm-wordmark` (NEW #6), `nm-button` (kit). No new component.
- States: restoring (splash), chooser, redirect (signed in). No error state of its own.
- Accessibility: focus on the `h1` after load (§7.3 rule applies here too); both links ≥ 48px high with the focus ring; tab order wordmark, primary, outline.
- No storage writes; no request other than the restore's `POST /auth/web/refresh` and `GET /users/me`.

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
| `nm-field` inputs `autocapitalize` and `spellcheck` | bound to the native attributes (`null` = attribute absent; defaults unchanged) | `TextCapitalization.words` | name fields (`autocapitalize="words"`, `spellcheck="false"`) |
| `normalizeKenyanPhone(input): string \| null` in `shared/format/formatters.ts` | port of `KenyanPhone.normalize`: strip spaces and hyphens, accept `+254`/`254`/`0` + `7XXXXXXXX`/`1XXXXXXXX`, return `+254…` or `null` | `KenyanPhone.normalize` | phone screens (not shipped by #5, verified 2026-10-28; `formatPhoneIntl` exists) |

If the #5 build already provides any of these, reuse it; do not add a second one. Verified on `feat/website-auth-shell` at `77e34f0`: none of the type styles `resend`, `wordmark-suffix`, `greeting`, `num-otp`, `num-resend`, nor `hideLabel`, `autocapitalize`, `spellcheck` or `normalizeKenyanPhone` exist yet; `auth-heading`, `top-bar-title`, `pushed-title`, `list-title`, `tab-label`, `muted`, `field-label`, `error`, `num-meta` do.

### 7.2 Components built in #6 (all standalone, OnPush, signal inputs, `nm-` prefix, under `apps/website/src/app/shared/ui/`)

| Component | Flutter | Status | Spec |
|---|---|---|---|
| `nm-icon` | Material icons used by the apps | **NEW (#6)** | Inline SVG from a typed registry (`home`, `home-filled`, `add-circle`, `add-circle-filled`, `location`, `location-filled`, `history`, `person`, `person-filled`, `work`, `work-filled`, `visibility`, `visibility-filled`, `arrow-back`). Paths from Google Material Symbols (Apache-2.0, licence noted in the file header). `fill="currentColor"`, size input (default 21), always `aria-hidden="true"`. No icon font, no new dependency |
| `nm-wordmark` | `NitumeWordmark` (+ R-17 suffix) | **NEW (#6)** | 9px green dot (brand mark; mobile Q1 default kept), 9px gap, `Nitume` in `auth-heading` (22/700 blue); optional `suffix` (`Runner`) after a space in `wordmark-suffix`, same baseline. Accessible name `Nitume` / `Nitume Runner` (`role="img"` + `aria-label` on the wrapper, inner text `aria-hidden`). Optional `href` makes it a link with that accessible name (shell side nav → role home; chooser → `/`) |
| `nm-back-button` | `NitumeBackButton` | **NEW (#6)** | 32px white circle, 1px slate-line, 16px `arrow-back` blue, 48×48 hit area (`nm-hit-area`), accessible name `Back`, focus ring. Output `back`; default action `history.back()` when the previous entry is inside `/app`, else the `fallback` input URL |
| `nm-pushed-header` | C-10 `NitumePushedHeader` | **NEW (#6)** | Row height 56, padding `2px 20px 6px 12px`, slate; back button, optional title `pushed-title` (18/700, `h1`), optional Fira Code `Step n of m` (`num-meta`), or a trailing slot. Used by the code screen now and by every pushed view later |
| `nm-top-bar` | C-9 `NitumeTopBar` | **NEW (#6)** | Padding `8px 20px 14px`, slate; optional `greeting` above the title, title `top-bar-title` (21/700, `h1`), empty title renders no heading (BOARD Needs row 40); trailing actions slot, gap 10. Used by the route stubs now and the root views later |
| `nm-auth-frame` | `AuthFrame` (`.auth-wrap`) | **NEW (#6)** | §7.4 |
| `nm-otp-field` | C-26 `OtpCodeField` | **NEW (#6)** | `customer-v-auth-otp.md` §Components |
| `nm-otp-resend-line` | C-38 `OtpResendLine` | **NEW (#6)** | `customer-v-auth-otp.md` §Components |
| `nm-legal-line` | `_LegalLine` (phone screens) | **NEW (#6)** | `customer-v-auth-phone.md` §Components |
| `nm-app-nav` | C-13 `NitumeTabBar` | **NEW (#6)** | §7.3 |
| `nm-app-shell` | `HomeShell` / `RunnerShell` frame | **NEW (#6)** | §7.3; `customer-shell.md`, `runner-shell.md` give items and behaviour |

Reused from the kit (#5, PR #26, merged into this branch at `77e34f0`): `nm-button`, `nm-field`, `nm-error-state`, `nm-skeleton-card`, `NmToastService` + `nm-toast-host`, `nmNum`, `formatCountdown`, `formatPhoneIntl`, `friendlyError`, `RealtimeService`, `_tokens.scss` mixins and breakpoints. `normalizeKenyanPhone` is a #6 addition (§7.1).

### 7.3 App area, shell and nav (web adaptation of C-13; WQ-3 breakpoint 768px)

- `AppAreaComponent` (parent of every `/app` route): slate canvas (`--nitume-slate`), `min-height: 100dvh`, `<router-outlet>`, and the single `nm-toast-host` (so the sign-in screens can show `Please sign in again.` and `New code sent.`). Focus: after each navigation inside `/app`, focus moves to the new page's `h1` (`tabindex="-1"`, no focus ring on programmatic focus).
- `nm-app-shell` inputs: `items: NavItem[]` (`{ key, label, icon, activeIcon, link }`), `wordmarkSuffix?`, `homeLink`. Content projection for the routed view. It renders a visually hidden `Skip to content` link first (**proposed** copy; visible on focus), the nav, and `<main id="content">`.
- **Below 768px — bottom bar** (C-13 exactly): fixed to the bottom, white, 1px slate-line top border, padding `4px 8px` plus `env(safe-area-inset-bottom)`, items in equal-width columns, each a link with min-height 52px (≥ 48 tap), icon 21px, 4px gap, label `tab-label` (10/700), single line with ellipsis. Inactive icon and label slate-400; active green-700 with the filled icon variant. No indicator, no fill. `<main>` gets bottom padding = bar height + safe-area inset so nothing hides under it. On routes with `data.pushed` the bar is not rendered (pushed screens cover the tab bar in the apps).
- **768px and wider — side nav**: `<nav>` sticky on the left, full viewport height, width 220px, white, 1px slate-line right border, padding `20px 12px`. Top: `nm-wordmark` (with suffix in the runner shell) linking to the role home, 24px below it the items. Each item: a link, min-height 48px, padding `12px 14px`, radius `--nitume-r-s`, 12px gap, icon 21px, label `list-title` (14.5/600). Inactive icon and label **slate-600** (the 10px tab label's slate-400 is not used at 14.5px on white: slate-600 meets WCAG AA); active green-700 + filled icon (same rule as the tab bar); hover slate fill; focus ring. The side nav is **white** (WQ-16, owner 2026-10-28), never blue. Pushed routes keep the side nav visible (WQ-15, owner 2026-10-28) with the parent item (`data.navKey`) active.
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
10. `verifyOtp`, `refresh` and `logout` go to `/api/v1/auth/web/otp/verify`, `/api/v1/auth/web/refresh`, `/api/v1/auth/web/logout` with `withCredentials: true`; refresh and logout have an empty body and no `Authorization` header; `requestOtp`, `me`, `updateDisplayName` and runner calls have no credentials.
11. `ensureRestored()`: refresh 201 + `/users/me` 200 → `signedIn` with the user; refresh 401 (`refresh_cookie_missing`, `refresh_invalid`) → `signedOut` with no toast; refresh status 0 → `failed`; `/users/me` 401 → `signedOut`; two concurrent calls make one refresh request.
12. `completeSignIn` keeps the verify user when `GET /users/me` fails; sets the fresh flag once (`takeFreshSignIn()` true then false).
13. `freshAccessToken()`: returns the token when `exp` is more than 30 s away; refreshes when within 30 s; returns `null` when signed out or when refresh fails.
14. `refresh()` runs inside `navigator.locks.request('nitume-auth-refresh', …)` when available and still works without it.

### 9.3 Sign-out
15. `signOut('user')`: `POST /auth/web/logout` sent with credentials and no Bearer, token and user cleared, `RealtimeService.disconnect()` called, `signed-out` broadcast, `WINDOW.location.replace('/app/<role>/sign-in')`.
16. `signOut('expired')` and `signOut('suspended')` also call `POST /auth/web/logout` (best effort, clears the cookie) and navigate with `?signedOut=expired|suspended`.
17. A failing logout call does not block sign-out.
18. The phone screen shows `Please sign in again.` / `This account can't sign in. Contact support.` / the not-allowed line for the three `signedOut` values, once, and strips the parameter; an unknown value shows nothing.
19. A tab receiving `signed-out` on an `/app` route navigates to its sign-in page; on a sign-in page it does nothing.

### 9.4 Interceptor
20. Adds the Bearer header to `/api/v1/**` requests, not to `/auth/otp/request`, any `/auth/web/*`, nor to any URL outside `apiBaseUrl`; `withCredentials` is true on `/auth/web/*` only.
21. **Refresh-then-retry**: a 401 on `GET /users/me` triggers one `POST /auth/web/refresh`; on 201 the original request is retried once with the new token and its result reaches the caller.
22. Three parallel 401s cause exactly one refresh and three retries.
23. **Refresh failure sign-out**: refresh 401 `refresh_invalid` (and, separately, `refresh_cookie_missing`) → `signOut('expired')`, the original error is rethrown.
24. Refresh 401 `account_suspended` → `signOut('suspended')`.
25. A protected call answering 401 `account_suspended` → `signOut('suspended')` without a refresh.
26. Retry answering 401 again → `signOut('expired')`; no second refresh (no loop).
27. Refresh network failure → original error rethrown, no sign-out.
28. 401 on `/auth/otp/request`, `/auth/web/otp/verify`, `/auth/web/refresh`, `/auth/web/logout` never triggers a refresh.
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
43. Customer flow + runner role → runner destination (WQ-13): with a name and verified → `/app/runner/jobs`; fresh without verification → the onboarding step; a customer `returnUrl` is dropped.
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

### 9.10 Added 2026-10-28 (owner answers and the web auth API)
51. No request from `/app` code goes to the mobile `/api/v1/auth/otp/verify`, `/api/v1/auth/refresh` or `/api/v1/auth/logout` (one flow-level test: sign in, refresh, sign out with `HttpTestingController.expectNone` on the three URLs).
52. Verify answering 403 `web_origin_not_allowed` → the code screen shows `Something went wrong. Please try again.`; refresh answering it → outcome `rejected`; in dev mode one `console.error` mentions `WEB_ORIGINS`.
53. `SIGN_OUT_HOOK` runs before `POST /auth/web/logout` with the reason; a hook that rejects or never settles (3 s, fake timers) does not block sign-out; the default provider is a no-op; `dropSession()` does not call it.
54. `freshAccessToken()` with refresh `rejected` while signed in → `signOut('expired')`; with `suspended` → `signOut('suspended')`; with `network` → `null`, no sign-out.
55. `RealtimeService`: a `connect_error` with `message: 'account_suspended'` (and, separately, `data.code: 'account_suspended'`) → no retry scheduled, state `disconnected`, `REALTIME_ACCOUNT_SUSPENDED` called once; any other `connect_error` still retries with the backoff (existing #5 tests keep passing).
56. `app.config.ts` providers: `REALTIME_TOKEN_PROVIDER` resolves to `session.freshAccessToken()` (not the `null` stub); `REALTIME_ACCOUNT_SUSPENDED` signs out with `suspended`.
57. `/auth` chooser: renders wordmark (link to `/`), heading, sub and the two links with the §6.7 copy and `href`s; no marketing header/footer; a signed-in customer is sent to `/app/customer/home` and a runner to `/app/runner/jobs` with `replaceUrl`; restore `failed` still shows the chooser; the old `AuthComponent` and `pages/auth/` no longer exist.
58. `/app` signed out → `/auth`.
59. Side nav from 768px on a pushed route stays visible with the parent item active (WQ-15) and its background token is `--nitume-white` (WQ-16).

---

## 10. Data needed (all on `main` unless marked)

| Need | Where | Status |
|---|---|---|
| `POST /auth/otp/request` (codes and `retryAfterSeconds`) | `auth.controller.ts`, `otp.service.ts`, `otp-throttler.guard.ts` | exists |
| `POST /auth/web/otp/verify`, `POST /auth/web/refresh`, `POST /auth/web/logout`; cookie `nitume_rt`; `WebOriginGuard` + `WEB_ORIGINS` | `apps/api/src/auth/web/{web-auth.controller,refresh-cookie.service,web-origin.guard}.ts`, `config/web-origins.ts` | **PR #20 open** (`feat/api-web-refresh-cookie`, verified at `af5f70a`) |
| `GET /users/me`, `PATCH /users/me` (`displayName` 2–60) | `users.controller.ts` | exist |
| `GET /runners/me` (`verification.level2Missing`), `GET /runners/me/verifications` | `runners.controller.ts` | exist |
| `account_suspended` on verify and refresh | `auth.service.ts` | verify: exists; refresh (mobile and web, cookie cleared, coded error kept): **PR #22 open** (`fix/api-refresh-suspended`) |
| `account_suspended` on every authenticated route and as socket `connect_error` | `users/user-access.service.ts`, `realtime/realtime.gateway.ts` | **PR #25 open** (`feat/api-suspended-access`) |
| `role_mismatch` on verify (RA-9) | — | missing; the client role check covers it |
| Socket | `RealtimeService.connect()` after sign-in, `disconnect()` on sign-out | exists (#5); `account_suspended` `connect_error` handling added by #6 (§5 item 8) |

No new socket event. No task state appears on these screens (pre-auth and frame only).

---

## 11. Questions for the owner (#6)

The spec first numbered these WQ-9 … WQ-15; BOARD numbers them **WQ-12 … WQ-18** and this file now uses the board numbers (WQ-9 → WQ-12, WQ-10 → WQ-13, WQ-11 → WQ-14, WQ-12 → WQ-15, WQ-13 → WQ-16, WQ-14 → WQ-17, WQ-15 → WQ-18). All seven were **answered by the owner on 2026-10-28** (GitHub #6 comment); the answers are binding and applied above.

| Id | Answer (owner, 2026-10-28) | Applied in |
|---|---|---|
| WQ-12 | Replace the public `/auth` page with a role chooser that opens the matching sign-in | §1, §2, §6.4, §6.7 |
| WQ-13 | A runner who signs in through the customer flow goes to the runner area | §6.2 row 3 |
| WQ-14 | Not-allowed copy: `This number can't be used to sign in here. Use another number, or contact support.` | §4.5, code-screen states |
| WQ-15 | From 768px, pushed screens keep the side nav visible | §7.3 |
| WQ-16 | The side nav is white, like the tab bar | §7.3 |
| WQ-17 | Per-IP verify limit copy: `Too many attempts. Try again in N min.` | §3, code-screen states |
| WQ-18 | A web session lasts 30 days like the apps (existing refresh lifetime) | §4.1 |

Also answered and applied: WQ-3 (panel from 768px, dialogs 335px; #6 uses the same 768px breakpoint for the nav); WQ-8 (access token in memory, refresh token in an httpOnly cookie, through the dedicated `/auth/web/*` routes of PR #20, not a cookie mode on the mobile routes); WQ-4 (FCM web push, added by #11/#18; #6 ships the no-op `SIGN_OUT_HOOK`, §4.2, §4.5).

Open (wording only, build default = the proposed copy):

| Id | Question | Recommendation |
|---|---|---|
| Q6-1 (board WQ number to be assigned) | **Chooser wording.** WQ-12 describes the two choices as "send errands / run errands". The user-facing word elsewhere is "tasks", so §6.7 proposes heading `Sign in to Nitume`, sub `Choose how you use Nitume.`, buttons `I need tasks done` and `I'm a Runner or want to become one`. Approve, or give the wording | Approve as proposed |

Original question text (kept for the record):

| Id | Question | Recommendation (as asked) |
|---|---|---|
| WQ-12 | **The public `/auth` page.** Every marketing CTA (`Log in`, `Request a task`, `Apply to become a Runner`, `Talk to sales`) links to `/auth`. Options: (A) **replace** `/auth` with a small role chooser in the auth frame (wordmark, heading `Sign in to Nitume`, primary `I need tasks done` → `/app/customer/sign-in`, outline `I'm a Runner or want to become one` → `/app/runner/sign-in`; all **proposed** copy; a signed-in visitor is redirected to their area); the old page, its Google stub and its `localStorage` tokens go away. (B) **redirect** `/auth` to `/app/customer/sign-in`: simplest, but the `Become a Runner` CTA would then sign runner applicants up as customers, and one phone has one role (row 127), so they could not apply later with that number. (C) **keep** the old page and add links: keeps tokens in `localStorage` (against WQ-8), a fake Google button and no OA-17 states | **A** (replace with the chooser). Built in a separate commit so it can be swapped for B |
| WQ-13 | **Customer sign-in with a runner's number.** The customer app has no role check (a runner number gets a runner session in the customer app). On the website both areas exist, so the default sends a runner who used the customer sign-in to the runner area. Alternative: refuse with a line like the row-127 one | Send to the runner area (no new copy) |
| WQ-14 | **Admin or business number on the website sign-in.** The runner app shows the customer-account sentence for any non-runner; the customer app shows nothing. Proposed for the web, both flows and a restored session: `This number can't be used to sign in here. Use another number, or contact support.` (+ `Contact support` when configured) | Approve the sentence |
| WQ-15 | **Pushed screens on desktop.** In the apps a pushed screen covers the tab bar. Below 768px the web does the same; from 768px the default keeps the side nav visible with the parent item active, and the view shows its back header | Keep the side nav visible from 768px |
| WQ-16 | **Side-nav style.** The design system calls `#0B2545` the colour for "navigation surfaces"; the apps' tab bar is white with green-700 for the active item. Default: a white side nav that mirrors the tab bar (active green-700, inactive slate-600). Alternative: a blue side nav with white labels like an admin console | White side nav (parity with the tab bar) |
| WQ-17 | **Network throttle while verifying.** The API can answer `otp_ip_rate_limited` on verify (per-IP limit). The apps show the generic error. Proposed: `Too many attempts. Try again in N min.` (N in Fira Code) | Approve the sentence |
| WQ-18 | **How long a web session lasts (security).** The refresh cookie would follow the apps' 30-day refresh lifetime, so a shared or cybercafé computer stays signed in until `Log out`. Options: same 30 days (persistent cookie); a session cookie that ends when the browser closes; or a shorter web lifetime (e.g. 7 days). (§3: session/token handling) | Persistent, same lifetime as the apps, plus the cross-tab sign-out and full-reload sign-out in §4.5; revisit if support sees shared-device issues |


## 12. Needs from other agents

- **Owner merge (open PRs)**: #6 calls routes and codes that exist only in open PRs: #20 (`/auth/web/*`, cookie, `WEB_ORIGINS`, credentialed CORS allow-list; this closes the earlier CORS finding), #22 (`account_suspended` on refresh) and #25 (`account_suspended` on every authenticated route and on the socket handshake). #6 can be built and unit-tested now (HTTP is faked), but it must not be merged before #20, #22 and #25. Deployments must list the website origin in `WEB_ORIGINS`.
- **Deployment (board WQ-9, open)**: the `SameSite=Strict` cookie works only when the website and the API share a registrable domain (e.g. `nitume.co.ke` / `api.nitume.co.ke`). Local dev (`localhost:4200` → `localhost:3000`) is same-site. #6 code does not change with the answer.
- Done by api-contract and no longer needed: cookie set/read/rotate/clear, empty refresh/logout bodies, cookie-only logout, `account_suspended` on refresh, origin allow-list (PR #20, #22, #25).
- **api-contract (RA-9, open)**: `role_mismatch` on verify with `role: runner` for an existing customer number, so no customer session (and cookie) is issued to the runner flow.
- **web-parity**: #5 kit (PR #26) is merged into `feat/website-auth-shell` at `77e34f0`; #6 must not be merged before PR #26.
- **#11 / #18**: replace the `SIGN_OUT_HOOK` provider with the push-token unregister (WQ-4).
