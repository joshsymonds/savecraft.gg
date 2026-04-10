<!--
  @component
  Rich tooltip content for a PoE gem. Designed to be rendered inside HoverTip's tip snippet.
  Shows gem name, tags, description, level/quality, attribute requirements, and cast time.
-->
<script lang="ts">
  import { GEM_COLORS } from "./colors";

  interface Props {
    /** Gem display name */
    name: string;
    /** Gem attribute color */
    color?: "R" | "G" | "B" | "W";
    /** Whether this is a support gem */
    support?: boolean;
    /** Whether this is a vaal gem */
    vaal?: boolean;
    /** Gem level */
    level?: number;
    /** Gem quality percentage */
    quality?: number;
    /** Quality type ID (Default, Anomalous, Divergent, Phantasmal) */
    qualityId?: string;
    /** Gem tag string, e.g. "Spell, Lightning, Duration" */
    tags?: string;
    /** Gem description text */
    description?: string;
    /** Base cast time in seconds */
    castTime?: number;
    /** Strength requirement */
    reqStr?: number;
    /** Dexterity requirement */
    reqDex?: number;
    /** Intelligence requirement */
    reqInt?: number;
    /** Natural max level (20 for most, 5 for Empower etc.) */
    naturalMaxLevel?: number;
    /** Whether this gem has a global effect (aura, etc.) */
    hasGlobalEffect?: boolean;
  }

  let {
    name, color = "W", support = false, vaal = false,
    level, quality, qualityId,
    tags, description, castTime,
    reqStr, reqDex, reqInt, naturalMaxLevel,
    hasGlobalEffect = false,
  }: Props = $props();

  const COLOR_LABELS: Record<string, string> = { R: "Str", G: "Dex", B: "Int", W: "—" };
  const COLOR_MAP: Record<string, keyof typeof GEM_COLORS> = { R: "str", G: "dex", B: "int", W: "white" };

  let gemColor = $derived(GEM_COLORS[COLOR_MAP[color] ?? "white"]);
  let qualityLabel = $derived(
    qualityId && qualityId !== "Default" ? qualityId : undefined
  );
  let hasRequirements = $derived((reqStr && reqStr > 0) || (reqDex && reqDex > 0) || (reqInt && reqInt > 0));
</script>

<div class="gem-tooltip">
  <!-- Header: name + type -->
  <div class="header">
    <span class="gem-name" style:color={gemColor.glow}>{name}</span>
    {#if support}
      <span class="gem-type">Support</span>
    {:else if vaal}
      <span class="gem-type vaal">Vaal</span>
    {/if}
  </div>

  <!-- Tags line -->
  {#if tags}
    <div class="tags">{tags}</div>
  {/if}

  <!-- Level / Quality row -->
  <div class="stats-row">
    {#if level != null}
      <span class="stat">
        Level <strong>{level}</strong>{#if naturalMaxLevel}&hairsp;/&hairsp;{naturalMaxLevel}{/if}
      </span>
    {/if}
    {#if quality != null && quality > 0}
      <span class="stat">
        Quality <strong>{quality}%</strong>{#if qualityLabel} <span class="alt-qual">({qualityLabel})</span>{/if}
      </span>
    {/if}
  </div>

  <!-- Cast time -->
  {#if castTime != null && castTime > 0 && !support}
    <div class="detail">Cast Time: {castTime}s</div>
  {/if}

  <!-- Global effect flag -->
  {#if hasGlobalEffect}
    <div class="detail aura">Aura / Global Effect</div>
  {/if}

  <!-- Description -->
  {#if description}
    <div class="description">{description}</div>
  {/if}

  <!-- Attribute requirements -->
  {#if hasRequirements}
    <div class="requirements">
      Requires
      {#if reqStr && reqStr > 0}<span class="req str">{reqStr} Str</span>{/if}
      {#if reqDex && reqDex > 0}<span class="req dex">{reqDex} Dex</span>{/if}
      {#if reqInt && reqInt > 0}<span class="req int">{reqInt} Int</span>{/if}
    </div>
  {/if}
</div>

<style>
  .gem-tooltip {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 200px;
    max-width: 320px;
  }

  .header {
    display: flex;
    align-items: baseline;
    gap: var(--space-sm);
  }

  .gem-name {
    font-family: var(--font-heading);
    font-size: 15px;
    font-weight: 700;
  }

  .gem-type {
    font-family: var(--font-pixel);
    font-size: 8px;
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 1px;
  }

  .gem-type.vaal {
    color: #e85a4a;
  }

  .tags {
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--color-text-muted);
    font-style: italic;
  }

  .stats-row {
    display: flex;
    gap: var(--space-md);
  }

  .stat {
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--color-text-dim);
  }

  .stat strong {
    color: var(--color-text);
    font-weight: 600;
  }

  .alt-qual {
    color: var(--color-text-muted);
    font-size: 11px;
  }

  .detail {
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--color-text-dim);
  }

  .detail.aura {
    color: var(--color-info);
  }

  .description {
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--color-text);
    line-height: 1.5;
    border-top: 1px solid var(--color-border-light);
    padding-top: 4px;
    margin-top: 2px;
    white-space: pre-line;
  }

  .requirements {
    font-family: var(--font-body);
    font-size: 11px;
    color: var(--color-text-muted);
    display: flex;
    gap: var(--space-sm);
    border-top: 1px solid var(--color-border-light);
    padding-top: 4px;
    margin-top: 2px;
  }

  .req { font-weight: 500; }
  .req.str { color: #e85a4a; }
  .req.dex { color: #5abe6a; }
  .req.int { color: #4a8ad0; }
</style>
