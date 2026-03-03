import { type ApiSave, fetchSaves } from "$lib/api/client";
import { gameDisplayName } from "$lib/stores/plugins";
import type { Save } from "$lib/types/save";
import { relativeTime } from "$lib/utils/time";
import { type Readable, writable } from "svelte/store";

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
