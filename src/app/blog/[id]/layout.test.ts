import { beforeEach, describe, expect, it, vi } from "vitest";

import { auth, resetAuthMock, signedInSession } from "@/test/auth-mock";

vi.mock("@/auth", async () => {
  const { auth: authMock } = await import("@/test/auth-mock");
  return { auth: authMock };
});

vi.mock("@/lib/data", () => ({ getBlog: vi.fn() }));

// `next/navigation` is deliberately NOT mocked, for the same reason as in
// page.test.ts: the assertion is that this layout produces the digest Next
// itself routes to a 404, and a stand-in would only prove the stand-in ran.
import type { Blog } from "@/lib/definitions";
import { getBlog } from "@/lib/data";
import BlogPostLayout from "@/app/blog/[id]/layout";

const NOT_FOUND_DIGEST = "NEXT_HTTP_ERROR_FALLBACK;404";
const id = "11111111-1111-4111-8111-111111111111";

const row: Blog = {
  id,
  title: "A post",
  content: "body",
  date: new Date("2026-01-01"),
  private: false,
};

/** A stand-in for the rendered page, asserted by identity below. */
const children = "PAGE_SUBTREE";

function props() {
  return { children, params: Promise.resolve({ id }) };
}

function digestOf(error: unknown): unknown {
  return (error as { digest?: unknown }).digest;
}

beforeEach(() => {
  resetAuthMock();
  vi.mocked(getBlog).mockReset();
  auth.mockResolvedValue(null);
});

/**
 * The whole point of PR #52's fix is that the lookup happens *in the layout*:
 * `notFound()` from `page.tsx` is flushed behind this segment's `loading.tsx`
 * and returns 200. Nothing asserted that before this file existed — no test
 * imported `BlogPostLayout`, so deleting `layout.tsx` outright left the entire
 * suite green and quietly restored the 200.
 *
 * The import above is what closes that: remove the file and this suite fails to
 * resolve. The digest assertions then pin *what* it does once it exists.
 *
 * What these cannot see is the HTTP status itself, which is a property of Next's
 * renderer and not of this function. The e2e case that would assert it needs a
 * database and is skipped; that gap is declared in the PR and on issue #52. The
 * digest is the part that needs no database, which is why it is tested here.
 */
describe("blog post layout", () => {
  it("renders the page subtree untouched when the post is available", async () => {
    vi.mocked(getBlog).mockResolvedValue(row);

    // Identity, not truthiness: a layout that swapped in its own markup would
    // still be truthy while dropping the page.
    await expect(BlogPostLayout(props())).resolves.toBe(children);
  });

  it("produces the 404 digest when the post is unavailable", async () => {
    vi.mocked(getBlog).mockResolvedValue(undefined);

    const error = await BlogPostLayout(props()).then(
      () => undefined,
      (thrown: unknown) => thrown,
    );

    expect(digestOf(error)).toBe(NOT_FOUND_DIGEST);
  });

  // An unknown id and a private post requested anonymously both arrive as
  // `undefined`, and the response has to stay identical: a 404 for one and
  // anything else for the other would confirm which private posts exist.
  it("404s the same way whether or not the viewer is signed in", async () => {
    vi.mocked(getBlog).mockResolvedValue(undefined);
    const anonymous = await BlogPostLayout(props()).catch((e: unknown) =>
      digestOf(e),
    );

    auth.mockResolvedValue(signedInSession());
    vi.mocked(getBlog).mockResolvedValue(undefined);
    const signedIn = await BlogPostLayout(props()).catch((e: unknown) =>
      digestOf(e),
    );

    expect(anonymous).toBe(NOT_FOUND_DIGEST);
    expect(signedIn).toBe(NOT_FOUND_DIGEST);
  });

  // The test above passes on both branches, so a layout that stopped consulting
  // the session — passing `null`, or dropping `getSession()` — would not show up
  // there. This is the one that reddens, because the two branches disagree.
  it("hands the viewer's own session to the query, not a fixed one", async () => {
    vi.mocked(getBlog).mockImplementation(async (session) =>
      session?.user ? row : undefined,
    );

    const anonymous = await BlogPostLayout(props()).catch((e: unknown) =>
      digestOf(e),
    );

    auth.mockResolvedValue(signedInSession());
    const signedIn = await BlogPostLayout(props());

    expect(anonymous).toBe(NOT_FOUND_DIGEST);
    expect(signedIn).toBe(children);
  });

  it("looks the post up under the id from its own segment's params", async () => {
    vi.mocked(getBlog).mockResolvedValue(row);

    await BlogPostLayout(props());

    expect(vi.mocked(getBlog).mock.calls[0]?.[1]).toBe(id);
  });

  // A 404 tells a crawler the post is gone. A database that is merely down must
  // not say that, so the failure has to propagate as itself and reach the route's
  // error boundary instead.
  it("keeps a real fetch failure distinct from a 404", async () => {
    vi.mocked(getBlog).mockRejectedValue(new Error("Failed to fetch blog."));

    const error = await BlogPostLayout(props()).then(
      () => undefined,
      (thrown: unknown) => thrown,
    );

    expect(digestOf(error)).toBeUndefined();
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("Failed to fetch blog.");
  });
});
