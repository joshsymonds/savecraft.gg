<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";
  import PlayAdvisor from "./play-advisor.svelte";
  const { Story } = defineMeta({ title: "MTG/Views/PlayAdvisor", tags: ["autodocs"] });

  const iconUrl = "/plugins/magic/icon.png";

  const gameReview = {
    icon_url: iconUrl,
    disclaimer: "Based on aggregate statistics from 17Lands data — individual game context may differ.",
    findings: [
      { turn: 2, category: "sequencing", description: "Playing tapped land on turn 2 cost a tempo advantage", impact: 2 },
      { turn: 4, category: "attack", description: "Held back Sheoldred when attacking was +3.2pp win rate", impact: 3 },
      { turn: 6, category: "sequencing", description: "Cast removal before combat — should have attacked first to bait blocks", impact: 4 },
      { turn: 8, category: "attack", description: "Missed lethal by not attacking with all creatures", impact: 5 },
    ],
    total_findings: 4,
    coverage: { found: 8, total: 10 },
  };

  const mulligan = {
    icon_url: iconUrl,
    hand_size: 7,
    land_count: 3,
    cmc_bucket: "2-3",
    on_play: true,
    keep_win_rate: 58.2,
    keep_games: 15000,
    mulligan_win_rate: 51.0,
    mulligan_games: 8000,
    recommendation: "keep",
    margin_pp: 7.2,
  };

  const cardTiming = {
    icon_url: iconUrl,
    disclaimer: "Win rates reflect when cards are first played, not drawn.",
    cards: [
      {
        card_name: "Sheoldred, the Apocalypse",
        best_turn: 4,
        best_win_rate: 72.5,
        turns: [
          { turn: 3, times_deployed: 80, win_rate: 65.0, total_games: 400 },
          { turn: 4, times_deployed: 350, win_rate: 72.5, total_games: 400 },
          { turn: 5, times_deployed: 200, win_rate: 68.0, total_games: 400 },
          { turn: 6, times_deployed: 100, win_rate: 63.0, total_games: 400 },
        ],
      },
      {
        card_name: "Go for the Throat",
        best_turn: 2,
        best_win_rate: 61.0,
        turns: [
          { turn: 2, times_deployed: 500, win_rate: 61.0, total_games: 800 },
          { turn: 3, times_deployed: 400, win_rate: 59.5, total_games: 800 },
          { turn: 4, times_deployed: 300, win_rate: 57.0, total_games: 800 },
        ],
      },
    ],
    coverage: { found: 2, total: 2 },
  };
</script>

<Story name="GameReview">
  <div style="width: 500px;">
    <PlayAdvisor data={gameReview} />
  </div>
</Story>

<Story name="Mulligan">
  <div style="width: 500px;">
    <PlayAdvisor data={mulligan} />
  </div>
</Story>

<Story name="CardTiming">
  <div style="width: 500px;">
    <PlayAdvisor data={cardTiming} />
  </div>
</Story>
