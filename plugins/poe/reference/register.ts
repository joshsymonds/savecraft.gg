/**
 * Side-effect import: registers all PoE native reference modules.
 * Import this file from the Worker entrypoint to activate the modules.
 */

import { registerNativeModule } from "../../../worker/src/reference/registry";
import { economyModule } from "./economy";
import { gemSearchModule } from "./gem-search";
import { passiveTreeModule } from "./passive-tree";
import { pobCalcModule } from "./pob-calc";
import { uniqueSearchModule } from "./unique-search";

registerNativeModule("poe", pobCalcModule);
registerNativeModule("poe", gemSearchModule);
registerNativeModule("poe", passiveTreeModule);
registerNativeModule("poe", uniqueSearchModule);
registerNativeModule("poe", economyModule);
