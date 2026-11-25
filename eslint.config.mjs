import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Architecture rules (module boundaries, no Drizzle in routes) live in .dependency-cruiser.cjs.
const config = [
  ...nextVitals,
  ...nextTs,
  {
    ignores: [
      ".next/**",
      ".open-next/**",
      ".wrangler/**",
      "src/paraglide/**",
      "next-env.d.ts",
      "cloudflare-env.d.ts",
      "playwright-report/**",
      "test-results/**",
      ".claude/worktrees/**",
      // Vendored Impeccable skill (#85): third-party code, upgraded with `npx impeccable update`.
      ".claude/skills/impeccable/**",
      ".github/skills/impeccable/**",
    ],
  },
  {
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      // CLAUDE.md rule 2: no personal data in logs. Log through createLogger from
      // src/modules/observability, the only path to the console (issue #9).
      "no-console": "error",
    },
  },
  {
    files: ["scripts/**", "tests/**", "*.config.*", "**/*.test.ts"],
    rules: { "no-console": "off" },
  },
];

export default config;
