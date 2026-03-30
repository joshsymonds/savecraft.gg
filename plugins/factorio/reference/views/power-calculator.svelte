<!--
  @component
  Factorio power calculator reference view.
  Renders power generation plan with entity counts, fuel consumption,
  and generation mix breakdown.

  @attribution wube
-->
<script lang="ts">
  import PowerPlan from "../../components/PowerPlan.svelte";

  interface Props {
    data: {
      target_mw: number;
      total_generation_mw: number;
      surplus_mw: number;
      sources: Array<{
        type: string;
        generation_mw: number;
        entities: Record<string, number>;
        fuel?: Record<string, unknown>;
        layout?: string;
      }>;
      existing_mw?: number;
      deficit_mw?: number;
    };
  }

  let { data }: Props = $props();
</script>

<PowerPlan {data} />
