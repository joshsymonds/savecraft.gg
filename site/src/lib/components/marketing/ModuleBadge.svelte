<script lang="ts">
  interface Props {
    requiresSave: boolean;
  }

  let { requiresSave }: Props = $props();
</script>

<span class="badge" class:instant={!requiresSave} class:needs-save={requiresSave}>
  {requiresSave ? "NEEDS SAVE" : "INSTANT"}
</span>

<style>
  .badge {
    display: inline-block;
    font-family: var(--font-pixel);
    font-size: 8px;
    letter-spacing: 1.5px;
    padding: 3px 8px;
    border-radius: 2px;
    vertical-align: baseline;
  }

  .instant {
    color: var(--color-green);
    background: rgba(90, 190, 138, 0.1);
    border: 1px solid rgba(90, 190, 138, 0.25);
  }

  .needs-save {
    color: var(--color-gold);
    background: rgba(200, 168, 78, 0.1);
    border: 1px solid rgba(200, 168, 78, 0.25);
  }
</style>
