# MCP Apps Views

Interactive UIs rendered inside MCP host iframes (Claude, ChatGPT) alongside tool results, via the MCP Apps extension (SEP-1865). Views replace LLM-interpreted presentation hints with deterministic Svelte component rendering.

SEP-1865 reached **Final status** on January 28, 2026 — the first official MCP extension. Production support exists in Claude (claude.ai + Desktop), ChatGPT, VS Code Copilot, and Goose. The specification lives in `github.com/modelcontextprotocol/ext-apps` with a stable `2026-01-26` release and a `draft` development branch.

For design guidance — when to build a view, interaction patterns, and visual principles — see `docs/view-design.md`.

## Why Views Exist

Without views, tools return structured JSON and a text hint telling the LLM how to present it ("display as a card gallery..."). This is unreliable — the LLM may ignore the hint, render it inconsistently, or lose formatting across turns. Views render data deterministically in a sandboxed iframe controlled by the MCP host, using the same Svelte components every time.

Tools that don't have views continue to work normally — `structuredContent` is still available to the model for reasoning and text responses. Views are an enhancement, not a replacement.

## Architecture

Two view types exist, matching the two tool categories:

**Game state views** — one self-contained HTML page per tool (`list_games`, `get_save`, etc.). Each page bundles the bridge, a single Svelte component, and the design system CSS. The host preloads the page and pushes `structuredContent` to it when the tool executes.

**Reference views** — one bundled HTML page for `query_reference` containing ALL reference module components. The page includes a component map keyed by module ID. When the tool executes, `structuredContent.module` tells the view which component to mount. This scales without growing tool count — adding a reference module = adding a Svelte component.

### Sandbox Model

MCP hosts render views inside a **double-iframe sandbox**:

1. An **outer sandbox iframe** with a unique origin (no `allow-same-origin`) — prevents DOM access to the host page
2. An **inner view iframe** that renders the actual HTML content

Communication between the view and host uses **JSON-RPC 2.0 over `postMessage`**, not raw postMessage payloads. The protocol defines standard MCP messages (reused: `tools/call`, `resources/read`, `ping`) and UI-specific messages (`ui/initialize`, `ui/notifications/tool-result`, `ui/notifications/tool-input`, `ui/message`, `ui/update-model-context`, `ui/open-link`).

Claude renders views on a dedicated sandbox domain (`{sha256-hash}.claudemcpcontent.com`). ChatGPT uses an equivalent isolation mechanism via its Apps SDK renderer.

## Response Format

Tools with views use `viewResult()` instead of `textResult()`:

```
viewResult(structuredContent, narrative)
→ { structuredContent: { ... }, content: [{ type: "text", text: "..." }] }
```

- **`structuredContent`** — first-class JSON object sent to both the model and the view widget. The model uses it for reasoning; the view renders it as UI. When an `outputSchema` is declared on the tool, `structuredContent` **MUST** conform to it, and clients **SHOULD** validate against the schema.
- **`content`** — concise narrative text for the model's conversational response. Not a presentation hint. Per the spec: "a tool that returns structured content SHOULD also return the serialized JSON in a TextContent block" for backward compatibility.

For `query_reference`, `structuredContent` includes a `module` field so the bundled reference view knows which component to mount:

```
viewResult({ module: "card_search", cards: [...], total: 5 }, "Found 5 cards.")
```

Clients without MCP Apps support receive both fields and use the narrative text normally. Graceful degradation is built into the format.

## Extension Negotiation

MCP Apps is an opt-in extension (depends on the extensions framework from protocol version `2025-11-25`). Both client and server must declare support during initialization within the `extensions` field nested under `capabilities`:

- **Client** sends `extensions: { "io.modelcontextprotocol/ui": { mimeTypes: ["text/html;profile=mcp-app"] } }` in the initialize request
- **Server** responds with `extensions: { "io.modelcontextprotocol/ui": {} }` in the initialize result

Extension identifiers follow the format `{vendor-prefix}/{extension-name}`, with `io.modelcontextprotocol` reserved for official extensions. Extensions are strictly additive: a client that doesn't recognize an extension skips it, and the baseline protocol continues working.

If either side omits this, no views render. Tools still return `structuredContent` + `content` regardless.

## Bridge

The bridge is the client-side code that runs inside the iframe. It uses `@modelcontextprotocol/ext-apps`'s `App` class to handle the `ui/initialize` handshake with the host and receive tool results:

```
App.connect() → ui/initialize handshake → app.ontoolresult → mount Svelte component
```

The `App` class manages JSON-RPC 2.0 transport over postMessage, protocol negotiation, and host capability discovery. The bridge source is at `views/src/bridge.ts`.

