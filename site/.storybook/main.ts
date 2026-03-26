import type { StorybookConfig } from "@storybook/sveltekit";

const config: StorybookConfig = {
  stories: ["../src/**/*.stories.@(ts|svelte)"],
  staticDirs: ["../static"],
  addons: ["@storybook/addon-svelte-csf"],
  framework: "@storybook/sveltekit",
  env: (existing) => ({
    ...existing,
    PUBLIC_APP_URL: existing?.PUBLIC_APP_URL ?? "https://my.savecraft.gg",
    PUBLIC_INSTALL_URL: existing?.PUBLIC_INSTALL_URL ?? "https://install.savecraft.gg",
  }),
};

export default config;
