/**
 * Shared game-agnostic core for the PoE1/PoE2 build_planner reference
 * modules — see plugins/poe/reference/build-planner.ts and
 * plugins/poe2/reference/build-planner.ts for the per-game configuration
 * (module id/description/parameters, snapshot table, buy_similar support)
 * built on top of {@link createBuildPlannerExecute}.
 *
 * Bridges the headless Path of Building calc service (pob-server) into the
 * MCP reference module system. Supports four workflows:
 *
 *   1. Analyze: pass a build URL → get structured calc results + buildId
 *   2. Modify: pass a buildId + operations → get updated results + new buildId
 *   3. Explore: pass a buildId + nearby_metrics → get ranked nearby nodes by impact
 *   4. Audit:   pass a buildId + audit_allocated → get ranked weakest branches +
 *               dead_weight nodes (the inverse of explore — what to cut)
 *
 * Every call returns a buildId that can be used for subsequent modifications,
 * enabling iterative build design without the player exporting build codes.
 *
 * pob-server's endpoints are themselves game-transparent — it routes by the
 * stored build's game — so this core needs no game parameter on any of the
 * /resolve /modify /nearby /audit /compare /build/{id}/summary calls. Only
 * the connected-character snapshot SQL (table name + game_id) and
 * player-facing wording differ per game; both are supplied via
 * {@link BuildPlannerConfig}.
 */

import { connectAdapterGuidance } from "../adapters/adapter";
import type { Env } from "../types";

import type { NativeReferenceModule, ReferenceResult } from "./types";

/** Timeout for PoB requests (ms). */
const POB_TIMEOUT_MS = 30_000;

/** Generic "value or the ReferenceResult to return" outcome for validation/fetch steps. */
type Outcome<T> = { ok: true; value: T } | { ok: false; result: ReferenceResult };

function textError(content: string): ReferenceResult {
  return { type: "text", content };
}

/** Minimal URL validation — must have a scheme and host. */
function isURL(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

// friendlyBuildLabel collapses a /compare input (URL or buildId) to a
// short identifier suitable for a column header sublabel. Disambiguates
// columns when the per-build class+level happens to match across builds
// (two Scion L99s look identical without this).
//
//   https://pobb.in/OeN3b-6rvLSM       → "pobb.in/OeN3b-6rvLSM"
//   https://www.pathofexile.com/...    → "pathofexile.com/..."
//   21df3afc0a5138821b8f1c071d6523cd   → "21df3afc"
//   <anything else>                    → input truncated to 24 chars
function friendlyBuildLabel(input: string): string {
  if (/^[a-f0-9]{32}$/.test(input)) return input.slice(0, 8);
  try {
    const u = new URL(input);
    const host = u.hostname.replace(/^www\./, "");
    const path = u.pathname.replace(/^\/+/, "").split("/").find(Boolean);
    return path ? `${host}/${path}` : host;
  } catch {
    return input.length > 24 ? `${input.slice(0, 24)}…` : input;
  }
}

/**
 * Re-feed a stored PoB XML snapshot to pob-server /calc. The buildId is
 * content-addressed, so this deterministically re-materializes the SAME
 * build that was evicted from pob-server's store — no GGG call, no
 * /import, no buildId drift. Used to transparently recover when a
 * connected-character snapshot's buildId is no longer resident.
 */
function refeedBuild(pobUrl: string, xml: string, apiKey?: string): Promise<Response> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }
  return fetch(`${pobUrl}/calc`, {
    method: "POST",
    headers,
    body: JSON.stringify({ buildXml: xml }),
    signal: AbortSignal.timeout(POB_TIMEOUT_MS),
  });
}

async function pobFetch(
  pobUrl: string,
  path: string,
  body: Record<string, unknown>,
  apiKey?: string,
  sections?: string,
  statKeys?: string,
  recoveryXml?: string,
): Promise<Response> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }
  const params = new URLSearchParams();
  if (sections) params.set("sections", sections);
  if (statKeys) params.set("stat_keys", statKeys);
  const qs = params.toString();
  const url = qs ? `${pobUrl}${path}?${qs}` : `${pobUrl}${path}`;
  const issue = (): Promise<Response> =>
    fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(POB_TIMEOUT_MS),
    });
  const response = await issue();
  // A 404 on a connected-character buildId means pob-server evicted the
  // build from its store. Re-feed the stored XML (deterministic identical
  // buildId) and retry the original call once.
  if (response.status === 404 && recoveryXml) {
    const refed = await refeedBuild(pobUrl, recoveryXml, apiKey);
    if (refed.ok) return issue();
  }
  return response;
}

/** Convert a caught error into the standard "PoB calc service unavailable" ReferenceResult. */
function unavailableError(error: unknown): ReferenceResult {
  return textError(
    `PoB calc service is currently unavailable: ${error instanceof Error ? error.message : "unknown error"}. Try again later.`,
  );
}

/** Returns an error ReferenceResult if `response` is not ok, else undefined. */
async function httpErrorIfNotOk(
  label: string,
  response: Response,
): Promise<ReferenceResult | undefined> {
  if (response.ok) return undefined;
  const body = await response.text().catch(() => "");
  return textError(`PoB ${label} error (${String(response.status)}): ${body}`);
}

