# Agent Sync Workflow

How the Nitume agents stay in sync. Read this before starting any work.

> Claude Code note: subagents cannot spawn subagents, so the **orchestrator is the main session** (`/orchestrate`). It dispatches the subagents in `.claude/agents/` and is the only writer of `BOARD.md` and `PROGRESS.md`. Below, "orchestrator" means that main session.

## File locations (assumed layout)

```
docs/design/                 nitume_design_system.html + the four mockup HTML files
docs/design/Nitume_System_Design.md
docs/Nitume_Business_Plan.docx
docs/specs/<surface>/<view-id>.md      written by design-auditor
docs/audits/<surface>-gap-report.md    written by design-auditor
docs/agent-sync/BOARD.md               written ONLY by the orchestrator
docs/agent-sync/SCREEN_MAP.md          written ONLY by design-auditor
PROGRESS.md                            written ONLY by the orchestrator
```
If a path differs in the repo, `design-auditor` records the real paths at the top of `SCREEN_MAP.md` and everyone uses those.

## Single source of truth for "what is there"

`SCREEN_MAP.md` maps every mockup view to its real implementation file. `BOARD.md` tracks the stage of each screen. Never rely on memory of earlier sessions; re-read both at the start.

## Screen lifecycle

```
unaudited -> specced -> building -> built -> audited-pass -> reviewed -> awaiting-owner
                 ^                     |
                 +---- audited-fail ---+
```

1. **Audit + spec** — `design-auditor` reads the mockup view and design system, writes `docs/specs/<surface>/<view-id>.md`, compares it with the real screen (if any) and records gaps. Lists every shared widget the screen needs and whether it already exists in `nitume_core`.
2. **Shared pieces first** — `core-ui` builds any missing token/theme/widget the spec lists, on its own branch, before screen agents need it.
3. **Data check** — `api-contract` confirms every endpoint/event the spec lists exists and matches the response shape; fills gaps on its own branch. Schema, payment or state-machine changes go to the owner (BOARD "Questions for the owner"), not into code.
4. **Build** — `flutter-customer` / `flutter-runner` / `web-parity` implement or fix the screen strictly from the spec, using only `nitume_core` widgets and theme.
5. **Re-audit** — `design-auditor` audits the built screen against the spec and returns PASS or a numbered FAIL list. FAIL goes back to the builder.
6. **Review** — `reviewer` checks Definition of Done, non-negotiables and git hygiene, and writes the PR summary.
7. **Owner merges.** Agents never merge.

## Handoff protocol (how agents talk)

Subagents do not edit `BOARD.md`. Each ends its reply with this block, which the orchestrator copies onto the board:

```
HANDOFF
screen: <surface>/<view-id>
stage: <new stage>
branch: <branch name>
commits: <hash — message> (one per line)
needs: <shared widgets / endpoints / decisions required from another agent, or "none">
questions-for-owner: <items from AGENT_BUILD_INSTRUCTIONS §3, or "none">
notes: <anything unsure>
```

## File ownership (prevents edit collisions)

| Path | Only this agent edits it |
|------|--------------------------|
| `packages/nitume_core/**` | `core-ui` |
| `apps/customer_app/**` | `flutter-customer` |
| `apps/runner_app/**` | `flutter-runner` |
| `apps/admin/**`, `apps/website/**` | `web-parity` |
| `apps/api/**` | `api-contract` |
| `docs/specs/**`, `docs/audits/**`, `SCREEN_MAP.md` | `design-auditor` |
| `BOARD.md`, `PROGRESS.md` | orchestrator |

A screen agent that needs a change outside its area files a `needs:` entry in its HANDOFF instead of editing.

## Parallel work

Agents share one working tree, so two agents must never switch branches in it at the same time. For parallel runs the orchestrator creates a worktree per agent:

```
git worktree add ../nitume-<branch-slug> -b <branch> main
```
and tells the agent which directory to work in. Remove worktrees when the branch is handed off.

## Design rules every agent enforces

- Colors: only `#0B2545`, `#FFFFFF`, `#F4F6F9`, `#04AF4D` plus the derived tones and the amber/red status accents in `nitume_design_system.html`. No other hex values in app code outside the theme/token layer.
- Fira Sans for all UI text; Fira Code only for numeric data (timestamps, due dates, prices, counters like `3/5`, ratings, ETAs).
- White text on any blue or green fill. Never dark text on green.
- Green only for primary actions, active toggles and checked/complete states.
- Reusable widgets/components, never per-screen copy-pasted markup.

## Domain reminders every agent enforces

- Six task categories only: Buy For Me, Get It For Me, Check It For Me, Go There For Me, Wait For Me, Business Tasks. The ERD enum values (`buy_for_me | pickup_delivery | inspection | representation | queue_admin | business`) map to those six in that order (pending owner confirmation). Display names in UI, enum values in API/DB code.
- Task state machine exactly as `Nitume_System_Design.md` §3.3 (including CANCELLED, FAILED, DISPUTED, EXPIRED). UI shows states; it never invents or skips them.
- No internal wallet/escrow. Three payment flows stay separate: service fee, runner fee, merchant payment. "Available balance" in the Runner app is a payout ledger view, not a stored wallet.
- Anything unclear in the documents: stop and ask (BOARD → Questions for the owner).
