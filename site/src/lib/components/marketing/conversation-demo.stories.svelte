<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";

  import ConversationDemo from "./ConversationDemo.svelte";

  const { Story } = defineMeta({
    title: "Marketing/ConversationDemo",
    tags: ["autodocs"],
  });

  const stardewConversation = [
    { role: "player", text: "I gave Alex the Mermaid's Pendant... HE SAID YES!!!" },
    {
      role: "ai",
      text: "Congratulations!! He moves in after the ceremony on the 28th. Fair warning \u2014 he still talks about gridball. A lot.",
    },
    { role: "player", text: "Ha, worth it. What should I focus on this season?" },
    {
      role: "ai",
      text: "You\u2019re at 63% Perfection in Fall Year 3. You\u2019re still missing Red Cabbage for the Community Center \u2014 check the Traveling Cart on Fridays. Plant Cranberries on every open tile for the gold you\u2019ll need for the Obelisks.",
    },
  ];

  const mtgaConversation = [
    { role: "player", text: "P1P3 in Tarkir \u2014 Abzan Kin-Guard or Pacifism?" },
    {
      role: "ai",
      text: "Pacifism. Your pool is WG with two premium 2-drops \u2014 Pacifism\u2019s 60.2% GIH WR in Selesnya is 3 points above Kin-Guard here, and premium removal wheels less than solid creatures.",
    },
    { role: "player", text: "Makes sense. How\u2019s my curve looking?" },
    {
      role: "ai",
      text: "Light on 3-drops \u2014 you have 1 vs the Selesnya average of 3.4. Prioritize 3s next few picks. Your mana base needs 10 green sources for the GG spell; you\u2019re at 7.",
    },
  ];
</script>

<Story name="StardewValley">
  <div style="max-width: 520px; margin: 40px auto;">
    <ConversationDemo
      conversation={stardewConversation}
      headerLabel="STARDEW VALLEY \u2014 SUNRISE FARM, YEAR 3"
    />
  </div>
</Story>

<Story name="MagicArena">
  <div style="max-width: 520px; margin: 40px auto;">
    <ConversationDemo
      conversation={mtgaConversation}
      headerLabel="MTG ARENA \u2014 TARKIR DRAFT, PACK 1"
      headerDotColor="var(--color-gold)"
      startDelay={800}
    />
  </div>
</Story>