/** POST to a pob-server endpoint and unwrap the JSON body, or an error ReferenceResult. */
async function pobFetchResult(
  pobUrl: string,
  path: string,
  body: Record<string, unknown>,
  apiKey: string | undefined,
  label: string,
  extras?: { sections?: string; statKeys?: string; recoveryXml?: string },
): Promise<Outcome<Record<string, unknown>>> {
  let response: Response;
  try {
    response = await pobFetch(
      pobUrl,
      path,
      body,
      apiKey,
      extras?.sections,
      extras?.statKeys,
      extras?.recoveryXml,
    );
  } catch (error) {
    return { ok: false, result: unavailableError(error) };
  }
  const err = await httpErrorIfNotOk(label, response);
  if (err) return { ok: false, result: err };
  return parseJsonRecord(label, response);
}

/** True if `value` is an array whose every element is a string. */
function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

/** True if `value` is a JSON object (non-null, non-array). */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Parse a pob-server response body as a JSON object, or an error
 * ReferenceResult if the body isn't a JSON object (pob-server always
 * responds with a JSON object on success; a non-object body indicates a
 * malformed/unexpected upstream response).
 */
async function parseJsonRecord(
  label: string,
  response: Response,
): Promise<Outcome<Record<string, unknown>>> {
  const data: unknown = await response.json();
  if (!isRecord(data)) {
    return {
      ok: false,
      result: textError(`PoB ${label} error: response body was not a JSON object.`),
    };
  }
  return { ok: true, value: data };
}

/**
 * Validate an optional query param that must be a JSON array of strings
 * (nearby_categories / audit_categories). Empty arrays normalize to
 * undefined ("no filter").
 */
function validateStringArrayParameter(
  value: unknown,
  parameterName: string,
  arrayExample: string,
): Outcome<string[] | undefined> {
  if (value === undefined || value === null) return { ok: true, value: undefined };
  if (!Array.isArray(value)) {
    return {
      ok: false,
      result: textError(
        `Error: ${parameterName} must be a JSON array of strings (e.g. ${arrayExample}).`,
      ),
    };
  }
  if (!isStringArray(value)) {
    return { ok: false, result: textError(`Error: ${parameterName} entries must all be strings.`) };
  }
  return { ok: true, value: value.length > 0 ? value : undefined };
}

interface ModSourcesParams {
  modSourcesArray: string[] | undefined;
  modSourcesLimit: number | undefined;
}

/** Validate mod_sources (array of stat names) and mod_sources_limit (1-50 integer). */
function validateModSources(
  modSources: unknown,
  modSourcesLimit: number | undefined,
): Outcome<ModSourcesParams> {
  let modSourcesArray: string[] | undefined;
  if (modSources !== undefined && modSources !== null) {
    if (!Array.isArray(modSources)) {
      return {
        ok: false,
        result: textError(
          'Error: mod_sources must be a JSON array of stat names (e.g. ["Life","CombinedDPS"]). Pass it as a real array, not a JSON-encoded string.',
        ),
      };
    }
    if (!isStringArray(modSources)) {
      return {
        ok: false,
        result: textError(
          "Error: mod_sources entries must all be strings (stat names like Life, CombinedDPS, TotalEHP).",
        ),
      };
    }
    if (modSources.length > 0) modSourcesArray = modSources;
  }
  if (modSourcesLimit !== undefined) {
    if (typeof modSourcesLimit !== "number" || !Number.isInteger(modSourcesLimit)) {
      return {
        ok: false,
        result: textError("Error: mod_sources_limit must be an integer between 1 and 50."),
      };
    }
    if (modSourcesLimit < 1 || modSourcesLimit > 50) {
      return {
        ok: false,
        result: textError(
          `Error: mod_sources_limit ${String(modSourcesLimit)} out of range. Must be 1-50 to keep response payloads tractable.`,
        ),
      };
    }
  }
  return { ok: true, value: { modSourcesArray, modSourcesLimit } };
}

/**
 * Parse a query param that's a JSON-encoded array (nearby_metrics,
 * nearby_delta_stats, audit_metrics, audit_delta_stats). `requireNonEmpty`
 * additionally rejects an empty array (used only by nearby_metrics).
 */
function parseJsonArrayParameter(
  raw: string | undefined,
  parameterName: string,
  options: { requireNonEmpty?: boolean } = {},
): Outcome<unknown[] | undefined> {
  if (!raw) return { ok: true, value: undefined };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return { ok: false, result: textError(`Error: ${parameterName} is not valid JSON.`) };
  }
  const empty = options.requireNonEmpty && Array.isArray(parsed) && parsed.length === 0;
  if (!Array.isArray(parsed) || empty) {
    const suffix = options.requireNonEmpty ? "non-empty " : "";
    return {
      ok: false,
      result: textError(`Error: ${parameterName} must be a ${suffix}JSON array.`),
    };
  }
  return { ok: true, value: parsed };
}

interface CharacterSnapshot {
  buildId: string;
  xml: string;
}

type SnapshotResolution =
  | { ok: true; snapshot: CharacterSnapshot }
  | { ok: false; guidance: string };

