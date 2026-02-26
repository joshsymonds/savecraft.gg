import { SELF } from "cloudflare:test";

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
