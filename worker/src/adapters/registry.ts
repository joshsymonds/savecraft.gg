/**
 * Static registry of API adapters.
 *
 * Each adapter is imported at build time from its plugin directory.
 * Adding a new API plugin = one new directory under plugins/ + one import here.
 */

import { wowAdapter } from "../../../plugins/wow/adapter";

import type { ApiAdapter } from "./adapter";

export const adapters: Record<string, ApiAdapter> = {
  wow: wowAdapter,
};
