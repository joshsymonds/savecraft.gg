/** Design tokens extracted from savecraft-devices-v11.jsx wireframe. */

export const colors = {
  bg: "#05071a",
  panelBg: "linear-gradient(135deg, #0a0e2e 0%, #111b47 50%, #0a0e2e 100%)",

  border: "#4a5aad",
  borderLight: "#7a8aed",

  gold: "#c8a84e",
  goldLight: "#e8c86e",
  green: "#5abe8a",
  red: "#e85a5a",
  yellow: "#e8c44e",
  blue: "#4a9aea",

  text: "#e8e0d0",
  textDim: "#8890b8",
  textMuted: "#4a5080",
} as const;

export type ColorToken = keyof typeof colors;
