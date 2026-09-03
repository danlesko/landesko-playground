import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [
  // `next lint` skipped build output implicitly. The ESLint CLI does not, and
  // linting generated files reports thousands of problems we cannot fix.
  {
    ignores: [
      ".next/**",
      "next-env.d.ts",
      "src/**/_lib/**",
      ".vercel/**",
      "coverage/**",
      // Coding-agent scratch checkouts. Flat config lints dot-directories, and
      // each of these is a full worktree, so the run covers 167 files instead of
      // 39 and reports a copy nobody edits. A worktree without its own
      // node_modules turns that into hundreds of unresolved-import errors.
      ".claude/**",
      // Playwright's generated report and traces.
      "test-results/**",
      "playwright-report/**",
      "blob-report/**",
    ],
  },
  // Imported directly rather than through `FlatCompat`, and the shim is gone with
  // it. eslint-config-next 16 ships real flat config -- `./core-web-vitals` and
  // `./typescript` each default-export a config ARRAY -- so wrapping them in a
  // compatibility layer for eslintrc-format configs is no longer just redundant,
  // it crashes: FlatCompat serialises what it is given to validate it against the
  // eslintrc schema, and the flat config holds a circular reference through
  // `configs.flat`, so `pnpm lint` died with "Converting circular structure to
  // JSON" the moment eslint-config-next moved to 16.
  //
  // `@eslint/eslintrc` was a devDependency for this one import and is now
  // uninstalled. That does NOT clear its `ajv@6` / `minimatch@3` /
  // `brace-expansion@1` subtree, which an earlier draft claimed: eslint 9 depends
  // on `@eslint/eslintrc` itself, so all four are still in the lockfile
  // transitively. Removing a direct dependency removes a direct dependency. The
  // advisories #127 is about need eslint 10, not this.
  //
  // Still core-web-vitals rather than the bare entry: it is a superset, appending
  // a 22-entry override block on top of the same base `next` config the bare entry
  // carries. Only two of those 22 differ in effect from the base -- the two named
  // next. The old warning about not re-extending base `next` afterwards applies
  // for exactly that reason -- doing so would reset `no-html-link-for-pages` and
  // `no-sync-scripts` from error back to warn, which is the only thing
  // core-web-vitals adds.
  ...nextCoreWebVitals,
  ...nextTypescript,
  // Rule overrides only.
  {
    rules: {
      "react/no-unescaped-entities": "off",
      "@next/next/no-page-custom-font": "off",
      // `@typescript-eslint/no-explicit-any` is deliberately NOT disabled here.
      // It was, project-wide, and that is the only reason two `any` sites in the
      // history ever passed lint. Leaving it on is the half that stops them
      // coming back; re-adding the "off" line silently re-opens the hole rather
      // than failing anything.
    },
  },
];

export default eslintConfig;
