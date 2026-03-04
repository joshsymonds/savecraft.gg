/**
 * Authentication layer for non-MCP endpoints:
 *
 * - authenticateSession: Clerk session JWT (web UI routes)
 * - authenticateApiKey: SHA-256 hashed API key lookup in D1 (daemon routes)
 *
 * MCP auth is handled entirely by @cloudflare/workers-oauth-provider
 * (token validation via KV lookup). This module is not involved.
 *
 * All resolve to the same AuthResult { userUuid: string }.
 * When CLERK_ISSUER is unset, stub auth is used (bearer token = user UUID).
 */
import type { Env } from "./types";

export interface AuthResult {
  userUuid: string;
}

export interface DeviceAuthResult {
  deviceUuid: string;
  userUuid: string | null;
}

// -- Stub auth (development/testing) --------------------------------------

/** Stub auth: bearer token IS the user UUID. Used when CLERK_ISSUER is unset. */
function authenticateStub(token: string): AuthResult {
  return { userUuid: token };
}

// -- Session auth (Clerk JWT) ---------------------------------------------

/**
 * Validate a Clerk session JWT and extract the user UUID.
 * Returns null if invalid. Falls back to stub when CLERK_ISSUER is unset.
 */
export async function authenticateSession(request: Request, env: Env): Promise<AuthResult | null> {
  const token = extractToken(request);
  if (!token) return null;

  if (!env.CLERK_ISSUER) return authenticateStub(token);
  return validateClerkJwt(token, env);
}

// -- API key auth (D1 lookup) ---------------------------------------------

/** Authenticate a daemon API key by hashing it and looking up in D1. Returns null if not found. */
export async function authenticateApiKey(
  token: string,
  db: D1Database,
): Promise<AuthResult | null> {
  if (!token) return null;

  const hash = await sha256Hex(token);
  const row = await db
    .prepare("SELECT user_uuid FROM api_keys WHERE key_hash = ?")
    .bind(hash)
    .first<{ user_uuid: string }>();

  if (!row) return null;
  return { userUuid: row.user_uuid };
}

/**
 * Authenticate a daemon request. Uses API key auth when CLERK_ISSUER is set,
 * otherwise falls back to stub auth.
 */
export async function authenticateDaemon(request: Request, env: Env): Promise<AuthResult | null> {
  const token = extractToken(request);
  if (!token) return null;

  if (!env.CLERK_ISSUER) return authenticateStub(token);
  return authenticateApiKey(token, env.DB);
}

// -- Device token auth (D1 lookup) ----------------------------------------

/**
 * Authenticate a device token (`dvt_` prefix) by hashing and looking up in D1.
 * Always does D1 lookup — no stub mode for device tokens.
 * Updates last_push_at on successful auth.
 */
export async function authenticateDevice(
  request: Request,
  env: Env,
): Promise<DeviceAuthResult | null> {
  const token = extractToken(request);
  if (!token) return null;

  const hash = await sha256Hex(token);
  const row = await env.DB
    .prepare("SELECT device_uuid, user_uuid FROM devices WHERE token_hash = ?")
    .bind(hash)
    .first<{ device_uuid: string; user_uuid: string | null }>();

  if (!row) return null;

  // Update last activity timestamp (best-effort, don't fail auth on update error)
  await env.DB
    .prepare("UPDATE devices SET last_push_at = datetime('now') WHERE device_uuid = ?")
    .bind(row.device_uuid)
    .run();

  return { deviceUuid: row.device_uuid, userUuid: row.user_uuid };
}

// -- Helpers --------------------------------------------------------------

export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function extractToken(request: Request): string | undefined {
  const auth = request.headers.get("Authorization");
  if (auth?.startsWith("Bearer ")) {
    return auth.slice(7) || undefined;
  }

  const protocols = request.headers.get("Sec-WebSocket-Protocol");
  if (protocols) {
    const match = protocols
      .split(",")
      .map((s) => s.trim())
      .find((s) => s.startsWith("access_token."));
    if (match) {
      return match.slice("access_token.".length) || undefined;
    }
  }

  return undefined;
}

/**
 * Validate a Clerk-issued JWT and extract the user UUID.
 * Uses Clerk's JWKS endpoint to verify the signature.
 */
async function validateClerkJwt(token: string, env: Env): Promise<AuthResult | null> {
  try {
    const [headerB64, payloadB64] = token.split(".");
    if (!headerB64 || !payloadB64) return null;

    const header = JSON.parse(atob(headerB64)) as { kid?: string; alg?: string };
    const payload = JSON.parse(atob(payloadB64)) as {
      sub?: string;
      iss?: string;
      exp?: number;
      azp?: string;
    };

    // Validate issuer
    const issuer = env.CLERK_ISSUER;
    if (!issuer || payload.iss !== issuer) return null;

    // Validate expiration
    if (payload.exp && payload.exp < Date.now() / 1000) return null;

    // Validate signature using Clerk's JWKS
    if (!header.kid) return null;
    const jwk = await fetchClerkJwk(issuer, header.kid);
    if (!jwk) return null;

    const isValid = await verifyJwtSignature(token, jwk, header.alg ?? "RS256");
    if (!isValid) return null;

    if (!payload.sub) return null;
    return { userUuid: payload.sub };
  } catch {
    return null;
  }
}

/** Fetch a specific JWK from Clerk's JWKS endpoint by key ID. */
async function fetchClerkJwk(issuer: string, kid: string): Promise<JsonWebKey | null> {
  const jwksUrl = `${issuer}/.well-known/jwks.json`;
  const resp = await fetch(jwksUrl);
  if (!resp.ok) return null;

  const jwks = await resp.json<{ keys: (JsonWebKey & { kid: string })[] }>();
  return jwks.keys.find((k) => k.kid === kid) ?? null;
}

/** Verify JWT signature using Web Crypto API. */
async function verifyJwtSignature(token: string, jwk: JsonWebKey, alg: string): Promise<boolean> {
  const parts = token.split(".");
  if (parts.length !== 3) return false;

  const algorithm = algToWebCrypto(alg);
  if (!algorithm) return false;

  const key = await crypto.subtle.importKey("jwk", jwk, algorithm, false, ["verify"]);

  const data = new TextEncoder().encode(`${parts[0] ?? ""}.${parts[1] ?? ""}`);
  const signature = base64UrlDecode(parts[2] ?? "");

  return crypto.subtle.verify(algorithm, key, signature, data);
}

function algToWebCrypto(alg: string): { name: string; hash: string } | null {
  switch (alg) {
    case "RS256": {
      return { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" };
    }
    case "RS384": {
      return { name: "RSASSA-PKCS1-v1_5", hash: "SHA-384" };
    }
    case "RS512": {
      return { name: "RSASSA-PKCS1-v1_5", hash: "SHA-512" };
    }
    default: {
      return null;
    }
  }
}

function base64UrlDecode(input: string): Uint8Array {
  const base64 = input.replaceAll("-", "+").replaceAll("_", "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.codePointAt(index) ?? 0;
  }
  return bytes;
}
