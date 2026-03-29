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
- Slug maps to tool name: `search-saves.svelte` → tool `search_saves`

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

`viewResult()` returns `{ structuredContent, content }`. The view renders `structuredContent` as UI. `content` carries BOTH the narrative AND the same data as JSON text — this is critical because Claude hides `structuredContent` from the model when a widget renders. Without data in `content`, the model is blind to what the view shows and cannot reason about it.

## Bridge — Do Not Reimplement

The bridge at `views/src/bridge.ts` uses `@modelcontextprotocol/ext-apps`'s `App` class. It handles the `ui/initialize` handshake that MCP hosts require before sending data.

**Never use raw `window.addEventListener("message", ...)`** — the host will not send tool results without the initialization handshake. The App class handles this.

## View Philosophy

**Views render the AI's synthesis. The conversation drives interaction.** See `docs/view-design.md`.

Views are passive renderers of data the LLM assembled. If the player wants to go deeper, they type another message. The view presents; the LLM decides what to show next.

### Used Capabilities

- **`app.updateModelContext()`** — The primary view interaction. When the player clicks or focuses on something, silently tell the model what they're looking at. Makes the next conversational turn contextually aware.
- **`app.requestDisplayMode("fullscreen")`** — User-initiated escalation for complex data. Also `"pip"` and `"inline"`.
- **`app.openLink()`** — External links to authoritative sources ("View on Scryfall").
- **`ontoolinputpartial`** — Streaming preview while the LLM generates large arguments. Rendering optimization, not interactivity.
- **`onhostcontextchanged`** — Theme, locale, container dimension updates from host.

### Not Used (intentionally)

- **`app.callServerTool()`** — Bypasses the conversation. Views that call tools build web apps in iframes, competing with established gaming tools. If the player wants more data, they ask the AI.
- **`app.sendMessage()`** — Hijacks the conversation. The player types when they want to talk.
- **`app.downloadFile()`** — If data needs exporting, the model provides it in text or the player uses the website.
- **`localStorage`** — Blocked in sandboxed iframes (unique origin). Views are stateless — everything arrives in `structuredContent`.

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

## Attribution

Every view includes a collapsed legal footer rendered by `views/src/Attribution.svelte`. This is **automatic** — view authors don't need to do anything.

**How it works:** The build pipeline reads `[attribution].sources` from each plugin's `plugin.toml`, resolves source keys against shared presets in `views/src/attributions.ts`, and embeds the result as `window.__ATTRIBUTION__` in the compiled HTML. The Attribution component reads this global and renders a collapsed `▸ Legal · Source1 · Source2` footer that expands to show full disclaimers on click.

- **Game state views** aggregate attribution from ALL plugins (they span multiple games)
- **Reference views** get attribution from their parent plugin only
- **Build fails** if any plugin is missing `[attribution]` or uses an unknown source key

To add a new attribution source: add it to `SOURCES` in `views/src/attributions.ts`, then reference it from plugin.toml.

## Game Watermarks

Every reference view should display its game's icon as a subtle centered watermark. This is a first-class part of the Savecraft visual language — it gives each game identity without competing with content.

**How it works:**
- Panel accepts a `watermark?: string` prop — renders a centered, semi-transparent (10% opacity) `<img>` that shows through gaps between content elements
- The handler injects `icon_url` into `structuredContent` via `resolveIconUrl()` (uses per-isolate manifest cache)
- Views pass `data.icon_url` to their outer `<Panel watermark={data.icon_url}>`
- Stories include `icon_url` in fixture data: `const iconUrl = "/plugins/<game>/icon.png"`

**Rules:**
- Watermark is Panel's responsibility — never add per-component watermark CSS
- Every reference view's outer Panel should have `watermark={data.icon_url}`
- Every view's data interface should include `icon_url?: string`
- Every Storybook story should include `icon_url: iconUrl` in fixture data so the watermark is visible during development
- `resolveIconUrl(plugins, serverUrl, gameId)` is the single source of truth for icon URL construction — never duplicate the manifest lookup

**For MtgCard specifically:** The `iconUrl` prop passes through to `<Panel watermark={iconUrl}>` internally. Card-search passes `data.icon_url` to each MtgCard's `iconUrl` prop.

## Visual Hierarchy

Views use a two-level hierarchy:

- **Section** — top-level titled container with pixel-font header bar. One per logical grouping.
- **Nested Panel + `.sub-label`** — sub-groupings within a Section. Use `<Panel nested>` with a `<span class="sub-label">` heading (defined in `view.css` as a global utility class).

**Anti-patterns:**
- Never nest Section inside Section — title directly below title looks bad and confuses hierarchy
- Never use Section's `count` prop — the number badge in the upper-right is confusing and visually noisy. If a count matters, show it in the content area.
- Never add callout/alert components — views render pre-enrichment data from game modules, not AI synthesis. The LLM provides judgment in the conversation text, not the view.

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
views/src/attributions.ts              # Attribution presets registry
views/src/Attribution.svelte           # Collapsed legal footer component
views/scripts/build.ts                 # Build → views.gen.ts
views/.storybook/                      # Storybook config (port 6007)
worker/src/mcp/views.gen.ts            # GENERATED — VIEWS record (commit this)
worker/src/mcp/handler.ts              # resources/list, resources/read, _meta.ui
worker/src/mcp/tools.ts                # viewResult(), textResult()
worker/src/mcp/views/                  # Game state views + stories
plugins/*/reference/views/             # Reference views + stories
```
