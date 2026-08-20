import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

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
    ],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  // Rule overrides only — do not add `extends: ["next"]` here. Base `next` is
  // already inside `next/core-web-vitals`, and re-extending it from this last
  // position resets `@next/next/no-html-link-for-pages` and
  // `@next/next/no-sync-scripts` from error back to warn, which is the only
  // thing core-web-vitals adds over the base config.
  {
    rules: {
      "react/no-unescaped-entities": "off",
      "@next/next/no-page-custom-font": "off",
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
];

export default eslintConfig;