/** Per-game configuration for {@link createBuildPlannerExecute}. */
export interface BuildPlannerConfig {
  /** D1 saves.game_id value for this game (e.g. "poe", "poe2"). */
  gameId: string;
  /**
   * D1 table storing the per-save PoB snapshot for this game. Schema is
   * identical across games (save_uuid, pob_build_id, pob_xml, imported_at)
   * — see migration 0056 (poe) / 0062 (poe2).
   */
  snapshotTable: string;
  /** Full display name used in player-facing guidance, e.g. "Path of Exile 2". */
  gameLabel: string;
  /** Short display name for terser guidance strings, e.g. "PoE2". */
  gameAbbrev: string;
  /**
   * Whether /compare's buy_similar trade-mod lookup is supported for this
   * game. pob-server's QueryMods snapshot is dumped exclusively from the
   * poe1 process pool (see cmd/pob-server/compare.go's lookupQueryModsLeg)
   * — other games have no equivalent, so a caller passing buy_similar gets
   * a clear error instead of a silently empty/best-effort result.
   */
  supportsBuySimilar: boolean;
}

/** Build the "provide character/build/build_id" error text for this game. */
function missingBuildReferenceError(config: BuildPlannerConfig): ReferenceResult {
  return textError(
    `Error: provide character (your connected ${config.gameAbbrev} character), a build URL, or a build_id — one of build/build_id is required.`,
  );
}

/**
 * Resolve a connected character to its stored PoB snapshot.
 *
 * `character:"current"` → the user's most-recently-played (most recently
 * refreshed) save for this game; otherwise an exact save_name match. Joins
 * the game's snapshot table so a save with no imported build is treated as
 * "refresh first" guidance, not a hit. NEVER calls GGG or pob-server
 * /import — pure D1 read of state populated by refresh_save.
 */
async function resolveCharacterSnapshot(
  env: Env,
  userUuid: string,
  character: string,
  config: BuildPlannerConfig,
): Promise<SnapshotResolution> {
  const isCurrent = character.toLowerCase() === "current";
  const base = `SELECT bs.pob_build_id AS buildId, bs.pob_xml AS xml
       FROM saves s
       JOIN ${config.snapshotTable} bs ON bs.save_uuid = s.uuid
      WHERE s.user_uuid = ? AND s.game_id = ? AND s.removed_at IS NULL`;
  const row = isCurrent
    ? await env.DB.prepare(`${base} ORDER BY s.last_updated DESC LIMIT 1`)
        .bind(userUuid, config.gameId)
        .first<{ buildId: string; xml: string }>()
    : await env.DB.prepare(`${base} AND s.save_name = ? LIMIT 1`)
        .bind(userUuid, config.gameId, character)
        .first<{ buildId: string; xml: string }>();

  if (row) {
    return { ok: true, snapshot: { buildId: row.buildId, xml: row.xml } };
  }

  // No snapshot. Distinguish "save exists, never refreshed" from "no such
  // connected character" so the guidance points at the right next step.
  const saveExists = isCurrent
    ? await env.DB.prepare(
        "SELECT 1 AS x FROM saves WHERE user_uuid = ? AND game_id = ? AND removed_at IS NULL LIMIT 1",
      )
        .bind(userUuid, config.gameId)
        .first()
    : await env.DB.prepare(
        "SELECT 1 AS x FROM saves WHERE user_uuid = ? AND game_id = ? AND removed_at IS NULL AND save_name = ? LIMIT 1",
      )
        .bind(userUuid, config.gameId, character)
        .first();

  const foundOrNamed = isCurrent ? "found" : `named "${character}"`;
  const who = isCurrent ? "your most-recently-played character" : `character "${character}"`;
  const guidance = saveExists
    ? `No imported ${config.gameLabel} build yet for ${who}. Run refresh_save for this ${config.gameAbbrev} character first — that imports the live build into Savecraft — then call build_planner again with the same character.`
    : `No connected ${config.gameLabel} character ${foundOrNamed}. To analyze the player's own character, ${connectAdapterGuidance(config.gameLabel)}, then retry. (To analyze a build that isn't theirs, pass its URL via the build parameter instead.)`;
  return { ok: false, guidance };
}

interface ResolvedBuildReference {
  buildId: string | undefined;
  recoveryXml: string | undefined;
}

/**
 * Resolve `character` → a stored buildId/recoveryXml (connected-character
 * path), then enforce that a build reference (character, build, or
 * build_id) is present. `build`/`build_id` win over `character` if also
 * supplied.
 */
async function resolveBuildReference(
  env: Env,
  config: BuildPlannerConfig,
  build: string | undefined,
  buildId: string | undefined,
  character: string | undefined,
  userUuid: string | undefined,
): Promise<Outcome<ResolvedBuildReference>> {
  let resolvedBuildId = buildId;
  let recoveryXml: string | undefined;
  if (character && !build && !buildId) {
    if (!userUuid) {
      return {
        ok: false,
        result: textError(
          `Error: the character parameter needs a signed-in player. To use it, ${connectAdapterGuidance(config.gameLabel)}, then retry — or pass a build URL instead.`,
        ),
      };
    }
    const resolved = await resolveCharacterSnapshot(env, userUuid, character, config);
    if (!resolved.ok) {
      return { ok: false, result: textError(resolved.guidance) };
    }
    resolvedBuildId = resolved.snapshot.buildId;
    recoveryXml = resolved.snapshot.xml;
  }
  if (!build && !resolvedBuildId) {
    return { ok: false, result: missingBuildReferenceError(config) };
  }
  return { ok: true, value: { buildId: resolvedBuildId, recoveryXml } };
}

