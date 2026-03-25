/**
 * Side-effect import: registers all MTGA native reference modules.
 * Import this file from the Worker entrypoint to activate the modules.
 */

import { registerNativeModule } from "../../../worker/src/reference/registry";
import { cardSearchModule } from "./card-search";
import { cardStatsModule } from "./card-stats";
import { collectionDiffModule } from "./collection-diff";
import { deckbuildingModule } from "./deckbuilding";
import { draftAdvisorModule } from "./draft-advisor";
import { manaBaseModule } from "./mana-base";
import { rulesSearchModule } from "./rules-search";

registerNativeModule("mtga", rulesSearchModule);
registerNativeModule("mtga", cardSearchModule);
registerNativeModule("mtga", cardStatsModule);
registerNativeModule("mtga", collectionDiffModule);
registerNativeModule("mtga", deckbuildingModule);
registerNativeModule("mtga", draftAdvisorModule);
registerNativeModule("mtga", manaBaseModule);
