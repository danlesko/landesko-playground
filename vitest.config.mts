import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // tsconfig sets `jsx: "preserve"` for Next, which leaves JSX in the output and
  // makes any `.tsx` module unparseable here. Server components are still
  // importable as plain functions once it is transformed.
  oxc: { jsx: { runtime: "automatic" } },
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
