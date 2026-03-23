/**
 * Side-effect import: registers all MTGA native reference modules.
 * Import this file from the Worker entrypoint to activate the modules.
 */

import { registerNativeModule } from "../../../worker/src/reference/registry";
import { cardSearchModule } from "./card-search";
import { collectionDiffModule } from "./collection-diff";
import { draftRatingsModule } from "./draft-ratings";
import { manaBaseModule } from "./mana-base";
import { rulesSearchModule } from "./rules-search";

registerNativeModule("mtga", rulesSearchModule);
registerNativeModule("mtga", cardSearchModule);
registerNativeModule("mtga", collectionDiffModule);
registerNativeModule("mtga", draftRatingsModule);
registerNativeModule("mtga", manaBaseModule);
