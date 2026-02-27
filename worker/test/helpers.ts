import { env, SELF } from "cloudflare:test";

/** D1 tables in FK-safe deletion order (children before parents). */
export const CLEANUP_TABLES = [
  "search_index",
  "notes",
  "device_configs",
  "device_events",
  "saves",
] as const;

/**
 * Clean all shared state (D1 + R2) between tests.
 * Delete order: children before parents (FK-safe).
 */
export async function cleanAll(): Promise<void> {
  for (const table of CLEANUP_TABLES) {
    await env.DB.prepare(`DELETE FROM ${table}`).run();
  }
  for (const bucket of [env.SAVES, env.PLUGINS]) {
    const listed = await bucket.list();
    for (const object of listed.objects) {
      await bucket.delete(object.key);
    }
  }
}

/**
 * Connect a WebSocket through the Worker routes.
 * Returns the client-side WebSocket after accepting.
 */
export async function connectWs(path: string, userUuid: string): Promise<WebSocket> {
  const resp = await SELF.fetch(`https://test-host${path}`, {
    headers: {
      Upgrade: "websocket",
      Authorization: `Bearer ${userUuid}`,
    },
  });

  const ws = resp.webSocket;
  if (!ws) {
    throw new Error(
      `WebSocket upgrade failed for ${path}: ${String(resp.status)} ${resp.statusText}`,
    );
  }
  ws.accept();
  return ws;
}

/**
 * Wait for the next message on a WebSocket.
 * Returns the parsed JSON message, or rejects on timeout.
 */
export function waitForMessage<T = unknown>(ws: WebSocket, timeoutMs = 2000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timed out waiting for WebSocket message after ${String(timeoutMs)}ms`));
    }, timeoutMs);

    ws.addEventListener(
      "message",
      (event) => {
        clearTimeout(timer);
        try {
          resolve(JSON.parse(event.data as string) as T);
        } catch {
          reject(new Error(`Failed to parse WebSocket message: ${String(event.data)}`));
        }
      },
      { once: true },
    );
  });
}