interface CompareParams {
  build: string | undefined;
  buildId: string | undefined;
  compareWith: unknown;
  sections: string | undefined;
  statKeys: string | undefined;
  buySimilar: boolean | undefined;
  buySimilarFilters: unknown;
  league: string | undefined;
  modSourcesArray: string[] | undefined;
  modSourcesLimit: number | undefined;
}

/** Apply buy_similar / league / buy_similar_filters onto a compare request body, or reject them. */
function applyBuySimilar(
  config: BuildPlannerConfig,
  compareBody: Record<string, unknown>,
  params: CompareParams,
): Outcome<undefined> {
  if (params.buySimilar) {
    if (!config.supportsBuySimilar) {
      return {
        ok: false,
        result: textError(
          `Error: buy_similar is not supported for ${config.gameLabel} builds — pob-server's trade-mod lookup is poe1-only.`,
        ),
      };
    }
    compareBody.buySimilar = true;
  }
  if (params.league) {
    compareBody.league = params.league;
  }
  const { buySimilarFilters } = params;
  if (buySimilarFilters !== undefined && buySimilarFilters !== null) {
    if (typeof buySimilarFilters !== "object" || Array.isArray(buySimilarFilters)) {
      return {
        ok: false,
        result: textError(
          'Error: buy_similar_filters must be a JSON object (e.g. {mods: [{mod_text: "+# to maximum Life", min: 90}]}). Pass it as a real object, not a JSON-encoded string.',
        ),
      };
    }
    if (!config.supportsBuySimilar) {
      return {
        ok: false,
        result: textError(
          `Error: buy_similar_filters is not supported for ${config.gameLabel} builds.`,
        ),
      };
    }
    if (!params.buySimilar) {
      return {
        ok: false,
        result: textError(
          "Error: buy_similar_filters set without buy_similar=true. Pass buy_similar=true alongside the filters or omit the filters object — silently ignoring filters would be a worse UX.",
        ),
      };
    }
    compareBody.buy_similar_filters = buySimilarFilters;
  }
  return { ok: true, value: undefined };
}

/** Build the /compare request body: validates compare_with, primary build ref, and buy_similar. */
function buildCompareRequest(
  config: BuildPlannerConfig,
  params: CompareParams,
): Outcome<Record<string, unknown>> {
  const { compareWith } = params;
  if (!Array.isArray(compareWith)) {
    return {
      ok: false,
      result: textError(
        'Error: compare_with must be a JSON array of build URLs or build_ids (e.g. ["https://pobb.in/abc", "def123"]).',
      ),
    };
  }
  if (compareWith.length === 0) {
    return {
      ok: false,
      result: textError(
        "Error: compare_with must contain at least one additional build to compare against the primary.",
      ),
    };
  }
  // Total builds (primary + compare_with) must fit the server cap of 8.
  // Reject early so the user gets faster feedback than waiting for a
  // /compare round-trip that's guaranteed to 400.
  if (compareWith.length + 1 > 8) {
    return {
      ok: false,
      result: textError(
        "Error: compare accepts at most 8 builds per request (primary + compare_with). Split the comparison into smaller batches.",
      ),
    };
  }
  const primary = params.build ?? params.buildId;
  if (primary === undefined) {
    // Unreachable: resolveBuildReference already guarantees build or
    // build_id is present before compare mode runs. Narrows the type
    // without a non-null assertion.
    return { ok: false, result: missingBuildReferenceError(config) };
  }
  const compareWithArray = compareWith as string[];
  // Pre-compute friendly per-build labels so the view can disambiguate
  // columns when the auto-generated class+level matches across builds
  // (e.g. two Scion L99s). The server's labelFor fallback only emits
  // the hostname, which is identical for any pair of pobb.in URLs.
  const buildSources = [primary, ...compareWithArray];
  const compareBody: Record<string, unknown> = {
    builds: buildSources,
    labels: buildSources.map((source) => friendlyBuildLabel(source)),
  };
  const buySimilarOutcome = applyBuySimilar(config, compareBody, params);
  if (!buySimilarOutcome.ok) return buySimilarOutcome;
  if (params.modSourcesArray !== undefined) {
    compareBody.modSources = params.modSourcesArray;
    if (params.modSourcesLimit !== undefined) compareBody.modSourcesLimit = params.modSourcesLimit;
  }
  return { ok: true, value: compareBody };
}

/**
 * Compare mode: compare_with triggers /compare with the primary build
 * (build URL or build_id) concatenated with the compare_with builds.
 * Takes precedence over modify/nearby/audit/resolve.
 */
async function runCompareMode(
  pobUrl: string,
  env: Env,
  config: BuildPlannerConfig,
  params: CompareParams,
): Promise<ReferenceResult> {
  const built = buildCompareRequest(config, params);
  if (!built.ok) return built.result;
  const fetched = await pobFetchResult(
    pobUrl,
    "/compare",
    built.value,
    env.POB_API_KEY,
    "compare",
    {
      sections: params.sections,
      statKeys: params.statKeys,
    },
  );
  if (!fetched.ok) return fetched.result;
  // Override the wrapper's default module field so the MCP host mounts
  // build-compare.svelte (not build-planner.svelte). The wrapper at
  // worker/src/mcp/handler.ts spreads the module's returned data after
  // `module: moduleId`, so this key shadows the default.
  fetched.value.module = "build_compare";
  return { type: "structured", data: fetched.value };
}

