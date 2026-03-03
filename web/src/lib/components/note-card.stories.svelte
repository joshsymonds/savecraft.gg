<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";

  import NoteCard from "./NoteCard.svelte";

  const { Story } = defineMeta({
    title: "Components/NoteCard",
    tags: ["autodocs"],
  });
</script>

<Story name="Default">
  <div style="width: 500px;">
    <NoteCard
      note={{
        id: "n1",
        title: "Maxroll Blessed Hammer Build",
        content:
          "## Gear Priority\n\nHelm: Harlequin Crest (Shako) — +2 skills, DR, MF. BiS.\nArmor: Enigma in Mage Plate — Teleport, +2 skills, strength, MF.",
        source: "user",
        sizeBytes: 8200,
        updatedAt: "2d ago",
      }}
      ondelete={(id) => alert(`Delete ${String(id)}`)}
      onedit={(id, title, _content) => alert(`Edit ${String(id)}: ${String(title)}`)}
    />
  </div>
</Story>

<Story name="AISource">
  <div style="width: 500px;">
    <NoteCard
      note={{
        id: "n2",
        title: "Farming Goals",
        content:
          "Need: Ber rune, 3os Mage Plate\nFound: Jah rune (2/24), Vex (2/20)\n\nBest spots: Travincal, Chaos Sanctuary, Cows",
        source: "ai",
        sizeBytes: 340,
        updatedAt: "1d ago",
      }}
      ondelete={(id) => alert(`Delete ${String(id)}`)}
      onedit={(id, title, _content) => alert(`Edit ${String(id)}: ${String(title)}`)}
    />
  </div>
</Story>

<Story name="ImportSource">
  <div style="width: 500px;">
    <NoteCard
      note={{
        id: "n3",
        title: "D2R Runewords Reference",
        content:
          "Enigma: Jah + Ith + Ber (3os Armor)\nInfinity: Ber + Mal + Ber + Ist (4os Polearm)\nFaith: Ohm + Jah + Lem + Eld (4os Bow)",
        source: "import",
        sizeBytes: 24_500,
        updatedAt: "5d ago",
      }}
      ondelete={(id) => alert(`Delete ${String(id)}`)}
      onedit={(id, title, _content) => alert(`Edit ${String(id)}: ${String(title)}`)}
    />
  </div>
</Story>

<Story name="InList">
  <div style="width: 500px; display: flex; flex-direction: column; gap: 8px;">
    <NoteCard
      note={{
        id: "n1",
        title: "Maxroll Blessed Hammer Build",
        content:
          "## Gear Priority\n\nHelm: Harlequin Crest (Shako) — +2 skills, DR, MF. BiS.\nArmor: Enigma in Mage Plate — Teleport, +2 skills.",
        source: "user",
        sizeBytes: 8200,
        updatedAt: "2d ago",
      }}
      ondelete={(id) => alert(`Delete ${String(id)}`)}
      onedit={(id, title, _content) => alert(`Edit ${String(id)}: ${String(title)}`)}
    />
    <NoteCard
      note={{
        id: "n2",
        title: "Farming Goals",
        content: "Need: Ber rune, 3os Mage Plate\nFound: Jah rune (2/24), Vex (2/20)",
        source: "user",
        sizeBytes: 340,
        updatedAt: "1d ago",
      }}
      ondelete={(id) => alert(`Delete ${String(id)}`)}
      onedit={(id, title, _content) => alert(`Edit ${String(id)}: ${String(title)}`)}
    />
  </div>
</Story>
