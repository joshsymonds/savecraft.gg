import type { WireTestPathResult } from "$lib/types/wire";
import { writable, type Readable } from "svelte/store";

const { subscribe, set } = writable<WireTestPathResult | null>(null);

export const testPathResult: Readable<WireTestPathResult | null> = { subscribe };

export function setTestPathResult(result: WireTestPathResult): void {
  set(result);
}

export function clearTestPathResult(): void {
  set(null);
}
