<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";
  import BuildCompare from "./build-compare.svelte";
  const { Story } = defineMeta({ title: "PoE/Views/BuildCompare", tags: ["autodocs"] });

  // ─── Mock builds ───────────────────────────────────────────────────────────
  // The data shape mirrors CompareResponse from cmd/pob-server/compare.go.
  // Stories below mix and match these to exercise the seven scenarios.

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
  };

  // ─── N=2 same-class diff ──────────────────────────────────────────────────
  // First scaffold story — minimal data to verify the empty layout renders
  // each of the six sections. Subsequent stories will progressively flesh
  // out the diff data shapes.
  const n2SameClass = {
    builds: [witchBuild, marauderBuild],
    diffs: {
      summary: {
        CombinedDPS: { perBuild: [1_247_832, 2_500_000], leader: 1, range: 0.501 },
        Life: { perBuild: [4_891, 7_200], leader: 1, range: 0.321 },
      },
      tree: {
        allocatedOnlyIn: {
          "witch-01": [3001, 3002, 3003],
          "marauder-01": [4001, 4002],
        },
        common: [1001, 1002],
      },
      gear: {
        Helmet: { perBuild: ["Atziri's Foible", "Devoto's Devotion"], same: false },
        "Body Armour": { perBuild: ["Kintsugi", null], same: false },
      },
      skills: [
        {
          label: "Cyclone Setup",
          perBuild: [
            ["Cyclone", "Pulverise", "Brutality"],
            ["Cyclone", "Brutality", "Inspiration"],
          ],
          same: false,
        },
      ],
    },
  };
</script>

<!-- Scaffold story: empty layout shell, minimal data. Verifies all six
     sections render their empty Panel + Section frames. -->
<Story name="Scaffold">
  <div style="max-width: 700px;">
    <BuildCompare data={n2SameClass} />
  </div>
</Story>
