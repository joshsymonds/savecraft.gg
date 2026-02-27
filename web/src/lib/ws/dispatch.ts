import { dispatchToActivity } from "$lib/stores/activity";
import { dispatchToDevices } from "$lib/stores/devices";
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

  dispatchToDevices(msg);
  dispatchToActivity(msg);
}
