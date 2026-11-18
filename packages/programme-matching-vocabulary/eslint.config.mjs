import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.ts"],
    languageOptions: { globals: { ...globals.node } },
    rules: {
      // This package is the matching trust boundary: every branch here decides
      // who gets assigned what. A function that outgrows ten paths is a rule
      // engine hiding inside a helper, so the limit is enforced, not advised.
      complexity: ["error", 10],
    },
  },
);
