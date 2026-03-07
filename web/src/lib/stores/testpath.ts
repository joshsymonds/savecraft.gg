import type { TestPathResult } from "$lib/proto/savecraft/v1/protocol";
import { type Readable, writable } from "svelte/store";

const { subscribe, set } = writable<TestPathResult | null>(null);

export const testPathResult: Readable<TestPathResult | null> = { subscribe };

export function setTestPathResult(result: TestPathResult): void {
  set(result);
}

export function clearTestPathResult(): void {
  set(null);
}
