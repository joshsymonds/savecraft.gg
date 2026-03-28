---
name: working-on-views
description: MCP Apps view development for Savecraft. Use when creating or modifying interactive views rendered in MCP host iframes (Claude, ChatGPT). Triggers on Svelte view components, Storybook stories, the view build pipeline, bridge code, or MCP Apps resource handling. Use when working on files in views/, worker/src/mcp/views/, plugins/*/reference/views/, or when adding viewResult() responses to tools.
---

# Working on Views

Read `docs/views.md` for architecture, response format, and constraints.
Read `docs/view-design.md` for when to build a view, interaction patterns, and visual principles.

## Verification

```bash
just build-views    # Rebuild views.gen.ts (required after any .svelte change)
just test-worker    # Handler + tool tests
just storybook-views  # Visual verification on port 6007
```

## Two View Types

**Game state views** — one self-contained HTML per tool. Component + bridge bundled together.
- Location: `worker/src/mcp/views/<slug>.svelte`
- Slug maps to tool name: `list-games.svelte` → tool `list_games`

**Reference views** — one bundled HTML for `query_reference` containing ALL reference module components. Routes on `structuredContent.module`.
- Location: `plugins/<game>/reference/views/<module-id>.svelte`
- Filename maps to module ID: `card-search.svelte` → module `card_search`
- Auto-discovered by build — adding a `.svelte` file and rebuilding is sufficient.

## Adding a New View

1. Create `<name>.svelte` — Svelte 5 component: `let { data } = $props()`
2. Create `<name>.stories.svelte` — Storybook story with fixture data
3. For game state views: update tool in `tools.ts` to return `viewResult(structuredContent, narrative)` instead of `textResult()`
4. Run `just build-views` then `just test-worker`
5. Commit `views.gen.ts` with other changes — CI does not rebuild it

## Response Format

```typescript
// Old (presentation hints — being replaced):
textResult(data, "Display as card gallery...");

// New (structured content for view rendering):
viewResult({ cards, total: cards.length }, "Found 5 cards.");
// For query_reference, handler injects module automatically:
// → { module: "card_search", cards: [...], total: 5 }
```

`viewResult()` returns `{ structuredContent, content }`. Both the model and the view receive `structuredContent`. The view renders it as UI; the model uses it for reasoning.

## Bridge — Do Not Reimplement

The bridge at `views/src/bridge.ts` uses `@modelcontextprotocol/ext-apps`'s `App` class. It handles the `ui/initialize` handshake that MCP hosts require before sending data.

**Never use raw `window.addEventListener("message", ...)`** — the host will not send tool results without the initialization handshake. The App class handles this.

## MCP Apps Capabilities

Views are NOT static displays. The App class enables rich interaction:

- **`app.callServerTool()`** — Call Savecraft MCP tools from the view. Use for drill-down (click a save → fetch sections), pagination, filtering without LLM round-trips.
- **`app.updateModelContext()`** — Tell the model what the user did in the view ("User selected Atmus's equipment tab"). Deferred to next user message.
- **`app.sendMessage()`** — Send a message to the chat from the view.
- **`app.requestDisplayMode("fullscreen")`** — Switch to fullscreen for complex visualizations. Also `"pip"` and `"inline"`.
- **`app.openLink()`** / **`app.downloadFile()`** — Browser interactions.
- **`ontoolinputpartial`** — Streaming partial tool arguments for preview rendering while the LLM is still generating.
- **`onhostcontextchanged`** — Theme, locale, container dimension updates from host.
- **`localStorage`** — Works in the iframe. Use for state persistence across refreshes.

## Styling

**Savecraft design tokens** in `views/src/view.css`: `--color-bg`, `--color-panel-bg`, `--color-border`, `--color-gold`, `--color-text`, `--color-text-dim`, `--color-text-muted`, `--font-pixel`, `--font-heading`, `--font-body`.

**Host theme integration** (optional, for native look):
```typescript
import { applyDocumentTheme, applyHostStyleVariables, applyHostFonts } from "@modelcontextprotocol/ext-apps";

app.onhostcontextchanged = (ctx) => {
  if (ctx.theme) applyDocumentTheme(ctx.theme);
  if (ctx.styles?.variables) applyHostStyleVariables(ctx.styles.variables);
  if (ctx.styles?.css?.fonts) applyHostFonts(ctx.styles.css.fonts);
};
```

Host provides 50+ CSS variables: `--color-background-*`, `--color-text-*`, `--font-sans`, `--font-mono`, `--border-radius-*`, `--shadow-*`.

## CSP Constraints

Default iframe CSP blocks external resources. To use external fonts, images, or APIs:

```typescript
// In handler.ts, add to resource or tool _meta.ui:
_meta: {
  ui: {
    resourceUri: "ui://savecraft/reference.html",
    csp: {
      resourceDomains: ["https://fonts.googleapis.com", "https://fonts.gstatic.com"],  // fonts, images, styles
      connectDomains: ["https://api.example.com"],  // fetch/XHR/WebSocket
    }
  }
}
```

**Key CSP facts:**
- `script-src 'self' 'unsafe-inline'` — inline scripts OK, `blob:` URLs blocked
- `style-src 'self' 'unsafe-inline'` — inline styles OK, external stylesheets blocked unless declared in `resourceDomains`
- `connect-src 'none'` — no network unless declared in `connectDomains`
- `font-src 'self'` — no external fonts unless declared in `resourceDomains`

## Build Pipeline

`just build-views` runs `views/scripts/build.ts`:
1. Discovers `.svelte` files (excluding `.stories.svelte`) from `worker/src/mcp/views/` and `plugins/*/reference/views/`
2. Game state views → one IIFE entry per tool (bridge + component)
3. Reference views → one IIFE entry with component map importing all reference views
4. Wraps each in HTML with design tokens CSS
5. Outputs `worker/src/mcp/views.gen.ts` — committed, not rebuilt by CI

The handler imports `VIEWS` from `views.gen.ts` and auto-wires `resources/list`, `resources/read`, and `_meta.ui.resourceUri` on `tools/list`.

## Svelte 5 Component Pattern

```svelte
<script lang="ts">
  // Props from structuredContent
  let { data }: { data: { cards: Card[]; total: number } } = $props();
