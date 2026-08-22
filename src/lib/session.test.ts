import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/auth", async () => {
  const { auth } = await import("@/test/auth-mock");
  return { auth };
});

import { getSession } from "@/lib/session";
import { getSession as loadersGetSession } from "@/app/blog/[id]/loaders";

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

  // Everything rendered above or beside a route sees the same request, so a
  // bare `auth()` there is a second verification of the same cookie — and two
  // reads can disagree, rendering a signed-in header over signed-out content.
  // Server actions are excluded: each is its own request, with nothing to share.
  it("is the only way rendered code reads the session", () => {
    const rendered = [
      "src/app/layout.tsx",
      "src/app/blog/BlogList.tsx",
      "src/app/blog/[id]/layout.tsx",
      "src/app/blog/[id]/page.tsx",
    ];

    const offenders = rendered.filter((path) =>
      /\bawait auth\(/.test(readFileSync(path, "utf8")),
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
