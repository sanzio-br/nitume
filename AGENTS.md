# Agent Conventions

Nitume is built by a team of specialised Claude Code subagents defined in `.claude/agents/`. The **orchestrator is the main Claude Code session** (run `/orchestrate`), because subagents cannot spawn other subagents. Agents stay in sync through the shared files in `docs/agent-sync/` (see `WORKFLOW.md` there).

Every agent must:

1. **Read first**: this file, `AGENT_BUILD_INSTRUCTIONS.md`, `docs/agent-sync/WORKFLOW.md`, then `docs/agent-sync/BOARD.md`.
2. **Work on a feature branch** — never commit to `main`. Branch off `main` as `<type>/<scope>-<short-description>`.
3. **Commit small, logical units** using conventional commits: `<type>(<scope>): <short summary>`.
4. **Never commit broken code.** If it doesn't compile or tests fail, use a non-main branch with a `wip:` prefix.
5. **Never merge to `main`.** Only the project owner merges after review.
6. **Tag milestones** that correspond to roadmap phases in `Nitume_System_Design.md` §11.
7. **Stop and ask** on anything in `AGENT_BUILD_INSTRUCTIONS.md` §3 (schema, payments, palette, state machine, security, third-party services, scope).
8. **End every session** with a short summary to the project owner: what was built, commits (with hashes), what is unsure, what to tackle next.

## Agent roster

| Agent | Where | Scope | Can edit code? |
|-------|-------|-------|----------------|
| orchestrator | main session (`/orchestrate`) | Plans, dispatches, owns `BOARD.md` and `PROGRESS.md` | Only `docs/agent-sync/`, `PROGRESS.md` |
| `design-auditor` | subagent | Extracts specs from mockups, audits built screens against them | Only `docs/specs/`, `docs/audits/`, `SCREEN_MAP.md` |
| `core-ui` | subagent | `packages/nitume_core` (theme, tokens, shared widgets) | Yes |
| `flutter-customer` | subagent | `apps/customer_app` | Yes |
| `flutter-runner` | subagent | `apps/runner_app` | Yes |
| `web-parity` | subagent | `apps/admin`, `apps/website` (Angular) | Yes |
| `api-contract` | subagent | `apps/api` — verifies and fills endpoints that screens need | Yes |
| `reviewer` | subagent | Definition of Done, non-negotiables, git hygiene | No |

## Existing status (from the project owner)

| Area | Status |
|------|--------|
| `apps/admin` (Angular) | Completed — parity audit only |
| `apps/website` (Angular) | Completed — parity audit only |
| `apps/api` | Gaps filled, on `main` |
| Root workspace (`package.json`, `scripts/dev.mjs`) | Set up |
| `apps/customer_app` + `packages/nitume_core` | Foundation built, needs screens |
| `apps/runner_app` | Needs screens (`design-auditor` establishes the real state) |

Agents follow the Definition of Done in `AGENT_BUILD_INSTRUCTIONS.md` §6 and the non-negotiables in §7.
