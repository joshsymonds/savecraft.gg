/**
 * Canonical Savecraft facts.
 *
 * This module is the single source of truth for facts that appear in BOTH the
 * MCP `setup_help` tool responses and the marketing site pages. Both surfaces
 * import from `@savecraft/content/*` (worker via tsconfig paths, site via
 * SvelteKit kit.alias). Hardcoded duplicates of these strings outside this
 * module are forbidden — see the harmonization epic for the reasoning.
 *
 * Every value here is traced to a code reference; do NOT add a fact without
 * verifying it against the implementation. The audit trail for this initial
 * extraction lives in the epic description.
 */

// ── URLs ───────────────────────────────────────────────────────────────────

export const URLS = {
  homepage: "https://savecraft.gg",
  app: "https://my.savecraft.gg",
  mcp: "https://mcp.savecraft.gg",
  install: "https://install.savecraft.gg",
  api: "https://api.savecraft.gg",
  privacy: "https://savecraft.gg/privacy",
  docs: "https://savecraft.gg/docs",
  support: "https://savecraft.gg/support",
  github: "https://github.com/joshsymonds/savecraft.gg",
  discord: "https://discord.gg/YnC8stpEmF",
  author: "https://joshsymonds.com",
  chatgptApp:
    "https://chatgpt.com/apps/savecraft/asdk_app_69bf076444388191b92e9c482184b44c",
  factorioModPortal: "https://mods.factorio.com/mod/savecraft",
  rimworldSteamWorkshop:
    "https://steamcommunity.com/sharedfiles/filedetails/?id=3693580596",
} as const;

// ── Contacts ───────────────────────────────────────────────────────────────

export const CONTACTS = {
  /** Author / general contact. */
  general: "josh@savecraft.gg",
  /** Customer support inbox advertised on /support. */
  support: "support@savecraft.gg",
  /** Privacy / GDPR requests. */
  privacy: "privacy@savecraft.gg",
} as const;

// ── Project identity ──────────────────────────────────────────────────────

export const PROJECT = {
  name: "Savecraft",
  tagline: "Real game data for your AI assistant",
  license: {
    spdx: "Apache-2.0",
    name: "Apache License 2.0",
    /** Apache 2.0 is OSI-approved, so the "open source" label is accurate. */
    isOpenSource: true,
  },
} as const;

export const AUTHOR = {
  name: "Josh Symonds",
  url: URLS.author,
  githubHandle: "joshsymonds",
  contactEmail: CONTACTS.general,
} as const;

/** AI clients with verified OAuth wiring. README's "Gemini" mention is aspirational. */
export const AI_CLIENTS = ["Claude", "ChatGPT"] as const;

// ── Source kinds ──────────────────────────────────────────────────────────

export type SourceKindId =
  | "reference"
  | "api"
  | "wasm"
  | "mod_selfpush"
  | "mod_with_daemon";

export interface SourceKind {
  /** Short human label for the kind. */
  label: string;
  /** One-sentence description used on marketing cards. */
  shortDescription: string;
  /** Multi-sentence prose for the MCP `setup_help(setup)` response. */
  setupBlurb: string;
  /** Game IDs currently using this kind, in canonical order. */
  gamesToday: readonly string[];
  /** Where the user gets the artifact (URL), if applicable. */
  distributionUrl?: string;
  /** Whether the local daemon must be installed for this kind. */
  requiresDaemon: boolean;
}

export const SOURCE_KINDS: Record<SourceKindId, SourceKind> = {
  reference: {
    label: "Expert modules",
    shortDescription:
      "Every supported game answers expert questions the moment it's on your list, all current to the latest patch.",
    setupBlurb:
      "No install needed. Reference modules ship with every supported game and answer expert questions via MCP queries. Connect Savecraft to your AI assistant once, then ask anything about a supported game.",
    gamesToday: [],
    requiresDaemon: false,
  },
  api: {
    label: "Account integration",
    shortDescription:
      "Path of Exile (GGG-approved) and World of Warcraft sign in through the game's own provider. Read-only character data.",
    setupBlurb: `No local install needed. Visit ${URLS.app}, sign in, and connect the game from the dashboard (add a game, choose your region if prompted, complete OAuth with the game's provider, e.g. Battle.net for WoW or pathofexile.com for PoE). Once authorized, Savecraft discovers your characters automatically.`,
    gamesToday: ["poe", "wow"],
    requiresDaemon: false,
  },
  wasm: {
    label: "Save files",
    shortDescription:
      "Save-file games like Diablo II, Stardew Valley, and Stellaris read in place on the machine you play on. The daemon parses locally and sends the structured output.",
    setupBlurb:
      "Install the Savecraft daemon on your machine. It watches your save files, parses them with a sandboxed WASM plugin, and pushes structured game state to Savecraft. Save files stay on your device; the daemon sends only the parsed JSON output.",
    gamesToday: ["d2r", "sdv", "stellaris", "clair-obscur", "magic"],
    requiresDaemon: true,
  },
  mod_selfpush: {
    label: "In-game mod",
    shortDescription:
      "A mod runs inside the game, connects to Savecraft directly, and pushes state on every save. No external daemon required.",
    setupBlurb: `Subscribe to the Savecraft mod on Steam Workshop. The mod runs inside the game, opens a WebSocket to Savecraft, and pushes state on every save. No local daemon required.`,
    gamesToday: ["rimworld"],
    distributionUrl: URLS.rimworldSteamWorkshop,
    requiresDaemon: false,
  },
  mod_with_daemon: {
    label: "In-game mod + daemon",
    shortDescription:
      "A mod writes save state to a local file inside the game; the Savecraft daemon picks it up and pushes it.",
    setupBlurb: `Install the Savecraft daemon AND the Savecraft mod from the Factorio Mod Portal (${URLS.factorioModPortal}). The mod writes structured state to a local file each save; the daemon watches the file and pushes it to Savecraft.`,
    gamesToday: ["factorio"],
    distributionUrl: URLS.factorioModPortal,
    requiresDaemon: true,
  },
};

