import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import eslint from "@eslint/js";
import prettier from "eslint-config-prettier";
import perfectionist from "eslint-plugin-perfectionist";
import sonarjs from "eslint-plugin-sonarjs";
import unicorn from "eslint-plugin-unicorn";
import vitest from "@vitest/eslint-plugin";
import tseslint from "typescript-eslint";

const tsconfigRootDir = dirname(fileURLToPath(import.meta.url));

export default tseslint.config(
  // ── Ignores ──────────────────────────────────────────────
  {
    ignores: [
      "src/proto/**",
      "node_modules/**",
      "dist/**",
      ".wrangler/**",
      "coverage/**",
      "*.config.ts", // Config files aren't application code
    ],
  },

  // ── Base presets ──────────────────────────────────────────
  eslint.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  unicorn.configs.recommended,
  sonarjs.configs.recommended,
  prettier, // Last preset — disables formatting rules

  // ── Parser settings ──────────────────────────────────────
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir,
      },
    },
  },

  // ── All TypeScript files ─────────────────────────────────
  {
    files: ["src/**/*.ts", "test/**/*.ts"],
    plugins: { perfectionist },
    rules: {
      // ── Correctness ──────────────────────────────────────
      // Equivalent: errcheck, staticcheck
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/switch-exhaustiveness-check": "error",

      // ── Type safety ──────────────────────────────────────
      // Equivalent: forcetypeassert, govet
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-non-null-assertion": "error",
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "separate-type-imports" },
      ],
      "@typescript-eslint/explicit-function-return-type": [
        "error",
        {
          allowExpressions: true,
          allowTypedFunctionExpressions: true,
          allowHigherOrderFunctions: true,
          allowDirectConstAssertionInArrowFunctions: true,
        },
      ],

      // ── Unused code ──────────────────────────────────────
      // Equivalent: unused, ineffassign
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

      // ── Complexity ────────────────────────────────────────
      // Equivalent: cyclop, gocognit, gocyclo, nestif, funlen
      "sonarjs/cognitive-complexity": ["error", 15],
      complexity: ["error", 15],
      "max-depth": ["error", 4],
      "max-lines-per-function": [
        "error",
        { max: 80, skipBlankLines: true, skipComments: true },
      ],
      "max-nested-callbacks": ["error", 3],

      // ── Naming ────────────────────────────────────────────
      // Equivalent: revive naming rules, varnamelen
      "@typescript-eslint/naming-convention": [
        "error",
        { selector: "default", format: ["camelCase"] },
        {
          selector: "variable",
          format: ["camelCase", "UPPER_CASE"],
        },
        {
          selector: "variable",
          modifiers: ["const", "exported"],
          format: ["camelCase", "PascalCase", "UPPER_CASE"],
        },
        {
          selector: "parameter",
          format: ["camelCase"],
          leadingUnderscore: "allow",
        },
        { selector: "typeLike", format: ["PascalCase"] },
        { selector: "enumMember", format: ["PascalCase"] },
        { selector: "property", format: null },
        { selector: "import", format: null },
      ],

      // ── No print statements ───────────────────────────────
      // Equivalent: forbidigo
      "no-console": "error",

      // ── Comment hygiene ───────────────────────────────────
      // Equivalent: godox
      "no-warning-comments": [
        "warn",
        { terms: ["fixme", "hack", "xxx", "bug"] },
      ],
      "sonarjs/todo-tag": "warn", // Warn, don't error — TODOs are valid during development

      // ── Import organization ───────────────────────────────
      // Equivalent: goimports
      "perfectionist/sort-imports": [
        "error",
        {
          type: "natural",
          groups: [
            "builtin",
            { newlinesBetween: 1 },
            "external",
            { newlinesBetween: 1 },
            "internal",
            "parent",
            "sibling",
            "index",
          ],
        },
      ],
      "perfectionist/sort-named-imports": ["error", { type: "natural" }],
      "perfectionist/sort-exports": ["error", { type: "natural" }],

      // ── General quality ───────────────────────────────────
      eqeqeq: ["error", "always"],
      "no-eval": "error",
      "no-implied-eval": "error",
      "prefer-const": "error",
      "no-var": "error",
      "object-shorthand": "error",
      "prefer-template": "error",

      // ── Unicorn overrides ─────────────────────────────────
      "unicorn/no-null": "off", // null is idiomatic in Web APIs, D1, R2
      "unicorn/prevent-abbreviations": [
        "error",
        {
          replacements: {
            args: false,
            config: false,
            ctx: false,
            db: false,
            env: false,
            err: false,
            fn: false,
            msg: false,
            params: false,
            props: false,
            req: false,
            res: false,
            ws: false,
          },
        },
      ],
      "unicorn/filename-case": ["error", { case: "kebabCase" }],
    },
  },

  // ── Test-specific relaxations ─────────────────────────────
  // Equivalent: golangci-lint _test.go exclusions
  {
    files: ["test/**/*.ts"],
    plugins: { vitest },
    rules: {
      ...vitest.configs.recommended.rules,

      // Relaxed in tests (mirrors Go test exclusions)
      "@typescript-eslint/no-floating-promises": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/consistent-type-assertions": "off",
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/naming-convention": "off",
      "sonarjs/cognitive-complexity": "off",
      "sonarjs/no-duplicate-string": "off",
      "max-lines-per-function": "off",
      complexity: "off",
      "no-console": "off",
    },
  },
);
