import { dispatchToActivity } from "$lib/stores/activity";
import { setDiscoveredGames } from "$lib/stores/discovery";
import { dispatchToSources } from "$lib/stores/sources";
import { setTestPathResult } from "$lib/stores/testpath";
import type { WireMessage } from "$lib/types/wire";

export function handleMessage(data: string): void {
  let msg: WireMessage;
  try {
    msg = JSON.parse(data) as WireMessage;
  } catch {
    return;
  }

  if (msg.testPathResult) {
    setTestPathResult(msg.testPathResult);
  }

  if (msg.gamesDiscovered) {
    setDiscoveredGames(msg.gamesDiscovered);
  }

  dispatchToSources(msg);
  dispatchToActivity(msg);
}
