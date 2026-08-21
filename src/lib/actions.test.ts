import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  auth,
  resetAuthMock,
  sessionWithoutUser,
  signedInSession,
} from "@/test/auth-mock";
import {
  expectRedirect,
  redirect,
  resetNextMocks,
  revalidatePath,
} from "@/test/next-mocks";
import {
  normalizeSql,
  onlySqlCall,
  resetSqlMock,
  sqlCalls,
} from "@/test/sql-mock";

vi.mock("@vercel/postgres", async () => {
  const { sql } = await import("@/test/sql-mock");
  return { sql };
});

vi.mock("@/auth", async () => {
  const { auth: authMock } = await import("@/test/auth-mock");
  return { auth: authMock };
});

vi.mock("next/cache", async () => {
  const { revalidatePath: revalidatePathMock, unstable_noStore } = await import(
    "@/test/next-mocks"
  );
  return { revalidatePath: revalidatePathMock, unstable_noStore };
});

vi.mock("next/navigation", async () => {
  const { redirect: redirectMock } = await import("@/test/next-mocks");
  return { redirect: redirectMock };
});

// Note: `@/lib/data` is deliberately NOT mocked. `deleteBlogPost` delegates to
// the real `deleteBlog`, so these tests prove the DELETE actually reaches the
// (mocked) driver rather than that one mock called another.
import { createBlog, deleteBlogPost } from "@/lib/actions";

const VALID_UUID = "11111111-1111-4111-8111-111111111111";

function blogForm(overrides: Record<string, string | null> = {}): FormData {
  const fields: Record<string, string | null> = {
    title: "A title",
    content: "Some content",
    private: null,
    ...overrides,
  };

  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (value !== null) formData.set(key, value);
  }
  return formData;
}

/**
 * `createBlog` is a useActionState action, so the previous state comes first.
 * Every call here starts from the empty state; nothing depends on the previous
 * one, which is the property that lets the action stay pure.
 */
const submitBlog = (formData: FormData) => createBlog({}, formData);

/** The `private` column value the INSERT bound, whatever its position. */
function insertedPrivateFlag(): unknown {
  const call = onlySqlCall();
  expect(normalizeSql(call.text)).toContain("INSERT INTO blogs");
  return call.values.at(-1);
}

