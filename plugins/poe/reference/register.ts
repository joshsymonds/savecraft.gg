/**
 * Side-effect import: registers all PoE native reference modules.
 * Import this file from the Worker entrypoint to activate the modules.
 */

import { registerNativeModule } from "../../../worker/src/reference/registry";
import { pobCalcModule } from "./pob-calc";

registerNativeModule("poe", pobCalcModule);
