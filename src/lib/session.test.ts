import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/auth", async () => {
  const { auth } = await import("@/test/auth-mock");
  return { auth };
});

import { getSession } from "@/lib/session";
import { getSession as loadersGetSession } from "@/app/blog/[id]/loaders";

// Resolved from this file rather than `process.cwd()`, so the walk below does
// not depend on where vitest was invoked from.
const appDir = fileURLToPath(new URL("../app", import.meta.url));

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry.name) && !entry.name.includes(".test.")
      ? [path]
      : [];
  });
}

/** The named bindings a file imports from `@/auth`, `auth as x` included. */
function authImports(source: string): string[] {
  return [...source.matchAll(/import\s*\{([^}]*)\}\s*from\s*"@\/auth"/g)]
    .flatMap((match) => (match[1] ?? "").split(","))
    .map((binding) => (binding.split(/\s+as\s+/)[0] ?? "").trim())
    .filter(Boolean);
}

/**
 * What this file can and cannot see.
 *
 * It cannot see the actual win. `cache()` is an identity pass-through in
 * React's non-RSC build, which is the one Vitest loads, so per-request
 * memoization does not happen here at all: calling `getSession()` twice calls
 * `auth` twice under test and once in a real render. No test in this suite can
 * assert the deduplication itself.
 *
 * What it can see is the thing that would break it. The memo only works if every
 * caller goes through the *same* wrapper — `cache` returns a new memo per call,
 * so a second `cache(auth)` anywhere is a second memo and a second read. That is
 * a property of the module graph, and the module graph is observable.
 */
describe("the shared session memo", () => {
  it("is one memo, not one per route", () => {
    // Identity, because equality of behaviour is not the point: two separate
    // `cache(auth)` wrappers behave identically and still read twice.
    expect(loadersGetSession).toBe(getSession);
  });

  // Everything under `src/app` renders inside a request that the root layout
  // also renders in, so a direct `auth()` there is a second verification of the
  // same cookie — and two reads can disagree, rendering a signed-in header over
  // signed-out content.
  //
  // Derived by walking the tree rather than from a list of the files that read
  // the session today, so a component added later is covered without anyone
  // remembering to add it. And keyed on the *import* rather than on a call
  // expression: `auth` cannot be called without being imported, so this holds
  // for `return auth()` and for `import { auth as a }` alike, which a search for
  // `await auth(` would miss.
  //
  // `signIn`/`signOut` and the route handler's `handlers` are other bindings
  // from the same module and are not session reads, so only `auth` is barred.
  it("is the only way anything under src/app reads the session", () => {
    const files = sourceFiles(appDir).map((path) => relative(appDir, path));

    // A walk that resolved nowhere would report no offenders and pass. These
    // two are the reason the test exists — the layout that renders on every
    // route, and the one that reads the session under it.
    expect(files).toContain("layout.tsx");
    expect(files).toContain("blog/BlogList.tsx");

    const offenders = files.filter((path) =>
      authImports(readFileSync(join(appDir, path), "utf8")).includes("auth"),
    );

    expect(offenders).toEqual([]);
  });

  it("reads the session through the real auth module", async () => {
    const { auth } = await import("@/test/auth-mock");
    auth.mockResolvedValue(null);

    await getSession();

    // Guards the assertion above against passing for the wrong reason: a
    // `getSession` that never called `auth` would satisfy both of them.
    expect(auth).toHaveBeenCalled();
  });
});
