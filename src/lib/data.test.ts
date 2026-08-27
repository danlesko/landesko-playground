import { inspect } from "node:util";

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
  sqlCalls,
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
import { deleteBlog, fetchBlogPage, getBlog } from "@/lib/data";

/**
 * The two results `fetchBlogPage` consumes, in order: the page of rows, then the
 * count. `total` is queued as a *string* because that is what the driver returns
 * for `COUNT(*)` -- it is a Postgres bigint, which does not fit a JS number -- so
 * queueing a number here would test a shape the database cannot produce.
 */
function queueBlogPage(rows: unknown[], total: number = rows.length): void {
  queueSqlResult(rows);
  queueSqlResult([{ total: String(total) }]);
}

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

const PAGE_ROWS_ANONYMOUS =
  "SELECT * FROM blogs WHERE blogs.private != TRUE ORDER BY blogs.date DESC, blogs.id DESC LIMIT $1 OFFSET $2";
const PAGE_ROWS_SIGNED_IN =
  "SELECT * FROM blogs ORDER BY blogs.date DESC, blogs.id DESC LIMIT $1 OFFSET $2";
// The count is a second authorization surface, not bookkeeping: if it dropped the
// guard, an anonymous reader would be offered page links for posts they cannot
// see, and every one of those pages would be empty for them.
const PAGE_COUNT_ANONYMOUS =
  "SELECT COUNT(*) AS total FROM blogs WHERE blogs.private != TRUE";
const PAGE_COUNT_SIGNED_IN = "SELECT COUNT(*) AS total FROM blogs";
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

/** A real uuid, because the column is `UUID` and the row parser checks it. */
const ROW_ID = "22222222-2222-4222-8222-222222222222";

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
  // The stand-in still runs Node's real formatter over every argument, rather
  // than being an empty function. `console.error` formats its arguments eagerly,
  // and on this runtime it *throws* on some of them: handed a `ZodError`, the
  // inspector raises `TypeError: Cannot read properties of undefined (reading
  // 'value')`, which would replace the generic error data.ts means to throw. A
  // no-op mock cannot see that, so it hid the defect until a review reproduced
  // it outside the suite. Formatting here means any un-loggable payload fails
  // the test that logs it, wherever in this file that happens.
  consoleError = vi.spyOn(console, "error").mockImplementation((...args) => {
    args.forEach((arg) => inspect(arg));
  });
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