**Set callbacks before calling `connect()`.** The `ontoolresult` and `ontoolinput` callbacks must be registered before `await app.connect()` to avoid missing the initial data push.

**Do not use raw postMessage listeners.** The host requires the `ui/initialize` handshake before sending tool results. The handshake protocol version string is `2025-11-21` (the date the SEP was proposed), distinct from the base MCP protocol version. Skipping the handshake produces a blank iframe.

### Bridge Library

The npm package `@modelcontextprotocol/ext-apps` exposes four sub-path imports:

| Import | Purpose |
|--------|---------|
| `@modelcontextprotocol/ext-apps` | `App` class for building views |
| `@modelcontextprotocol/ext-apps/react` | React hooks (`useApp`, `useHostStyles`) — not used by Savecraft (Svelte) |
| `@modelcontextprotocol/ext-apps/app-bridge` | `AppBridge` class for host-side embedding — not used by Savecraft |
| `@modelcontextprotocol/ext-apps/server` | `registerAppTool`, `registerAppResource`, `RESOURCE_MIME_TYPE` — server helpers |

The `App` class provides methods beyond `ontoolresult`:

- `callServerTool(name, args)` — invoke an MCP tool from the view back to the server
- `sendMessage(message)` — send arbitrary messages to the host
- `updateModelContext(context)` — inject context into the model's next turn
- `openLink(url)` — request the host open a URL (subject to host policy)
- `downloadFile(data, filename)` — trigger a file download
- `requestDisplayMode(mode)` — request expanded/collapsed display

Savecraft views currently only use `ontoolresult` (receive data) and `ontoolinput` (receive pre-execution data for preloaded views). The other methods are available if views need interactivity beyond passive rendering.

## Build Pipeline

`just build-views` runs `views/scripts/build.ts`, which:

1. Discovers `.svelte` files (excluding `.stories.svelte`) from `worker/src/mcp/views/` and `plugins/*/reference/views/`
2. Generates temporary entry files that import the bridge + components
3. Compiles each entry via Vite + `@sveltejs/vite-plugin-svelte` (IIFE format, `emitCss: false` for self-contained bundles)
4. Wraps the compiled JS in an HTML page with the design system CSS
5. Writes `worker/src/mcp/views.gen.ts` exporting `VIEWS: Record<string, string>`

Game state views compile individually (one entry per tool). Reference views compile together (one entry with a component map importing all reference view components).

HTML must be bundled as a single file (using `vite-plugin-singlefile` or equivalent) — the host injects the full HTML into the sandbox iframe, not a URL.

### Output

`worker/src/mcp/views.gen.ts` exports a single `VIEWS` record mapping slugs to self-contained HTML strings. The handler imports this to serve resources and auto-wire tool definitions.

### When to Rebuild

Run `just build-views` after:
- Adding, modifying, or removing a `.svelte` view component
- Changing `views/src/bridge.ts` or `views/src/view.css`

The generated file (`views.gen.ts`) is committed to the repo. CI does not rebuild it — you must rebuild locally before pushing.

### Attribution Injection

The build pipeline reads `[attribution].sources` from each plugin's `plugin.toml` and resolves them against shared presets in `views/src/attributions.ts`. The resolved attribution array is embedded as `window.__ATTRIBUTION__` in each compiled view's HTML.

- **Game state views** (like `list-games`) aggregate attribution from all plugins
- **Reference views** get attribution from their parent plugin only
- **Build fails** if any plugin lacks `[attribution]` or references an unknown source key

The `Attribution.svelte` component reads `window.__ATTRIBUTION__` and renders a collapsed legal footer at the bottom of every view. Collapsed state shows source names; clicking expands to full disclaimer text with policy links.

## Handler Wiring

The handler auto-discovers views from `views.gen.ts`:

- **`resources/list`** — returns one resource entry per key in `VIEWS`
- **`resources/read`** — returns the HTML for the requested `ui://savecraft/<slug>.html` URI
- **`tools/list`** — adds `_meta.ui.resourceUri` to tool definitions that have a matching view slug

The `_meta.ui` object also supports additional fields:

| Field | Purpose |
|-------|---------|
| `resourceUri` | URI of the view resource (required for view association) |
| `csp` | Content Security Policy domain allowlists (see Constraints below) |
| `visibility` | Array of `"model"` and/or `"app"` — controls who sees the result |
| `permissions` | Requested permissions for the iframe sandbox |

For backward compatibility with older ChatGPT clients, the handler should also populate the legacy flat key `_meta["ui/resourceUri"]` alongside the nested form.

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

### Content Security Policy

MCP Apps iframes run in a **fully isolated sandbox** with all external resources and connections blocked by default. This is NOT the host page's CSP — the iframe has its own security context on a dedicated sandbox domain.

