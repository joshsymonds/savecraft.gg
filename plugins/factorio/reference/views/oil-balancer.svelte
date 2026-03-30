<!--
  @component
  Factorio oil balancer reference view.
  Wraps OilChain with Panel layout for the reference module output.

  @attribution wube
-->
<script lang="ts">
  import OilChain from "../../components/OilChain.svelte";
  import type { OilBalancerResult } from "../../components/oil-fixtures";
  import Panel from "../../../../views/src/components/layout/Panel.svelte";

  interface Props {
    data: OilBalancerResult & { icon_url?: string };
    /** Base URL for sprite sheets (e.g., R2 URL or Storybook static path) */
    spriteBaseUrl?: string;
  }

  let { data, spriteBaseUrl = "/plugins/factorio/sprites" }: Props = $props();
</script>

<div class="factorio-view">
  <Panel watermark={data.icon_url}>
    <OilChain {data} {spriteBaseUrl} />
  </Panel>
</div>
