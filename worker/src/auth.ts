/**
 * Authentication layer. Provides a uniform interface for extracting
 * user identity from requests. Two implementations:
 *
 * - Stub: Bearer token IS the user UUID (development/testing)
 * - Clerk: JWT validation against Clerk's public keys (production)
 *
 * The active implementation is selected by the CLERK_ISSUER env var.
 * If set, Clerk JWT validation is used. Otherwise, stub auth.
 */
import type { Env } from "./types";

export interface AuthResult {
  userUuid: string;
}

/**
 * Extract user identity from the request.
 * Returns null if the request is not authenticated.
 */
export async function authenticate(request: Request, env: Env): Promise<AuthResult | null> {
  const auth = request.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return null;

  const token = auth.slice(7);
  if (!token) return null;

  // Production: validate Clerk JWT
  if (env.CLERK_ISSUER) {
    return validateClerkJwt(token, env);
  }

  // Development: bearer token IS the user UUID
  return { userUuid: token };
}

/**
 * Validate a Clerk-issued JWT and extract the user UUID.
 * Uses Clerk's JWKS endpoint to verify the signature.
 *
 * The JWT `sub` claim maps to the Clerk user ID.
 * The Savecraft user UUID is stored in Clerk's publicMetadata.
 * For now, we use the Clerk user ID directly as the user UUID.
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
    if (payload.iss !== env.CLERK_ISSUER) return null;

    // Validate expiration
    if (payload.exp && payload.exp < Date.now() / 1000) return null;

    // Validate signature using Clerk's JWKS
    if (!header.kid) return null;
    const jwk = await fetchClerkJwk(env.CLERK_ISSUER, header.kid);
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