// ── Install / pairing ─────────────────────────────────────────────────────

export interface PlatformInstall {
  /** True if a download / installer exists for this platform. */
  available: boolean;
  /** Shell command (Linux) or null (no CLI install). */
  command: string | null;
  /** Human-language instructions (Windows browser flow, macOS roadmap notice). */
  instructions: string | null;
  /** Where the daemon ends up on disk. */
  installsTo: string | null;
  /** How it runs after install (systemd user unit, autostart registry, etc.). */
  runtime: string | null;
  /** Binary signing scheme. */
  signing: string | null;
  /** One-line summary of what happens after install completes. */
  postInstall: string | null;
}

export const PLATFORM_INSTALL: Record<
  "linux" | "windows" | "macos",
  PlatformInstall
> = {
  linux: {
    available: true,
    command: `curl -fsSL ${URLS.install} | bash`,
    instructions: null,
    installsTo: "~/.local/bin/savecraft-daemon",
    runtime:
      "systemd user unit at ~/.config/systemd/user/savecraft-daemon.service",
    signing: "Ed25519 (verified via openssl during install)",
    postInstall:
      "Self-registers with the Savecraft server and prints a pairing link.",
  },
  windows: {
    available: true,
    command: null,
    instructions: `Visit ${URLS.install} in a browser. The installer is a signed MSI; double-click to install. No admin required.`,
    installsTo: "%LOCALAPPDATA%\\Savecraft\\",
    runtime:
      "Autostarts via HKCU Run registry entries for daemon and tray; runs per-user (no admin).",
    signing: "Authenticode (no SmartScreen warning)",
    postInstall:
      "The tray app appears in your system tray. Click 'Link Account' or use the printed pairing link.",
  },
  macos: {
    available: false,
    command: null,
    instructions:
      "macOS support is not yet available; it's on the roadmap. Linux and Windows are supported today.",
    installsTo: null,
    runtime: null,
    signing: null,
    postInstall: null,
  },
};

export const PAIRING = {
  codeFormat: "6-digit decimal",
  codeTtlMinutes: 20,
  linkUrlPattern: `${URLS.app}/link/<code>`,
  trayButtonLabel: "Link Account",
  refreshNote: "Restart the daemon to generate a fresh pairing code.",
} as const;

// ── Storage architecture ──────────────────────────────────────────────────

/**
 * Where Savecraft persists user data. Save sections live in D1 (sections
 * table), NOT R2 — R2 holds only WASM plugin binaries. This was a documented
 * drift bug in the marketing site privacy page; encoding the truth here means
 * both surfaces render the same correct answer.
 *
 * Verified against worker/migrations/0003_sections.sql and the absence of
 * R2 .put() calls in worker/src/.
 */
export const STORAGE_LAYERS = {
  d1: [
    "save sections (parsed JSON snapshots)",
    "account and device metadata",
    "notes",
    "search index (FTS5)",
    "API keys (SHA-256 hashed)",
    "device auth tokens (SHA-256 hashed)",
    "linked characters",
    "adapter OAuth tokens (game_credentials)",
    "MCP tool-call audit log (90-day retention)",
    "reference data",
  ],
  r2: ["WASM plugin binaries", "plugin manifests and signatures"],
  kv: ["short-lived OAuth handshake state (TTL-managed)"],
  durableObjects: [
    "SourceHub and UserHub WebSocket state",
    "device status ring buffer (rolling per-device window)",
  ],
} as const;

// ── Third-party data processors ───────────────────────────────────────────

