// Shared attribution presets for game publishers and data providers.
//
// Each key is a source ID referenced from plugin.toml [attribution] blocks.
// Views render these as a collapsed legal footer.

export interface Attribution {
  name: string;
  disclaimer: string;
  url: string;
}

export const SOURCES: Record<string, Attribution> = {
  wotc: {
    name: "Wizards of the Coast",
    disclaimer:
      "Savecraft is unofficial Fan Content permitted under the Fan Content Policy. Not approved/endorsed by Wizards. Portions of the materials used are property of Wizards of the Coast. \u00a9Wizards of the Coast LLC.",
    url: "https://company.wizards.com/en/legal/fancontentpolicy",
  },
  scryfall: {
    name: "Scryfall",
    disclaimer:
      "Not produced by, endorsed by, supported by, or affiliated with Scryfall, LLC.",
    url: "https://scryfall.com/docs/api",
  },
  "17lands": {
    name: "17Lands",
    disclaimer:
      "Not produced by, endorsed by, supported by, or affiliated with 17Lands, LLC. \u00a9 17Lands, LLC.",
    url: "https://www.17lands.com",
  },
  blizzard: {
    name: "Blizzard Entertainment",
    disclaimer:
      "Blizzard Entertainment\u00ae and related trademarks are trademarks or registered trademarks of Blizzard Entertainment, Inc. in the U.S. and/or other countries. This tool is in no way associated with or endorsed by Blizzard Entertainment\u00ae.",
    url: "https://www.blizzard.com/en-us/legal/c1ae32ac-7ff9-4ac3-a03b-fc04b8697010/blizzard-legal-faq",
  },
  raiderio: {
    name: "Raider.IO",
    disclaimer:
      "Raider.IO\u00ae and IO Score\u00ae are registered trademarks of RaiderIO, Inc. Not produced by, endorsed by, supported by, or affiliated with RaiderIO, Inc.",
    url: "https://raider.io",
  },
  ludeon: {
    name: "Ludeon Studios",
    disclaimer:
      "Portions of the materials used to create this content are trademarks and/or copyrighted works of Ludeon Studios Inc. All rights reserved by Ludeon. This content is not official and is not endorsed by Ludeon.",
    url: "https://rimworldgame.com/eula/",
  },
  concernedape: {
    name: "ConcernedApe",
    disclaimer:
      "ConcernedApe\u2122, Stardew Valley\u00ae are trademarks of ConcernedApe LLC. Not affiliated with or endorsed by ConcernedApe.",
    url: "https://www.stardewvalley.net/terms/",
  },
  kepler: {
    name: "Kepler Interactive",
    disclaimer:
      "Clair Obscur: Expedition 33 is a trademark of Sandfall Interactive. Published by Kepler Interactive. Not affiliated with or endorsed by Sandfall Interactive or Kepler Interactive.",
    url: "https://www.keplerinteractive.com",
  },
  wube: {
    name: "Wube Software",
    disclaimer:
      "Factorio is a trademark of Wube Software Ltd. Not affiliated with or endorsed by Wube Software.",
    url: "https://www.factorio.com",
  },
};

/**
 * Resolve source keys to full attribution entries.
 * Throws if any key is not in the presets registry.
 */
export function resolveAttribution(keys: string[]): Attribution[] {
  return keys.map((key) => {
    const source = SOURCES[key];
    if (!source) {
      throw new Error(
        `Unknown attribution source "${key}". Valid keys: ${Object.keys(SOURCES).join(", ")}`,
      );
    }
    return source;
  });
}
