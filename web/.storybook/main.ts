import type { StorybookConfig } from "@storybook/sveltekit";

const config: StorybookConfig = {
  stories: ["../src/**/*.stories.@(ts|svelte)"],
  staticDirs: [{ from: "../../plugins", to: "/plugins" }],
  addons: ["@storybook/addon-svelte-csf"],
  framework: "@storybook/sveltekit",
  env: (existing) => ({
    ...existing,
    // Mock env vars for components that transitively import $env/static/public
    // (e.g. AddSourceContent → PUBLIC_API_URL for install URLs)
    PUBLIC_CLERK_PUBLISHABLE_KEY: existing?.PUBLIC_CLERK_PUBLISHABLE_KEY ?? "pk_test_storybook",
    PUBLIC_API_URL: existing?.PUBLIC_API_URL ?? "https://api.savecraft.gg",
    PUBLIC_MCP_URL: existing?.PUBLIC_MCP_URL ?? "https://mcp.savecraft.gg",
    PUBLIC_APP_URL: existing?.PUBLIC_APP_URL ?? "https://my.savecraft.gg",
  }),
};

export default config;
