<!--
  @component
  Visual socket chain for a PoE socket group.
  Renders gems as colored pips connected by link bars, with diagonal gem names below.
  Hovering a socket shows a GemTooltip via HoverTip.
-->
<script lang="ts">
  import HoverTip from "../data/HoverTip.svelte";
  import GemTooltip from "./GemTooltip.svelte";
  import { GEM_COLORS } from "./colors";

  interface Gem {
    name?: string;
    nameSpec?: string;
    level?: number;
    quality?: number;
    qualityId?: string;
    enabled?: boolean;
    support?: boolean;
    vaal?: boolean;
    /** Gem attribute color: R(str), G(dex), B(int), W(neutral) */
    color?: string;
    /** Actual socket color on the item */
    socketColor?: string;
    tags?: string;
    description?: string;
    castTime?: number;
    reqStr?: number;
    reqDex?: number;
    reqInt?: number;
    naturalMaxLevel?: number;
    hasGlobalEffect?: boolean;
  }

  interface Props {
    /** Gems in this socket group (all linked) */
    gems: Gem[];
    /** Whether this is the build's main skill group */
    isMainGroup?: boolean;
    /** Whether this group is enabled */
    enabled?: boolean;
  }

  let { gems, isMainGroup = false, enabled = true }: Props = $props();

  const COLOR_MAP: Record<string, keyof typeof GEM_COLORS> = {
    R: "str", G: "dex", B: "int", W: "white",
  };

  function pipLabel(gem: Gem): string {
    return gem.socketColor || gem.color || "W";
  }

  function colorKey(gem: Gem): keyof typeof GEM_COLORS {
    const c = gem.socketColor || gem.color || "W";
    return COLOR_MAP[c] ?? "white";
  }

  /** Abbreviated gem name for diagonal labels. Strips "Support", "Awakened", and common words. */
  function shortName(gem: Gem): string {
    let n = gem.name || gem.nameSpec || "?";
    n = n.replace(/ Support$/, "");
    n = n.replace(/^Awakened /, "Awk. ");
    n = n.replace(/^Vaal /, "V. ");
    n = n.replace(/Increased /, "Inc ");
    n = n.replace(/Greater /, "Gr ");
    n = n.replace(/ Damage/, " Dmg");
    n = n.replace(/ Penetration/, " Pen");
    // Hard cap at 14 chars
    if (n.length > 14) n = n.slice(0, 13) + "…";
    return n;
  }

  let activeGems = $derived(gems.filter((g) => g.name || g.nameSpec));
</script>

<div class="socket-chain" class:main={isMainGroup} class:disabled={!enabled}>
  {#each activeGems as gem, i}
    {#if i > 0}
      <span class="link-bar"></span>
    {/if}
    <div class="gem-col">
      <HoverTip>
        {#snippet tip()}
          <GemTooltip
            name={gem.name || gem.nameSpec || "Unknown"}
            color={gem.color ?? "W"}
            support={gem.support}
            vaal={gem.vaal}
            level={gem.level}
            quality={gem.quality}
            qualityId={gem.qualityId}
            tags={gem.tags}
            description={gem.description}
            castTime={gem.castTime}
            reqStr={gem.reqStr}
            reqDex={gem.reqDex}
            reqInt={gem.reqInt}
            naturalMaxLevel={gem.naturalMaxLevel}
            hasGlobalEffect={gem.hasGlobalEffect}
          />
        {/snippet}
        <span
          class="pip"
          class:gem-disabled={gem.enabled === false}
          style:--pip-bg={GEM_COLORS[colorKey(gem)].bg}
          style:--pip-glow={GEM_COLORS[colorKey(gem)].glow}
          style:--pip-text={GEM_COLORS[colorKey(gem)].text}
        >
          {pipLabel(gem)}
        </span>
      </HoverTip>
      <span class="stem"></span>
      <span class="gem-name" class:support={gem.support} class:gem-disabled={gem.enabled === false}>
        {shortName(gem)}
      </span>
    </div>
  {/each}
</div>

<style>
  .socket-chain {
    display: flex;
    align-items: flex-start;
    gap: 0;
    padding: var(--space-xs) 0 0;
    /* Reserve space below chain for diagonal labels */
    padding-bottom: 70px;
  }

  .socket-chain.disabled {
    opacity: 0.35;
  }

  .gem-col {
    display: flex;
    flex-direction: column;
    align-items: center;
    position: relative;
    /* Fixed width so columns don't shift with label length */
    width: 32px;
    min-width: 32px;
  }

  .pip {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    min-width: 32px;
    background: var(--pip-bg);
    color: var(--pip-text);
    font-family: var(--font-heading);
    font-weight: 700;
    font-size: 14px;
    line-height: 1;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.6);
    user-select: none;
    clip-path: polygon(
      20% 0%, 80% 0%,
      80% 0%, 80% 10%,
      80% 10%, 100% 10%,
      100% 10%, 100% 90%,
      100% 90%, 80% 90%,
      80% 90%, 80% 100%,
      80% 100%, 20% 100%,
      20% 100%, 20% 90%,
      20% 90%, 0% 90%,
      0% 90%, 0% 10%,
      0% 10%, 20% 10%,
      20% 10%, 20% 0%
    );
    box-shadow: 0 0 8px color-mix(in srgb, var(--pip-glow) 35%, transparent);
    flex-shrink: 0;
    cursor: default;
    transition: transform 0.15s, box-shadow 0.15s;
  }

  .pip:hover {
    transform: scale(1.15);
    box-shadow: 0 0 12px color-mix(in srgb, var(--pip-glow) 55%, transparent);
  }

  .pip.gem-disabled {
    opacity: 0.25;
    filter: saturate(0.2);
  }

  .stem {
    width: 1px;
    height: 15px;
    background: var(--color-border);
    flex-shrink: 0;
    align-self: flex-start;
    margin-left: 9px;
  }

  .gem-name {
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--color-text-dim);
    white-space: nowrap;
    position: absolute;
    top: 36px;
    left: 24px;
    transform-origin: top left;
    transform: rotate(55deg);
    border-bottom: 1px solid var(--color-border);
    padding-bottom: 2px;
  }

  .gem-name.support {
    font-style: italic;
    color: var(--color-text-muted);
  }

  .gem-name.gem-disabled {
    opacity: 0.3;
    text-decoration: line-through;
  }

  .link-bar {
    display: block;
    width: 10px;
    height: 4px;
    min-width: 10px;
    background: var(--color-text-muted);
    border-radius: 2px;
    flex-shrink: 0;
    margin-top: 14px; /* vertically center with pip */
  }

  .main .link-bar {
    background: var(--color-gold);
    box-shadow: 0 0 4px color-mix(in srgb, var(--color-gold) 40%, transparent);
  }
</style>
