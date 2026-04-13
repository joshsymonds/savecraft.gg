<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";
  import MatchStats from "./match-stats.svelte";
  const { Story } = defineMeta({ title: "MTG/Views/MatchStats", tags: ["autodocs"] });

  const iconUrl = "/plugins/magic/icon.png";

  const overview = {
    icon_url: iconUrl,
    total_matches: 147,
    total_wins: 89,
    total_losses: 58,
    win_rate: 60.5,
    by_format: [
      { format: "Premier Draft", wins: 52, losses: 28, total: 80, win_rate: 65.0 },
      { format: "Quick Draft", wins: 25, losses: 20, total: 45, win_rate: 55.6 },
      { format: "Traditional Draft", wins: 12, losses: 10, total: 22, win_rate: 54.5 },
    ],
  };

  const byDeck = {
    icon_url: iconUrl,
    decks: [
      { deck: "WB Midrange", wins: 32, losses: 8, total: 40, win_rate: 80.0 },
      { deck: "UR Spells", wins: 18, losses: 12, total: 30, win_rate: 60.0 },
      { deck: "BG Ramp", wins: 15, losses: 15, total: 30, win_rate: 50.0 },
      { deck: "RW Aggro", wins: 12, losses: 18, total: 30, win_rate: 40.0 },
      { deck: "UB Control", wins: 5, losses: 12, total: 17, win_rate: 29.4 },
    ],
  };

  const matchups = {
    icon_url: iconUrl,
    format: "Premier Draft",
    matchups: [
      { archetype: "WB", wins: 18, losses: 6, total: 24, win_rate: 75.0 },
      { archetype: "UR", wins: 12, losses: 8, total: 20, win_rate: 60.0 },
      { archetype: "RG", wins: 10, losses: 10, total: 20, win_rate: 50.0 },
      { archetype: "UB", wins: 6, losses: 14, total: 20, win_rate: 30.0 },
      { archetype: "WU", wins: 4, losses: 12, total: 16, win_rate: 25.0 },
    ],
  };
</script>

<Story name="Overview">
  <div style="width: 500px;">
    <MatchStats data={overview} />
  </div>
</Story>

<Story name="ByDeck">
  <div style="width: 500px;">
    <MatchStats data={byDeck} />
  </div>
</Story>

<Story name="Matchups">
  <div style="width: 500px;">
    <MatchStats data={matchups} />
  </div>
</Story>
