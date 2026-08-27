import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";

import { auth, resetAuthMock, signedInSession } from "@/test/auth-mock";

vi.mock("@/auth", async () => {
  const { auth: authMock } = await import("@/test/auth-mock");
  return { auth: authMock };
});

vi.mock("@/lib/data", () => ({
  fetchBlogPage: vi.fn(),
  getBlog: vi.fn(),
}));
vi.mock("@/lib/actions", () => ({ deleteBlogPost: vi.fn() }));

import { fetchBlogPage, getBlog } from "@/lib/data";
// `blog/BlogList` and not `blog/page`. `blog/page.tsx` is a synchronous shell
// whose only job is to declare a `<Suspense>`, so `renderToStaticMarkup` on it
// renders the *fallback*: this file used to import it under the name `BlogList`,
// which kept compiling and kept passing while asserting the heading order of the
// skeleton. Measured: the markup contained no row title and the page query
// was never called, so the signed-in case below rendered zero of the controls it
// exists to check. The shell's own fallback is covered in blog/page.test.ts.
import BlogList from "@/app/blog/BlogList";
import BlogDetail from "@/app/blog/[id]/page";
import Animation from "@/app/animation/page";

const id = "11111111-1111-4111-8111-111111111111";
const row = {
  id,
  title: "A post",
  content: "body",
  date: new Date("2026-01-01"),
  private: false,
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
  vi.mocked(fetchBlogPage).mockReset();
  vi.mocked(getBlog).mockReset();
  auth.mockResolvedValue(null);
});

describe.each([
  {
    route: "/blog",
    render: async () => {
      vi.mocked(fetchBlogPage).mockResolvedValue({
        blogs: [row, { ...row, id: "b" }],
        total: 2,
        totalPages: 1,
        page: 1,
      });
      return BlogList({ searchParams: Promise.resolve({}) });
    },
  },
  {
    route: "/blog/[id]",
    render: async () => {
      vi.mocked(getBlog).mockResolvedValue(row);
      return BlogDetail({ params: Promise.resolve({ id }) });
    },
  },
  // The only route besides /blog carrying more than a lone h1, so the only
  // other one where a level can be skipped. It needs none of the mocking
  // above — no data, session or env — and the `beforeEach` resets are inert for
  // it. `ProcessingDrawing` does render its own wrapping `<div>`, but its p5
  // wrapper is a `dynamic(..., { ssr: false })` import, so it contributes no
  // *heading* markup here; the two this asserts are the page's own.
  {
    route: "/animation",
    render: async () => Animation(),
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

  // The name no longer promises extra controls, because it stopped being true
  // for every fixture when /animation joined: the blog routes gain owner-only
  // controls when signed in, /animation renders identically either way. Kept
  // for /animation rather than skipped, so the day it does grow a
  // session-dependent heading it is already covered.
  it("still has no skip for a signed-in viewer", async () => {
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
