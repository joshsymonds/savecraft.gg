/**
 * Fetches real API responses from Blizzard + Raider.io and saves them as test fixtures.
 *
 * Usage:
 *   BATTLENET_CLIENT_ID=xxx BATTLENET_CLIENT_SECRET=yyy npx tsx fetch-fixtures.ts <name> <realm> <region>
 *
 * Example:
 *   BATTLENET_CLIENT_ID=xxx BATTLENET_CLIENT_SECRET=yyy npx tsx fetch-fixtures.ts Dratnos tichondrius us
 */

const [name, realm, region] = process.argv.slice(2);
if (!name || !realm || !region) {
  console.error(
    "Usage: npx tsx fetch-fixtures.ts <name> <realm-slug> <region>",
  );
  process.exit(1);
}

const clientId = process.env["BATTLENET_CLIENT_ID"];
const clientSecret = process.env["BATTLENET_CLIENT_SECRET"];
if (!clientId || !clientSecret) {
  console.error(
    "Set BATTLENET_CLIENT_ID and BATTLENET_CLIENT_SECRET env vars",
  );
  process.exit(1);
}

const outDir = new URL("./testdata/", import.meta.url);

async function getAppToken(): Promise<string> {
  const res = await fetch("https://oauth.battle.net/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId!,
      client_secret: clientSecret!,
    }),
  });
  if (!res.ok) throw new Error(`Token request failed: ${res.status}`);
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

async function fetchAndSave(
  label: string,
  url: string,
  filename: string,
  headers: Record<string, string> = {},
): Promise<void> {
  const res = await fetch(url, { headers });
  if (!res.ok) {
    console.error(`  ${label}: HTTP ${res.status} — skipped`);
    return;
  }
  const data = await res.json();
  const path = new URL(filename, outDir);
  const { writeFile, mkdir } = await import("node:fs/promises");
  await mkdir(outDir, { recursive: true });
  await writeFile(path, JSON.stringify(data, null, 4) + "\n");
  console.log(`  ${label}: saved ${filename}`);
}

async function main() {
  console.log(
    `Fetching fixtures for ${name} on ${realm} (${region.toUpperCase()})...\n`,
  );

  // Blizzard API
  const token = await getAppToken();
  console.log("Got Blizzard app token.\n");

  const base = `https://${region}.api.blizzard.com`;
  const ns = `namespace=profile-${region}`;
  const charPath = `profile/wow/character/${realm.toLowerCase()}/${name.toLowerCase()}`;
  const auth = { Authorization: `Bearer ${token}` };

  const blizzardEndpoints: [string, string, string][] = [
    ["Profile", `${base}/${charPath}?${ns}&locale=en_US`, "blizzard-profile.json"],
    ["Equipment", `${base}/${charPath}/equipment?${ns}&locale=en_US`, "blizzard-equipment.json"],
    ["Statistics", `${base}/${charPath}/statistics?${ns}&locale=en_US`, "blizzard-statistics.json"],
    ["Specializations", `${base}/${charPath}/specializations?${ns}&locale=en_US`, "blizzard-specializations.json"],
    ["Mythic Keystone", `${base}/${charPath}/mythic-keystone-profile?${ns}&locale=en_US`, "blizzard-mythic-keystone.json"],
    ["Raids", `${base}/${charPath}/encounters/raids?${ns}&locale=en_US`, "blizzard-raids.json"],
    ["Professions", `${base}/${charPath}/professions?${ns}&locale=en_US`, "blizzard-professions.json"],
  ];

  console.log("Blizzard API:");
  for (const [label, url, filename] of blizzardEndpoints) {
    await fetchAndSave(label, url, filename, auth);
  }

  // Raider.io (no auth needed)
  const rioFields = [
    "mythic_plus_scores_by_season:current",
    "mythic_plus_best_runs",
    "mythic_plus_recent_runs",
    "raid_progression",
    "gear",
  ].join(",");
  const rioUrl = `https://raider.io/api/v1/characters/profile?region=${region}&realm=${realm}&name=${name}&fields=${rioFields}`;

  console.log("\nRaider.io:");
  await fetchAndSave("Profile", rioUrl, "raiderio-profile.json");

  console.log("\nDone.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
