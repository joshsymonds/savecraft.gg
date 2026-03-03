---
name: working-on-web
description: SvelteKit frontend development conventions for Savecraft. Use when working on files in web/, including Svelte components, pages, stores, Storybook stories, or frontend tests. Triggers on SvelteKit code, Svelte components, Storybook, web UI, dashboard, onboarding, or frontend screenshots.
---

# Working on the Web UI

Read `docs/web.md` for the dashboard architecture, onboarding state machine, and component specs.

## Verification

```bash
cd web && npm run check          # TypeScript + Svelte checks
cd web && npm run lint            # ESLint
cd web && npm run test            # Component tests
```

## Conventions

- SvelteKit conventions throughout. TypeScript strict mode.
- Component tests use mock WebSocket and mock API responses.
- Reactive stores (`$devices`, MCP status) drive the UI — no explicit state machines.

## Storybook

Storybook runs on port 6006. Start it before taking screenshots.

```bash
just storybook                    # Start Storybook (port 6006)
```

**Story IDs** follow the pattern `category-component--story-name` (lowercase, hyphens).

## Screenshots

Custom Playwright-based tool at `web/scripts/screenshot.ts`. Output goes to `web/screenshots/<story-id>.png`.

```bash
cd web && npm run screenshot components-gamecard--watching     # Single story
cd web && npm run screenshot:all                                # All stories
```

**NixOS requirement:** Uses system chromium via `findChromium()`. Do NOT use Playwright's bundled chromium — it won't work on NixOS due to dynamic linking. The `findChromium()` function auto-detects the system binary.

## Key Paths

```
web/src/routes/          # SvelteKit pages
web/src/lib/             # Shared components, stores, utilities
web/scripts/screenshot.ts # Playwright screenshot tool
web/screenshots/         # Screenshot output directory
web/.storybook/          # Storybook config
```
