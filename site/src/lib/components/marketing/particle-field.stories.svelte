<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";

  import ParticleField from "./ParticleField.svelte";

  const { Story } = defineMeta({
    title: "Marketing/ParticleField",
    tags: ["autodocs"],
  });
</script>

<Story name="Default">
  <div style="position: relative; width: 100vw; height: 400px; background: #010214; overflow: hidden;">
    <ParticleField />
  </div>
</Story>

<Story name="Dense">
  <div style="position: relative; width: 100vw; height: 400px; background: #010214; overflow: hidden;">
    <ParticleField count={120} seed={99} />
  </div>
</Story>

<Story name="Sparse">
  <div style="position: relative; width: 100vw; height: 400px; background: #010214; overflow: hidden;">
    <ParticleField count={20} seed={7} />
  </div>
</Story>
