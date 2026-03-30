<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";

  import EvolutionTracker from "./evolution-tracker.svelte";

  const { Story } = defineMeta({
    title: "Factorio/Views/EvolutionTracker",
    tags: ["autodocs"],
  });

  // Early game: ~35% evolution, small biters dominant, approaching big worm tier
  const earlyGameData = {
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
  };

  // Mid game: ~72% evolution, mixed biters, approaching behemoth tier
  const midGameData = {
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
  };

  // Late game: 98.7% evolution, all tiers unlocked, behemoths spawning
  const lateGameData = {
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
  };

  // Pollution-dominant: heavy industry, few nests cleared
  const pollutionDominantData = {
    evolution_factor: 0.45,
    sources: {
      time: 0.12,
      pollution: 0.32,
      kills: 0.01,
    },
    dominant_source: "pollution",
    current_tier: "medium-worm-turret",
    previous_tier_threshold: 0.3,
    next_tier: {
      name: "big-worm-turret",
      threshold: 0.5,
    },
    spawn_weights: {
      "small-biter": 0.075,
      "medium-biter": 0.3,
      "big-biter": 0,
      "behemoth-biter": 0,
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

<Story name="PollutionDominant">
  <EvolutionTracker data={pollutionDominantData} />
</Story>
