/**
 * Side-effect import: registers all MTGA native reference modules.
 * Import this file from the Worker entrypoint to activate the modules.
 */

import { registerNativeModule } from "../../../worker/src/reference/registry";
import { cardSearchModule } from "./card-search";
import { rulesSearchModule } from "./rules-search";

registerNativeModule("mtga", rulesSearchModule);
registerNativeModule("mtga", cardSearchModule);
