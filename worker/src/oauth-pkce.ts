/**
 * PKCE (RFC 7636) helpers for OAuth providers that require it (GGG).
 *
 * S256 only — `code_challenge = BASE64URL(SHA256(ASCII(verifier)))`.
 * Uses Web Crypto, available in the Workers runtime.
 */

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCodePoint(byte);
  }
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

/** Derive the S256 code_challenge for a given code_verifier. */
export async function pkceChallengeS256(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64UrlEncode(new Uint8Array(digest));
}

export interface PkcePair {
  /** The high-entropy code_verifier (kept server-side, never sent on the wire). */
  verifier: string;
  /** The S256 code_challenge (sent on the authorize redirect). */
  challenge: string;
}

/**
 * Generate a fresh PKCE pair. The verifier is base64url of 32 random
 * bytes (~43 chars, within RFC 7636's 43–128 unreserved-charset bound).
 */
export async function generatePkcePair(): Promise<PkcePair> {
  const verifier = base64UrlEncode(crypto.getRandomValues(new Uint8Array(32)));
  const challenge = await pkceChallengeS256(verifier);
  return { verifier, challenge };
}
