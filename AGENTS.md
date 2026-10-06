# Agent Conventions

Each agent works on a separate logical unit from the system design roadmap. Agents must:

1. **Work on a feature branch** — never commit directly to `main`. Branch off `main` using naming convention `<type>/<scope>-<short-description>`.
2. **Commit small, logical units** — one coherent change per commit, not giant monolithic commits.
3. **Use conventional commit messages** — `<type>(<scope>): <short summary>` format.
4. **Never commit broken code** — if code doesn't compile/fail tests, use a branch or `wip:` prefix on a non-main branch.
5. **Always work on a feature branch** — never commit directly to `main`.
6. **Tag milestones** that correspond to roadmap phases in the system design.
7. **At the end of each session**, give the project owner a short summary: what was built, what was committed (with hashes), what is unsure, and what to tackle next.

## Agent Assignments

| Agent | Scope | Status |
|-------|-------|--------|
| `flutter-customer` | `apps/customer_app` + `packages/nitume_core` | Foundation built, needs screens |
| `flutter-runner` | Runner
| `angular-admin` | `apps/admin` | Already completed |
| `angular-website` | `apps/website` | Already completed |
| `api` | `apps/api` | Gaps filled, on `main` |
| `root-workspace` | Root `package.json`, `scripts/dev.mjs` | Already set up |

Agents must follow the Definition of Done from `AGENT_BUILD_INSTRUCTIONS.md §6` and the non-negotiables from §7.