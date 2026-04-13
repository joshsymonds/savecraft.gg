/**
 * Side-effect import: registers all MTG native reference modules.
 * Import this file from the Worker entrypoint to activate the modules.
 */

import { registerNativeModule } from "../../../worker/src/reference/registry";
import { cardSearchModule } from "./card-search";
import { cardStatsModule } from "./card-stats";
import { collectionDiffModule } from "./collection-diff";
import { commanderDeckReviewModule } from "./commander-deck-review";
import { commanderLookupModule } from "./commander-lookup";
import { commanderTrendsModule } from "./commander-trends";
import { comboSearchModule } from "./combo-search";
import { deckbuildingModule } from "./deckbuilding";
import { draftAdvisorModule } from "./draft-advisor";
import { matchStatsModule } from "./match-stats";
import { rulesSearchModule } from "./rules-search";
import { playAdvisorModule } from "./play-advisor";
import { sideboardAnalysisModule } from "./sideboard-analysis";

registerNativeModule("magic", rulesSearchModule);
registerNativeModule("magic", cardSearchModule);
registerNativeModule("magic", cardStatsModule);
registerNativeModule("magic", collectionDiffModule);
registerNativeModule("magic", commanderDeckReviewModule);
registerNativeModule("magic", commanderLookupModule);
registerNativeModule("magic", commanderTrendsModule);
registerNativeModule("magic", comboSearchModule);
registerNativeModule("magic", deckbuildingModule);
registerNativeModule("magic", draftAdvisorModule);
registerNativeModule("magic", matchStatsModule);
registerNativeModule("magic", playAdvisorModule);
registerNativeModule("magic", sideboardAnalysisModule);
