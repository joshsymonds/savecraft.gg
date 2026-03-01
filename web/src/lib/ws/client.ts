import { PUBLIC_API_URL } from "$env/static/public";
import { getToken } from "$lib/auth/clerk";
import { writable } from "svelte/store";

export type ConnectionStatus = "disconnected" | "connecting" | "reconnecting" | "connected";

export const connectionStatus = writable<ConnectionStatus>("disconnected");

type MessageHandler = (data: string) => void;

let ws: WebSocket | null = null;
let handler: MessageHandler | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
const INITIAL_DELAY = 100;
const MAX_DELAY = 15_000;
let reconnectDelay = INITIAL_DELAY;
let intentionalClose = false;
let hasFailedOnce = false;

// eslint-disable-next-line no-console
const log = console.log.bind(console, "[ws]");
// eslint-disable-next-line no-console
const warn = console.warn.bind(console, "[ws]");
// eslint-disable-next-line no-console
const err = console.error.bind(console, "[ws]");

function wsUrl(): string {
  return `${PUBLIC_API_URL.replace(/^http/, "ws")}/ws/ui`;
}

function scheduleReconnect(): void {
  if (intentionalClose) return;
  connectionStatus.set("reconnecting");
  log("scheduling reconnect in", reconnectDelay, "ms");
  reconnectTimer = setTimeout(() => {
    reconnectDelay = Math.min(reconnectDelay * 2, MAX_DELAY);
    void doConnect();
  }, reconnectDelay);
}

async function doConnect(): Promise<void> {
  if (intentionalClose) return;

  log("doConnect: fetching token…");
  const token = await getToken();
  if (!token) {
    warn("doConnect: no token — will retry");
    scheduleReconnect();
    return;
  }
  log("doConnect: got token, hasFailedOnce =", hasFailedOnce);

  // Only show "connecting" on the initial attempt; stay "reconnecting" on retries
  if (!hasFailedOnce) {
    connectionStatus.set("connecting");
  }

  const url = wsUrl();
  log("opening WebSocket to", url);

  // Pass JWT via Sec-WebSocket-Protocol header (not URL query param)
  // to avoid token exposure in access logs and browser history.
  const socket = new WebSocket(url, [`access_token.${token}`]);
  ws = socket;

  socket.addEventListener("open", () => {
    log("open");
    connectionStatus.set("connected");
    reconnectDelay = INITIAL_DELAY;
    hasFailedOnce = false;
  });

  socket.addEventListener("message", (event: MessageEvent) => {
    if (handler && typeof event.data === "string") {
      handler(event.data);
    }
  });

  socket.addEventListener("close", (event: CloseEvent) => {
    log("close: code =", event.code, "reason =", event.reason, "wasClean =", event.wasClean);
    hasFailedOnce = true;
    ws = null;
    scheduleReconnect();
  });

  socket.addEventListener("error", (event) => {
    err("error:", event);
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
  hasFailedOnce = false;
  log("tab visible — reconnecting immediately");
  void doConnect();
}

export function connect(onMessage: MessageHandler): void {
  log("connect() called");
  handler = onMessage;
  intentionalClose = false;
  hasFailedOnce = false;
  document.addEventListener("visibilitychange", handleVisibilityChange);
  void doConnect();
}

export function disconnect(): void {
  log("disconnect() called");
  intentionalClose = true;
  handler = null;
  document.removeEventListener("visibilitychange", handleVisibilityChange);
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
