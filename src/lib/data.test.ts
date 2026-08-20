import type { Session } from "next-auth";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  normalizeSql,
  onlySqlCall,
  queueSqlResult,
  failNextSqlCalls,
  resetSqlMock,
} from "@/test/sql-mock";
import { resetNextMocks } from "@/test/next-mocks";

vi.mock("@vercel/postgres", async () => {
  const { sql } = await import("@/test/sql-mock");
  return { sql };
});

vi.mock("next/cache", async () => {
  const { unstable_noStore } = await import("@/test/next-mocks");
  return { unstable_noStore };
});

// `vi.mock` is hoisted above this import, so `data.ts` receives the mocks.
import { sql } from "@vercel/postgres";
import { deleteBlog, fetchRecentBlogs, getBlog, getUser } from "@/lib/data";

/**
 * The clause that keeps private posts away from anonymous visitors. If the
 * spelling in `src/lib/data.ts` ever changes, these tests must be updated
 * deliberately rather than deleted.
 */
const PRIVATE_GUARD = "private != TRUE";

function session(): Session {
  return {
    user: { name: "Dan", email: "owner@example.com" },
    expires: new Date(Date.now() + 60_000).toISOString(),
  };
}

beforeEach(() => {
  resetSqlMock();
  resetNextMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

it("resolves `sql` to the mock, so no query can reach a real database", () => {
  expect(vi.isMockFunction(sql)).toBe(true);
});

describe("fetchRecentBlogs", () => {
  it("filters out private posts when there is no session", async () => {
    queueSqlResult([]);

    await fetchRecentBlogs(null);

    // This is the authorization boundary. The mock records the query text the
    // application built; it does not synthesise it. Delete the WHERE clause
    // from data.ts and this fails.
    expect(normalizeSql(onlySqlCall().text)).toContain(PRIVATE_GUARD);
  });

  it("does not filter private posts for a signed-in session", async () => {
    queueSqlResult([]);

    await fetchRecentBlogs(session());

    expect(normalizeSql(onlySqlCall().text)).not.toContain(PRIVATE_GUARD);
  });

  it("returns the rows the driver produced", async () => {
    const rows = [{ id: "a", title: "one", content: "c", date: "2026-01-01" }];
    queueSqlResult(rows);

    await expect(fetchRecentBlogs(null)).resolves.toEqual(rows);
  });

  it("keeps the LIMIT and the newest-first ordering on both branches", async () => {
    queueSqlResult([]);
    await fetchRecentBlogs(null);
    const anonymous = normalizeSql(onlySqlCall().text);

    resetSqlMock();
    queueSqlResult([]);
    await fetchRecentBlogs(session());
    const authenticated = normalizeSql(onlySqlCall().text);

    for (const text of [anonymous, authenticated]) {
      expect(text).toContain("ORDER BY blogs.date DESC");
      expect(text).toContain("LIMIT 10");
    }
  });

  it("reports a generic failure without leaking the driver error", async () => {
    failNextSqlCalls(
      new Error("connection to postgres://user:hunter2@db.internal failed"),
    );

    await expect(fetchRecentBlogs(null)).rejects.toThrow(
      "Failed to fetch blogs.",
    );
    await expect(fetchRecentBlogs(null)).rejects.not.toThrow(/hunter2/);
  });
});

describe("getBlog", () => {
  const id = "11111111-1111-4111-8111-111111111111";

  it("filters out private posts when there is no session", async () => {
    queueSqlResult([]);

    await getBlog(null, id);

    expect(normalizeSql(onlySqlCall().text)).toContain(PRIVATE_GUARD);
  });

  it("does not filter private posts for a signed-in session", async () => {
    queueSqlResult([]);

    await getBlog(session(), id);

    expect(normalizeSql(onlySqlCall().text)).not.toContain(PRIVATE_GUARD);
  });

  it("passes the id as a bound parameter rather than inlining it", async () => {
    queueSqlResult([]);

    await getBlog(null, "'; DROP TABLE blogs; --");

    const call = onlySqlCall();
    expect(normalizeSql(call.text)).toContain("id=$1");
    expect(normalizeSql(call.text)).not.toContain("DROP TABLE");
    expect(call.values).toEqual(["'; DROP TABLE blogs; --"]);
  });

  it("returns undefined when nothing matched, so a private post reads as missing", async () => {
    queueSqlResult([]);

    await expect(getBlog(null, id)).resolves.toBeUndefined();
  });

  it("returns the first row when one matched", async () => {
    const row = { id, title: "one", content: "c", date: "2026-01-01" };
    queueSqlResult([row]);

    await expect(getBlog(null, id)).resolves.toEqual(row);
  });

  it("reports a generic failure without leaking the driver error", async () => {
    failNextSqlCalls(new Error("password authentication failed for user 'x'"));

    await expect(getBlog(null, id)).rejects.toThrow("Failed to fetch blog.");
    await expect(getBlog(null, id)).rejects.not.toThrow(/password/);
  });
});

describe("getUser", () => {
  it("binds the email instead of interpolating it into the query text", async () => {
    queueSqlResult([]);

    await getUser("owner@example.com");

    const call = onlySqlCall();
    expect(normalizeSql(call.text)).toBe("SELECT * FROM users WHERE email=$1");
    expect(call.values).toEqual(["owner@example.com"]);
  });

  it("returns undefined for an unknown email", async () => {
    queueSqlResult([]);

    await expect(getUser("nobody@example.com")).resolves.toBeUndefined();
  });

  it("reports a generic failure without leaking the driver error", async () => {
    failNextSqlCalls(new Error('relation "users" does not exist at 10.0.0.7'));

    await expect(getUser("owner@example.com")).rejects.toThrow(
      "Failed to fetch user.",
    );
    await expect(getUser("owner@example.com")).rejects.not.toThrow(
      /10\.0\.0\.7/,
    );
  });
});

describe("deleteBlog", () => {
  it("deletes exactly one row by bound id", async () => {
    await deleteBlog("22222222-2222-4222-8222-222222222222");

    const call = onlySqlCall();
    expect(normalizeSql(call.text)).toBe("DELETE FROM blogs WHERE id=$1");
    expect(call.values).toEqual(["22222222-2222-4222-8222-222222222222"]);
  });

  it("reports a generic failure without leaking the driver error", async () => {
    failNextSqlCalls(new Error("deadlock detected on db.internal"));

    await expect(deleteBlog("x")).rejects.toThrow("Failed to delete blog.");
    await expect(deleteBlog("x")).rejects.not.toThrow(/db\.internal/);
  });
});