export interface ThirdParty {
  name: string;
  /** What role they play (infra, auth, game data, etc.). MCP-side concise label. */
  role: string;
  /**
   * Optional richer GDPR-style role description for the marketing site's
   * legal page. When unset, the site falls back to `role`.
   */
  siteRole?: string;
  /** What data they receive from us or directly from the user's browser. */
  dataReceived: string;
  /**
   * For data providers (e.g. Blizzard, GGG, Raider.io): what character /
   * profile data we receive BACK from them. Site-only; MCP omits this.
   */
  dataReceivedFromThem?: string;
  /** Where the processing happens. */
  dataLocation: string;
  /** Link to their privacy policy. */
  privacyUrl: string;
  /**
   * Optional legal-page disclosure about cross-border transfer mechanisms
   * (e.g. EU-U.S. DPF, SCCs). Site-only.
   */
  transferSafeguards?: string;
  /**
   * Optional clickable link rendered next to {@link transferSafeguards}.
   * Used for Clerk's DPA URL so it stays a clickable anchor rather than
   * inline plaintext in the prose.
   */
  transferSafeguardsLink?: { label: string; url: string };
  /**
   * Optional free-form extra paragraph rendered after the standard fields
   * (used for Stripe's "future" disclosure, Cloudflare's bucket detail,
   * etc.). Site-only.
   */
  extraDetail?: string;
  /** Optional short note (e.g. "future" for not-yet-integrated processors). */
  note?: string;
}

export const THIRD_PARTIES: readonly ThirdParty[] = [
  {
    name: "Cloudflare",
    role: "Infrastructure (Workers, D1, R2, KV, Durable Objects, Workers AI, Vectorize)",
    siteRole: "Infrastructure provider (data processor under GDPR).",
    dataReceived:
      "All application data: save snapshots, account metadata, notes, authentication tokens, device events. Cloudflare Workers execute your API requests; D1 stores save snapshots and metadata; R2 stores plugin binaries; KV stores OAuth handshake state.",
    dataLocation: "Global edge network, including the United States",
    privacyUrl: "https://www.cloudflare.com/privacypolicy/",
    transferSafeguards:
      "Cloudflare is certified under the EU-U.S. Data Privacy Framework and incorporates EU Standard Contractual Clauses in its Data Processing Addendum, which applies automatically to all customers.",
  },
  {
    name: "Clerk",
    role: "Authentication provider",
    siteRole:
      "Authentication provider (data processor for authentication services; independent data controller for its own account management).",
    dataReceived:
      "Your email address, display name, and authentication credentials (hashed). Clerk also processes session data and device metadata as part of authentication.",
    dataLocation: "United States (Google Cloud Platform)",
    privacyUrl: "https://clerk.com/legal/privacy",
    transferSafeguards:
      "Clerk is certified under the EU-U.S. Data Privacy Framework and offers a DPA with Standard Contractual Clauses:",
    transferSafeguardsLink: {
      label: "clerk.com/legal/dpa",
      url: "https://clerk.com/legal/dpa",
    },
  },
  {
    name: "Blizzard Entertainment (Battle.net)",
    role: "World of Warcraft character data provider",
    siteRole:
      "Game data provider (when you connect a Battle.net account for World of Warcraft).",
    dataReceived:
      "API requests for your character profile data (gear, stats, talents, raid progression). These requests are authenticated with your OAuth token and Savecraft's application credentials.",
    dataReceivedFromThem:
      "Character profile data (name, realm, class, level, equipped gear, talents, Mythic+ runs, raid progression, professions). This data becomes part of your game save state within Savecraft.",
    dataLocation: "United States",
    privacyUrl:
      "https://www.blizzard.com/en-us/legal/a4380ee5-5c8d-4e3b-83b7-ea4d874e7f22/blizzard-entertainment-online-privacy-policy",
  },
  {
    name: "Raider.io",
    role: "World of Warcraft Mythic+ and raid enrichment",
    siteRole:
      "Enrichment data provider for World of Warcraft (no authentication required).",
    dataReceived:
      "Your character name, realm, and region in API requests. No OAuth tokens or personal data are shared.",
    dataReceivedFromThem:
      "Mythic+ scores, rankings, and raid progression summaries. This enriches your character's game state but is not required; if Raider.io is unavailable, your save data is still complete from Blizzard's API alone.",
    dataLocation: "United States",
    privacyUrl: "https://raider.io/privacy",
  },
  {
    name: "Grinding Gear Games (pathofexile.com)",
    role: "Path of Exile character data provider (Savecraft is a GGG-approved application)",
    siteRole:
      "Path of Exile character data provider. Savecraft is a GGG-approved application.",
    dataReceived:
      "API requests for your character profile, authenticated with your GGG OAuth token and Savecraft's application credentials.",
    dataReceivedFromThem:
      "Character profile data (name, league, class, level, equipment, passive tree, items). This becomes part of your game save state within Savecraft.",
    dataLocation: "International (GGG operates globally)",
    privacyUrl: "https://www.pathofexile.com/privacy-policy",
  },
  {
    name: "Google Fonts",
    role: "Web font delivery (CSS-loaded by the browser)",
    siteRole: "Web font delivery, loaded by your browser via CSS.",
    dataReceived:
      "Your browser's IP address, User-Agent, and referer when it fetches font files from fonts.googleapis.com. No Savecraft application data is sent to Google.",
    dataLocation: "Google global edge network",
    privacyUrl: "https://policies.google.com/privacy",
  },
  {
    name: "Stripe",
    role: "Payments (planned)",
    siteRole: "Payments processor (planned; not yet integrated).",
    dataReceived: "Nothing yet; payments aren't enabled.",
    dataLocation: "United States",
    privacyUrl: "https://stripe.com/privacy",
    note: "Planned for paid subscriptions; will be added when payments launch.",
    extraDetail:
      "When we add paid subscriptions, Stripe will process payments. Stripe will receive your payment card details, billing address, and transaction data directly; we will not store payment information ourselves. Stripe acts as both a data processor (handling transactions on our behalf) and an independent data controller (for fraud prevention and regulatory compliance). We will update this policy before adding Stripe.",
  },
];

