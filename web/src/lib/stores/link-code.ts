import { writable } from "svelte/store";

export const pendingLinkCode = writable<string | null>(null);
