<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";

  import Attribution from "./Attribution.svelte";

  const { Story } = defineMeta({
    title: "Shared/Attribution",
    tags: ["autodocs"],
  });
</script>

<Story name="MultiSource">
  <Attribution
    entries={[
      {
        name: "Wizards of the Coast",
        disclaimer:
          "Savecraft is unofficial Fan Content permitted under the Fan Content Policy. Not approved/endorsed by Wizards. Portions of the materials used are property of Wizards of the Coast. \u00a9Wizards of the Coast LLC.",
        url: "https://company.wizards.com/en/legal/fancontentpolicy",
      },
      {
        name: "Scryfall",
        disclaimer:
          "Not produced by, endorsed by, supported by, or affiliated with Scryfall, LLC.",
        url: "https://scryfall.com/docs/api",
      },
      {
        name: "17Lands",
        disclaimer:
          "Not produced by, endorsed by, supported by, or affiliated with 17Lands, LLC. \u00a9 17Lands, LLC.",
        url: "https://www.17lands.com",
      },
    ]}
  />
</Story>

<Story name="SingleSource">
  <Attribution
    entries={[
      {
        name: "Ludeon Studios",
        disclaimer:
          "Portions of the materials used to create this content are trademarks and/or copyrighted works of Ludeon Studios Inc. All rights reserved by Ludeon. This content is not official and is not endorsed by Ludeon.",
        url: "https://rimworldgame.com/eula/",
      },
    ]}
  />
</Story>

<Story name="Empty">
  <Attribution entries={[]} />
</Story>