// ── What we don't collect ─────────────────────────────────────────────────

/**
 * Optimistic-but-honest framing per
 * [feedback_privacy_optimistic_honest.md]. Every line here is verifiable; the
 * site privacy page used to make stronger claims (e.g. "no IP addresses") that
 * were false. We disclose what we do collect (under LOGGING / STORAGE_LAYERS)
 * and frame the genuine privacy wins here.
 */
export const NOT_COLLECTED: readonly string[] = [
  "Zero third-party analytics SDKs (no Google Analytics, Posthog, Mixpanel, Hotjar, Segment, or similar).",
  "No behavioral tracking of any kind: no heatmaps, no session recordings, no funnel analytics.",
  "We never see your conversations with the AI. The audit log captures which MCP tool the AI called on your behalf; the AI's responses to you stay between you and the AI provider.",
  'No device fingerprinting. The only browser-side signal we keep is a short label identifying the AI client that made the request (e.g. "chatgpt", "claude-desktop").',
  "Raw save-file bytes stay on your device. The daemon parses them locally and pushes only the structured JSON output.",
  "No advertising networks, no data brokers, no marketing or social-media trackers.",
];

// ── What we DO log ────────────────────────────────────────────────────────

export const LOGGING = {
  mcpToolCalls: {
    purpose:
      'Debugging, abuse prevention, and answering questions like "why did this tool error?"',
    retentionDays: 90,
    fields: [
      "tool name",
      "params (truncated to 4 KB)",
      "response size in bytes",
      "duration in milliseconds",
      "error flag",
      "AI-client label (derived from User-Agent)",
      "user UUID",
      "timestamp",
    ],
    notLogged:
      "The AI's response to you. The content returned by the tool (only its size).",
  },
  sourceIp: {
    purpose:
      "Rate-limiting unlinked daemon registrations to 10 per hour per IP. Helps prevent abuse of the registration endpoint before a daemon is paired to an account.",
    retention:
      "Lifetime of the source row (deleted when the source is unlinked).",
  },
} as const;

// ── Security mechanisms ───────────────────────────────────────────────────

/**
 * Per feedback_privacy_optimistic_honest.md, this is the honest accounting of
 * what's protected and how. We don't claim app-layer encryption for adapter
 * OAuth tokens (that would be theatre — the worker holds the database and the
 * key both, and the tokens must be usable in plaintext to refresh character
 * data). We do claim SHA-256 hashing where it's real.
 */
export const SECURITY = {
  deviceAuthTokens:
    "SHA-256 hashed before storage; the plaintext token is never stored server-side.",
  apiKeys:
    'SHA-256 hashed; a short prefix (e.g. "sav_a1b2") is shown once at creation for identification.',
  oauthMcpTokens:
    "Opaque random strings, stored in Cloudflare KV with automatic TTL-based expiration.",
  oauthAdapterTokens:
    "Stored in D1 game_credentials, used by the worker to fetch your character data on demand from the game provider (Battle.net, GGG). Protected by Cloudflare's platform-level encryption at rest; revoke at any time from your game-provider's account settings.",
  passwordHashing:
    "Handled by Clerk per their security practices. Savecraft never sees or stores your password.",
  daemonFilesystemAccess:
    "Read-only via Go's os.ReadFile (internal/osfs/osfs.go). The daemon cannot modify or delete your save files.",
  wasmSandbox:
    "WASM plugins run under wazero with only stdin / stdout / stderr wired up. No filesystem, no network, no environment access (internal/runner/wazero.go).",
} as const;
