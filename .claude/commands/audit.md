---
description: Audit a surface against its mockup (e.g. /audit customer)
argument-hint: <customer|runner|admin|website>
---
Use the `design-auditor` subagent to run Mode A (spec) then Mode B (audit) for the surface "$ARGUMENTS". Cover every view listed for it in docs/agent-sync/SCREEN_MAP.md. It must create specs for screens that lack them, update SCREEN_MAP.md and write the gap report. Then record its HANDOFF blocks on docs/agent-sync/BOARD.md and summarize the findings.
