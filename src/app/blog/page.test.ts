import { beforeEach, describe, expect, it, vi } from "vitest";
import { isValidElement, type ReactNode } from "react";

import { auth, resetAuthMock, signedInSession } from "@/test/auth-mock";

vi.mock("@/auth", async () => {
  const { auth: authMock } = await import("@/test/auth-mock");
  return { auth: authMock };
});

vi.mock("@/lib/data", () => ({ fetchRecentBlogs: vi.fn() }));
vi.mock("@/lib/actions", () => ({ deleteBlogPost: vi.fn() }));

import { fetchRecentBlogs } from "@/lib/data";
import Blog from "@/app/blog/page";

const EMPTY_MESSAGE = "No posts to show yet.";

const row = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "A post",
  content: "body",
  date: "2026-01-01",
};

// Literal strings under intrinsic elements only. Descending into a component
// would let `<Something>No posts to show yet.</Something>` pass even if
// `Something` dropped its children, so an unrendered wrapper fails here rather
// than reading as a pass. Nothing below can see CSS, so this proves the text is
// in the tree, not that it is visible.
function textOf(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join(" ");
  if (isValidElement(node) && typeof node.type === "string") {
    return textOf((node.props as { children?: ReactNode }).children);
  }
  return "";
}

beforeEach(() => {
  resetAuthMock();
  vi.mocked(fetchRecentBlogs).mockReset();
  auth.mockResolvedValue(null);
});

describe("blog list page", () => {
  it("says so when there are no posts to show", async () => {
    vi.mocked(fetchRecentBlogs).mockResolvedValue([]);

    expect(textOf(await Blog())).toContain(EMPTY_MESSAGE);
  });

  it("does not say so when there are posts", async () => {
    vi.mocked(fetchRecentBlogs).mockResolvedValue([row]);

    expect(textOf(await Blog())).not.toContain(EMPTY_MESSAGE);
  });

  it("shows the same empty message to a signed-in viewer", async () => {
    auth.mockResolvedValue(signedInSession());
    vi.mocked(fetchRecentBlogs).mockResolvedValue([]);

    expect(textOf(await Blog())).toContain(EMPTY_MESSAGE);
  });

  it("keeps a fetch failure out of the empty state", async () => {
    vi.mocked(fetchRecentBlogs).mockRejectedValue(
      new Error("Failed to fetch blogs."),
    );

    await expect(Blog()).rejects.toThrow("Failed to fetch blogs.");
  });
});
