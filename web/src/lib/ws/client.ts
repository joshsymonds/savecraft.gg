import { PUBLIC_API_URL } from "$env/static/public";
import { getToken } from "$lib/auth/clerk";
import { writable } from "svelte/store";

export type ConnectionStatus = "disconnected" | "connecting" | "reconnecting" | "connected";

export const connectionStatus = writable<ConnectionStatus>("disconnected");

type MessageHandler = (data: ArrayBuffer) => void;

let ws: WebSocket | null = null;
let handler: MessageHandler | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
const INITIAL_DELAY = 100;
const MAX_DELAY = 15_000;
let reconnectDelay = INITIAL_DELAY;
let intentionalClose = false;
let hasFailedOnce = false;

// Debounce "reconnecting" so brief disconnects (tab switch) are invisible.
// All other statuses update immediately.
const RECONNECTING_DEBOUNCE = 2000;
let statusDebounceTimer: ReturnType<typeof setTimeout> | null = null;

function setStatus(status: ConnectionStatus): void {
  if (statusDebounceTimer) {
    clearTimeout(statusDebounceTimer);
    statusDebounceTimer = null;
  }
  if (status === "reconnecting") {
    statusDebounceTimer = setTimeout(() => {
      connectionStatus.set("reconnecting");
    }, RECONNECTING_DEBOUNCE);
  } else {
    connectionStatus.set(status);
  }
}

function wsUrl(): string {
  return `${PUBLIC_API_URL.replace(/^http/, "ws")}/ws/ui`;
}

function scheduleReconnect(): void {
  if (intentionalClose) return;
  setStatus("reconnecting");
  reconnectTimer = setTimeout(() => {
    reconnectDelay = Math.min(reconnectDelay * 2, MAX_DELAY);
    void doConnect();
  }, reconnectDelay);
}

async function doConnect(): Promise<void> {
  if (intentionalClose) return;

  const token = await getToken();
  if (!token) {
    // Clerk session may be refreshing — retry instead of giving up
    scheduleReconnect();
    return;
  }

  // Only show "connecting" on the initial attempt; stay "reconnecting" on retries
  if (!hasFailedOnce) {
    setStatus("connecting");
  }

  // Pass JWT via Sec-WebSocket-Protocol header (not URL query param)
  // to avoid token exposure in access logs and browser history.
  const socket = new WebSocket(wsUrl(), [`access_token.${token}`]);
  socket.binaryType = "arraybuffer";
  ws = socket;

  socket.addEventListener("open", () => {
    setStatus("connected");
    reconnectDelay = INITIAL_DELAY;
    hasFailedOnce = false;
  });

  socket.addEventListener("message", (event: MessageEvent) => {
    if (handler && event.data instanceof ArrayBuffer) {
      handler(event.data);
    }
  });

  socket.addEventListener("close", () => {
    ws = null;
    if (!intentionalClose) {
      hasFailedOnce = true;
      scheduleReconnect();
    }
  });

  socket.addEventListener("error", () => {
    socket.close();
  });
}

function handleVisibilityChange(): void {
  if (document.visibilityState !== "visible") return;
  if (intentionalClose || !handler) return;
  // Already connected or connecting — nothing to do
  if (ws?.readyState === WebSocket.OPEN || ws?.readyState === WebSocket.CONNECTING) return;
  // Page is visible again — reset backoff and reconnect immediately
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  reconnectDelay = INITIAL_DELAY;
  void doConnect();
}

export function connect(onMessage: MessageHandler): void {
  handler = onMessage;
  intentionalClose = false;
  hasFailedOnce = false;
  document.addEventListener("visibilitychange", handleVisibilityChange);
  void doConnect();
}

export function disconnect(): void {
  intentionalClose = true;
  handler = null;
  document.removeEventListener("visibilitychange", handleVisibilityChange);
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (statusDebounceTimer) {
    clearTimeout(statusDebounceTimer);
    statusDebounceTimer = null;
  }
  if (ws) {
    ws.close();
    ws = null;
  }
  setStatus("disconnected");
}

export function send(data: Uint8Array): void {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(data);
  }
}