describe("fetchBlogPage", () => {
  it("issues exactly the private-filtered query when there is no session", async () => {
    queueBlogPage([]);

    await fetchBlogPage(null, 1);

    // This is the authorization boundary. The mock records the query text the
    // application built; it does not synthesise it.
    const text = normalizeSql(sqlCalls()[0]!.text);
    expect(text).toBe(PAGE_ROWS_ANONYMOUS);
    expect(text).toContain(PRIVATE_GUARD);
  });

  it("does not filter private posts for a signed-in session", async () => {
    queueBlogPage([]);

    await fetchBlogPage(session(), 1);

    const text = normalizeSql(sqlCalls()[0]!.text);
    expect(text).toBe(PAGE_ROWS_SIGNED_IN);
    expect(text).not.toContain(PRIVATE_GUARD);
  });

  // `session?.user` is the predicate actions.ts and the UI use. The read path
  // must agree, so a session object with no user fails closed to the
  // private-filtered query rather than being treated as signed in.
  it("treats a session that carries no user as anonymous", async () => {
    queueBlogPage([]);

    await fetchBlogPage(sessionWithoutUser(), 1);

    const text = normalizeSql(sqlCalls()[0]!.text);
    expect(text).toBe(PAGE_ROWS_ANONYMOUS);
    expect(text).toContain(PRIVATE_GUARD);
  });

  it("returns the rows the driver produced", async () => {
    // Every field as the driver actually produces it, including a real uuid.
    // This mock no longer only documents the row shape, it has to satisfy it:
    // `data.ts` parses now, so an unfaithful field here fails the test rather
    // than passing through a row the database could not return. The `id: "a"`
    // this used to carry is what the parser rejected first.
    const rows = [
      {
        id: ROW_ID,
        title: "one",
        content: "c",
        date: NAIVE_DATE,
        private: false,
      },
    ];
    queueBlogPage(rows);

    await expect(fetchBlogPage(null, 1)).resolves.toMatchObject({
      blogs: rows,
    });
  });

  it("keeps the total ordering and binds the window on both branches", async () => {
    queueBlogPage([]);
    await fetchBlogPage(null, 1);
    const anonymous = sqlCalls()[0]!;

    resetSqlMock();
    queueBlogPage([]);
    await fetchBlogPage(session(), 1);
    const authenticated = sqlCalls()[0]!;

    for (const call of [anonymous, authenticated]) {
      // `blogs.id DESC` is not decoration. OFFSET only means anything against a
      // total order: with ties on `date` alone the database may return them in
      // any order per query, so one post could appear on two pages or none.
      expect(normalizeSql(call.text)).toContain(
        "ORDER BY blogs.date DESC, blogs.id DESC",
      );
      // The window arrives as bound parameters rather than as literals, so the
      // text no longer carries the numbers and the values are where to assert.
      expect(normalizeSql(call.text)).toContain("LIMIT $1 OFFSET $2");
      expect(call.values).toEqual([10, 0]);
    }
  });

  it("offsets by whole pages", async () => {
    queueBlogPage([]);
    await fetchBlogPage(null, 3);

    // Page 3 starts after two full pages, not three. An off-by-one here would
    // silently skip or repeat ten posts.
    expect(sqlCalls()[0]!.values).toEqual([10, 20]);
  });

  it("carries the privacy guard on the count as well as the rows", async () => {
    queueBlogPage([]);
    await fetchBlogPage(null, 1);

    // Two queries, and the second is an authorization surface too: an unguarded
    // count would offer an anonymous reader page links for posts they cannot see.
    expect(sqlCalls()).toHaveLength(2);
    const count = normalizeSql(sqlCalls()[1]!.text);
    expect(count).toBe(PAGE_COUNT_ANONYMOUS);
    expect(count).toContain(PRIVATE_GUARD);
  });

  it("counts every row for a signed-in reader", async () => {
    queueBlogPage([]);
    await fetchBlogPage(session(), 1);

    const count = normalizeSql(sqlCalls()[1]!.text);
    expect(count).toBe(PAGE_COUNT_SIGNED_IN);
    expect(count).not.toContain(PRIVATE_GUARD);
  });

  it("derives the page count from the total, flooring at one page", async () => {
    queueBlogPage([], 21);
    await expect(fetchBlogPage(null, 1)).resolves.toMatchObject({
      total: 21,
      totalPages: 3,
    });

    resetSqlMock();
    // An empty blog still has a page 1 to be on, rather than "page 1 of 0".
    queueBlogPage([], 0);
    await expect(fetchBlogPage(null, 1)).resolves.toMatchObject({
      total: 0,
      totalPages: 1,
    });
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
      const rejected = fetchBlogPage(makeSession(), 1);
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

  // Same predicate as above; see the note in the fetchBlogPage block.
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
    // See the note on the equivalent row in fetchBlogPage.
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

  // Same table as fetchBlogPage; see the note there.
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

      // Note the prefix differs by one character from the fetchBlogPage one,
      // so a copy-paste of the wrong message is caught here rather than
      // silently logging the wrong operation.
      expectLoggedExactly("Failed to fetch blog:", driverError);
    },
  );
});

/**
 * The row parser, exercised through the two reads rather than by importing the
 * schema — the schema is not exported, and what matters is that a bad row cannot
 * reach a render site, not that a schema object rejects it in isolation.
 *
 * Every case here passed before the parser existed. The cast asserted the shape
 * without looking, so each of these rows went straight through to the page.
 */
