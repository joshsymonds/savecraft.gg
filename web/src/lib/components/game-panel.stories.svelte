<script module lang="ts">
  import type { MergedGame, NoteSummary } from "$lib/types/source";
  import { defineMeta } from "@storybook/addon-svelte-csf";

  import GamePanel from "./GamePanel.svelte";

  const { Story } = defineMeta({
    title: "Components/GamePanel",
    tags: ["autodocs"],
  });

  const mockNotes: Record<string, NoteSummary[]> = {
    s1: [
      {
        id: "n1",
        title: "Maxroll Blessed Hammer Build",
        content:
          "## Gear Priority\n\nHelm: Harlequin Crest (Shako) — +2 skills, DR, MF. BiS.\nArmor: Enigma in Mage Plate — Teleport, +2 skills.",
        source: "user",
        sizeBytes: 8200,
        updatedAt: "2d ago",
      },
      {
        id: "n2",
        title: "Farming Goals",
        content:
          "Need: Ber rune, 3os Mage Plate\nFound: Jah rune (2/24), Vex (2/20)\n\nBest spots: Travincal, Chaos Sanctuary, Cows",
        source: "user",
        sizeBytes: 340,
        updatedAt: "1d ago",
      },
    ],
    s4: [
      {
        id: "n3",
        title: "Perfection Checklist",
        content: "Missing: Golden Clock ($10M), 4 Obelisks\nShipping: 6 items remaining",
        source: "user",
        sizeBytes: 1100,
        updatedAt: "3d ago",
      },
    ],
  };

  function mockLoadNotes(saveUuid: string): Promise<NoteSummary[]> {
    return Promise.resolve(mockNotes[saveUuid] ?? []);
  }

  const multiSourceGames: MergedGame[] = [
    {
      gameId: "d2r",
      name: "Diablo II: Resurrected",
      statusLine: "3 characters",
      sourceCount: 2,
      saves: [
        {
          saveUuid: "s1",
          saveName: "Hammerdin",
          summary: "Paladin · Level 89 · Hell",
          lastUpdated: "2m ago",
          status: "success",
          sourceId: "steam-deck",
          sourceName: "STEAM-DECK",
        },
        {
          saveUuid: "s2",
          saveName: "BlizzSorc",
          summary: "Sorceress · Level 76 · Nightmare",
          lastUpdated: "1d ago",
          status: "success",
          sourceId: "steam-deck",
          sourceName: "STEAM-DECK",
        },
        {
          saveUuid: "s7",
          saveName: "Hammerdin",
          summary: "Paladin · Level 89 · Hell",
          lastUpdated: "3h ago",
          status: "success",
          sourceId: "desktop-pc",
          sourceName: "DESKTOP-PC",
        },
      ],
    },
    {
      gameId: "stardew",
      name: "Stardew Valley",
      statusLine: "1 farm found",
      sourceCount: 1,
      saves: [
        {
          saveUuid: "s4",
          saveName: "Sunrise Farm — Luna",
          summary: "Year 3 · Fall · 64% Perfection",
          lastUpdated: "4h ago",
          status: "success",
          sourceId: "steam-deck",
          sourceName: "STEAM-DECK",
        },
      ],
    },
    {
      gameId: "stellaris",
      name: "Stellaris",
      statusLine: "2 empires found",
      sourceCount: 1,
      saves: [
        {
          saveUuid: "s5",
          saveName: "United Nations of Earth",
          summary: "Year 2340 · Federation Builder",
          lastUpdated: "2d ago",
          status: "success",
          sourceId: "steam-deck",
          sourceName: "STEAM-DECK",
        },
        {
          saveUuid: "s6",
          saveName: "Tzynn Empire",
          summary: "Year 2280 · Militarist Xenophobe",
          lastUpdated: "5d ago",
          status: "success",
          sourceId: "steam-deck",
          sourceName: "STEAM-DECK",
        },
      ],
    },
  ];

  const singleSourceGames: MergedGame[] = multiSourceGames.map((g) => ({
    ...g,
    sourceCount: 1,
  }));

  const emptyGames: MergedGame[] = [];
</script>

<!-- Multi-source: source badges visible on saves -->
<Story name="MultipleGames">
  <div style="width: 700px;">
    <GamePanel
      games={multiSourceGames}
      showSourceBadges={true}
      loadNotes={mockLoadNotes}
      onadd={() => alert("Add a game")}
    />
  </div>
</Story>

<!-- Single source: no source badges needed -->
<Story name="SingleSource">
  <div style="width: 700px;">
    <GamePanel
      games={singleSourceGames}
      showSourceBadges={false}
      loadNotes={mockLoadNotes}
      onadd={() => alert("Add a game")}
    />
  </div>
</Story>

<!-- No games: prominent add button -->
<Story name="Empty">
  <div style="width: 700px;">
    <GamePanel games={emptyGames} onadd={() => alert("Add a game")} />
  </div>
</Story>

<!-- Pre-navigated into D2R game showing saves list -->
<Story name="GameDrilledDown">
  <div style="width: 700px;">
    <GamePanel
      games={multiSourceGames}
      showSourceBadges={true}
      loadNotes={mockLoadNotes}
      initialGameId="d2r"
    />
  </div>
</Story>

<!-- Pre-navigated into a save showing notes -->
<Story name="SaveDrilledDown">
  <div style="width: 700px;">
    <GamePanel
      games={multiSourceGames}
      showSourceBadges={true}
      loadNotes={mockLoadNotes}
      initialGameId="d2r"
      initialSaveUuid="s1"
    />
  </div>
</Story>
