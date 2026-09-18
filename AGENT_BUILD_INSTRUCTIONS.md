# NITUME — Build Instructions for AI Coding Agent

**Read this entire file before writing or changing any code.** This is the operating brief for building Nitume. It tells you what to build, which documents govern which decisions, how to behave when something is unclear, and how to commit your work. Treat it as binding unless the project owner (the human you're working with) tells you otherwise in writing, in the conversation, or in a later revision of this file.

---

## 0. Required reading, in this order

Before writing a single line of application code, read every document below, fully. Do not skim. Do not start implementing after reading only one of them — they are complementary and some details only make sense once you've seen all four.

| Order | Document | What it governs |
|---|---|---|
| 1 | `Nitume_Business_Plan.docx` | The product itself: what Nitume is, its service categories, target customers, trust/verification model, payment philosophy, pricing logic, rollout sequencing, and what is explicitly **out of scope** for MVP. |
| 2 | `Nitume_System_Design.md` | The technical architecture: NestJS module structure, database schema (ERD), API surface, the task state machine, the real-time location/notification design, payments orchestration, Angular/Flutter architecture, infrastructure, and the scaling plan. |
| 3 | `nitume_design_system.html` | The **only** source of truth for visual design tokens: exact colors, typography (Fira Sans / Fira Code), spacing, component patterns (buttons, chips, list items, cards, form fields), and the explicit usage rules at the bottom of that page. |
| 4 | `nitume_website.html`, `nitume_customer_app.html`, `nitume_runner_app.html`, `nitume_admin_dashboard.html` | Reference mockups of the four real surfaces you are building. These show layout, information hierarchy, screen-to-screen flow, and copy tone — not just colors. Open each one in a browser and click through every tab/screen before building the equivalent real screen. |

If any of these files are missing from the repository when you start, **stop and ask the project owner for them** rather than inventing your own version of the business plan, schema, or design system. Guessing at any of these four documents is not acceptable — they already exist and were deliberately produced; your job is to implement them, not redesign them.

---

## 1. Source-of-truth hierarchy

When two documents seem to disagree, resolve it in this order (highest priority first), and say out loud which document you followed and why:

1. **Explicit instructions from the project owner in this conversation** — always wins, even over the documents below.
2. **`nitume_design_system.html`** for anything visual (color, type, spacing, component shape). Never introduce a color, font, or component pattern that isn't in that file or a reasonable, clearly-labeled extension of it (see Section 4).
3. **`Nitume_System_Design.md`** for anything technical (schema, module boundaries, API shape, state machine, real-time design, infra).
4. **`Nitume_Business_Plan.docx`** for anything about product scope, policy, pricing logic, or category rules.
5. **The four HTML mockups** for layout/flow/copy — but they are reference, not pixel-perfect spec. If a mockup's layout conflicts with the design system's component patterns, the design system wins on styling; the mockup wins on what content/flow belongs on that screen.

If following this hierarchy still leaves a real ambiguity — see Section 3.

---

## 2. What you are building

Build Nitume as specified in the system design document, using:

- **Backend:** NestJS (TypeScript), modular monolith per the module breakdown in `Nitume_System_Design.md` §3.1. PostgreSQL + PostGIS as the system of record. Redis for cache, pub/sub, and queues (BullMQ). Socket.IO for real-time (location, live status, notifications).
- **Web frontend:** Angular, structured per §7.1 — customer, business, and admin feature modules, with the admin/ops live-map view prioritized early (per the business plan's manual-oversight MVP approach).
- **Mobile:** Flutter, two apps (Customer, Runner) sharing a core package, per §7.2.
- **Payments:** M-Pesa Daraja integration implementing the three-flow model (service fee / runner fee / merchant payment) from the business plan and §6 of the system design. **Do not build an internal customer/runner wallet or escrow system** unless the project owner explicitly tells you to — this is a deliberate, repeated decision in both source documents, not an oversight.
- **Maps:** Google Maps/Places/Distance Matrix per §5, with the caching guidance in that section followed (don't burn API budget on uncached autocomplete/distance calls).

Follow the **build sequencing in `Nitume_System_Design.md` §11** (Foundation → Core loop → Live layer → Automation → Scale-readiness) and the **30/90-day roadmap in the business plan**. Do not jump ahead to automated matching, full multi-region infra, or scale optimizations before the core transactional loop (create task → quote → pay → assign → track → evidence → complete) works end-to-end. Build in that order even if it feels slower — it's the order both documents specify for a reason.

---

## 3. When you are not sure — stop and ask

You will hit decisions the documents don't fully answer. That's expected — a business plan and a system design are not a complete spec for every button and edge case. When that happens:

**Do not silently guess and proceed. Do not pick "a reasonable default" and keep going for anything in the list below.** Stop, summarize the ambiguity in 2–4 sentences, propose the option you'd lean toward and why, and wait for the project owner's approval before writing the code.

You must stop and ask before proceeding on:

- Any change to the database schema that isn't already implied by the ERD in the system design (new tables, renamed columns, different relationships).
- Any payment-flow decision not already covered by the three-flow model (e.g., how exactly a refund is triggered, exact commission percentages, exact Runner advance limits — the business plan gives *indicative* ranges, not final numbers).
- Any change to, or extension of, the color palette, typography, or component patterns beyond what's in `nitume_design_system.html`.
- Any third-party service choice not already named in the system design (e.g., which SMS gateway, which object storage provider, which hosting platform) if more than one reasonable option exists.
- Any security- or compliance-relevant decision (how OTPs are generated/expired, how ID documents are stored, session/token lifetimes, rate limits) beyond the general guidance in §10.
- Any deviation from the task state machine in §3.3 — adding, removing, or reordering states.
- Anything that would commit real money, real API keys, or a real third-party account (e.g., actually registering for a production Daraja/M-Pesa account, a Google Maps billing account) — always confirm before doing this, even in a "just testing" context.
- Scope questions: whether something the business plan describes as a *later-phase* feature (e.g., automated matching v2, business subscriptions, the B2B API) should be pulled forward.

For smaller implementation-level choices clearly implied by the documents (e.g., exact variable names, which NestJS decorator to use, how to structure a specific DTO), use your judgment and proceed — don't ask about things a competent engineer would just decide. The bar is: **if getting it wrong would mean redoing product, data, money, or brand decisions, ask first. If getting it wrong just means a small refactor, proceed.**

---

## 4. Design system discipline

- Use the exact hex values from `nitume_design_system.html`: `#0B2545` (Deep Trust Blue — text/headers/nav), `#FFFFFF` (cards/canvas), `#F4F6F9` (outer background/separators), `#04AF4D` (primary actions/success/active states only). Do not introduce new brand colors.
- The document also defines two small semantic accents (amber for "pending", a muted red for "disputed/failed") — these exist only as status-chip accents, never as large surfaces or buttons. If you need a new semantic state (e.g., a third status color), stop and ask rather than picking a color yourself.
- Typography: Fira Sans for all UI text, labels, descriptions, and buttons. Fira Code exclusively for numeric data — timestamps, dates, prices, counters, ratings, ETAs. Apply this distinction consistently in Angular and Flutter, not just in the HTML mockups — this means setting it up as a real design-token/theme layer (Angular: SCSS variables or a theme service; Flutter: a `ThemeData`/text-theme setup), not just copying inline styles.
- Any button or chip rendered on a blue or green fill uses white text — never dark text on the green.
- Port the component patterns (list item with checkbox + title + `3/5`-style counter, status chips, card shapes, form field style) as reusable components (Angular components / Flutter widgets), not copy-pasted markup per screen.

---

## 5. Git workflow

Work in git from the first commit. Follow these rules for the whole project:

1. **Initialize the repo properly** if one doesn't exist yet — sensible `.gitignore` for Node/NestJS, Angular, Flutter and OS/editor cruft, before the first commit. Never commit `node_modules`, build output, `.env` files, or any credentials/API keys.
2. **Commit in small, logical units**, not one giant commit per feature. A reasonable size is "one coherent change that could be described in one commit message" — e.g., "add Errand entity and migration", "implement task state machine transitions", "add live location Socket.IO gateway", not "backend" or "wip".
3. **Write clear, conventional commit messages.** Use this format:
   ```
   <type>(<scope>): <short summary>

   <optional longer body explaining why, not just what>
   ```
   Where `type` is one of `feat`, `fix`, `refactor`, `docs`, `chore`, `test`, `style`, and `scope` is the module or surface affected (e.g., `errands`, `location`, `angular-admin`, `flutter-customer`, `payments`, `schema`). Example: `feat(errands): implement task state machine with status history logging`.
4. **Commit after each working, reviewable step**, not only at the end of a session — if you build for hours without committing, you're doing it wrong. A good rule of thumb: if you'd be upset to lose the last chunk of work, it should already be committed.
5. **Never commit code you know is broken** (doesn't compile, fails existing tests) to the main branch. If you need to checkpoint broken/in-progress work, use a branch or clearly mark it in the commit message (`wip:` prefix is acceptable *only* on a non-main branch).
6. **Always work on a feature branch — never commit directly to `main`.** This is the standing default for this project, not a judgment call. Before starting any new piece of work (a module, a schema change, a new screen, a fix), branch off the latest `main` using this naming convention:
   ```
   <type>/<scope>-<short-description>
   ```
   e.g. `feat/errands-state-machine`, `feat/flutter-runner-active-job-screen`, `fix/payments-mpesa-callback-idempotency`. Keep one branch per logical unit of work from Section 5.2 above — don't pile unrelated changes onto a single long-lived branch.
   - Commit to the branch as you go, following the same small-logical-units rule.
   - When the unit of work is complete and matches its Definition of Done (Section 6), open a PR (or the equivalent diff/summary if no PR tooling is configured) describing what changed, which documents/sections it implements, and anything flagged in Section 3.
   - **Wait for the project owner's review and approval before merging into `main`.** Do not self-merge, even if you're confident the work is correct — `main` should only ever contain reviewed, approved work.
   - Keep branches short-lived: merge (or get feedback and iterate) before starting the next unrelated branch, rather than letting many branches drift out of sync with `main`.
7. **Do not rewrite shared history** (no force-push over commits others may have pulled, no squashing already-pushed commits) without explicit approval.
8. **Tag or note milestones** that correspond to the roadmap phases in the system design (e.g., after "Foundation" is complete, after "Core loop" is complete) so progress is traceable against the plan in Section 2.

---

## 6. Definition of done, per phase

Don't call a phase finished until:

- **Foundation:** Auth (OTP + JWT), Users/Runners/Customers CRUD, Errand entity + state machine implemented and unit-tested, schema matches the ERD (or documented, approved deviations), admin dashboard shell renders and authenticates.
- **Core loop:** A task can be created, quoted, paid for via M-Pesa sandbox, manually assigned to a Runner via the admin dashboard, marked through its state transitions, evidence uploaded, and completed — end to end, by hand, without errors.
- **Live layer:** Runner location pings flow through Socket.IO/Redis to a live-updating map on both the Angular admin dashboard and the Flutter customer app; geofenced arrival detection fires; push/WhatsApp/SMS notifications actually send (sandbox/test credentials are fine) for the events listed in §4.4 of the system design.
- **Automation:** Matching runs without a human clicking "assign" for the happy path; notification fan-out and reconciliation workers run on a schedule/queue, not manually triggered.
- Every phase: the relevant tests pass, the relevant migration is committed, and a short note is added to a running `PROGRESS.md` (create this file if it doesn't exist) describing what was completed and what was explicitly deferred.

---

## 7. Non-negotiables — quick checklist

Keep this list visible while you work. Violating any of these means re-reading the source documents, not just fixing the code.

- [ ] No internal customer/Runner wallet or escrow balance, unless explicitly approved.
- [ ] Three-flow payment separation (service fee / runner fee / merchant payment) is preserved everywhere money is discussed in code, copy, or schema.
- [ ] Task categories are limited to the six defined in the business plan (Buy For Me, Get It For Me, Check It For Me, Go There For Me, Wait For Me, Business Tasks) — no open-ended "anything goes" task type.
- [ ] No impersonation-enabling or ID-verification-bypassing functionality, per the business plan's explicit prohibitions.
- [ ] Design tokens match `nitume_design_system.html` exactly; no ad hoc colors or fonts.
- [ ] Task state machine matches §3.3 of the system design exactly, including side-states (`CANCELLED`, `FAILED`, `DISPUTED`, `EXPIRED`).
- [ ] Every write path that isn't strictly synchronous (notifications, matching, reconciliation) goes through a queue, per §9's scaling principles — don't take shortcuts that hard-code synchronous behavior "for now" without flagging it.
- [ ] Git history is clean, incremental, and readable — see Section 5.
- [ ] Anything in Section 3's "stop and ask" list is actually stopped on and asked about — do not rationalize your way past this list because a deadline feels close.

---

## 8. How to report progress

At the end of each work session (or each time you'd otherwise go quiet for a while), give the project owner a short summary: what you built, what you committed (with commit hashes or a `git log --oneline` snippet), what you're unsure about, and what you'd tackle next. This keeps the human able to actually review and approve rather than discovering scope creep after the fact.
