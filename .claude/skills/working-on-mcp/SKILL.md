---
name: working-on-mcp
description: MCP server and OAuth development conventions for Savecraft. Use when working on MCP tools, OAuth flows, auth middleware, or the MCP handler in worker/src/mcp/, worker/src/oauth.ts, or worker/src/auth.ts. Triggers on MCP tool implementation, OAuth provider, token validation, Clerk integration, or protected resource metadata.
---

# Working on MCP & OAuth

Read `docs/mcp.md` for tool contracts, OAuth flow, notes, and search architecture.
Read `docs/mcp-design.md` for cross-platform MCP tool design best practices.

## Verification

```bash
just test-worker   # MCP tests are part of the Worker test suite
```

## Architecture Rules

**No SDK.** The MCP server is hand-rolled JSON-RPC 2.0 in `src/mcp/handler.ts`. The official `@modelcontextprotocol/sdk` depends on ajv/express/hono (CJS, incompatible with workerd). The Cloudflare `agents` SDK's `createMcpHandler` ignores the `env` parameter so tools can't access D1/R2 bindings.

**Tool functions are pure.** Every tool in `src/mcp/tools.ts` takes `(db, snapshots, userUuid)` and returns a `ToolResult` or `ViewToolResult`. No side effects, no request objects, testable without the MCP protocol layer.

**Two response formats.** `textResult(data, presentation?)` for tools without views (legacy, being migrated). `viewResult(structuredContent, narrative)` for tools with MCP Apps views — returns `{ structuredContent, content }` where the view widget renders `structuredContent` and the model uses `content` for its response. See `docs/views.md` and the `working-on-views` skill.

**MCP Apps extension.** Server declares `extensions: { "io.modelcontextprotocol/ui": {} }` in the initialize response. Handler auto-wires `_meta.ui.resourceUri` on tool definitions from `views.gen.ts`.

**Protocol version:** `2025-06-18`. Transport: Streamable HTTP (POST + JSON responses, not SSE).

## OAuth Architecture

The Worker is itself the **OAuth 2.1 Authorization Server** via `@cloudflare/workers-oauth-provider`. Clerk is the upstream IdP only — users authenticate via Clerk, but the Worker issues its own opaque access tokens stored in `OAUTH_KV`.

**Key properties:**
- AI clients (Claude, ChatGPT, Gemini) never see Clerk. The entire OAuth dance happens against our origin.
- Token validation is a KV lookup — no JWT signature check, no network call.
- `ctx.props.userUuid` flows from Clerk's `sub` claim through to R2 prefix scoping.
- Zero skip-Clerk paths in production. Authorize returns 503 if Clerk secrets are missing.
- `OAUTH_ENDPOINTS` constant in `src/oauth.ts` is shared with test helpers.

**Protected resource metadata gotcha:** RFC 8707 uses exact string comparison. MCP clients send `resource=https://host/` with trailing slash. The metadata `resource` URL MUST have the trailing slash or token validation silently fails. Our `index.ts` overrides the library's response to include the trailing slash.

## Auth Modes

`src/auth.ts` handles two separate auth concerns:

1. **MCP OAuth** — handled by the `OAuthProvider` wrapper in `index.ts`. Token → KV lookup → `ctx.props.userUuid`.
2. **Session/daemon auth** — `src/auth.ts`. Stub mode: bearer token IS user UUID (when `CLERK_ISSUER` not set). Clerk mode: JWT validation via JWKS.

These are separate concerns. Don't conflate them.

## Cloudflare Zone Gotcha

`ai_bots_protection` must be `disabled` on the Cloudflare zone. Claude.ai's MCP client makes requests from Anthropic's IPs (`160.79.104-106.x`), and "Block AI Scrapers and Crawlers" silently blocks them at the edge. The OAuth flow completes but the authenticated MCP request never reaches the Worker.

## Key Paths

```
worker/src/mcp/handler.ts    # JSON-RPC 2.0 routing
worker/src/mcp/tools.ts      # Pure tool functions
worker/src/oauth.ts           # OAUTH_ENDPOINTS, Clerk redirect logic
worker/src/auth.ts            # Session/daemon auth (stub + Clerk modes)
worker/src/index.ts           # OAuthProvider wrapper, protected resource metadata override
```
