<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";
  import CollectionDiff from "./collection-diff.svelte";
  const { Story } = defineMeta({ title: "MTG/Views/CollectionDiff", tags: ["autodocs"] });

  const iconUrl = "/plugins/mtga/icon.png";

  const fullData = {
    icon_url: iconUrl,
    missing: [
      { name: "Sheoldred, the Apocalypse", count: 2, rarity: "mythic" },
      { name: "Preacher of the Schism", count: 1, rarity: "rare" },
      { name: "Go for the Throat", count: 3, rarity: "uncommon" },
      { name: "Cut Down", count: 2, rarity: "uncommon" },
      { name: "Swamp", count: 4, rarity: "common" },
    ],
    wildcardCost: { common: 4, uncommon: 5, rare: 1, mythic: 2, unknown: 0, total: 12 },
    unresolvedCards: [],
  };

  const withUnresolved = {
    ...fullData,
    unresolvedCards: ["Phyrexian Obliterator", "Dark Ritual"],
  };

  const complete = {
    icon_url: iconUrl,
    missing: [],
    wildcardCost: { common: 0, uncommon: 0, rare: 0, mythic: 0, unknown: 0, total: 0 },
    unresolvedCards: [],
  };
</script>

<Story name="MissingCards">
  <div style="width: 600px;">
    <CollectionDiff data={fullData} />
  </div>
</Story>

<Story name="WithUnresolved">
  <div style="width: 600px;">
    <CollectionDiff data={withUnresolved} />
  </div>
</Story>

<Story name="Complete">
  <div style="width: 600px;">
    <CollectionDiff data={complete} />
  </div>
</Story>
