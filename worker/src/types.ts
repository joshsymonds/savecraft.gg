export interface Env {
  DB: D1Database;
  SNAPSHOTS: R2Bucket;
  DAEMON_HUB: DurableObjectNamespace;
  ENVIRONMENT: string;
}
