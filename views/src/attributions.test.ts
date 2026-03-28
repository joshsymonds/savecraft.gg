import { resolveAttribution, SOURCES } from "./attributions.js";

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`FAIL: ${msg}`);
    failed++;
  } else {
    passed++;
  }
}

// All 8 source keys exist
assert(Object.keys(SOURCES).length === 8, "expected 8 source keys");

// Every source has required fields
for (const [key, source] of Object.entries(SOURCES)) {
  assert(typeof source.name === "string" && source.name.length > 0, `${key}.name is non-empty string`);
  assert(
    typeof source.disclaimer === "string" && source.disclaimer.length > 0,
    `${key}.disclaimer is non-empty string`,
  );
  assert(typeof source.url === "string" && source.url.startsWith("https://"), `${key}.url is https URL`);
}

// resolveAttribution returns correct entries for valid keys
const result = resolveAttribution(["wotc", "scryfall"]);
assert(result.length === 2, "resolves 2 keys");
assert(result[0].name === "Wizards of the Coast", "first result is WotC");
assert(result[1].name === "Scryfall", "second result is Scryfall");

// resolveAttribution resolves all keys
const all = resolveAttribution(Object.keys(SOURCES));
assert(all.length === 8, "resolves all 8 keys");

// resolveAttribution returns empty array for empty input
assert(resolveAttribution([]).length === 0, "empty input returns empty array");

// resolveAttribution throws on unknown key
try {
  resolveAttribution(["wotc", "bogus"]);
  assert(false, "should have thrown on unknown key");
} catch (e: unknown) {
  assert(e instanceof Error && e.message.includes('Unknown attribution source "bogus"'), "throws with key name");
}

console.log(`\n${String(passed)} passed, ${String(failed)} failed`);
if (failed > 0) process.exit(1);
