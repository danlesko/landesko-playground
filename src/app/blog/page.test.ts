import { beforeEach, describe, expect, it, vi } from "vitest";
import { Fragment, isValidElement, type ReactNode } from "react";

import { auth, resetAuthMock, signedInSession } from "@/test/auth-mock";

vi.mock("@/auth", async () => {
  const { auth: authMock } = await import("@/test/auth-mock");
  return { auth: authMock };
});

vi.mock("@/lib/data", () => ({ fetchRecentBlogs: vi.fn() }));
vi.mock("@/lib/actions", () => ({ deleteBlogPost: vi.fn() }));

import { fetchRecentBlogs } from "@/lib/data";
import MyBlogBodyAbbr from "@/components/MyBlogBodyAbbr";
// ./BlogList and not ./page: `page.tsx` is a synchronous shell that only
// declares the Suspense boundary, so calling it renders no rows and every
// assertion below would pass or fail for reasons unrelated to the list.
import BlogList from "@/app/blog/BlogList";

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
// `MyBlogBodyAbbr`, and descending into components is exactly what it refuses to
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
  vi.mocked(fetchRecentBlogs).mockReset();
  auth.mockResolvedValue(null);
});

describe("blog list page", () => {
  it("says so when there are no posts to show", async () => {
    vi.mocked(fetchRecentBlogs).mockResolvedValue([]);

    const tree = await BlogList();
    expect(countElements(tree, MyBlogBodyAbbr)).toBe(0);
    expect(textOf(tree)).toContain(EMPTY_MESSAGE);
  });

  it("does not say so when there are posts", async () => {
    vi.mocked(fetchRecentBlogs).mockResolvedValue([row]);

    const tree = await BlogList();
    // The row count is the load-bearing half. `not.toContain` alone is
    // satisfied by an empty render, so on its own it passed even when this
    // called a shell that rendered no list at all.
    expect(countElements(tree, MyBlogBodyAbbr)).toBe(1);
    expect(textOf(tree)).not.toContain(EMPTY_MESSAGE);
  });

  it("shows the same empty message to a signed-in viewer", async () => {
    auth.mockResolvedValue(signedInSession());
    vi.mocked(fetchRecentBlogs).mockResolvedValue([]);

    const tree = await BlogList();
    expect(countElements(tree, MyBlogBodyAbbr)).toBe(0);
    expect(textOf(tree)).toContain(EMPTY_MESSAGE);
  });

  it("keeps a fetch failure out of the empty state", async () => {
    vi.mocked(fetchRecentBlogs).mockRejectedValue(
      new Error("Failed to fetch blogs."),
    );

    await expect(BlogList()).rejects.toThrow("Failed to fetch blogs.");
  });
});
