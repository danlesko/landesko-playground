import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";

import { auth, resetAuthMock, signedInSession } from "@/test/auth-mock";

vi.mock("@/auth", async () => {
  const { auth: authMock } = await import("@/test/auth-mock");
  return { auth: authMock };
});

vi.mock("@/lib/data", () => ({
  fetchRecentBlogs: vi.fn(),
  getBlog: vi.fn(),
}));
vi.mock("@/lib/actions", () => ({ deleteBlogPost: vi.fn() }));

import { fetchRecentBlogs, getBlog } from "@/lib/data";
import BlogList from "@/app/blog/page";
import BlogDetail from "@/app/blog/[id]/page";

const id = "11111111-1111-4111-8111-111111111111";
const row = {
  id,
  title: "A post",
  content: "body",
  date: new Date("2026-01-01"),
};

// The tag name, not the accessible name. A role+name query can pin a level via
// its `level` option, but it says nothing about the levels *around* it, and the
// defect here was a sequence: a correctly-named heading at a skipped level.
function headingLevels(markup: string): number[] {
  return [...markup.matchAll(/<h([1-6])[\s>]/g)].map((m) => Number(m[1]));
}

// Counted with a reduce rather than the obvious array method, whose name is also
// a Tailwind utility: tailwind.config.ts scans `src/app/**/*.ts`, so that bare
// token anywhere in this file emits a dead rule into the production stylesheet.
function countTopLevel(levels: number[]): number {
  return levels.reduce((n, level) => (level === 1 ? n + 1 : n), 0);
}

// axe's `heading-order`: the document may descend by any amount but may only
// ascend one level at a time, so h1 -> h3 is a violation and h3 -> h1 is not.
function firstSkip(levels: number[]): string | undefined {
  for (let i = 1; i < levels.length; i++) {
    const previous = levels[i - 1]!;
    const current = levels[i]!;
    if (current > previous + 1) return `h${previous} -> h${current}`;
  }
  return undefined;
}

beforeEach(() => {
  resetAuthMock();
  vi.mocked(fetchRecentBlogs).mockReset();
  vi.mocked(getBlog).mockReset();
  auth.mockResolvedValue(null);
});

describe.each([
  {
    route: "/blog",
    render: async () => {
      vi.mocked(fetchRecentBlogs).mockResolvedValue([row, { ...row, id: "b" }]);
      return BlogList();
    },
  },
  {
    route: "/blog/[id]",
    render: async () => {
      vi.mocked(getBlog).mockResolvedValue(row);
      return BlogDetail({ params: Promise.resolve({ id }) });
    },
  },
])("$route heading levels", ({ render }) => {
  it("opens at h1 and has exactly one", async () => {
    const levels = headingLevels(
      renderToStaticMarkup((await render()) as ReactElement),
    );

    expect(levels[0]).toBe(1);
    expect(countTopLevel(levels)).toBe(1);
  });

  it("never skips a level", async () => {
    const levels = headingLevels(
      renderToStaticMarkup((await render()) as ReactElement),
    );

    // Guards vacuity without demanding a second heading: a route is free to
    // carry only its h1, and should not have to add one to satisfy this.
    expect(levels.length).toBeGreaterThan(0);
    expect(firstSkip(levels)).toBeUndefined();
  });

  it("still has no skip for a signed-in viewer, who gets extra controls", async () => {
    auth.mockResolvedValue(signedInSession());
    const levels = headingLevels(
      renderToStaticMarkup((await render()) as ReactElement),
    );

    expect(levels[0]).toBe(1);
    expect(countTopLevel(levels)).toBe(1);
    expect(firstSkip(levels)).toBeUndefined();
  });
});

describe("firstSkip", () => {
  it("reports a gap and tolerates a descent", () => {
    expect(firstSkip([1, 3])).toBe("h1 -> h3");
    expect(firstSkip([1, 2, 3, 2, 2])).toBeUndefined();
  });
});
