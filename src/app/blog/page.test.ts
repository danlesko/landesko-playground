import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  Fragment,
  Suspense,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { auth, resetAuthMock, signedInSession } from "@/test/auth-mock";

vi.mock("@/auth", async () => {
  const { auth: authMock } = await import("@/test/auth-mock");
  return { auth: authMock };
});

vi.mock("@/lib/data", () => ({ fetchBlogPage: vi.fn(), BLOG_PAGE_SIZE: 10 }));
vi.mock("@/lib/actions", () => ({ deleteBlogPost: vi.fn() }));

import { fetchBlogPage } from "@/lib/data";
import BlogBodyAbbr from "@/components/BlogBodyAbbr";
// ./BlogList and not ./page: `page.tsx` is a synchronous shell that only
// declares the Suspense boundary, so calling it renders no rows and every
// assertion below would pass or fail for reasons unrelated to the list.
import BlogList, { BlogListSkeleton } from "@/app/blog/BlogList";
// The shell itself, covered separately at the bottom of this file.
import Blog from "@/app/blog/page";

const EMPTY_MESSAGE = "No posts to show yet.";

const row = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "A post",
  content: "body",
  date: new Date("2026-01-01"),
  private: false,
};

// Literal strings under intrinsic elements only. Descending into a component
// would let `<Something>No posts to show yet.</Something>` pass even if
// `Something` dropped its children, so an unrendered wrapper fails here rather
// than reading as a pass. Nothing below can see CSS, so this proves the text is
// in the tree, not that it is visible.
function textOf(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join(" ");
  // Fragments are descended into as well as intrinsics. A fragment is not a
  // component -- it renders its children verbatim and cannot drop them -- so
  // this does not reopen the hole the rule above closes. Without it a component
  // whose root is `<>` reads as rendering nothing, which is precisely how three
  // assertions here reported empty output while the markup was fine.
  if (
    isValidElement(node) &&
    (typeof node.type === "string" || node.type === Fragment)
  ) {
    return textOf((node.props as { children?: ReactNode }).children);
  }
  return "";
}

// `textOf` cannot see row content at all: every post renders inside
// `BlogBodyAbbr`, and descending into components is exactly what it refuses to
// do. So "no posts message absent" is satisfied by rendering *nothing*, and the
// negative assertion below needs a positive counterpart that counts the rows as
// elements instead of as text. Walks the same nodes -- intrinsics, fragments and
// arrays -- but reports the component elements it passes rather than entering
// them.
function countElements(node: ReactNode, type: unknown): number {
  if (Array.isArray(node)) {
    return node.reduce(
      (sum: number, child) => sum + countElements(child, type),
      0,
    );
  }
  if (!isValidElement(node)) return 0;
  const children = (node.props as { children?: ReactNode }).children;
  const here = node.type === type ? 1 : 0;
  if (typeof node.type === "string" || node.type === Fragment) {
    return here + countElements(children, type);
  }
  return here;
}

beforeEach(() => {
  resetAuthMock();
  vi.mocked(fetchBlogPage).mockReset();
  auth.mockResolvedValue(null);
});

describe("blog list page", () => {
  it("says so when there are no posts to show", async () => {
    vi.mocked(fetchBlogPage).mockResolvedValue({
      blogs: [],
      total: 0,
      totalPages: 1,
    });

    const tree = await BlogList({ searchParams: Promise.resolve({}) });
    expect(countElements(tree, BlogBodyAbbr)).toBe(0);
    expect(textOf(tree)).toContain(EMPTY_MESSAGE);
  });

  it("does not say so when there are posts", async () => {
    vi.mocked(fetchBlogPage).mockResolvedValue({
      blogs: [row],
      total: 1,
      totalPages: 1,
    });

    const tree = await BlogList({ searchParams: Promise.resolve({}) });
    // The row count is the load-bearing half. `not.toContain` alone is
    // satisfied by an empty render, so on its own it passed even when this
    // called a shell that rendered no list at all.
    expect(countElements(tree, BlogBodyAbbr)).toBe(1);
    expect(textOf(tree)).not.toContain(EMPTY_MESSAGE);
  });

  it("shows the same empty message to a signed-in viewer", async () => {
    auth.mockResolvedValue(signedInSession());
    vi.mocked(fetchBlogPage).mockResolvedValue({
      blogs: [],
      total: 0,
      totalPages: 1,
    });

    const tree = await BlogList({ searchParams: Promise.resolve({}) });
    expect(countElements(tree, BlogBodyAbbr)).toBe(0);
    expect(textOf(tree)).toContain(EMPTY_MESSAGE);
  });

  it("keeps a fetch failure out of the empty state", async () => {
    vi.mocked(fetchBlogPage).mockRejectedValue(
      new Error("Failed to fetch blogs."),
    );

    await expect(
      BlogList({ searchParams: Promise.resolve({}) }),
    ).rejects.toThrow("Failed to fetch blogs.");
  });
});

