/**
 * Cron job dispatcher.
 *
 * Maps cron pattern strings (from wrangler.toml) to job functions.
 * The Worker's scheduled() handler delegates to this dispatcher.
 */

import type { Env } from "../types";

import { refreshAdapterSources } from "./adapter-refresh";
import { reapOrphanSources } from "./reap-orphans";

type JobFn = (env: Env) => Promise<unknown>;

const JOBS: Record<string, JobFn> = {
  "*/15 * * * *": refreshAdapterSources,
  "0 4 * * *": reapOrphanSources,
};

export async function dispatch(cron: string, env: Env): Promise<void> {
  const job = JOBS[cron];
  if (!job) {
    throw new Error(`No job registered for cron pattern: ${cron}`);
  }
  await job(env);
}