interface AuditParams {
  buildId: string | undefined;
  recoveryXml: string | undefined;
  auditMetrics: string | undefined;
  auditDeltaStats: string | undefined;
  auditBranchLimit: number | undefined;
  auditNodeLimit: number | undefined;
  auditIncludeZero: string | undefined;
  auditSort: string | undefined;
  auditScope: string | undefined;
  auditCategoriesArray: string[] | undefined;
}

/**
 * include_zero: snake-case string param → bool. Default true; pass
 * 'false' / 'no' / '0' to suppress the dead_weight bucket. The Go server
 * distinguishes "field omitted" from "explicitly false" via a *bool, so
 * only forward the field when the player set it explicitly.
 */
function parseIncludeZero(auditIncludeZero: string | undefined): boolean | undefined {
  if (auditIncludeZero === undefined) return undefined;
  const lowered = auditIncludeZero.toLowerCase();
  return !(lowered === "false" || lowered === "no" || lowered === "0");
}

/** Build the /audit request body: validates build_id, audit_metrics, audit_delta_stats. */
function buildAuditRequest(params: AuditParams): Outcome<Record<string, unknown>> {
  if (!params.buildId) {
    return { ok: false, result: textError("Error: build_id is required for audit_allocated.") };
  }
  const metrics = parseJsonArrayParameter(params.auditMetrics, "audit_metrics");
  if (!metrics.ok) return metrics;
  const deltaStats = parseJsonArrayParameter(params.auditDeltaStats, "audit_delta_stats");
  if (!deltaStats.ok) return deltaStats;
  const includeZero = parseIncludeZero(params.auditIncludeZero);

  // Snake_case → camelCase translation. The Go server validates and clamps
  // everything (max 10 metrics, max 20 deltaStats, branchLimit ∈ [1,50],
  // nodeLimit ∈ [1,100], scope ∈ {tree,ascendancy,both}, sort ∈
  // {weakest,strongest}); the TS layer just forwards.
  const auditBody: Record<string, unknown> = { buildId: params.buildId };
  if (metrics.value !== undefined) auditBody.metrics = metrics.value;
  if (deltaStats.value !== undefined) auditBody.deltaStats = deltaStats.value;
  if (params.auditBranchLimit !== undefined) auditBody.branchLimit = params.auditBranchLimit;
  if (params.auditNodeLimit !== undefined) auditBody.nodeLimit = params.auditNodeLimit;
  if (includeZero !== undefined) auditBody.includeZero = includeZero;
  if (params.auditSort) auditBody.sort = params.auditSort;
  if (params.auditScope) auditBody.scope = params.auditScope;
  if (params.auditCategoriesArray) auditBody.categories = params.auditCategoriesArray;
  return { ok: true, value: auditBody };
}

/** Audit mode: audit_allocated triggers /audit (inverse of explore — find what to cut). */
async function runAuditMode(
  pobUrl: string,
  env: Env,
  params: AuditParams,
): Promise<ReferenceResult> {
  const built = buildAuditRequest(params);
  if (!built.ok) return built.result;
  const fetched = await pobFetchResult(pobUrl, "/audit", built.value, env.POB_API_KEY, "audit", {
    recoveryXml: params.recoveryXml,
  });
  if (!fetched.ok) return fetched.result;
  return { type: "structured", data: fetched.value };
}

interface NearbyParams {
  buildId: string | undefined;
  recoveryXml: string | undefined;
  nearbyMetrics: string;
  nearbyRadius: number | undefined;
  nearbyLimit: number | undefined;
  nearbyDeltaStats: string | undefined;
  nearbySort: string | undefined;
  nearbyCategoriesArray: string[] | undefined;
}

/** Build the /nearby request body: validates build_id, nearby_metrics, nearby_delta_stats. */
function buildNearbyRequest(params: NearbyParams): Outcome<Record<string, unknown>> {
  if (!params.buildId) {
    return { ok: false, result: textError("Error: build_id is required for nearby node search.") };
  }
  const metrics = parseJsonArrayParameter(params.nearbyMetrics, "nearby_metrics", {
    requireNonEmpty: true,
  });
  if (!metrics.ok) return metrics;
  const deltaStats = parseJsonArrayParameter(params.nearbyDeltaStats, "nearby_delta_stats");
  if (!deltaStats.ok) return deltaStats;

  const nearbyBody: Record<string, unknown> = { buildId: params.buildId, metrics: metrics.value };
  if (params.nearbyRadius) nearbyBody.radius = params.nearbyRadius;
  if (params.nearbyLimit) nearbyBody.limit = params.nearbyLimit;
  if (deltaStats.value) nearbyBody.deltaStats = deltaStats.value;
  if (params.nearbySort) nearbyBody.sort = params.nearbySort;
  if (params.nearbyCategoriesArray) nearbyBody.categories = params.nearbyCategoriesArray;
  return { ok: true, value: nearbyBody };
}

