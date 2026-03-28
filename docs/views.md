# MCP Apps Views

Interactive UIs rendered inside MCP host iframes (Claude, ChatGPT) alongside tool results, via the MCP Apps extension (SEP-1865). Views replace LLM-interpreted presentation hints with deterministic Svelte component rendering.

## Why Views Exist

Without views, tools return structured JSON and a text hint telling the LLM how to present it ("display as a card gallery..."). This is unreliable — the LLM may ignore the hint, render it inconsistently, or lose formatting across turns. Views render data deterministically in a sandboxed iframe controlled by the MCP host, using the same Svelte components every time.

Tools that don't have views continue to work normally — `structuredContent` is still available to the model for reasoning and text responses. Views are an enhancement, not a replacement.

## Architecture

Two view types exist, matching the two tool categories:

**Game state views** — one self-contained HTML page per tool (`list_games`, `get_save`, etc.). Each page bundles the bridge, a single Svelte component, and the design system CSS. The host preloads the page and pushes `structuredContent` to it when the tool executes.

**Reference views** — one bundled HTML page for `query_reference` containing ALL reference module components. The page includes a component map keyed by module ID. When the tool executes, `structuredContent.module` tells the view which component to mount. This scales without growing tool count — adding a reference module = adding a Svelte component.

## Response Format

Tools with views use `viewResult()` instead of `textResult()`:

```
viewResult(structuredContent, narrative)
→ { structuredContent: { ... }, content: [{ type: "text", text: "..." }] }
```

- **`structuredContent`** — first-class JSON object sent to both the model and the view widget. The model uses it for reasoning; the view renders it as UI.
- **`content`** — concise narrative text for the model's conversational response. Not a presentation hint.

For `query_reference`, `structuredContent` includes a `module` field so the bundled reference view knows which component to mount:

```
viewResult({ module: "card_search", cards: [...], total: 5 }, "Found 5 cards.")
```

Clients without MCP Apps support receive both fields and use the narrative text normally. Graceful degradation is built into the format.

## Extension Negotiation

MCP Apps is an opt-in extension. Both client and server must declare support during initialization:

- **Server** responds with `extensions: { "io.modelcontextprotocol/ui": {} }` in the initialize result
- **Client** sends `extensions: { "io.modelcontextprotocol/ui": { mimeTypes: [...] } }` in the initialize request

If either side omits this, no views render. Tools still return `structuredContent` + `content` regardless.

## Bridge

The bridge is the client-side code that runs inside the iframe. It uses `@modelcontextprotocol/ext-apps`'s `App` class to handle the `ui/initialize` handshake with the host and receive tool results:

```
App.connect() → ui/initialize handshake → app.ontoolresult → mount Svelte component
```

The `App` class manages postMessage transport, JSON-RPC protocol, and host capability negotiation. The bridge source is at `views/src/bridge.ts`.

**Do not use raw postMessage listeners.** The host requires the `ui/initialize` handshake before sending tool results. Skipping it produces a blank iframe.

## Build Pipeline

`just build-views` runs `views/scripts/build.ts`, which:

1. Discovers `.svelte` files (excluding `.stories.svelte`) from `worker/src/mcp/views/` and `plugins/*/reference/views/`
2. Generates temporary entry files that import the bridge + components
3. Compiles each entry via Vite + `@sveltejs/vite-plugin-svelte` (IIFE format, `emitCss: false` for self-contained bundles)
4. Wraps the compiled JS in an HTML page with the design system CSS
5. Writes `worker/src/mcp/views.gen.ts` exporting `VIEWS: Record<string, string>`

Game state views compile individually (one entry per tool). Reference views compile together (one entry with a component map importing all reference view components).

### Output

`worker/src/mcp/views.gen.ts` exports a single `VIEWS` record mapping slugs to self-contained HTML strings. The handler imports this to serve resources and auto-wire tool definitions.

### When to Rebuild

Run `just build-views` after:
- Adding, modifying, or removing a `.svelte` view component
- Changing `views/src/bridge.ts` or `views/src/view.css`

The generated file (`views.gen.ts`) is committed to the repo. CI does not rebuild it — you must rebuild locally before pushing.

## Handler Wiring

