import { browser } from "$app/environment";

const STORAGE_KEY = "savecraft:linkCode";

/** Must match LINK_CODE_TTL_MINUTES in worker/src/hub.ts. */
const CODE_TTL_MS = 20 * 60_000;

interface StoredCode {
  code: string;
  ts: number;
}

function readStored(): StoredCode | null {
  if (!browser) return null;
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "code" in parsed &&
      "ts" in parsed &&
      typeof (parsed as StoredCode).code === "string" &&
      typeof (parsed as StoredCode).ts === "number"
    ) {
      return parsed as StoredCode;
    }
  } catch {
    // Corrupt or old-format entry — discard.
  }
  localStorage.removeItem(STORAGE_KEY);
  return null;
}

function isExpired(stored: StoredCode): boolean {
  return Date.now() - stored.ts > CODE_TTL_MS;
}

/** Write a pending link code to localStorage (survives cross-tab auth flows like magic links). */
export function setPendingLinkCode(code: string): void {
  if (browser) {
    const entry: StoredCode = { code, ts: Date.now() };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entry));
  }
}

/**
 * Read the pending link code without consuming it.
 * Used by the sign-in page to show a reassuring banner.
 * Returns null if no code is pending or the code has expired.
 */
export function peekPendingLinkCode(): string | null {
  const stored = readStored();
  if (!stored || isExpired(stored)) return null;
  return stored.code;
}

/**
 * Read and consume the pending link code.
 * Returns null if no code is pending or the code has expired.
 * Clears the value so it's only consumed once.
 */
export function consumePendingLinkCode(): string | null {
  const stored = readStored();
  if (!stored) return null;
  localStorage.removeItem(STORAGE_KEY);
  if (isExpired(stored)) return null;
  return stored.code;
}
