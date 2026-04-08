/**
 * Side-effect import: registers all WoW native reference modules.
 * Import this file from the Worker entrypoint to activate the modules.
 */

import { registerNativeModule } from "../../../worker/src/reference/registry";
import { abilityLookupModule } from "./ability-lookup";
import { dungeonGuideModule } from "./dungeon-guide";
import { seasonInfoModule } from "./season-info";

registerNativeModule("wow", abilityLookupModule);
registerNativeModule("wow", dungeonGuideModule);
registerNativeModule("wow", seasonInfoModule);
