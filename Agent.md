# Agent.md

This file defines hard constraints for any AI agent working in this repository.

## Core Rules

1. Do not replace any rendering library or framework used by this project unless the user explicitly asks for it.
2. When a problem is complex, do not use downgrade strategies, fallback implementations, or reduced-scope substitutes to avoid the real issue. Solve the actual problem.

## Mandatory Interpretation

### Rendering And Framework Stability

- Do not switch away from the current rendering stack.
- Do not replace Phaser with Canvas, Pixi, DOM rendering, SVG, or any other renderer.
- Do not replace React, Vite, Tailwind, Socket.IO, or boardgame.io with other frameworks or libraries unless the user explicitly requests that change.
- Do not keep two parallel rendering implementations long-term. If a legacy path exists temporarily during migration, remove it after the intended solution is working.

### No Downgrade Policy

- Do not bypass a hard bug by disabling animations, removing features, hiding UI, or reverting to a simpler renderer just to make the page appear functional.
- Do not avoid difficult integration work by introducing a weaker temporary architecture and leaving it in place.
- Do not treat "good enough for now" as acceptable when the user asked for the real solution.
- If a bug is difficult, continue debugging until the root cause is identified and fixed.

## Required Behavior

- Preserve the current architecture unless the user explicitly asks for architectural change.
- Prefer root-cause fixes over workarounds.
- If a constraint makes progress difficult, explain the blocker clearly and keep working within the existing stack.
- When proposing a change, verify that it does not violate the two core rules above.
- Before making a major technical change, check whether it alters the existing rendering or framework stack. If it does, stop unless the user explicitly approved it.

## Examples Of Forbidden Actions

- Replacing Phaser board rendering with raw canvas because a Phaser issue is hard to debug.
- Replacing Phaser with Pixi because it feels simpler.
- Replacing React rendering with direct DOM manipulation to avoid state bugs.
- Disabling movement animation permanently because tween behavior is broken.
- Hiding a broken subsystem instead of fixing it.

## Examples Of Required Actions

- Debug Phaser scene lifecycle problems inside Phaser.
- Fix rendering timing, sizing, asset loading, scene sync, or tween issues without changing the renderer.
- Keep the existing stack and repair the broken integration.
- Finish the intended implementation instead of shipping a reduced substitute.
