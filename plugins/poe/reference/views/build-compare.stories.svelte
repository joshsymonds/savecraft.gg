<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";
  import BuildCompare from "./build-compare.svelte";
  import treeData from "./tree-data.gen.json";
  const { Story } = defineMeta({ title: "PoE/Views/BuildCompare", tags: ["autodocs"] });

  // ─── Mock builds ───────────────────────────────────────────────────────────
  // Data shape mirrors CompareResponse from cmd/pob-server/compare.go.
  // Stories below mix and match these to exercise the seven scenarios.

  // Pull real allocated-node sets from regions of the bundled tree
  // data so the visual passive-tree overlay panel renders meaningfully.
  // Same spatial-region helper as passive-tree-overlay.stories.svelte —
  // a build's "allocations" land in its class-territory lobe plus the
  // center commons every build pays for.
  function nodeIdsInRegion(minX, maxX, minY, maxY) {
    const ids = [];
    for (const [id, node] of Object.entries(treeData.nodes)) {
      if (node.ascendancy) continue;
      if (node.x < minX || node.x > maxX) continue;
      if (node.y < minY || node.y > maxY) continue;
      ids.push(Number(id));
    }
    return ids;
  }
  const witchTerritory = nodeIdsInRegion(2000, 8000, -8000, -1500);
  const marauderTerritory = nodeIdsInRegion(-8000, -2000, 1500, 8000);
  const rangerTerritory = nodeIdsInRegion(2500, 8000, 1500, 7000);
  const elementalistTerritory = nodeIdsInRegion(2000, 8000, -8000, -3000); // overlaps Witch but slightly tighter
  const centerCommons = nodeIdsInRegion(-1500, 1500, -1500, 1500);

  const witchBuild = {
    id: "witch-01",
    label: "Vaal Spark Occultist",
    character: { class: "Witch", ascendancy: "Occultist", level: 95 },
    summary: {
      CombinedDPS: 1_247_832,
      Life: 4_891,
      EnergyShield: 2_104,
      FireResist: 75,
      ColdResist: 75,
      LightningResist: 76,
      ChaosResist: -30,
      Armour: 1_240,
      Evasion: 0,
    },
    tree: { allocatedNodeIds: [...new Set([...witchTerritory, ...centerCommons])] },
  };

  const elementalistBuild = {
    id: "witch-02",
    label: "Hierophant Arc",
    character: { class: "Witch", ascendancy: "Elementalist", level: 96 },
    summary: {
      CombinedDPS: 1_840_000,
      Life: 5_120,
      EnergyShield: 6_400,
      FireResist: 78,
      ColdResist: 75,
      LightningResist: 75,
      ChaosResist: 18,
      Armour: 980,
      Evasion: 0,
    },
    tree: { allocatedNodeIds: [...new Set([...elementalistTerritory, ...centerCommons])] },
  };

  const marauderBuild = {
    id: "marauder-01",
    label: "Cyclone Berserker",
    character: { class: "Marauder", ascendancy: "Berserker", level: 94 },
    summary: {
      CombinedDPS: 2_500_000,
      Life: 7_200,
      EnergyShield: 0,
      FireResist: 76,
      ColdResist: 75,
      LightningResist: 75,
      ChaosResist: 12,
      Armour: 18_500,
      Evasion: 800,
    },
    tree: { allocatedNodeIds: [...new Set([...marauderTerritory, ...centerCommons])] },
  };

  const rangerBuild = {
    id: "ranger-01",
    label: "Lightning Arrow Deadeye",
    character: { class: "Ranger", ascendancy: "Deadeye", level: 95 },
    summary: {
      CombinedDPS: 3_120_000,
      Life: 4_650,
      EnergyShield: 0,
      FireResist: 75,
      ColdResist: 75,
      LightningResist: 76,
      ChaosResist: -45,
      Armour: 0,
      Evasion: 22_400,
    },
    tree: { allocatedNodeIds: [...new Set([...rangerTerritory, ...centerCommons])] },
  };

  // ─── 1. N=2 same-class diff ───────────────────────────────────────────────
  // Two witches, modest deltas, full diff coverage. The "everyday" case.
  const n2SameClass = {
    builds: [witchBuild, elementalistBuild],
    diffs: {
      summary: {
        CombinedDPS: { perBuild: [1_247_832, 1_840_000], leader: 1, range: 0.475 },
        Life: { perBuild: [4_891, 5_120], leader: 1, range: 0.047 },
        EnergyShield: { perBuild: [2_104, 6_400], leader: 1, range: 2.041 },
        ChaosResist: { perBuild: [-30, 18], leader: 1, range: 1.6 },
      },
      tree: {
        allocatedOnlyIn: {
          "witch-01": [3001, 3002, 3003, 3004, 3005, 3006, 3007, 3008],
          "witch-02": [4001, 4002, 4003, 4004, 4005, 4006],
        },
        common: Array.from({ length: 32 }, (_, i) => 1000 + i),
      },
      gear: {
        Helmet: { perBuild: ["Atziri's Foible", "Crown of the Tyrant"], nameSame: false, modsSame: false },
        "Body Armour": { perBuild: ["Kintsugi", "Shavronne's Wrappings"], nameSame: false, modsSame: false },
        Boots: { perBuild: ["Goldwyrm", "Goldwyrm"], nameSame: true, modsSame: true },
      },
      skills: [
        {
          label: "Main Skill",
          perBuild: [
            ["Vaal Spark", "Lightning Penetration", "Spell Echo"],
            ["Arc", "Lightning Penetration", "Spell Echo"],
          ],
          same: false,
        },
        {
          label: "Aura Setup",
          perBuild: [
            ["Discipline", "Wrath"],
            ["Discipline", "Wrath"],
          ],
          same: true,
        },
      ],
    },
  };

  // ─── 2. N=3 multi-build ───────────────────────────────────────────────────
  // Three classes, three columns. Verifies header row + group bars + data
  // rows scale cleanly to wider tables.
  const n3MultiBuild = {
    builds: [witchBuild, marauderBuild, rangerBuild],
    diffs: {
      summary: {
        CombinedDPS: { perBuild: [1_247_832, 2_500_000, 3_120_000], leader: 2, range: 1.502 },
        Life: { perBuild: [4_891, 7_200, 4_650], leader: 1, range: 0.55 },
        EnergyShield: { perBuild: [2_104, 0, 0], leader: 0, range: Infinity },
        Armour: { perBuild: [1_240, 18_500, 0], leader: 1, range: Infinity },
        Evasion: { perBuild: [0, 800, 22_400], leader: 2, range: Infinity },
      },
      tree: {
        allocatedOnlyIn: {
          "witch-01": [3001, 3002, 3003, 3004, 3005, 3006, 3007, 3008],
          "marauder-01": [5001, 5002, 5003, 5004, 5005, 5006, 5007],
          "ranger-01": [6001, 6002, 6003, 6004, 6005, 6006, 6007, 6008, 6009],
        },
        common: Array.from({ length: 18 }, (_, i) => 1000 + i),
      },
      gear: {
        Helmet: {
          perBuild: ["Atziri's Foible", "Devoto's Devotion", "Hyrri's Demise"],
          nameSame: false,
          modsSame: false,
        },
        "Body Armour": {
          perBuild: ["Kintsugi", "Belly of the Beast", "Queen of the Forest"],
          nameSame: false,
          modsSame: false,
        },
        Boots: {
          perBuild: ["Goldwyrm", "Atziri's Step", "Atziri's Step"],
          nameSame: false,
          modsSame: false,
        },
      },
      skills: [
        {
          label: "Main Skill",
          perBuild: [
            ["Vaal Spark", "Lightning Penetration", "Spell Echo"],
            ["Cyclone", "Pulverise", "Brutality"],
            ["Lightning Arrow", "Mirage Archer", "Awakened Lightning Pen"],
          ],
          same: false,
        },
      ],
    },
  };

  // ─── 3. Large stat deltas ─────────────────────────────────────────────────
  // Order-of-magnitude differences. Verifies the leader-highlight variant
  // works on dramatic numbers (M vs k vs raw) without wrapping/overflow.
  const largeStatDeltas = {
    builds: [witchBuild, marauderBuild],
    diffs: {
      summary: {
        CombinedDPS: { perBuild: [124_000, 12_400_000], leader: 1, range: 99.0 },
        Life: { perBuild: [3_200, 14_500], leader: 1, range: 3.531 },
        EnergyShield: { perBuild: [180, 0], leader: 0, range: Infinity },
        Armour: { perBuild: [400, 52_000], leader: 1, range: 129.0 },
      },
      tree: {
        allocatedOnlyIn: { "witch-01": [3001, 3002], "marauder-01": [5001] },
        common: [1001, 1002, 1003],
      },
      gear: {},
      skills: [],
    },
  };

  // ─── 4. Gear missing on one build ─────────────────────────────────────────
  // Asymmetric gear: build B doesn't have several slots populated. Verifies
  // the `—` muted variant renders correctly when slotDiff.perBuild[i] is null.
  const gearMissing = {
    builds: [witchBuild, elementalistBuild],
    diffs: {
      summary: {
        CombinedDPS: { perBuild: [1_247_832, 1_840_000], leader: 1, range: 0.475 },
      },
      gear: {
        Helmet: { perBuild: ["Atziri's Foible", "Crown of the Tyrant"], nameSame: false, modsSame: false },
        "Body Armour": { perBuild: ["Kintsugi", null], nameSame: false, modsSame: false },
        Gloves: { perBuild: [null, "Voidbringer"], nameSame: false, modsSame: false },
        Boots: { perBuild: ["Goldwyrm", null], nameSame: false, modsSame: false },
        Belt: { perBuild: [null, null], nameSame: false, modsSame: false },
        Amulet: { perBuild: ["Bisco's Collar", "Bisco's Collar"], nameSame: true, modsSame: true },
      },
      skills: [],
      tree: { allocatedOnlyIn: {}, common: [] },
    },
  };

  // ─── 5. Buy-similar populated ─────────────────────────────────────────────
  // The buy-similar Panel renders below the comparison Panel. Trade URLs are
  // truncated for display in the Item column.
  const buySimilarPopulated = {
    builds: [witchBuild, marauderBuild],
    diffs: {
      summary: {
        CombinedDPS: { perBuild: [1_247_832, 2_500_000], leader: 1, range: 1.004 },
        Life: { perBuild: [4_891, 7_200], leader: 1, range: 0.472 },
      },
      gear: {
        Helmet: { perBuild: ["Atziri's Foible", "Devoto's Devotion"], nameSame: false, modsSame: false },
        "Body Armour": { perBuild: ["Kintsugi", "Belly of the Beast"], nameSame: false, modsSame: false },
        Boots: { perBuild: ["Goldwyrm", "Kaom's Roots"], nameSame: false, modsSame: false },
      },
      skills: [],
      tree: { allocatedOnlyIn: {}, common: [] },
    },
    buySimilar: [
      {
        fromBuildId: "marauder-01",
        toBuildId: "witch-01",
        slot: "Helmet",
        itemName: "Devoto's Devotion",
        tradeUrl: "https://www.pathofexile.com/trade/search/Standard?example=1",
      },
      {
        fromBuildId: "marauder-01",
        toBuildId: "witch-01",
        slot: "Body Armour",
        itemName: "Belly of the Beast",
        tradeUrl: "https://www.pathofexile.com/trade/search/Standard?example=2",
      },
      {
        fromBuildId: "marauder-01",
        toBuildId: "witch-01",
        slot: "Boots",
        itemName: "Kaom's Roots",
        tradeUrl: "https://www.pathofexile.com/trade/search/Standard?example=3",
      },
    ],
  };

  // ─── 6. Buy-similar empty ─────────────────────────────────────────────────
  // Verifies the buy-similar Panel does NOT render when buySimilar is
  // missing or empty. Same comparison content as #5 minus the trades.
  const buySimilarEmpty = {
    builds: [witchBuild, marauderBuild],
    diffs: {
      summary: {
        CombinedDPS: { perBuild: [1_247_832, 2_500_000], leader: 1, range: 1.004 },
        Life: { perBuild: [4_891, 7_200], leader: 1, range: 0.472 },
      },
      gear: {
        Helmet: { perBuild: ["Atziri's Foible", "Devoto's Devotion"], nameSame: false, modsSame: false },
        "Body Armour": { perBuild: ["Kintsugi", "Belly of the Beast"], nameSame: false, modsSame: false },
      },
      skills: [],
      tree: { allocatedOnlyIn: {}, common: [] },
    },
    buySimilar: [],
  };

  // ─── 7. Config diff ───────────────────────────────────────────────────────
  // Two builds with divergent configs across all three value types
  // (number, boolean, short string). enemyLevel agrees and is filtered
  // server-side; only differing keys appear in the Config row group.
  const configDiff = {
    builds: [witchBuild, marauderBuild],
    diffs: {
      summary: {
        CombinedDPS: { perBuild: [1_247_832, 2_500_000], leader: 1, range: 1.004 },
      },
      gear: {},
      skills: [],
      tree: { allocatedOnlyIn: {}, common: [] },
      config: [
        {
          key: "enemyIsBoss",
          perBuild: ["Pinnacle", "Conqueror"],
          same: false,
        },
        {
          key: "enemyArmour",
          perBuild: [61_989, 100_000],
          same: false,
        },
        {
          key: "raiseSpectreEnableBuffs",
          perBuild: [true, false],
          same: false,
        },
        // Asymmetric: only the witch has this setting; marauder didn't
        // configure it, so the marauder column shows the muted "—".
        {
          key: "summonElementalRelicEnableHatredAura",
          perBuild: [true, null],
          same: false,
        },
      ],
    },
  };

  // ─── 8. Mod sources diff ─────────────────────────────────────────────────
  // Two stats with cross-build modifier divergence. Life has one row
  // unique to each build (different tree nodes contribute) and one
  // shared item where build B has a different roll (same Belly base,
  // different INC value → server emitted both as separate rows since
  // values differ). CombinedDPS shows an N=3-style mismatch where one
  // build pulls a unique gem-source row.
  const modSourcesPopulated = {
    builds: [witchBuild, marauderBuild, rangerBuild],
    diffs: {
      summary: {
        Life: { perBuild: [4_891, 7_200, 4_650], leader: 1, range: 0.55 },
        CombinedDPS: { perBuild: [1_247_832, 2_500_000, 3_120_000], leader: 2, range: 1.502 },
      },
      gear: {},
      skills: [],
      tree: { allocatedOnlyIn: {}, common: [] },
      modSources: {
        Life: [
          {
            key: "Tree:Cruel Preparation|Life|BASE",
            source_type: "Tree",
            mod_type: "BASE",
            perBuild: [
              { source_name: "Cruel Preparation", mod_name: "Life", value: 50 },
              null,
              null,
            ],
          },
          {
            key: "Tree:Heart of the Warrior|Life|INC",
            source_type: "Tree",
            mod_type: "INC",
            perBuild: [
              null,
              { source_name: "Heart of the Warrior", mod_name: "Life", value: 30 },
              null,
            ],
          },
          {
            key: "Item:Belly of the Beast|Life|INC",
            source_type: "Item",
            mod_type: "INC",
            perBuild: [
              { source_name: "Belly of the Beast", mod_name: "Life", value: 40 },
              { source_name: "Belly of the Beast", mod_name: "Life", value: 45 },
              null,
            ],
          },
        ],
        CombinedDPS: [
          {
            key: "Skill:Awakened Spell Echo|CombinedDPS|MORE",
            source_type: "Skill",
            mod_type: "MORE",
            perBuild: [
              { source_name: "Awakened Spell Echo", mod_name: "CombinedDPS", value: 49 },
              null,
              null,
            ],
          },
          {
            key: "Skill:Awakened Lightning Pen|CombinedDPS|MORE",
            source_type: "Skill",
            mod_type: "MORE",
            perBuild: [
              null,
              null,
              { source_name: "Awakened Lightning Pen", mod_name: "CombinedDPS", value: 25 },
            ],
          },
        ],
      },
    },
  };

  // ─── 9. Errored build ─────────────────────────────────────────────────────
  // One build failed to resolve. It appears in `builds` but NOT in any
  // diff's perBuild — column set is built from the successful subset only.
  // Subtitle should read "3 builds · 2 resolved" to surface the error.
  const erroredBuild = {
    builds: [
      witchBuild,
      { id: "broken-01", label: "Unparseable Build", error: "Failed to parse: invalid base64" },
      marauderBuild,
    ],
    diffs: {
      summary: {
        // Only TWO entries in perBuild — successful subset is [witch, marauder].
        CombinedDPS: { perBuild: [1_247_832, 2_500_000], leader: 1, range: 1.004 },
        Life: { perBuild: [4_891, 7_200], leader: 1, range: 0.472 },
      },
      tree: {
        allocatedOnlyIn: { "witch-01": [3001, 3002], "marauder-01": [5001, 5002, 5003] },
        common: [1001, 1002, 1003],
      },
      gear: {
        Helmet: { perBuild: ["Atziri's Foible", "Devoto's Devotion"], nameSame: false, modsSame: false },
      },
      skills: [],
    },
  };