</script>

<div class="gallery">
  {#each data.cards as card}
    <div class="card">{card.name}</div>
  {/each}
</div>

<style>
  .gallery { display: grid; gap: 10px; padding: 16px; }
  .card {
    background: var(--color-panel-bg);
    border: 1px solid var(--color-border);
    border-radius: 8px;
    padding: 12px;
    font-family: var(--font-heading);
    color: var(--color-text);
  }
</style>
```

## Storybook Story Pattern

```svelte
<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";
  import CardSearch from "./card-search.svelte";
  const { Story } = defineMeta({ title: "Reference/CardSearch", tags: ["autodocs"] });
</script>

<Story name="MultipleCards">
  <CardSearch data={{ cards: [{ name: "Lightning Bolt", ... }], total: 1 }} />
</Story>
```

## Gotchas

- **Claude caches resources at MCP connection time.** View changes require disconnecting and reconnecting the MCP server in the host.
- **`views.gen.ts` must be committed.** CI does not run `just build-views`. Forgetting to rebuild and commit after `.svelte` changes means staging/production serves stale views.
- **Extension negotiation required.** Server declares `extensions: { "io.modelcontextprotocol/ui": {} }` in initialize response. Without this, hosts don't render views.
- **Protocol version:** `2025-06-18`.

## Key Paths

```
views/src/bridge.ts                    # App class bridge (do not reimplement)
views/src/view.css                     # Design system tokens
views/scripts/build.ts                 # Build → views.gen.ts
views/.storybook/                      # Storybook config (port 6007)
worker/src/mcp/views.gen.ts            # GENERATED — VIEWS record (commit this)
worker/src/mcp/handler.ts              # resources/list, resources/read, _meta.ui
worker/src/mcp/tools.ts                # viewResult(), textResult()
worker/src/mcp/views/                  # Game state views + stories
plugins/*/reference/views/             # Reference views + stories
```
