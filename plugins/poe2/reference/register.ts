/**
 * Side-effect import: registers all PoE2 native reference modules.
 * Import this file from the Worker entrypoint to activate the modules.
 */

import { registerNativeModule } from "../../../worker/src/reference/registry";
import { economyModule } from "./economy";
import { passiveTreeModule } from "./passive-tree";

registerNativeModule("poe2", economyModule);
registerNativeModule("poe2", passiveTreeModule);
