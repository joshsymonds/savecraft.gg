<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";

  import Panel from "./Panel.svelte";
  import StatusDot from "./StatusDot.svelte";

  const { Story } = defineMeta({
    title: "Components/StatusDot",
    tags: ["autodocs"],
  });
</script>

<Story name="AllVariants">
  <div style="width: 480px;">
    <Panel>
      <div style="padding: 24px;">
        <div
          style="font-family: var(--font-pixel); font-size: 8px; color: var(--color-gold); letter-spacing: 2px; margin-bottom: 20px;"
        >
          STATUS VARIANTS
        </div>
        <div style="display: flex; gap: 48px; align-items: flex-start;">
          {#each [{ status: "online", label: "ONLINE", desc: "Source connected & syncing" }, { status: "error", label: "ERROR", desc: "Parse failure detected" }, { status: "offline", label: "OFFLINE", desc: "Last seen 2h ago" }] as variant (variant.status)}
            <div
              style="display: flex; flex-direction: column; align-items: center; gap: 10px; min-width: 100px;"
            >
              <StatusDot status={variant.status} size={24} />
              <div style="text-align: center;">
                <div
                  style="font-family: var(--font-pixel); font-size: 7px; color: var(--color-text); letter-spacing: 1px; margin-bottom: 4px;"
                >
                  {variant.label}
                </div>
                <div
                  style="font-family: var(--font-body); font-size: 18px; color: var(--color-text-muted);"
                >
                  {variant.desc}
                </div>
              </div>
            </div>
          {/each}
        </div>
      </div>
    </Panel>
  </div>
</Story>

<Story name="InContext">
  <div style="width: 420px;">
    <Panel>
      <div
        style="padding: 12px 16px; background: rgba(5,7,26,0.4); border-bottom: 1px solid rgba(74,90,173,0.12);"
      >
        <span
          style="font-family: var(--font-pixel); font-size: 7px; color: var(--color-gold); letter-spacing: 2px;"
          >SOURCES</span
        >
      </div>
      {#each [{ status: "online", name: "STEAM-DECK", detail: "SteamOS 3.5 · v0.1.0" }, { status: "error", name: "DESKTOP-PC", detail: "parse error on Fallout 4" }, { status: "offline", name: "LAPTOP", detail: "last seen 2 days ago" }] as source (source.name)}
        <div
          style="display: flex; align-items: center; gap: 12px; padding: 14px 18px; border-bottom: 1px solid rgba(74,90,173,0.06);"
        >
          <StatusDot status={source.status} size={10} />
          <div>
            <div
              style="font-family: var(--font-pixel); font-size: 8px; color: var(--color-text); letter-spacing: 0.5px;"
            >
              {source.name}
            </div>
            <div
              style="font-family: var(--font-body); font-size: 18px; color: var(--color-text-muted); margin-top: 2px;"
            >
              {source.detail}
            </div>
          </div>
        </div>
      {/each}
    </Panel>
  </div>
</Story>

<Story name="Sizes">
  <div style="width: 480px;">
    <Panel>
      <div style="padding: 24px;">
        <div
          style="font-family: var(--font-pixel); font-size: 8px; color: var(--color-gold); letter-spacing: 2px; margin-bottom: 20px;"
        >
          SIZE SCALE
        </div>
        <div style="display: flex; gap: 32px; align-items: flex-end;">
          {#each [6, 8, 12, 16, 24, 32] as size (size)}
            <div style="display: flex; flex-direction: column; align-items: center; gap: 10px;">
              <StatusDot status="online" {size} />
              <span
                style="font-family: var(--font-body); font-size: 18px; color: var(--color-text-muted);"
                >{size}px</span
              >
            </div>
          {/each}
        </div>
      </div>
    </Panel>
  </div>
</Story>
