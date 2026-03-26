import type { Preview } from "@storybook/svelte";

import "../src/app.css";

const preview: Preview = {
  parameters: {
    layout: "fullscreen",
    backgrounds: {
      default: "savecraft",
      values: [{ name: "savecraft", value: "#05071a" }],
    },
  },
};

export default preview;
