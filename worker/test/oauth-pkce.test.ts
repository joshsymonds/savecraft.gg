import { describe, expect, it } from "vitest";

import { generatePkcePair, pkceChallengeS256 } from "../src/oauth-pkce";

describe("PKCE S256", () => {
  // RFC 7636 Appendix B test vector.
  it("derives the RFC 7636 challenge from the reference verifier", async () => {
    const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
    const challenge = await pkceChallengeS256(verifier);
    expect(challenge).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });

  it("challenge is base64url (no +, /, or = padding)", async () => {
    const challenge = await pkceChallengeS256("some-verifier-value-1234567890");
    expect(challenge).not.toMatch(/[+/=]/);
  });

  it("generatePkcePair yields a verifier and its matching S256 challenge", async () => {
    const pair = await generatePkcePair();
    // RFC 7636: 43–128 chars, unreserved alphabet only.
    expect(pair.verifier.length).toBeGreaterThanOrEqual(43);
    expect(pair.verifier.length).toBeLessThanOrEqual(128);
    expect(pair.verifier).toMatch(/^[A-Za-z0-9\-._~]+$/);
    expect(pair.challenge).toBe(await pkceChallengeS256(pair.verifier));
  });

  it("generatePkcePair is non-deterministic", async () => {
    const a = await generatePkcePair();
    const b = await generatePkcePair();
    expect(a.verifier).not.toBe(b.verifier);
  });
});
