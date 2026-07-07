<!--
  @component
  Magic: The Gathering landing page. All copy and structure live in
  ./content.ts; rendering is the shared GamePage template.
-->
<script lang="ts">
  import GamePage from "$lib/components/marketing/GamePage.svelte";
  import type { GameInfo } from "$lib/server/plugins";

  import { content } from "./content";

  let { data } = $props<{ data: { game: GameInfo } }>();
</script>

<GamePage {content} game={data.game} />
