import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import eslint from "@eslint/js";
import prettier from "eslint-config-prettier";
import svelte from "eslint-plugin-svelte";
import globals from "globals";
import tseslint from "typescript-eslint";
import svelteParser from "svelte-eslint-parser";

const tsconfigRootDir = dirname(fileURLToPath(import.meta.url));

export default tseslint.config(
  // ── Ignores ──────────────────────────────────────────────
  {
    ignores: [".svelte-kit/**", ".storybook/**", "build/**", "node_modules/**", "*.config.ts", "*.config.js"],
  },

  // ── Base presets ──────────────────────────────────────────
  eslint.configs.recommended,
  ...tseslint.configs.strict,
  ...svelte.configs.recommended,
  prettier,

  // ── Parser settings ──────────────────────────────────────
  {
    languageOptions: {
      globals: globals.browser,
      parserOptions: {
        projectService: {
          allowDefaultProject: ["vitest-setup.ts"],
        },
        tsconfigRootDir,
        extraFileExtensions: [".svelte"],
      },
    },
  },

  // ── Svelte files ─────────────────────────────────────────
  {
    files: ["**/*.svelte", "**/*.svelte.ts"],
    languageOptions: {
      parser: svelteParser,
      parserOptions: {
        parser: tseslint.parser,
      },
    },
  },

  // ── All TypeScript + Svelte files ─────────────────────────
  {
    files: ["src/**/*.ts", "src/**/*.svelte"],
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          args: "all",
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrors: "all",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      "no-console": "error",
      eqeqeq: ["error", "always"],
      "prefer-const": "error",
      "no-var": "error",
    },
  },

  // ── Svelte-specific relaxations ───────────────────────────
  {
    files: ["**/*.svelte"],
    rules: {
      // Svelte 5 $state/$derived require `let` for reactive bindings
      "prefer-const": "off",
      // Svelte reactive declarations appear unused to TS analysis
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          args: "all",
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^(_|\\$\\$)",
          caughtErrors: "all",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      "max-lines-per-function": "off",
      // Static site uses external URLs, not SvelteKit navigation
      "svelte/no-navigation-without-resolve": "off",
    },
  },

  // ── Test-specific relaxations ─────────────────────────────
  {
    files: ["src/**/*.test.ts", "vitest-setup.ts"],
    rules: {
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "no-console": "off",
    },
  },
);
