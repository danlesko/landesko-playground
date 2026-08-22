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

/**
 * What the driver produces for the naive `timestamp` column: a `Date`, built
 * from a zone-less wall clock the way the parser builds one. Not
 * `new Date("2026-01-01")`, which is parsed as UTC and so stands in for a
 * value the driver never returns.
 */
const NAIVE_DATE = new Date(2026, 0, 1, 0, 0, 0);

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

/**
 * Asserts the catch logged the prefix and *the original error object*, once.
 *
 * Deliberately not `expect(consoleError).toHaveBeenCalledWith(prefix, error)`:
 * that compares arguments by deep equality, and Vitest compares Errors by name,
 * message, cause and enumerable properties. So it accepts a catch that logs
 * `new Error(error.message)` — a different object that reads the same but has
 * lost the driver's stack. Verified rather than assumed: with the
 * `toHaveBeenCalledWith` form, a re-wrapping mutant passed at 24/24.
 *
 * `toBe` is what pins identity. The call count is asserted too, so a catch that
 * logs twice, or logs in a loop, does not slip through on one matching call.
 *
 * The arity is asserted for the same reason the count is: checking only
 * arguments 0 and 1 leaves a catch free to append a third. Verified rather than
 * assumed: `console.error(prefix, error, session)` on all three paths passed at
 * 24/24 without the length assertion, logging the signed-in user's email.
 *
 * What this cannot see is a log that never reaches the spy — a module-level
 * `const log = console.error` captured at import time would bypass it. No
 * assertion on the spy can cover that; only reading data.ts can.
 */
function expectLoggedExactly(prefix: string, error: Error): void {
  expect(consoleError).toHaveBeenCalledOnce();
  const call = consoleError.mock.calls[0];
  if (!call) throw new Error("Unreachable: asserted called once above.");
  expect(call).toHaveLength(2);
  expect(call[0]).toBe(prefix);
  expect(call[1]).toBe(error);
}

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
    // A `Date` and a `private` flag, because that is what the driver hands
    // back for these columns. The cast in data.ts means nothing here would
    // complain about a string and a missing field, which is exactly why the
    // mock has to be written faithfully by hand.
    const rows = [
      { id: "a", title: "one", content: "c", date: NAIVE_DATE, private: false },
    ];
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

      // One invocation, awaited twice. Calling the subject a second time would
      // reject again and log again, which is what makes the log count below
      // exact rather than a restatement of how this test is written.
      const rejected = fetchRecentBlogs(makeSession());
      await expect(rejected).rejects.toThrow("Failed to fetch blogs.");
      await expect(rejected).rejects.not.toThrow(/hunter2/);

      // Swallowing the detail at the boundary is only safe because it still
      // reaches the server log.
      expectLoggedExactly("Failed to fetch blogs:", driverError);
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
    // See the note on the equivalent row in fetchRecentBlogs.
    const row = {
      id,
      title: "one",
      content: "c",
      date: NAIVE_DATE,
      private: false,
    };
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

      const rejected = getBlog(makeSession(), id);
      await expect(rejected).rejects.toThrow("Failed to fetch blog.");
      await expect(rejected).rejects.not.toThrow(/password/);

      // Note the prefix differs by one character from the fetchRecentBlogs one,
      // so a copy-paste of the wrong message is caught here rather than
      // silently logging the wrong operation.
      expectLoggedExactly("Failed to fetch blog:", driverError);
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

    const rejected = deleteBlog("x");
    await expect(rejected).rejects.toThrow("Failed to delete blog.");
    await expect(rejected).rejects.not.toThrow(/db\.internal/);

    expectLoggedExactly("Failed to delete blog:", driverError);
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
  // moved below the query passes the test above and fails this one.
  //
  // What that pins is execution *before a failure*, not cache semantics —
  // `noStore()` marks the surrounding render scope dynamic and is not a wrapper
  // around the query, so a post-query call still opts the scope out on the
  // success path. The failure path is where the position becomes observable.
  it.each(EVERY_EXPORT)(
    "%s still opts out when the query fails",
    async (_label, run) => {
      failNextSqlCalls(new Error("connection refused"));

      await expect(run()).rejects.toThrow();

      expect(unstable_noStore).toHaveBeenCalledOnce();
    },
  );
});
