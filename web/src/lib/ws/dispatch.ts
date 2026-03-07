import { dispatchToActivity } from "$lib/stores/activity";
import { dispatchToSources } from "$lib/stores/sources";
import { setTestPathResult } from "$lib/stores/testpath";
import { RelayedMessage } from "$lib/proto/savecraft/v1/protocol";

export function handleMessage(data: ArrayBuffer): void {
  let relayed: ReturnType<typeof RelayedMessage.decode>;
  try {
    relayed = RelayedMessage.decode(new Uint8Array(data));
  } catch {
    return;
  }

  const sourceId = relayed.sourceId;
  const serverTimestamp = relayed.serverTimestamp;
  const message = relayed.message;

  if (message?.payload?.$case === "testPathResult") {
    setTestPathResult(message.payload.testPathResult);
  }

  dispatchToSources(sourceId, message);
  dispatchToActivity(serverTimestamp, message);
}