beforeEach(() => {
  resetSqlMock();
  resetNextMocks();
  resetAuthMock();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createBlog authorization", () => {
  it("throws Unauthorized for an anonymous caller", async () => {
    auth.mockResolvedValue(null);

    await expect(submitBlog(blogForm())).rejects.toThrow("Unauthorized");
  });

  it("writes nothing and redirects nowhere when unauthorized", async () => {
    auth.mockResolvedValue(null);

    await expect(submitBlog(blogForm())).rejects.toThrow("Unauthorized");

    // The assertion that matters: the mutation never happened.
    expect(sqlCalls()).toHaveLength(0);
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("rejects a session that carries no user", async () => {
    auth.mockResolvedValue(sessionWithoutUser());

    await expect(submitBlog(blogForm())).rejects.toThrow("Unauthorized");
    expect(sqlCalls()).toHaveLength(0);
  });

  it("checks authorization before validating the form", async () => {
    auth.mockResolvedValue(null);

    // An empty title would fail the schema. An anonymous caller must not be
    // able to tell the difference, and must not reach the parser at all.
    await expect(submitBlog(blogForm({ title: "" }))).rejects.toThrow(
      "Unauthorized",
    );
  });
});

describe("createBlog when signed in", () => {
  beforeEach(() => {
    auth.mockResolvedValue(signedInSession());
  });

  it("inserts the post, revalidates /blog and redirects there", async () => {
    await expectRedirect(() => submitBlog(blogForm()), "/blog");

    const call = onlySqlCall();
    expect(normalizeSql(call.text)).toContain(
      "INSERT INTO blogs (title, content, date, private)",
    );
    expect(call.values.slice(0, 2)).toEqual(["A title", "Some content"]);
    expect(revalidatePath).toHaveBeenCalledWith("/blog");
    expect(redirect).toHaveBeenCalledWith("/blog");
  });

  it("binds every value instead of interpolating it into the query text", async () => {
    await expectRedirect(
      () => submitBlog(blogForm({ title: "'); DROP TABLE blogs; --" })),
      "/blog",
    );

    const call = onlySqlCall();
    expect(call.text).not.toContain("DROP TABLE");
    expect(call.values).toContain("'); DROP TABLE blogs; --");
  });

  it('treats the checkbox value "on" as private', async () => {
    await expectRedirect(
      () => submitBlog(blogForm({ private: "on" })),
      "/blog",
    );

    expect(insertedPrivateFlag()).toBe(true);
  });

  it("treats an absent checkbox as public", async () => {
    await expectRedirect(() => submitBlog(blogForm()), "/blog");

    expect(insertedPrivateFlag()).toBe(false);
  });

  it("treats any other checkbox value as public", async () => {
    // Pins current behaviour, which is not obviously the safe default: the
    // transform maps every string except "on" to `false`, so a client that
    // posts `private=true` publishes the post. A browser checkbox only ever
    // sends "on", so this is not exploitable through the UI, but it is a
    // hardening opportunity rather than a property worth celebrating.
    await expectRedirect(
      () => submitBlog(blogForm({ private: "off" })),
      "/blog",
    );

    expect(insertedPrivateFlag()).toBe(false);
  });

  it("returns an empty title as a field error instead of throwing", async () => {
    const state = await submitBlog(blogForm({ title: "" }));

    expect(state.fieldErrors?.title).toEqual(["Title is required"]);
    expect(state.fieldErrors?.content).toBeUndefined();
    expect(sqlCalls()).toHaveLength(0);
    // A returned error must not navigate, or the reader never sees it.
    expect(redirect).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("returns an over-long title as a field error naming the limit", async () => {
    const state = await submitBlog(blogForm({ title: "a".repeat(101) }));

    expect(state.fieldErrors?.title).toEqual([
      "Title must be 100 characters or fewer",
    ]);
    expect(sqlCalls()).toHaveLength(0);
    expect(redirect).not.toHaveBeenCalled();
  });

  it("hands back what was typed, because React resets the form on submit", async () => {
    // react-dom 19.1 calls requestFormReset before running the action, with no
    // opt-out, so the returned values are the only thing repopulating the
    // fields. Without this the reader is told the title is wrong *and* loses
    // the content they wrote.
    const state = await submitBlog(
      blogForm({ title: "", content: "Content worth keeping", private: "on" }),
    );

    expect(state.values).toEqual({
      title: "",
      content: "Content worth keeping",
      privateBlog: true,
    });
  });

  it("reports both fields at once when both are invalid", async () => {
    const state = await submitBlog(blogForm({ title: "", content: "" }));

    expect(state.fieldErrors?.title).toEqual(["Title is required"]);
    expect(state.fieldErrors?.content).toEqual(["Content is required"]);
  });

  it("accepts a title of exactly 100 characters", async () => {
    await expectRedirect(
      () => submitBlog(blogForm({ title: "a".repeat(100) })),
      "/blog",
    );

    expect(onlySqlCall().values).toContain("a".repeat(100));
  });

  it("returns empty content as a field error", async () => {
    const state = await submitBlog(blogForm({ content: "" }));

    expect(state.fieldErrors?.content).toEqual(["Content is required"]);
    expect(sqlCalls()).toHaveLength(0);
    expect(redirect).not.toHaveBeenCalled();
  });

  it("reports a missing title field in the reader's terms, not the parser's", async () => {
    // `formData.get` returns null, so this trips invalid_type rather than min.
    // Both paths have to produce the same sentence or the message leaks the
    // difference between "left blank" and "field absent".
    const state = await submitBlog(blogForm({ title: null }));

    expect(state.fieldErrors?.title).toEqual(["Title is required"]);
    expect(sqlCalls()).toHaveLength(0);
  });

  it("stamps the post with the date in America/Denver, not the server's zone", async () => {
    // 04:30 UTC is still the previous day in Denver. Pinning the exact string
    // documents the current format, which is en-US "M/D/YYYY, HH:mm:ss" and
    // notably *not* the `YYYY-MM-DD` that NewBlogSchema's `date` field
    // declares. See the PR description.
    vi.useFakeTimers({
      toFake: ["Date"],
      now: new Date("2026-03-15T04:30:00Z"),
    });
    try {
      await expectRedirect(() => submitBlog(blogForm()), "/blog");
    } finally {
      vi.useRealTimers();
    }

    expect(onlySqlCall().values.at(2)).toBe("3/14/2026, 22:30:00");
  });
});

describe("deleteBlogPost", () => {
  it("throws Unauthorized and deletes nothing for an anonymous caller", async () => {
    auth.mockResolvedValue(null);

    await expect(deleteBlogPost(VALID_UUID)).rejects.toThrow("Unauthorized");

    expect(sqlCalls()).toHaveLength(0);
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("rejects a session that carries no user", async () => {
    auth.mockResolvedValue(sessionWithoutUser());

    await expect(deleteBlogPost(VALID_UUID)).rejects.toThrow("Unauthorized");
    expect(sqlCalls()).toHaveLength(0);
  });

  it("refuses an id that is not a uuid, before touching the database", async () => {
    auth.mockResolvedValue(signedInSession());

    await expect(deleteBlogPost("1 OR 1=1")).rejects.toThrow();
    expect(sqlCalls()).toHaveLength(0);
  });

  it("deletes one row by bound id, revalidates and redirects", async () => {
    auth.mockResolvedValue(signedInSession());

    await expectRedirect(() => deleteBlogPost(VALID_UUID), "/blog");

    const call = onlySqlCall();
    expect(normalizeSql(call.text)).toBe("DELETE FROM blogs WHERE id=$1");
    expect(call.values).toEqual([VALID_UUID]);
    expect(revalidatePath).toHaveBeenCalledWith("/blog");
  });
});