/** Explore mode: nearby_metrics triggers /nearby search. */
async function runNearbyMode(
  pobUrl: string,
  env: Env,
  params: NearbyParams,
): Promise<ReferenceResult> {
  const built = buildNearbyRequest(params);
  if (!built.ok) return built.result;
  const fetched = await pobFetchResult(pobUrl, "/nearby", built.value, env.POB_API_KEY, "nearby", {
    recoveryXml: params.recoveryXml,
  });
  if (!fetched.ok) return fetched.result;
  return { type: "structured", data: fetched.value };
}

interface ResolveUrlParams {
  build: string;
  sections: string | undefined;
  statKeys: string | undefined;
  modSourcesArray: string[] | undefined;
  modSourcesLimit: number | undefined;
  nearbyCategoriesArray: string[] | undefined;
}

/** Step 1: resolve a build URL → buildId + calc results via pob-server /resolve. */
async function resolveBuildFromUrl(
  pobUrl: string,
  env: Env,
  params: ResolveUrlParams,
): Promise<Outcome<{ buildId: string; data: Record<string, unknown> }>> {
  const resolveBody: Record<string, unknown> = { url: params.build };
  if (params.modSourcesArray !== undefined) {
    resolveBody.modSources = params.modSourcesArray;
    if (params.modSourcesLimit !== undefined) resolveBody.modSourcesLimit = params.modSourcesLimit;
  }
  // Forward nearby_categories to focus the inline power_report attached
  // to /resolve responses on the requested category set.
  if (params.nearbyCategoriesArray) resolveBody.nearby_categories = params.nearbyCategoriesArray;

  const fetched = await pobFetchResult(
    pobUrl,
    "/resolve",
    resolveBody,
    env.POB_API_KEY,
    "resolve",
    {
      sections: params.sections,
      statKeys: params.statKeys,
    },
  );
  if (!fetched.ok) return fetched;
  const buildId = fetched.value.buildId as string;
  return { ok: true, value: { buildId, data: fetched.value } };
}

interface ModifyParams {
  resolvedBuildId: string;
  operations: unknown;
  sections: string | undefined;
  statKeys: string | undefined;
  recoveryXml: string | undefined;
  modSourcesArray: string[] | undefined;
  modSourcesLimit: number | undefined;
  nearbyCategoriesArray: string[] | undefined;
}

/**
 * Step 2: modify a build via pob-server /modify. operations must already be
 * validated as present (non-undefined/null) by the caller.
 */
async function runModifyMode(
  pobUrl: string,
  env: Env,
  params: ModifyParams,
): Promise<ReferenceResult> {
  // Pre-launch breaking change: operations must be a real JSON array.
  // Stringified-JSON arrays (the old shape) and non-array values are
  // rejected with a guiding error rather than silently parsed — see the
  // epic anti-pattern "NO backwards-compat for stringified-JSON
  // operations". The MCP manifest declares the array shape; clients that
  // send anything else are out of contract.
  if (!Array.isArray(params.operations)) {
    return textError(
      'Error: operations must be a JSON array (e.g. [{"op":"set_level","level":95}]). Pass it as a real array, not a JSON-encoded string.',
    );
  }
  if (params.operations.length === 0) {
    return textError("Error: operations must be a non-empty array.");
  }

  const modifyBody: Record<string, unknown> = {
    buildId: params.resolvedBuildId,
    operations: params.operations,
  };
  if (params.modSourcesArray !== undefined) {
    modifyBody.modSources = params.modSourcesArray;
    if (params.modSourcesLimit !== undefined) modifyBody.modSourcesLimit = params.modSourcesLimit;
  }
  if (params.nearbyCategoriesArray) modifyBody.nearby_categories = params.nearbyCategoriesArray;

  const fetched = await pobFetchResult(pobUrl, "/modify", modifyBody, env.POB_API_KEY, "modify", {
    sections: params.sections,
    statKeys: params.statKeys,
    recoveryXml: params.recoveryXml,
  });
  if (!fetched.ok) return fetched.result;
  return { type: "structured", data: fetched.value };
}

/**
 * Re-feed the stored XML snapshot (content-addressed → identical buildId)
 * and return its fresh calc result.
 */
async function refeedAndReturn(
  pobUrl: string,
  env: Env,
  recoveryXml: string,
): Promise<ReferenceResult> {
  let refed: Response;
  try {
    refed = await refeedBuild(pobUrl, recoveryXml, env.POB_API_KEY);
  } catch (error) {
    return unavailableError(error);
  }
  const err = await httpErrorIfNotOk("re-feed", refed);
  if (err) return err;
  const refedResult = await parseJsonRecord("re-feed", refed);
  if (!refedResult.ok) return refedResult.result;
  return { type: "structured", data: refedResult.value };
}

/**
 * Step 3: build_id only, no operations — return the stored summary.
 * Connected-character builds evicted from pob-server's store (404) are
 * transparently re-fed via {@link refeedAndReturn}.
 */
