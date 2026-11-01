import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/.expo/**",
      "**/coverage/**",
      "**/playwright-report/**",
      "**/test-results/**",
      "apps/mobile/babel.config.js",
      "apps/mobile/metro.config.js",
      "apps/mobile/dist-*/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      // Plaintext message content must never be logged; console is restricted to warn/error.
      "no-console": ["error", { allow: ["warn", "error"] }],
    },
  },
  {
    // React Native bundles static assets through require().
    files: ["apps/mobile/**/*.tsx"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
  {
    files: ["scripts/**", "**/scripts/**", "tests/**", "services/api/src/migrate.ts", "**/*.test.ts"],
    rules: { "no-console": "off" },
  },
);
