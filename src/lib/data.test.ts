import type { Session } from "next-auth";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from "vitest";

import {
  normalizeSql,
  onlySqlCall,
  queueSqlResult,
  failNextSqlCalls,
  resetSqlMock,
} from "@/test/sql-mock";
import { resetNextMocks, unstable_noStore } from "@/test/next-mocks";
import { sessionWithoutUser } from "@/test/auth-mock";

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
import { deleteBlog, fetchRecentBlogs, getBlog } from "@/lib/data";

/**
 * The clause that keeps private posts away from anonymous visitors.
 *
 * The anonymous queries are asserted by *exact* text, not by substring. A
 * substring check is too weak to be a security test: `WHERE blogs.private !=
 * TRUE OR TRUE` still contains the guard while leaking every private row.
 * Exact matching means any edit to an anonymous query has to be made in this
 * file too, which is the point — that edit deserves a second pair of eyes.
 */
const PRIVATE_GUARD = "private != TRUE";

const RECENT_BLOGS_ANONYMOUS =
  "SELECT * FROM blogs WHERE blogs.private != TRUE ORDER BY blogs.date DESC LIMIT 10";
const RECENT_BLOGS_SIGNED_IN =
  "SELECT * FROM blogs ORDER BY blogs.date DESC LIMIT 10";
const GET_BLOG_ANONYMOUS =
  "SELECT * FROM blogs WHERE id=$1 AND private != TRUE";
const GET_BLOG_SIGNED_IN = "SELECT * FROM blogs WHERE id=$1";

function session(): Session {
  return {
    user: { name: "Dan", email: "owner@example.com" },
    expires: new Date(Date.now() + 60_000).toISOString(),
  };
}

// Held in a variable so the error cases can assert on it. Silencing the log
// without asserting it made the log itself deletable: every `console.error` in
// data.ts could be removed with the whole suite still green.
let consoleError: MockInstance<typeof console.error>;