async function fetchStoredSummary(
  pobUrl: string,
  env: Env,
  resolvedBuildId: string,
  sections: string | undefined,
  recoveryXml: string | undefined,
): Promise<ReferenceResult> {
  let response: Response;
  try {
    const headers: Record<string, string> = {};
    if (env.POB_API_KEY) {
      headers.Authorization = `Bearer ${env.POB_API_KEY}`;
    }
    // stat_keys is not passed here — the summary endpoint serves cached
    // data from SQLite, so stat_keys has no effect. It only applies to
    // live calc paths (/calc, /modify, /resolve).
    const summaryUrl = sections
      ? `${pobUrl}/build/${resolvedBuildId}/summary?sections=${encodeURIComponent(sections)}`
      : `${pobUrl}/build/${resolvedBuildId}/summary`;
    response = await fetch(summaryUrl, { headers, signal: AbortSignal.timeout(POB_TIMEOUT_MS) });
  } catch (error) {
    return unavailableError(error);
  }

  if (response.status === 404 && recoveryXml) {
    return refeedAndReturn(pobUrl, env, recoveryXml);
  }

  const err = await httpErrorIfNotOk("lookup", response);
  if (err) return err;
  const summaryResult = await parseJsonRecord("lookup", response);
  if (!summaryResult.ok) return summaryResult.result;
  return { type: "structured", data: summaryResult.value };
}

interface ResolveFlowParams {
  build: string | undefined;
  buildId: string | undefined;
  operations: unknown;
  sections: string | undefined;
  statKeys: string | undefined;
  recoveryXml: string | undefined;
  modSourcesArray: string[] | undefined;
  modSourcesLimit: number | undefined;
  nearbyCategoriesArray: string[] | undefined;
}

/**
 * Steps 1-3 of the non-compare/audit/nearby path: resolve a build URL
 * (Step 1), modify it if operations were given (Step 2), or fall back to
 * the stored summary for a bare build_id (Step 3).
 */
async function runResolveModifySummary(
  pobUrl: string,
  env: Env,
  config: BuildPlannerConfig,
  params: ResolveFlowParams,
): Promise<ReferenceResult> {
  let resolvedBuildId = params.buildId;
  if (params.build) {
    const resolved = await resolveBuildFromUrl(pobUrl, env, {
      build: params.build,
      sections: params.sections,
      statKeys: params.statKeys,
      modSourcesArray: params.modSourcesArray,
      modSourcesLimit: params.modSourcesLimit,
      nearbyCategoriesArray: params.nearbyCategoriesArray,
    });
    if (!resolved.ok) return resolved.result;
    resolvedBuildId = resolved.value.buildId;
    // If no operations, return the resolve result directly.
    if (!params.operations) {
      return { type: "structured", data: resolved.value.data };
    }
  }

  if (params.operations !== undefined && params.operations !== null) {
    if (!resolvedBuildId) {
      return textError(
        "Error: operations require a build to modify. Provide either build (URL) or build_id.",
      );
    }
    return runModifyMode(pobUrl, env, {
      resolvedBuildId,
      operations: params.operations,
      sections: params.sections,
      statKeys: params.statKeys,
      recoveryXml: params.recoveryXml,
      modSourcesArray: params.modSourcesArray,
      modSourcesLimit: params.modSourcesLimit,
      nearbyCategoriesArray: params.nearbyCategoriesArray,
    });
  }

  // Step 3: build_id only, no operations — return stored summary.
  if (!resolvedBuildId) {
    // Unreachable: resolveBuildReference already guarantees build or
    // build_id is present, and the build branch above always assigns a
    // resolved id.
    return missingBuildReferenceError(config);
  }
  return fetchStoredSummary(pobUrl, env, resolvedBuildId, params.sections, params.recoveryXml);
}

function compareParamsFromQuery(
  query: Record<string, unknown>,
  build: string | undefined,
  buildId: string | undefined,
  compareWith: unknown,
  sections: string | undefined,
  statKeys: string | undefined,
  modSourcesArray: string[] | undefined,
  modSourcesLimit: number | undefined,
): CompareParams {
  return {
    build,
    buildId,
    compareWith,
    sections,
    statKeys,
    buySimilar: query.buy_similar as boolean | undefined,
    buySimilarFilters: query.buy_similar_filters,
    league: query.league as string | undefined,
    modSourcesArray,
    modSourcesLimit,
  };
}

function auditParamsFromQuery(
  query: Record<string, unknown>,
  buildId: string | undefined,
  recoveryXml: string | undefined,
  auditCategoriesArray: string[] | undefined,
): AuditParams {
  return {
    buildId,
    recoveryXml,
    auditMetrics: query.audit_metrics as string | undefined,
    auditDeltaStats: query.audit_delta_stats as string | undefined,
    auditBranchLimit: query.audit_branch_limit as number | undefined,
    auditNodeLimit: query.audit_node_limit as number | undefined,
    auditIncludeZero: query.audit_include_zero as string | undefined,
    auditSort: query.audit_sort as string | undefined,
    auditScope: query.audit_scope as string | undefined,
    auditCategoriesArray,
  };
}

function nearbyParamsFromQuery(
  query: Record<string, unknown>,
  buildId: string | undefined,
  recoveryXml: string | undefined,
  nearbyMetrics: string,
  nearbyCategoriesArray: string[] | undefined,
): NearbyParams {
  return {
    buildId,
    recoveryXml,
    nearbyMetrics,
    nearbyRadius: query.nearby_radius as number | undefined,
    nearbyLimit: query.nearby_limit as number | undefined,
    nearbyDeltaStats: query.nearby_delta_stats as string | undefined,
    nearbySort: query.nearby_sort as string | undefined,
    nearbyCategoriesArray,
  };
}

