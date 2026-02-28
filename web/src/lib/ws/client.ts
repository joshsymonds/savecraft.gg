import { PUBLIC_API_URL } from "$env/static/public";
import { getToken } from "$lib/auth/clerk";
import { writable } from "svelte/store";

export type ConnectionStatus = "disconnected" | "connecting" | "connected";

export const connectionStatus = writable<ConnectionStatus>("disconnected");

type MessageHandler = (data: string) => void;

let ws: WebSocket | null = null;
let handler: MessageHandler | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectDelay = 1000;
const MAX_DELAY = 30_000;
let intentionalClose = false;

function wsUrl(): string {
  return `${PUBLIC_API_URL.replace(/^http/, "ws")}/ws/ui`;
}

function scheduleReconnect(): void {
  if (intentionalClose) return;
  reconnectTimer = setTimeout(() => {
    reconnectDelay = Math.min(reconnectDelay * 2, MAX_DELAY);
    void doConnect();
  }, reconnectDelay);
}

async function doConnect(): Promise<void> {
  const token = await getToken();
  if (!token || intentionalClose) {
    connectionStatus.set("disconnected");
    return;
  }

  connectionStatus.set("connecting");

  // Pass JWT via Sec-WebSocket-Protocol header (not URL query param)
  // to avoid token exposure in access logs and browser history.
  const socket = new WebSocket(wsUrl(), [`access_token.${token}`]);
  ws = socket;

  socket.addEventListener("open", () => {
    connectionStatus.set("connected");
    reconnectDelay = 1000;
  });

  socket.addEventListener("message", (event: MessageEvent) => {
    if (handler && typeof event.data === "string") {
      handler(event.data);
    }
  });

  socket.addEventListener("close", () => {
    connectionStatus.set("disconnected");
    ws = null;
    scheduleReconnect();
  });

  socket.addEventListener("error", () => {
    socket.close();
  });
}

export function connect(onMessage: MessageHandler): void {
  handler = onMessage;
  intentionalClose = false;
  void doConnect();
}

export function disconnect(): void {
  intentionalClose = true;
  handler = null;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (ws) {
    ws.close();
    ws = null;
  }
  connectionStatus.set("disconnected");
}

export function send(data: string): void {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(data);
  }
}
