import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // No `oxc: { jsx: { runtime: "automatic" } }` here, and its absence is a result
  // rather than an omission. It existed because tsconfig set `jsx: "preserve"`
  // for Next, which leaves JSX in the output and made any `.tsx` module that
  // actually emits JSX unparseable in this runner -- one holding only TypeScript
  // was always fine. Next 16 rewrites that setting to `react-jsx` on
  // first run (#125), so the tsconfig now specifies the automatic runtime itself
  // and Vitest picks it up from there. Verified by deleting the override: all 344
  // tests still pass. Reverting tsconfig to `preserve` would break this suite
  // loudly, which is the right way round.
  resolve: {
    alias: {
      // Mirrors the `@/*` -> `./src/*` mapping in tsconfig.json.
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    // Explicit imports from "vitest" instead of globals, so no extra entry is
    // needed in tsconfig's `types` and the tests typecheck as ordinary modules.
    globals: false,
    include: ["src/**/*.test.ts"],
    setupFiles: ["./src/test/setup.ts"],
  },
});
