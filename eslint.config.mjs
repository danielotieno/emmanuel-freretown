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
    ],
  },
  {
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      // CLAUDE.md rule 2: no personal data in logs. Use a structured logger that strips it.
      "no-console": ["error", { allow: ["warn", "error"] }],
    },
  },
  {
    files: ["scripts/**", "tests/**", "*.config.*"],
    rules: { "no-console": "off" },
  },
];

export default config;
