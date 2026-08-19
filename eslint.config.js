import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

/**
 * react-hooks v7 ships with React-Compiler-borrowed rules (set-state-in-effect,
 * refs, immutability, preserve-manual-memoization) that are designed for
 * compiler-optimized apps. This MVP is not compiler-optimized; keep only the
 * classic `exhaustive-deps` rule.
 */
export default tseslint.config(
  { ignores: ["dist/**", "node_modules/**", "src-tauri/target/**", "vite.config.ts"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/refs": "off",
      "react-hooks/immutability": "off",
      "react-hooks/preserve-manual-memoization": "off",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
  {
    files: ["scripts/**/*.mjs"],
    languageOptions: {
      globals: {
        process: "readonly",
        console: "readonly",
      },
    },
  }
);