// Covered here because nothing else can. `page.tsx` is the file that keeps
// `/blog` streaming *and* keeps `/blog/[id]` able to answer 404: the boundary
// has to be declared inside this page rather than in a `loading.tsx`, because a
// `loading.tsx` at this segment would also cover the child route and flush its
// shell before the layout could set a status. That makes the boundary's
// existence a real invariant, and deleting it would regress the detail route's
// status with every test in this file still green.
describe("the /blog shell", () => {
  const findSuspense = (node: ReactNode): ReactElement | undefined => {
    if (!isValidElement(node)) return undefined;
    if (node.type === Suspense) return node;
    const { children } = node.props as { children?: ReactNode };
    for (const child of Array.isArray(children) ? children : [children]) {
      const found = findSuspense(child);
      if (found) return found;
    }
    return undefined;
  };

  it("declares a Suspense boundary whose fallback is the skeleton", () => {
    const suspense = findSuspense(Blog({ searchParams: Promise.resolve({}) }));

    expect(suspense).toBeDefined();
    const { fallback, children } = suspense!.props as {
      fallback: ReactElement;
      children: ReactElement;
    };
    // Component identity, not rendered output: two different components can
    // render the same pulse bars, and it is the wiring that is under test.
    expect(fallback.type).toBe(BlogListSkeleton);
    expect(children.type).toBe(BlogList);
  });

  // `next/navigation` is deliberately NOT mocked, following blog/[id]/page.test.ts:
  // the claim is that this produces the digest Next itself routes to a 404, and a
  // stand-in would only prove the stand-in was called.
  it("answers 404 for a well-formed page number past the end", async () => {
    vi.mocked(fetchBlogPage).mockResolvedValue({
      blogs: [],
      total: 5,
      totalPages: 1,
    });

    const error = await BlogList({
      searchParams: Promise.resolve({ page: "2" }),
    }).catch((thrown: unknown) => thrown);

    expect((error as { digest?: unknown }).digest).toBe(
      "NEXT_HTTP_ERROR_FALLBACK;404",
    );
  });

  // An empty blog is not a missing page. There is no post to be past the end of,
  // so ?page=2 shows the empty state rather than a 404 -- otherwise a fresh blog
  // would answer 404 for a URL that will become valid the moment a post exists.
  it("does not 404 on an empty blog, whatever the page number", async () => {
    vi.mocked(fetchBlogPage).mockResolvedValue({
      blogs: [],
      total: 0,
      totalPages: 1,
    });

    await expect(
      BlogList({ searchParams: Promise.resolve({ page: "9" }) }),
    ).resolves.toBeTruthy();
  });

  it("renders no rows itself, which is why the other suites import BlogList", () => {
    vi.mocked(fetchBlogPage).mockResolvedValue({
      blogs: [row],
      total: 1,
      totalPages: 1,
    });

    expect(
      countElements(Blog({ searchParams: Promise.resolve({}) }), BlogBodyAbbr),
    ).toBe(0);
    expect(vi.mocked(fetchBlogPage)).not.toHaveBeenCalled();
  });

  it("gives the fallback the same single h1 as the loaded list", () => {
    const markup = renderToStaticMarkup(BlogListSkeleton());
    const levels = [...markup.matchAll(/<h([1-6])[\s>]/g)].map((m) =>
      Number(m[1]),
    );

    // The heading order has to hold *during* the load too, and
    // ./heading-order.test.ts cannot see this: it renders BlogList, which is
    // what replaces this markup once the fetch resolves.
    expect(levels).toEqual([1]);
    expect(markup).toContain("Blog Posts");
  });
});
