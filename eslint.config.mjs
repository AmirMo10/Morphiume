import { defineConfig, globalIgnores } from "eslint/config";
import js from "@eslint/js";
import ts from "typescript-eslint";
import nextPlugin from "@next/eslint-plugin-next";
import reactHooks from "eslint-plugin-react-hooks";

export default defineConfig([
  globalIgnores([".next/**", "node_modules/**", ".local/**", "**/.local/**", "test-results/**", "playwright-report/**", "artifacts/**", "next-env.d.ts"]),
  {
    files: ["**/*.ts", "**/*.tsx"],
    extends: [js.configs.recommended, ts.configs.recommended],
    plugins: { "@next/next": nextPlugin, "react-hooks": reactHooks },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules,
      ...reactHooks.configs.recommended.rules,
      "no-undef": "off",
    },
  },
]);
