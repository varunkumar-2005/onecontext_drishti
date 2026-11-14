import js from "@eslint/js";
import globals from "globals";
export default [{ ignores: ["dist/**"] }, js.configs.recommended, { files: ["src/**/*.{js,jsx}"], languageOptions: { parserOptions: { ecmaVersion: "latest", sourceType: "module", ecmaFeatures: { jsx: true } }, globals: { ...globals.browser } }, rules: { "no-unused-vars": "off", "no-empty": "off" } }];
