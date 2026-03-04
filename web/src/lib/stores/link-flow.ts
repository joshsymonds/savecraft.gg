import { linkDevice } from "$lib/api/client";
import type { Readable } from "svelte/store";
import { writable } from "svelte/store";

import { pendingLinkCode } from "./link-code";

export type LinkState = "idle" | "linking" | "success" | "error";

const stateStore = writable<LinkState>("idle");
const errorStore = writable("");
const deviceIdStore = writable<string | null>(null);

export const linkState: Readable<LinkState> = stateStore;
export const linkError: Readable<string> = errorStore;
export const linkedDeviceId: Readable<string | null> = deviceIdStore;

function hasStatus(err: unknown): err is { status: number } {
  return typeof err === "object" && err !== null && "status" in err;
}

export async function submitLinkCode(code: string): Promise<void> {
  stateStore.set("linking");
  errorStore.set("");
  pendingLinkCode.set(null);

  try {
    const result = await linkDevice(code);
    deviceIdStore.set(result.device_uuid);
    stateStore.set("success");
  } catch (err: unknown) {
    if (hasStatus(err) && err.status === 400) {
      errorStore.set("Invalid code \u2014 check and try again");
    } else if (hasStatus(err) && err.status === 404) {
      errorStore.set("Code expired \u2014 generate a new one from the daemon");
    } else {
      errorStore.set("Network error \u2014 check your connection");
    }
    stateStore.set("error");
  }
}

export function dismissLinkError(): void {
  stateStore.set("idle");
  errorStore.set("");
}

export function resetLinkFlow(): void {
  stateStore.set("idle");
  errorStore.set("");
  deviceIdStore.set(null);
}
