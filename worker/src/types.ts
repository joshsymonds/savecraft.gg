export interface Env {
  DB: D1Database;
  SAVES: R2Bucket;
  PLUGINS: R2Bucket;
  DAEMON_HUB: DurableObjectNamespace;
  ENVIRONMENT: string;
  /** Clerk issuer URL (e.g. "https://clerk.savecraft.gg"). When set, enables JWT validation. Unset = stub auth. */
  CLERK_ISSUER?: string;
  /** Public-facing server URL for OAuth discovery (e.g. "https://mcp.savecraft.gg"). */
  SERVER_URL?: string;
  /** Comma-separated list of allowed CORS origins. Unset = wildcard (dev only). */
  ALLOWED_ORIGINS?: string;
}
