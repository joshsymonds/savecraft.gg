<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";

  import EvolutionTracker from "./evolution-tracker.svelte";

  const { Story } = defineMeta({
    title: "Factorio/Views/EvolutionTracker",
    tags: ["autodocs"],
  });

  // Early game: ~35% evolution, small biters dominant, approaching big worm tier
  const earlyGameData = {
    surfaces: {
      nauvis: {
        pollutant: "pollution",
        evolution_factor: 0.352,
        sources: {
          time: 0.3508,
          pollution: 0.0018,
          kills: 0,
        },
        dominant_source: "time",
        current_tier: "medium-worm-turret",
        previous_tier_threshold: 0.3,
        next_tier: {
          name: "big-worm-turret",
          threshold: 0.5,
        },
        spawn_weights: {
          "small-biter": 0.124,
          "medium-biter": 0.228,
          "big-biter": 0,
          "behemoth-biter": 0,
        },
        current_pollution: 8500,
      },
    },
    defenses: {
      turrets: { "laser-turret": 24, "gun-turret": 8 },
      walls: 800,
      enemy_bases_nearby: [],
    },
  };

  // Mid game: ~72% evolution, mixed biters, approaching behemoth tier
  const midGameData = {
    surfaces: {
      nauvis: {
        pollutant: "pollution",
        evolution_factor: 0.72,
        sources: {
          time: 0.58,
          pollution: 0.095,
          kills: 0.045,
        },
        dominant_source: "time",
        current_tier: "big-worm-turret",
        previous_tier_threshold: 0.5,
        next_tier: {
          name: "behemoth-worm-turret",
          threshold: 0.9,
        },
        spawn_weights: {
          "small-biter": 0,
          "medium-biter": 0.1,
          "big-biter": 0.176,
          "behemoth-biter": 0,
        },
        current_pollution: 25000,
      },
    },
    defenses: {
      turrets: { "laser-turret": 120, "gun-turret": 10, "flamethrower-turret": 8 },
      walls: 3200,
      enemy_bases_nearby: [
        { distance: 200, direction: "north", type: "biter-spawner" },
      ],
    },
  };

  // Late game: 98.7% evolution, all tiers unlocked, behemoths spawning
  const lateGameData = {
    surfaces: {
      nauvis: {
        pollutant: "pollution",
        evolution_factor: 0.987,
        sources: {
          time: 0.9867,
          pollution: 0.044,
          kills: 0.0393,
        },
        dominant_source: "time",
        current_tier: "behemoth-worm-turret",
        previous_tier_threshold: 0.9,
        next_tier: null,
        spawn_weights: {
          "small-biter": 0,
          "medium-biter": 0,
          "big-biter": 0.388,
          "behemoth-biter": 0.261,
        },
        current_pollution: 52000,
      },
    },
    defenses: {
      turrets: { "laser-turret": 283, "gun-turret": 10, "artillery-turret": 4 },
      walls: 5082,
      enemy_bases_nearby: [],
    },
  };

  // Multi-surface: Space Age with Nauvis biters + Gleba pentapods
  const multiSurfaceData = {
    surfaces: {
      nauvis: {
        pollutant: "pollution",
        evolution_factor: 0.8088,
        sources: {
          time: 0.6458,
          pollution: 0.3587,
          kills: 0,
        },
        dominant_source: "time",
        current_tier: "big-worm-turret",
        previous_tier_threshold: 0.5,
        next_tier: {
          name: "behemoth-worm-turret",
          threshold: 0.9,
        },
        spawn_weights: {
          "small-biter": 0,
          "medium-biter": 0.05,
          "big-biter": 0.248,
          "behemoth-biter": 0,
        },
        current_pollution: 42000,
      },
      gleba: {
        pollutant: "spores",
        evolution_factor: 0.2,
        sources: {
          time: 0.1,
          pollution: 0.08,
          kills: 0.02,
        },
        dominant_source: "time",
        current_tier: "none",
        previous_tier_threshold: 0,
        next_tier: {
          name: "medium-worm-turret",
          threshold: 0.3,
        },
        spawn_weights: {
          "small-wriggler-pentapod": 0.4,
          "small-strafer-pentapod": 0.4,
          "small-stomper-pentapod": 0.2,
        },
        current_pollution: 5000,
      },
    },
    defenses: {
      turrets: { "laser-turret": 283, "gun-turret": 10 },
      walls: 5082,
      enemy_bases_nearby: [
        { distance: 150, direction: "east", type: "biter-spawner" },
      ],
    },
  };
</script>

<Story name="EarlyGame">
  <EvolutionTracker data={earlyGameData} />
</Story>

<Story name="MidGame">
  <EvolutionTracker data={midGameData} />
</Story>

<Story name="LateGame">
  <EvolutionTracker data={lateGameData} />
</Story>

<Story name="MultiSurface">
  <EvolutionTracker data={multiSurfaceData} />
</Story>
