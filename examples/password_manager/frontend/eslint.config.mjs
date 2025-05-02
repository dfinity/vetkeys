// @ts-check

import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import svelte from "eslint-plugin-svelte";
import svelteConfig from "./svelte.config.js";

export default tseslint.config(
  eslint.configs.recommended,
  tseslint.configs.recommended,
  ...svelte.configs.recommended,
  {
    files: ["**/*.svelte", "**/*.svelte.ts", "**/*.svelte.js"],
    languageOptions: {
      parserOptions: {
        project: true,
        extraFileExtensions: [".svelte"],
        parser: tseslint.parser,
        svelteConfig,
      },
    },
  },
  {
    ignores: [
      "dist/",
      "src/declarations",
      "*.config.js",
      "*.config.cjs",
      "*.config.mjs",
      "*.config.ts",
    ],
  }
);
