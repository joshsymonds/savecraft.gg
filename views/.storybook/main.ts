import type { StorybookConfig } from "@storybook/sveltekit";

const config: StorybookConfig = {
  stories: [
    "../../worker/src/mcp/views/*.stories.svelte",
    "../../plugins/*/reference/views/*.stories.svelte",
  ],
  staticDirs: [{ from: "../../plugins", to: "/plugins" }],
  addons: ["@storybook/addon-svelte-csf"],
  framework: "@storybook/sveltekit",
};

export default config;
