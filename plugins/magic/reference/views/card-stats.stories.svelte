<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";
  import CardStats from "./card-stats.svelte";
  const { Story } = defineMeta({ title: "MTG/Views/CardStats", tags: ["autodocs"] });

  const iconUrl = "/plugins/magic/icon.png";

  const setOverview = {
    icon_url: iconUrl,
    set_code: "MKM",
    format: "PremierDraft",
    total_games: 250000,
    card_count: 286,
    avg_gihwr: 56.2,
    top_gihwr: [
      { card_name: "Aurelia's Vindicator", gihwr: 64.5, iwd: 8.3, ata: 2.1, games_in_hand: 5400 },
      { card_name: "Massacre Girl", gihwr: 63.1, iwd: 6.9, ata: 1.8, games_in_hand: 4200 },
      { card_name: "Etrata, Deadly Fugitive", gihwr: 62.8, iwd: 6.6, ata: 2.4, games_in_hand: 3800 },
    ],
    bottom_gihwr: [
      { card_name: "Granite Witness", gihwr: 44.2, iwd: -12.0, ata: 11.5, games_in_hand: 3100 },
      { card_name: "Tunnel Tipster", gihwr: 45.8, iwd: -10.4, ata: 10.2, games_in_hand: 2800 },
    ],
    undervalued: [
      { card_name: "Hidden Gem", gihwr: 59.0, iwd: 3.2, ata: 8.5, games_in_hand: 2800 },
      { card_name: "Late Pick Winner", gihwr: 58.2, iwd: 2.0, ata: 9.1, games_in_hand: 2200 },
    ],
  };

  const cardDetail = {
    icon_url: iconUrl,
    set_code: "MKM",
    format: "PremierDraft",
    query: "Aurelia",
    cards: [{
      card_name: "Aurelia's Vindicator",
      gihwr: 64.5, ohwr: 66.2, gdwr: 58.1, gnswr: 55.3,
      iwd: 8.3, alsa: 2.5, ata: 2.1,
      games_in_hand: 5400, games_played: 3200, set_avg_gihwr: 56.2,
      archetypes: [
        { archetype: "WB", gihwr: 67.2, iwd: 11.0, games_in_hand: 1800 },
        { archetype: "WR", gihwr: 63.8, iwd: 7.6, games_in_hand: 1200 },
        { archetype: "WU", gihwr: 61.5, iwd: 5.3, games_in_hand: 900 },
        { archetype: "WG", gihwr: 59.0, iwd: 2.8, games_in_hand: 600 },
      ],
    }],
    more: 0,
  };
</script>

<Story name="SetOverview">
  <div style="width: 500px;">
    <CardStats data={setOverview} />
  </div>
</Story>

<Story name="CardDetail">
  <div style="width: 500px;">
    <CardStats data={cardDetail} />
  </div>
</Story>
