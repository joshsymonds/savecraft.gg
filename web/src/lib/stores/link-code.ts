import { browser } from "$app/environment";

const STORAGE_KEY = "savecraft:linkCode";

/** Write a pending link code to sessionStorage (survives auth redirects). */
export function setPendingLinkCode(code: string): void {
  if (browser) sessionStorage.setItem(STORAGE_KEY, code);
}

/**
 * Read the pending link code without consuming it.
 * Used by the sign-in page to show a reassuring banner.
 */
export function peekPendingLinkCode(): string | null {
  if (!browser) return null;
  return sessionStorage.getItem(STORAGE_KEY);
}

/**
 * Read and consume the pending link code from sessionStorage.
 * Returns null if no code is pending. Clears the value so it's only consumed once.
 */
export function consumePendingLinkCode(): string | null {
  if (!browser) return null;
  const code = sessionStorage.getItem(STORAGE_KEY);
  if (code) sessionStorage.removeItem(STORAGE_KEY);
  return code;
}
