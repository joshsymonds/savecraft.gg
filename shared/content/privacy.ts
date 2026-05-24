/**
 * Privacy copy composed from {@link ./facts}.
 *
 * `PRIVACY_TLDR` is the verbatim paragraph rendered identically by both the
 * marketing site's `/privacy` page and `privacyTextForMcp()`. The MCP composer
 * adds dense follow-up paragraphs (storage layers, logging disclosure,
 * not-collected list, security mechanisms) so AI assistants get the full
 * picture in one tool response.
 *
 * Drift-prevention rules:
 * - Never write claims here directly; reference facts.
 * - If you need a new claim, add the underlying datum to facts first.
 * - Per [feedback_privacy_optimistic_honest.md], frame what we DO collect
 *   honestly with stated purpose; don't promise app-layer encryption we
 *   can't (and shouldn't) implement.
 */

import {
  CONTACTS,
  LOGGING,
  NOT_COLLECTED,
  SECURITY,
  STORAGE_LAYERS,
  URLS,
} from "./facts";

export const PRIVACY_TLDR =
  `Savecraft collects the minimum data needed to connect your game saves to AI assistants. ` +
  `We store your email address, the game save data you push to us, notes you create, and ` +
  `(for account-connected games like World of Warcraft and Path of Exile) OAuth tokens used ` +
  `solely to verify character ownership and refresh data on demand. We don't run analytics, ` +
  `track you, sell your data, or read your AI conversations. Our code is open source ` +
  `(${URLS.github}), so you can verify all of this yourself.`;

const LAYER_NAMES: Record<keyof typeof STORAGE_LAYERS, string> = {
  d1: "D1",
  r2: "R2",
  kv: "KV",
  durableObjects: "Durable Objects",
};

function formatStorageLine(): string {
  const parts: string[] = [];
  for (const [layer, items] of Object.entries(STORAGE_LAYERS)) {
    const name = LAYER_NAMES[layer as keyof typeof STORAGE_LAYERS];
    parts.push(`${name} stores ${(items as readonly string[]).join("; ")}`);
  }
  return parts.join(". ") + ".";
}

function formatLoggingLine(): string {
  const tools = LOGGING.mcpToolCalls;
  const ip = LOGGING.sourceIp;
  return (
    `MCP tool calls are logged for ${tools.retentionDays} days. Purpose: ${tools.purpose} ` +
    `Fields: ${tools.fields.join(", ")}. ${tools.notLogged} ` +
    `Daemon source registrations also get tagged with the requesting IP. Purpose: ${ip.purpose} ` +
    `Retention: ${ip.retention}`
  );
}

function formatSecurityLine(): string {
  return [
    SECURITY.deviceAuthTokens,
    SECURITY.apiKeys,
    SECURITY.oauthMcpTokens,
    SECURITY.oauthAdapterTokens,
    SECURITY.passwordHashing,
    SECURITY.daemonFilesystemAccess,
    SECURITY.wasmSandbox,
  ].join(" ");
}

/** Plain-text privacy blob returned by the MCP `setup_help(category="privacy")` tool. */
export function privacyTextForMcp(): string {
  return [
    PRIVACY_TLDR,
    `Where data is stored: ${formatStorageLine()}`,
    `Security: ${formatSecurityLine()}`,
    `What we log: ${formatLoggingLine()}`,
    `What we do NOT collect: ${NOT_COLLECTED.join(" ")}`,
    `Data deletion: You can delete individual saves, notes, and devices through the web UI or MCP tools. Email ${CONTACTS.privacy} to delete your entire account and all associated data.`,
    `Full privacy policy: ${URLS.privacy}`,
  ].join("\n\n");
}
