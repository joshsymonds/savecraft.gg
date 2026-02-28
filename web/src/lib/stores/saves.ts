import { type ApiSave, fetchSaves } from "$lib/api/client";
import { gameDisplayName } from "$lib/stores/plugins";
import type { Save } from "$lib/types/save";
import { type Readable, writable } from "svelte/store";

function relativeTime(isoString: string): string {
  const seconds = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${String(minutes)}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${String(hours)}h ago`;
  const days = Math.floor(hours / 24);
  return `${String(days)}d ago`;
}

function toSave(row: ApiSave): Save {
  return {
    id: row.id,
    gameId: row.game_id,
    gameName: gameDisplayName(row.game_id),
    saveName: row.save_name,
    summary: row.summary,
    lastUpdated: relativeTime(row.last_updated),
  };
}

const { subscribe, set } = writable<Save[]>([]);

export const saves: Readable<Save[]> = { subscribe };
export const savesLoading = writable(false);
export const savesError = writable<string | null>(null);

export async function loadSaves(): Promise<void> {
  savesLoading.set(true);
  savesError.set(null);
  try {
    const rows = await fetchSaves();
    set(rows.map((row) => toSave(row)));
  } catch (error) {
    savesError.set(error instanceof Error ? error.message : "Failed to load saves");
  } finally {
    savesLoading.set(false);
  }
}