</script>

<!-- 1. N=2 same-class — the canonical diff. -->
<Story name="N=2 same-class">
  <div style="max-width: 700px;">
    <BuildCompare data={n2SameClass} />
  </div>
</Story>

<!-- 2. N=3 multi-build — wider table, three columns. -->
<Story name="N=3 multi-build">
  <div style="max-width: 900px;">
    <BuildCompare data={n3MultiBuild} />
  </div>
</Story>

<!-- 3. Large stat deltas — order-of-magnitude differences. -->
<Story name="Large stat deltas">
  <div style="max-width: 700px;">
    <BuildCompare data={largeStatDeltas} />
  </div>
</Story>

<!-- 4. Gear missing — `—` muted variant for missing slots. -->
<Story name="Gear missing">
  <div style="max-width: 700px;">
    <BuildCompare data={gearMissing} />
  </div>
</Story>

<!-- 5. Buy-similar populated — second Panel with trade recommendations. -->
<Story name="Buy-similar populated">
  <div style="max-width: 700px;">
    <BuildCompare data={buySimilarPopulated} />
  </div>
</Story>

<!-- 6. Buy-similar empty — second Panel does not render. -->
<Story name="Buy-similar empty">
  <div style="max-width: 700px;">
    <BuildCompare data={buySimilarEmpty} />
  </div>
</Story>

<!-- 7. Config diff — heterogeneous values (number/bool/string), asymmetric. -->
<Story name="Config diff">
  <div style="max-width: 700px;">
    <BuildCompare data={configDiff} />
  </div>
</Story>

<!-- 8. Mod sources diff — per-stat modifier sources, N=3, asymmetric. -->
<Story name="Mod sources diff">
  <div style="max-width: 900px;">
    <BuildCompare data={modSourcesPopulated} />
  </div>
</Story>

<!-- 9. Errored build — one build failed to resolve, subtitle reflects it. -->
<Story name="Errored build">
  <div style="max-width: 700px;">
    <BuildCompare data={erroredBuild} />
  </div>
</Story>
