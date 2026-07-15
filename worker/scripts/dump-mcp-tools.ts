// Dumps the live MCP tool schemas (name, description, inputSchema) as JSON
// to stdout by calling the worker's own tool builder directly — no auth, no
// HTTP request, no frozen snapshot file. Runs in plain Node via tsx, so
// editing a tool definition in src/mcp/handler.ts and rerunning reflects
// the change immediately.
//
// buildToolsWithUi(env) only reads env.ENVIRONMENT and env.SERVER_URL (to
// derive the view CSP's resourceDomains); it needs no D1/R2/DO bindings, so
// a bare object covering those two fields is enough to exercise the exact
// same code path tools/list uses.
//
// Usage: npx tsx scripts/dump-mcp-tools.ts
import { buildToolsWithUi } from "../src/mcp/handler.js";
import type { Env } from "../src/types.js";

const env = {
  ENVIRONMENT: process.env.SAVECRAFT_ENVIRONMENT ?? "production",
  SERVER_URL: process.env.SAVECRAFT_SERVER_URL ?? "https://api.savecraft.gg",
} as Env;

const tools = buildToolsWithUi(env);
process.stdout.write(JSON.stringify(tools, null, 2) + "\n");
