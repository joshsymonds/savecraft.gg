import type { OAuthHelpers } from "@cloudflare/workers-oauth-provider";

export interface Env {
  DB: D1Database;
  SAVES: R2Bucket;
  PLUGINS: R2Bucket;
  DAEMON_HUB: DurableObjectNamespace;
  /** Workers for Platforms dispatch namespace for reference plugin Workers. */
  REFERENCE_PLUGINS: DispatchNamespace;
  /** KV namespace for OAuth token/grant/client storage (used by workers-oauth-provider). */
  OAUTH_KV: KVNamespace;
  /** OAuth helpers injected by the library at runtime. */
  OAUTH_PROVIDER: OAuthHelpers;
  ENVIRONMENT: string;
  /** Clerk issuer URL (e.g. "https://intent-earwig-38.clerk.accounts.dev"). When set, enables Clerk JWT session auth and Clerk as upstream IdP for MCP OAuth. */
  CLERK_ISSUER?: string;
  /** Clerk OAuth app client ID for upstream IdP delegation. */
  CLERK_OAUTH_CLIENT_ID?: string;
  /** Clerk OAuth app client secret for upstream IdP delegation. */
  CLERK_OAUTH_CLIENT_SECRET?: string;
  /** Public-facing server URL for OAuth discovery (e.g. "https://api.savecraft.gg"). */
  SERVER_URL?: string;
  /** Hostname that serves MCP (e.g. "mcp.savecraft.gg"). When set, root path "/" on this host routes to the MCP handler. */
  MCP_HOSTNAME?: string;
  /** Install worker URL for daemon distribution (e.g. "https://install.savecraft.gg"). */
  INSTALL_URL?: string;
  /** Comma-separated list of allowed CORS origins. Unset = wildcard (dev only). */
  ALLOWED_ORIGINS?: string;
  /** Application version injected at deploy time via --var VERSION:{version}. */
  VERSION?: string;
  /** Stale source threshold in ms. Sources with no message for this long are evicted. Default 90000 (90s). */
  STALE_THRESHOLD_MS?: number;
  /** DO alarm interval in ms for checking stale connections. Default 30000 (30s). */
  ALARM_INTERVAL_MS?: number;
}
