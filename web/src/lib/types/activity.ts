/** User-facing activity event types. Internal pipeline events (scan, parse start, plugin status) are filtered out. */
export type ActivityEventType =
  | "parse_completed"
  | "parse_failed"
  | "push_completed"
  | "push_failed"
  | "plugin_updated"
  | "daemon_online"
  | "daemon_offline"
  | "watching"
  | "game_detected"
  | "game_not_found"
  | "games_discovered"
  | "plugin_download_failed";