beforeEach(() => {
  resetSqlMock();
  resetNextMocks();
  consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

it("resolves `sql` to the mock, so no query can reach a real database", () => {
  expect(vi.isMockFunction(sql)).toBe(true);
});

describe("fetchRecentBlogs", () => {
  it("issues exactly the private-filtered query when there is no session", async () => {
    queueSqlResult([]);

    await fetchRecentBlogs(null);

    // This is the authorization boundary. The mock records the query text the
    // application built; it does not synthesise it.
    const text = normalizeSql(onlySqlCall().text);
    expect(text).toBe(RECENT_BLOGS_ANONYMOUS);
    expect(text).toContain(PRIVATE_GUARD);
  });

  it("does not filter private posts for a signed-in session", async () => {
    queueSqlResult([]);

    await fetchRecentBlogs(session());

    const text = normalizeSql(onlySqlCall().text);
    expect(text).toBe(RECENT_BLOGS_SIGNED_IN);
    expect(text).not.toContain(PRIVATE_GUARD);
  });

  // `session?.user` is the predicate actions.ts and the UI use. The read path
  // must agree, so a session object with no user fails closed to the
  // private-filtered query rather than being treated as signed in.
  it("treats a session that carries no user as anonymous", async () => {
    queueSqlResult([]);

    await fetchRecentBlogs(sessionWithoutUser());

    const text = normalizeSql(onlySqlCall().text);
    expect(text).toBe(RECENT_BLOGS_ANONYMOUS);
    expect(text).toContain(PRIVATE_GUARD);
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

  // Driven from one table over both session states: when the two branches each
  // had their own catch, only the anonymous one was exercised, so a mutant in
  // the signed-in catch left all 16 tests green.
  it.each([
    ["anonymous", (): Session | null => null],
    ["signed in", (): Session | null => session()],
  ])(
    "reports a generic failure without leaking the driver error (%s)",
    async (_label, makeSession) => {
      const driverError = new Error(
        "connection to postgres://user:hunter2@db.internal failed",
      );
      failNextSqlCalls(driverError);

      await expect(fetchRecentBlogs(makeSession())).rejects.toThrow(
        "Failed to fetch blogs.",
      );
      await expect(fetchRecentBlogs(makeSession())).rejects.not.toThrow(
        /hunter2/,
      );

      // Swallowing the detail at the boundary is only safe because it still
      // reaches the server log. Asserted by identity, so a catch that logs a
      // re-wrapped or stringified error fails here.
      expect(consoleError).toHaveBeenCalledWith(
        "Failed to fetch blogs:",
        driverError,
      );
    },
  );
});

describe("getBlog", () => {
  const id = "11111111-1111-4111-8111-111111111111";

  it("issues exactly the private-filtered query when there is no session", async () => {
    queueSqlResult([]);

    await getBlog(null, id);

    const text = normalizeSql(onlySqlCall().text);
    expect(text).toBe(GET_BLOG_ANONYMOUS);
    expect(text).toContain(PRIVATE_GUARD);
  });

  it("does not filter private posts for a signed-in session", async () => {
    queueSqlResult([]);

    await getBlog(session(), id);

    const text = normalizeSql(onlySqlCall().text);
    expect(text).toBe(GET_BLOG_SIGNED_IN);
    expect(text).not.toContain(PRIVATE_GUARD);
  });

  // Same predicate as above; see the note in the fetchRecentBlogs block.
  it("treats a session that carries no user as anonymous", async () => {
    queueSqlResult([]);

    await getBlog(sessionWithoutUser(), id);

    const text = normalizeSql(onlySqlCall().text);
    expect(text).toBe(GET_BLOG_ANONYMOUS);
    expect(text).toContain(PRIVATE_GUARD);
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

  // Same table as fetchRecentBlogs; see the note there.
  it.each([
    ["anonymous", (): Session | null => null],
    ["signed in", (): Session | null => session()],
  ])(
    "reports a generic failure without leaking the driver error (%s)",
    async (_label, makeSession) => {
      const driverError = new Error(
        "password authentication failed for user 'x'",
      );
      failNextSqlCalls(driverError);

      await expect(getBlog(makeSession(), id)).rejects.toThrow(
        "Failed to fetch blog.",
      );
      await expect(getBlog(makeSession(), id)).rejects.not.toThrow(/password/);

      // See the note in the fetchRecentBlogs block. Note the prefix differs by
      // one character from that one, so a copy-paste of the wrong message is
      // caught here rather than silently logging the wrong operation.
      expect(consoleError).toHaveBeenCalledWith(
        "Failed to fetch blog:",
        driverError,
      );
    },
  );
});

describe("deleteBlog", () => {
  it("deletes exactly one row by bound id", async () => {
    await deleteBlog("22222222-2222-4222-8222-222222222222");

    const call = onlySqlCall();
    expect(normalizeSql(call.text)).toBe("DELETE FROM blogs WHERE id=$1");
    expect(call.values).toEqual(["22222222-2222-4222-8222-222222222222"]);
  });

  it("reports a generic failure without leaking the driver error", async () => {
    const driverError = new Error("deadlock detected on db.internal");
    failNextSqlCalls(driverError);

    await expect(deleteBlog("x")).rejects.toThrow("Failed to delete blog.");
    await expect(deleteBlog("x")).rejects.not.toThrow(/db\.internal/);

    expect(consoleError).toHaveBeenCalledWith(
      "Failed to delete blog:",
      driverError,
    );
  });
});

/**
 * `noStore()` is retained on purpose even though it is currently inert: every
 * caller already awaits `auth()` in the root layout, which opts the request out
 * of caching anyway. It is kept for the day `auth()` moves out of the root
 * layout, at which point it becomes the only thing keeping private rows out of a
 * shared cache. Nothing asserted it before, so a safeguard whose whole purpose
 * is to survive a future refactor had no test protecting it from one.
 *
 * One table shared by both cases below, so the two can never drift apart and
 * leave an export covered on one path only.
 */
const EVERY_EXPORT: [string, () => Promise<unknown>][] = [
  ["fetchRecentBlogs", () => fetchRecentBlogs(null)],
  ["getBlog", () => getBlog(null, "11111111-1111-4111-8111-111111111111")],
  ["deleteBlog", () => deleteBlog("22222222-2222-4222-8222-222222222222")],
];

describe("cache opt-out", () => {
  it.each(EVERY_EXPORT)(
    "%s opts the request out of the data cache",
    async (_label, run) => {
      await run();

      expect(unstable_noStore).toHaveBeenCalledOnce();
    },
  );

  // Position, asserted without reading invocation counters: `noStore()` runs
  // before the query, so it still runs when the query throws. A `noStore()`
  // moved below the query — where it would opt nothing out — passes the test
  // above and fails this one.
  it.each(EVERY_EXPORT)(
    "%s still opts out when the query fails",
    async (_label, run) => {
      failNextSqlCalls(new Error("connection refused"));

      await expect(run()).rejects.toThrow();

      expect(unstable_noStore).toHaveBeenCalledOnce();
    },
  );
});
