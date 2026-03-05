import { linkSource } from "$lib/api/client";
import type { Readable } from "svelte/store";
import { writable } from "svelte/store";

import { pendingLinkCode } from "./link-code";

export type LinkState = "idle" | "linking" | "success" | "error";

const stateStore = writable<LinkState>("idle");
const errorStore = writable("");
const sourceIdStore = writable<string | null>(null);
const codeStore = writable("");

export const linkState: Readable<LinkState> = stateStore;
export const linkError: Readable<string> = errorStore;
export const linkedSourceId: Readable<string | null> = sourceIdStore;
export const linkCode: Readable<string> = codeStore;

function hasStatus(err: unknown): err is { status: number } {
  return typeof err === "object" && err !== null && "status" in err;
}

// Generation counter — incremented on each submit/cancel to ignore stale results
let generation = 0;

export async function submitLinkCode(code: string): Promise<void> {
  const gen = ++generation;
  codeStore.set(code);
  stateStore.set("linking");
  errorStore.set("");
  pendingLinkCode.set(null);

  try {
    const result = await linkSource(code);
    if (gen !== generation) return;
    sourceIdStore.set(result.source_uuid);
    stateStore.set("success");
    // Auto-reset after 5 s so linkedSourceId and success state don't persist
    setTimeout(() => {
      if (gen === generation) resetLinkFlow();
    }, 5000);
  } catch (err: unknown) {
    if (gen !== generation) return;
    if (hasStatus(err) && err.status === 400) {
      errorStore.set("Invalid code \u2014 check and try again");
    } else if (hasStatus(err) && err.status === 404) {
      errorStore.set("Code expired \u2014 generate a new one");
    } else {
      errorStore.set("Network error \u2014 check your connection");
    }
    stateStore.set("error");
  }
}

export function cancelLink(): void {
  generation++;
  stateStore.set("idle");
  errorStore.set("");
  codeStore.set("");
}

export function dismissLinkError(): void {
  stateStore.set("idle");
  errorStore.set("");
}

export function resetLinkFlow(): void {
  stateStore.set("idle");
  errorStore.set("");
  sourceIdStore.set(null);
  codeStore.set("");
}
