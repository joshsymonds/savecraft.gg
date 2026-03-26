<!--
  @component
  Seeded pixel particle background. Generates deterministic floating particles
  using an LCG PRNG so the field looks identical across renders.
-->
<script lang="ts">
  interface Particle {
    id: number;
    x: number;
    size: number;
    opacity: number;
    duration: number;
    delay: number;
    drift: number;
  }

  interface Props {
    count?: number;
    seed?: number;
  }

  let { count = 60, seed = 42 }: Props = $props();

  function seededParticles(n: number, s: number): Particle[] {
    const result: Particle[] = [];
    let state = s;
    const LCG_MUL = 1_664_525;
    const LCG_INC = 1_013_904_223;
    const LCG_MASK = 0x7f_ff_ff_ff;

    for (let i = 0; i < n; i++) {
      state = (state * LCG_MUL + LCG_INC) & LCG_MASK;
      const x = (state % 10_000) / 100;
      state = (state * LCG_MUL + LCG_INC) & LCG_MASK;
      const size = 3 + (state % 4);
      state = (state * LCG_MUL + LCG_INC) & LCG_MASK;
      const opacity = 0.15 + (state % 25) / 100;
      state = (state * LCG_MUL + LCG_INC) & LCG_MASK;
      const duration = 8 + (state % 12);
      state = (state * LCG_MUL + LCG_INC) & LCG_MASK;
      const delay = (state % 20_000) / 1000;
      state = (state * LCG_MUL + LCG_INC) & LCG_MASK;
      const drift = (state % 60) - 30;
      result.push({ id: i, x, size, opacity, duration, delay, drift });
    }
    return result;
  }

  const particles = $derived(seededParticles(count, seed));
</script>

<div class="particle-field">
  {#each particles as p (p.id)}
    <span
      class="particle"
      style="left:{p.x}%;bottom:-4px;width:{p.size}px;height:{p.size}px;opacity:{p.opacity};animation-duration:{p.duration}s;animation-delay:{p.delay}s;--drift:{p.drift}px"
    ></span>
  {/each}
</div>

<style>
  .particle-field {
    position: absolute;
    inset: 0;
    z-index: 0;
    pointer-events: none;
    overflow: hidden;
  }

  .particle {
    position: absolute;
    background: var(--color-gold);
    image-rendering: pixelated;
    animation: float-up linear infinite;
    animation-fill-mode: backwards;
  }

  @keyframes float-up {
    0% {
      transform: translateY(0) translateX(0);
      opacity: 0;
    }
    5% {
      opacity: var(--p-opacity, 0.2);
    }
    80% {
      opacity: var(--p-opacity, 0.2);
    }
    100% {
      transform: translateY(-120vh) translateX(var(--drift, 0px));
      opacity: 0;
    }
  }
</style>
