/**
 * Static registry of API adapters.
 *
 * Each adapter is imported at build time from its plugin directory.
 * Adding a new API plugin = one new directory under plugins/ + one import here.
 */

import { poe2Adapter } from "../../../plugins/poe2/adapter";
import { poeAdapter } from "../../../plugins/poe/adapter";
import { wowAdapter } from "../../../plugins/wow/adapter";

import type { ApiAdapter } from "./adapter";

export const adapters: Record<string, ApiAdapter> = {
  poe: poeAdapter,
  poe2: poe2Adapter,
  wow: wowAdapter,
};