interface ExecuteContext {
  pobUrl: string;
  build: string | undefined;
  buildId: string | undefined;
  recoveryXml: string | undefined;
  modSourcesArray: string[] | undefined;
  modSourcesLimit: number | undefined;
  nearbyCategoriesArray: string[] | undefined;
  auditCategoriesArray: string[] | undefined;
}

/**
 * Front-matter validation shared by every mode: mod_sources, the
 * connected-character/require-build-reference guard, nearby/audit
 * categories, the build URL shape, and POB_URL configuration. Order
 * matches the original inline sequence exactly (each gate must run before
 * the next for its error message to take precedence correctly).
 */
async function prepareExecuteContext(
  query: Record<string, unknown>,
  env: Env,
  config: BuildPlannerConfig,
): Promise<Outcome<ExecuteContext>> {
  const build = query.build as string | undefined;
  const buildIdParameter = query.build_id as string | undefined;
  const character = query.character as string | undefined;
  const userUuid = query.user_id as string | undefined;

  // Validate mod_sources / mod_sources_limit early — keeps the error path
  // off the network and gives the LLM a precise message to act on.
  const modSourcesOutcome = validateModSources(
    query.mod_sources,
    query.mod_sources_limit as number | undefined,
  );
  if (!modSourcesOutcome.ok) return modSourcesOutcome;

  // Connected-character path + require-build-reference guard.
  const buildReferenceOutcome = await resolveBuildReference(
    env,
    config,
    build,
    buildIdParameter,
    character,
    userUuid,
  );
  if (!buildReferenceOutcome.ok) return buildReferenceOutcome;

  // Validate nearby_categories / audit_categories early so the LLM gets a
  // clean error before any pob-server round-trip.
  const nearbyCatOutcome = validateStringArrayParameter(
    query.nearby_categories,
    "nearby_categories",
    '["Keystone","JewelSocket"]',
  );
  if (!nearbyCatOutcome.ok) return nearbyCatOutcome;
  const auditCatOutcome = validateStringArrayParameter(
    query.audit_categories,
    "audit_categories",
    '["Keystone"]',
  );
  if (!auditCatOutcome.ok) return auditCatOutcome;

  if (build && !isURL(build)) {
    return {
      ok: false,
      result: textError(
        "Error: build must be a URL (e.g. https://pobb.in/abc123). Raw base64 build codes are not accepted — ask the player for a link instead.",
      ),
    };
  }

  const pobUrl = env.POB_URL;
  if (!pobUrl) {
    return {
      ok: false,
      result: textError(
        "PoB calc service is not configured. The POB_URL environment variable is not set.",
      ),
    };
  }

  return {
    ok: true,
    value: {
      pobUrl,
      build,
      buildId: buildReferenceOutcome.value.buildId,
      recoveryXml: buildReferenceOutcome.value.recoveryXml,
      modSourcesArray: modSourcesOutcome.value.modSourcesArray,
      modSourcesLimit: modSourcesOutcome.value.modSourcesLimit,
      nearbyCategoriesArray: nearbyCatOutcome.value,
      auditCategoriesArray: auditCatOutcome.value,
    },
  };
}

/**
 * Build the shared build_planner `execute` function for a given game
 * configuration. Per-game modules provide their own id/name/description/
 * parameters and wire this in as `execute`.
 */
export function createBuildPlannerExecute(
  config: BuildPlannerConfig,
): NativeReferenceModule["execute"] {
  return async function execute(
    query: Record<string, unknown>,
    env: Env,
  ): Promise<ReferenceResult> {
    const context = await prepareExecuteContext(query, env, config);
    if (!context.ok) return context.result;
    const {
      pobUrl,
      build,
      buildId,
      recoveryXml,
      modSourcesArray,
      modSourcesLimit,
      nearbyCategoriesArray,
      auditCategoriesArray,
    } = context.value;

    const operations = query.operations;
    const sections = query.sections as string | undefined;
    const statKeys = query.stat_keys as string | undefined;
    const compareWith = query.compare_with;
    const auditAllocated = query.audit_allocated as string | undefined;
    const nearbyMetrics = query.nearby_metrics as string | undefined;

    // Compare mode takes precedence over modify/nearby/audit/resolve.
    if (compareWith !== undefined && compareWith !== null) {
      return runCompareMode(
        pobUrl,
        env,
        config,
        compareParamsFromQuery(
          query,
          build,
          buildId,
          compareWith,
          sections,
          statKeys,
          modSourcesArray,
          modSourcesLimit,
        ),
      );
    }

    // Audit mode: checked before nearby/operations/resolve to short-circuit cleanly.
    if (auditAllocated) {
      return runAuditMode(
        pobUrl,
        env,
        auditParamsFromQuery(query, buildId, recoveryXml, auditCategoriesArray),
      );
    }

    if (nearbyMetrics) {
      return runNearbyMode(
        pobUrl,
        env,
        nearbyParamsFromQuery(query, buildId, recoveryXml, nearbyMetrics, nearbyCategoriesArray),
      );
    }

    return runResolveModifySummary(pobUrl, env, config, {
      build,
      buildId,
      operations,
      sections,
      statKeys,
      recoveryXml,
      modSourcesArray,
      modSourcesLimit,
      nearbyCategoriesArray,
    });
  };
}
