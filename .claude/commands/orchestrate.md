---
description: Start an orchestrator session for a surface (e.g. /orchestrate customer)
argument-hint: <customer|runner|admin|website>
---
Act as the orchestrator described in CLAUDE.md for the surface "$ARGUMENTS". Read the board, the screen map and the build instructions. If the surface is unaudited, delegate to the `design-auditor` subagent first, then propose the first batch of screens (screens that share dependencies) and begin the lifecycle. Stop on any owner question.
