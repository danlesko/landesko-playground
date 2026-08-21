import { beforeEach, describe, expect, it, vi } from "vitest";

import { auth, resetAuthMock, signedInSession } from "@/test/auth-mock";

vi.mock("@/auth", async () => {
  const { auth: authMock } = await import("@/test/auth-mock");
  return { auth: authMock };
});

vi.mock("@/lib/data", () => ({ getBlog: vi.fn() }));

// `next/navigation` is deliberately NOT mocked: the assertion below is that the
// page produces the digest Next itself routes to a 404, so a stand-in would
// only prove the stand-in was called.
import { getBlog } from "@/lib/data";
import Blog, { generateMetadata } from "@/app/blog/[id]/page";

const NOT_FOUND_DIGEST = "NEXT_HTTP_ERROR_FALLBACK;404";
const id = "11111111-1111-4111-8111-111111111111";

const row = {
  id,
  title: "A post",
  content: "body",
  date: new Date("2026-01-01"),
};

function props() {
  return { params: Promise.resolve({ id }) };
}

function digestOf(error: unknown): unknown {
  return (error as { digest?: unknown }).digest;
}

beforeEach(() => {
  resetAuthMock();
  vi.mocked(getBlog).mockReset();
  auth.mockResolvedValue(null);
});

describe("blog detail page", () => {
  it("serves a 404 when the post is unavailable", async () => {
    vi.mocked(getBlog).mockResolvedValue(undefined);

    const error = await Blog(props()).then(
      () => undefined,
      (thrown: unknown) => thrown,
    );

    expect(digestOf(error)).toBe(NOT_FOUND_DIGEST);
  });

  // `getBlog` is mocked here, so this asserts only that the page's own 404
  // decision ignores the session. The guarantee that a private post and a
  // missing one both arrive as undefined belongs to the anonymous SQL predicate
  // and is tested against a mocked driver in src/lib/data.test.ts.
  //
  // Both branches expect the same digest, so a `cache(auth)` memo replaying the
  // first session would go unnoticed here. It cannot: measured against this
  // React, `cache` outside a request context re-runs on every call. The next
  // test is the one that would redden if the session stopped being threaded.
  it("404s on an unavailable post whether or not the viewer is signed in", async () => {
    vi.mocked(getBlog).mockResolvedValue(undefined);
    const anonymous = await Blog(props()).catch((e: unknown) => digestOf(e));

    auth.mockResolvedValue(signedInSession());
    vi.mocked(getBlog).mockResolvedValue(undefined);
    const signedIn = await Blog(props()).catch((e: unknown) => digestOf(e));

    expect(anonymous).toBe(NOT_FOUND_DIGEST);
    expect(signedIn).toBe(NOT_FOUND_DIGEST);
  });

  it("hands the viewer's own session to the query", async () => {
    vi.mocked(getBlog).mockImplementation(async (session) =>
      session?.user ? row : undefined,
    );

    const anonymous = await Blog(props()).catch((e: unknown) => digestOf(e));

    auth.mockResolvedValue(signedInSession());
    const signedIn = await Blog(props());

    expect(anonymous).toBe(NOT_FOUND_DIGEST);
    expect(signedIn).toBeTruthy();
  });

  it("does not 404 when the post is available", async () => {
    vi.mocked(getBlog).mockResolvedValue(row);

    await expect(Blog(props())).resolves.toBeTruthy();
  });

  it("keeps a real fetch failure distinct from a 404", async () => {
    vi.mocked(getBlog).mockRejectedValue(new Error("Failed to fetch blog."));

    const error = await Blog(props()).then(
      () => undefined,
      (thrown: unknown) => thrown,
    );

    expect(digestOf(error)).toBeUndefined();
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("Failed to fetch blog.");
  });
});

describe("generateMetadata", () => {
  it("titles the unavailable case without leaking the literal undefined", async () => {
    vi.mocked(getBlog).mockResolvedValue(undefined);

    await expect(generateMetadata(props())).resolves.toMatchObject({
      title: "Blog Post Not Found",
    });
  });

  it("uses the post title when the post is available", async () => {
    vi.mocked(getBlog).mockResolvedValue(row);

    await expect(generateMetadata(props())).resolves.toMatchObject({
      title: "A post",
    });
  });
});
