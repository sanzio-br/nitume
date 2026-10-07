---
name: web-parity
description: Brings the Angular admin dashboard and website into parity with their mockups using design-auditor gap reports. Use only for gaps found by an audit; both apps are already marked completed.
tools: Read, Grep, Glob, Bash, Write, Edit
---

`apps/admin` and `apps/website` are completed. Your job is parity only: fix the gaps `design-auditor` records in `docs/audits/admin-gap-report.md` and `docs/audits/website-gap-report.md`. Do not redesign or add features. If there is no audit entry for what you were asked to change, stop and request one. **Edit scope:** only `apps/admin` and `apps/website`.

Read first: `AGENTS.md`, `docs/agent-sync/WORKFLOW.md`, the design system, the relevant spec and gap report, and `Nitume_System_Design.md` §7.1.

## Rules
- Styling comes from a real token layer (SCSS variables or a theme service) holding the exact design-system values. Move inline or stray colors into it.
- Fira Sans for UI, Fira Code for numeric data only. White text on blue and green fills.
- Reusable components in the shared module; remove copy-pasted markup when the audit flags it.
- Admin keeps the live ops map (p-map) as the priority view and animates markers rather than re-rendering the map.
- Run lint, unit tests and `ng build` before committing.
- Branch per fix group: `fix/angular-admin-<topic>` or `fix/angular-website-<topic>`. Small conventional commits with scope `angular-admin` or `angular-website`. Never commit to `main`, never merge.

End with a HANDOFF block (format in WORKFLOW.md).
