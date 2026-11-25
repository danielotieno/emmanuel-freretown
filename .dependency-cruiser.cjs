/**
 * Architecture rules from CLAUDE.md. Run with `pnpm lint:deps`.
 * @type {import('dependency-cruiser').IConfiguration}
 */
module.exports = {
  forbidden: [
    {
      name: "modules-no-framework",
      comment:
        "Business logic in src/modules must not import Next.js, React or the app layer (ADR 0001).",
      severity: "error",
      from: { path: "^src/modules/" },
      to: { path: ["(^|/)node_modules/(next|react|react-dom)/", "^src/(app|components)/"] },
    },
    {
      name: "module-public-api-from-other-modules",
      comment: "A module imports another module only through its index.ts.",
      severity: "error",
      from: { path: "^src/modules/([^/]+)/" },
      to: {
        path: "^src/modules/[^/]+/.+",
        pathNot: ["^src/modules/$1/", "^src/modules/[^/]+/index\\.ts$"],
      },
    },
    {
      name: "module-public-api-from-outside",
      comment: "Code outside src/modules imports a module only through its index.ts.",
      severity: "error",
      from: { pathNot: "^src/modules/" },
      to: { path: "^src/modules/[^/]+/.+", pathNot: "^src/modules/[^/]+/index\\.ts$" },
    },
    {
      name: "no-db-in-app",
      comment:
        "Database access only through modules (CLAUDE.md rule 5). Routes and components may only obtain the request's db handle through src/app/_lib/db.ts.",
      severity: "error",
      from: { path: "^src/(app|components)/", pathNot: "^src/app/_lib/db\\.ts$" },
      to: { path: ["^src/db/", "(^|/)node_modules/(drizzle-orm|pg)/"] },
    },
    {
      name: "db-only-from-modules",
      comment: "Only modules (and the db helper) use the schema and Drizzle.",
      severity: "error",
      from: { pathNot: ["^src/modules/", "^src/db/", "^src/app/_lib/db\\.ts$"] },
      to: { path: ["^src/db/schema/", "(^|/)node_modules/drizzle-orm/"] },
    },
    {
      name: "no-circular",
      comment:
        "Circular imports, except Drizzle schema files whose foreign keys refer to each other lazily.",
      severity: "error",
      from: { pathNot: "^src/db/schema/" },
      to: { circular: true },
    },
    {
      name: "not-to-unresolvable",
      comment:
        "Except OpenNext's build output, which src/jobs/worker.ts imports and which only exists after `opennextjs-cloudflare build`.",
      severity: "error",
      from: {},
      to: { couldNotResolve: true, pathNot: "(^|/)\\.open-next/" },
    },
  ],
  options: {
    doNotFollow: { path: ["node_modules", "^\\.open-next/"] },
    exclude: { path: "^src/paraglide/" },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: "tsconfig.json" },
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default", "types"],
      extensions: [".ts", ".tsx", ".js", ".mjs", ".cjs", ".d.ts"],
    },
  },
};