**Default posture:** Everything blocked. The spec explicitly rejects CSP keywords like `'unsafe-inline'`, `'unsafe-eval'`, and `'none'` in MCP App iframes. Only explicit origin patterns are allowed.

**Opening access:** Declare allowed domains in `_meta.ui.csp` on the tool definition:

```json
{
  "_meta": {
    "ui": {
      "resourceUri": "ui://savecraft/list-games.html",
      "csp": {
        "connectDomains": ["https://api.savecraft.gg"],
        "resourceDomains": ["https://fonts.googleapis.com", "https://fonts.gstatic.com"],
        "frameDomains": [],
        "baseUriDomains": []
      }
    }
  }
}
```

| CSP field | Maps to | Purpose |
|-----------|---------|---------|
| `connectDomains` | `connect-src` | XHR, fetch, WebSocket |
| `resourceDomains` | `font-src`, `img-src`, `script-src`, `style-src`, `media-src` | Static assets |
| `frameDomains` | `frame-src` | Nested iframes |
| `baseUriDomains` | `base-uri` | Base URL resolution |

**Practical implications for Savecraft views:**

- **External fonts are blocked** unless the font CDN domains are declared in `resourceDomains`. Google Fonts requires both `fonts.googleapis.com` (stylesheets) and `fonts.gstatic.com` (font files). For v1, use CSS custom properties and accept system font fallbacks — adding CSP domains for fonts is untested and may vary by host.
- **No external API calls from views** unless declared in `connectDomains`. Savecraft views are passive renderers (data flows via `structuredContent`), so this is not an issue for v1.
- **`blob:` URLs are blocked** in scripts. Only declared origin patterns are allowed as source values.

**Claude egress proxy:** Beyond CSP, Claude runs a server-side egress proxy (`sandbox-egress-production`) that returns `403 host_not_allowed` for domains not on an allowlist. This is an additional enforcement layer — even if CSP allows a domain, the proxy must also permit it.

### Resource Caching

**Claude Desktop and claude.ai** cache MCP tool and resource metadata in memory when the MCP server is first connected. Changing view HTML requires disconnecting and reconnecting the MCP server. This is expected — resources are static templates, data flows via `structuredContent`.

**Claude Code** supports `list_changed` notifications for dynamic updates without reconnection.

**ChatGPT** caches resources similarly — changes require re-establishing the MCP connection.

### Cross-Platform Compatibility

**ChatGPT** has production-ready widget rendering via the OpenAI Apps SDK (launched September 2025, predating MCP Apps). ChatGPT supports both the standard MCP Apps keys (`_meta.ui.resourceUri`) and proprietary `openai/*` keys simultaneously:

| Standard key | OpenAI alias | Purpose |
|-------------|--------------|---------|
| `_meta.ui.resourceUri` | `_meta["openai/outputTemplate"]` | Link tool to view |
| `_meta.ui.csp` | `_meta["openai/widgetCSP"]` | CSP domain allowlists |
| `_meta.ui.visibility` | `_meta["openai/visibility"]` | Control who sees the result |

OpenAI's documentation recommends the standard MCP Apps keys. The `openai/*` namespace includes additional proprietary extensions (file upload/download, host-backed navigation, commerce integration) that have no MCP Apps equivalent.

**ChatGPT limitation:** Cannot connect to localhost MCP servers (remote only, requires ngrok for local development). Not an issue for Savecraft — the MCP server is always remote on `mcp.savecraft.gg`.

**Gemini:** No documented MCP Apps support as of March 2026. Gemini CLI supports MCP tools but does not render views.

**VS Code Copilot:** Supports MCP Apps views in the chat panel. Limited to code-centric workflows.

**Protocol version.** `2025-11-25` — the revision that introduced the extensions framework MCP Apps depends on.

## Key Paths

```
views/                              # Build infra + Storybook
  .storybook/                       # Storybook config (port 6007)
  scripts/build.ts                  # Build script → views.gen.ts
  src/bridge.ts                     # App class bridge (ontoolresult)
  src/view.css                      # Design system tokens
  src/attributions.ts               # Attribution presets registry
  src/Attribution.svelte            # Collapsed legal footer component
  package.json                      # Svelte, Vite, ext-apps, Storybook deps
  vite.config.ts                    # Vite config (used by Storybook)

worker/src/mcp/
  handler.ts                        # resources/list, resources/read, _meta.ui wiring
  tools.ts                          # viewResult(), textResult()
  views.gen.ts                      # GENERATED — VIEWS record
  views/                            # Game state view components + stories

plugins/<game>/reference/views/     # Reference view components + stories
```
