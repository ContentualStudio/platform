import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "dist/**",
      "coverage/**"
    ]
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: [
      "src/**/*.ts"
    ],
    languageOptions: {
      globals: {
        ...globals.node
      }
    },
    rules: {
      // A leading underscore is how this codebase marks a parameter that is
      // deliberately part of a signature but unused by one implementation —
      // a stub adapter that must still refuse a caller who omits it.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }
      ]
    }
  },
  {
    // Programme matching decides which programme a user is given, and the
    // decision has to stay readable by the people who audit it. A ceiling is
    // enforced on the matching path — and only there, so the rule lands on new
    // code rather than destabilising modules it was never written against.
    files: [
      "src/challenge-setup/programmes/**/*.ts",
      "src/challenge-setup/challenge-setup.service.ts",
      "src/scripts/verify-published-programme-matching.ts"
    ],
    ignores: [
      "src/challenge-setup/programmes/**/*.test.ts"
    ],
    rules: {
      complexity: ["error", 10]
    }
  }
);
