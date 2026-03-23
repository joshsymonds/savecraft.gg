/**
 * Side-effect import: registers the MTGA rules_search native module.
 * Import this file from the Worker entrypoint to activate the module.
 */

import { registerNativeModule } from "../../../worker/src/reference/registry";
import { rulesSearchModule } from "./rules-search";

registerNativeModule("mtga", rulesSearchModule);