The handler auto-discovers views from `views.gen.ts`:

- **`resources/list`** — returns one resource entry per key in `VIEWS`
- **`resources/read`** — returns the HTML for the requested `ui://savecraft/<slug>.html` URI
- **`tools/list`** — adds `_meta.ui.resourceUri` to tool definitions that have a matching view slug

Slug mapping convention:
- Tool `list_games` → slug `list-games` → URI `ui://savecraft/list-games.html`
- Tool `query_reference` → slug `reference` → URI `ui://savecraft/reference.html`

No hardcoded registry. Adding a view and rebuilding is sufficient — the handler discovers it automatically.

## Adding a New View

### Game State View

1. Create `worker/src/mcp/views/<tool-slug>.svelte` — Svelte 5 component with `let { data } = $props()`
2. Create `worker/src/mcp/views/<tool-slug>.stories.svelte` — Storybook story with fixture data
3. Update the tool function in `tools.ts` to return `viewResult(structuredContent, narrative)` instead of `textResult(data, presentation)`
4. Run `just build-views`
5. Run `just test-worker` to verify nothing broke

### Reference View

1. Create `plugins/<game>/reference/views/<module-id>.svelte` — Svelte 5 component
2. Create `plugins/<game>/reference/views/<module-id>.stories.svelte` — Storybook story
3. Ensure the module's `executeNativeModule` result includes the module ID: the handler injects `module` into `structuredContent` automatically for `query_reference`
4. Run `just build-views` — the build auto-discovers the new component and adds it to the bundled reference view
5. Run `just test-worker`

File naming convention: the `.svelte` filename maps to the module ID via kebab-to-snake conversion. `card-search.svelte` → module ID `card_search`.

## Storybook

`just storybook-views` starts the views Storybook on port 6007. It is independent from the web dashboard Storybook (port 6006).

- Stories live as `.stories.svelte` siblings next to their view components
- The Storybook config (`views/.storybook/`) globs across `worker/src/mcp/views/` and `plugins/*/reference/views/`
- Same Svelte components render in both Storybook (props) and production (bridge + postMessage)
- Use Storybook to iterate on view design before deploying

## Design System

Views use CSS custom properties from `views/src/view.css`, mirroring the shared design tokens in `shared/styles/base.css`:

- Colors: `--color-bg`, `--color-panel-bg`, `--color-border`, `--color-gold`, `--color-green`, `--color-red`, `--color-text`, `--color-text-dim`, `--color-text-muted`
- Fonts: `--font-pixel` (Press Start 2P), `--font-heading` (Chakra Petch), `--font-body` (Rajdhani)
- Animations: `fade-in`, `fade-slide-in`

Dark theme. Scoped `<style>` blocks within components for component-specific styles.

## Constraints

**CSP blocks external fonts.** The MCP host's iframe CSP is `style-src 'self' 'unsafe-inline' https://assets.claude.ai`. Google Fonts stylesheets are blocked. Font loading is an open problem — do not add `<link>` tags for external fonts. Use the CSS custom properties and accept system font fallbacks until a solution is validated.

**CSP blocks blob: URLs in scripts.** `script-src` does not include `blob:`. Inline scripts (`'unsafe-inline'`) are allowed.

**Claude caches resources at connection time.** The host fetches all resources when the MCP server is first connected. Changing view HTML requires disconnecting and reconnecting the MCP server in Claude. This is expected — resources are static templates, data flows via `structuredContent`.

**Protocol version.** `2025-06-18`.

## Key Paths

```
views/                              # Build infra + Storybook
  .storybook/                       # Storybook config (port 6007)
  scripts/build.ts                  # Build script → views.gen.ts
  src/bridge.ts                     # App class bridge (ontoolresult)
  src/view.css                      # Design system tokens
  package.json                      # Svelte, Vite, ext-apps, Storybook deps
  vite.config.ts                    # Vite config (used by Storybook)

worker/src/mcp/
  handler.ts                        # resources/list, resources/read, _meta.ui wiring
  tools.ts                          # viewResult(), textResult()
  views.gen.ts                      # GENERATED — VIEWS record
  views/                            # Game state view components + stories

plugins/<game>/reference/views/     # Reference view components + stories
```
