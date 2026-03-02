/** All possible activity event types. The activity store filters which ones are displayed. */
export type ActivityEventType =
  | "parse_started"
  | "plugin_status"
  | "parse_completed"
  | "parse_failed"
  | "push_started"
  | "push_completed"
  | "push_failed"
  | "plugin_updated"
  | "daemon_online"
  | "daemon_offline"
  | "watching"
  | "game_detected"
  | "game_not_found"
  | "scan_started"
  | "scan_completed"
  | "games_discovered"
  | "plugin_download_failed";
