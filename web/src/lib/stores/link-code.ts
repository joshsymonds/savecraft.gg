import { browser } from "$app/environment";

const STORAGE_KEY = "savecraft:linkCode";

/** Write a pending link code to localStorage (survives cross-tab auth flows like magic links). */
export function setPendingLinkCode(code: string): void {
  if (browser) localStorage.setItem(STORAGE_KEY, code);
}

/**
 * Read the pending link code without consuming it.
 * Used by the sign-in page to show a reassuring banner.
 */
export function peekPendingLinkCode(): string | null {
  if (!browser) return null;
  return localStorage.getItem(STORAGE_KEY);
}

/**
 * Read and consume the pending link code.
 * Returns null if no code is pending. Clears the value so it's only consumed once.
 */
export function consumePendingLinkCode(): string | null {
  if (!browser) return null;
  const code = localStorage.getItem(STORAGE_KEY);
  if (code) localStorage.removeItem(STORAGE_KEY);
  return code;
}
