import type { Preview } from "@storybook/svelte";

import "../src/view.css";

const preview: Preview = {
  parameters: {
    layout: "centered",
    backgrounds: {
      default: "claude-dark",
      values: [
        { name: "claude-dark", value: "#2b2a27" },
        { name: "claude-light", value: "#f3f3ee" },
        { name: "chatgpt-dark", value: "#212121" },
        { name: "chatgpt-light", value: "#ffffff" },
        { name: "savecraft", value: "#05071a" },
      ],
    },
  },
  globalTypes: {
    theme: {
      description: "Savecraft view theme",
      toolbar: {
        title: "Theme",
        icon: "paintbrush",
        items: [
          { value: "dark", title: "Dark", icon: "moon" },
          { value: "light", title: "Light", icon: "sun" },
        ],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: {
    theme: "dark",
  },
  decorators: [
    (Story, context) => {
      const theme = context.globals.theme || "dark";
      document.documentElement.dataset.theme = theme;
      document.documentElement.style.colorScheme = theme;
      return Story();
    },
  ],
};

export default preview;