describe("blog row validation", () => {
  const CONTENT = "a-private-post-body-that-must-not-be-logged";

  const validRow = () => ({
    id: ROW_ID,
    title: "one",
    content: CONTENT,
    date: NAIVE_DATE,
    private: true,
  });

  /** The valid row is asserted to pass first, so each rejection below is
   * attributable to the one field it breaks rather than to the fixture. */
  it("accepts the row the driver actually produces", async () => {
    queueBlogPage([validRow()]);

    await expect(fetchBlogPage(session(), 1)).resolves.toMatchObject({
      blogs: [validRow()],
    });
  });

  it.each([
    [
      "date arriving as a string, which is what the old type claimed",
      "date",
      "2026-01-01",
    ],
    [
      "date arriving as Postgres infinity, which parses to a number",
      "date",
      Infinity,
    ],
    // What the driver actually returns for a timestamp it cannot read: its
    // parser only accepts year-first text, so a server whose `DateStyle` is not
    // the default ISO yields `null` for every row rather than a `Date`.
    [
      "date arriving as null, which is what a non-ISO DateStyle yields",
      "date",
      null,
    ],
    ["private arriving as the string Postgres never sends", "private", "false"],
    ["id that is not a uuid", "id", "a"],
    ["title arriving as null", "title", null],
    // Without a case per column, a schema that stopped checking one of them —
    // `content: z.any()` is still assignable through the `z.ZodType<Blog>`
    // annotation — would keep the whole suite green.
    ["content arriving as a number", "content", 42],
  ])("rejects a row with %s", async (_label, field, value) => {
    queueBlogPage([{ ...validRow(), [field]: value }]);

    await expect(fetchBlogPage(session(), 1)).rejects.toThrow(
      "Failed to fetch blogs.",
    );
  });

  // Every other case here puts the bad row first, which a parser that only ever
  // looked at `rows[0]` would satisfy. This one is the reason the list read uses
  // `z.array(...)` rather than parsing a single row and trusting the rest.
  it("rejects a bad row that is not the first one", async () => {
    queueBlogPage([validRow(), { ...validRow(), date: "2026-01-01" }]);

    await expect(fetchBlogPage(session(), 1)).rejects.toThrow(
      "Failed to fetch blogs.",
    );
  });

  it("strips an undeclared column from a row that is not the first one", async () => {
    queueBlogPage([
      validRow(),
      { ...validRow(), author_email: "someone@example.com" },
    ]);

    const { blogs: rows } = await fetchBlogPage(session(), 1);

    expect(rows).toEqual([validRow(), validRow()]);
  });

  it("rejects a row that is missing a column entirely", async () => {
    // Deleted from a copy rather than written out without the field, so adding a
    // column to `validRow` cannot leave this case quietly testing an old shape.
    const withoutPrivate: Partial<ReturnType<typeof validRow>> = validRow();
    delete withoutPrivate.private;
    queueBlogPage([withoutPrivate]);

    await expect(fetchBlogPage(session(), 1)).rejects.toThrow(
      "Failed to fetch blogs.",
    );
  });

  // The reader is told nothing useful, so the detail has to reach the log or the
  // failure is undiagnosable. Asserts the field path is there, which is the part
  // that says *which* column drifted.
  /** What data.ts logged, as the single argument after the prefix. */
  function loggedPayload(prefix: string): unknown {
    expect(consoleError).toHaveBeenCalledOnce();
    const call = consoleError.mock.calls[0];
    if (!call) throw new Error("Unreachable: asserted called once above.");
    expect(call).toHaveLength(2);
    expect(call[0]).toBe(prefix);
    return call[1];
  }

  it("logs which field failed, under the same prefix as a query failure", async () => {
    queueBlogPage([{ ...validRow(), date: "2026-01-01" }]);
    await expect(fetchBlogPage(session(), 1)).rejects.toThrow();

    const logged = loggedPayload("Failed to fetch blogs:");
    expect(JSON.stringify(logged)).toContain('"path":[0,"date"]');
  });

  /**
   * The regression test for the reason data.ts reduces the error at all: given
   * the `ZodError` itself, `console.error` throws
   * `TypeError: Cannot read properties of undefined (reading 'value')` on this
   * runtime, and that `TypeError` replaces the generic error below — so the
   * reader gets an inspector crash and the log is lost. Asserting the message
   * here is what pins it: the `beforeEach` stand-in formats what it is given, so
   * an un-inspectable payload makes this reject with the wrong error.
   */
  it("logs something Node can actually format, so the generic error survives", async () => {
    queueBlogPage([{ ...validRow(), date: "2026-01-01" }]);

    await expect(fetchBlogPage(session(), 1)).rejects.toThrow(
      "Failed to fetch blogs.",
    );

    expect(() =>
      inspect(loggedPayload("Failed to fetch blogs:")),
    ).not.toThrow();
  });

  // Guards the claim in data.ts that nothing from a private post reaches the
  // log. A validation error that quoted the offending row would put post bodies
  // into the server log on every schema drift — and zod does carry the offending
  // value for some issue types, so this holds because of the reduction rather
  // than because ZodError is inherently value-free.
  it("keeps the post's content out of what it logs", async () => {
    queueBlogPage([{ ...validRow(), date: "2026-01-01" }]);
    await expect(fetchBlogPage(session(), 1)).rejects.toThrow();

    const logged = loggedPayload("Failed to fetch blogs:");
    // Both serialisers, because JSON.stringify drops keys that `inspect` shows.
    expect(JSON.stringify(logged)).not.toContain(CONTENT);
    expect(inspect(logged, { depth: null })).not.toContain(CONTENT);
  });

  // Not tidiness: these rows are handed to `BlogBodyAbbr`, a client
  // component, so anything left on them is serialised into the page. A column
  // added to the table must not ride along.
  it("strips a column the type does not declare instead of passing it on", async () => {
    queueBlogPage([{ ...validRow(), author_email: "someone@example.com" }]);

    const { blogs: rows } = await fetchBlogPage(session(), 1);

    expect(rows[0]).toEqual(validRow());
    expect(Object.keys(rows[0] ?? {})).not.toContain("author_email");
  });

  // More than one field, and the stripping too, because a single bad-date case
  // here would also be satisfied by a separate single-row schema that happened
  // to check only `date`. These pin that `getBlog` uses the *same* schema.
  it.each([
    ["date", "2026-01-01"],
    ["private", "false"],
    ["id", "a"],
    ["content", 42],
  ])(
    "applies the same parsing to the single-post read (%s)",
    async (field, value) => {
      queueSqlResult([{ ...validRow(), [field]: value }]);

      await expect(getBlog(session(), ROW_ID)).rejects.toThrow(
        "Failed to fetch blog.",
      );
    },
  );

  it("strips an undeclared column on the single-post read too", async () => {
    queueSqlResult([{ ...validRow(), author_email: "someone@example.com" }]);

    await expect(getBlog(session(), ROW_ID)).resolves.toEqual(validRow());
  });

  // The empty result is the ordinary answer for a missing *or* private post, so
  // it has to survive a parser that rejects everything else.
  it("still reports no post rather than failing when nothing matched", async () => {
    queueSqlResult([]);

    await expect(getBlog(session(), ROW_ID)).resolves.toBeUndefined();
    expect(consoleError).not.toHaveBeenCalled();
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
  [
    "fetchBlogPage",
    () => {
      // Two results, because it issues two queries; an unqueued count fails to
      // parse and the call rejects before the assertion is reached.
      queueBlogPage([]);
      return fetchBlogPage(null, 1);
    },
  ],
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
