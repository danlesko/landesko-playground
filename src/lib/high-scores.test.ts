import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@vercel/postgres", async () => {
  const { sql } = await import("@/test/sql-mock");
  return { sql };
});

import {
  normalizeSql,
  onlySqlCall,
  queueSqlResult,
  failNextSqlCalls,
  resetSqlMock,
  sqlCalls,
} from "@/test/sql-mock";
import {
  HIGH_SCORE_LIMIT,
  fetchHighScores,
  recordHighScore,
} from "@/lib/high-scores";

/**
 * The leaderboard's data layer, with `@vercel/postgres` mocked.
 *
 * These assert the SQL TEXT in a couple of places, which is unusual and deliberate: the
 * write is a single statement whose correctness is the whole feature, and the properties
 * that matter -- that it is ONE statement, and that its ordering is total -- are visible
 * nowhere else. The behavioural half of the same statement is covered against a real
 * Postgres by `e2e/high-scores.spec.ts`; these cover what a mock can see.
 */

beforeEach(() => {
  resetSqlMock();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("fetchHighScores", () => {
  it("asks for ten rows, highest score first, with a total ordering", () => {
    // The ordering is asserted because `score DESC` alone is not enough: two equal scores
    // would come back in scan order, so the board could reshuffle between reads with no
    // score having changed.
    queueSqlResult([]);
    return fetchHighScores().then(() => {
      const query = normalizeSql(onlySqlCall().text);
      expect(query).toContain("ORDER BY score DESC, created_at ASC, id ASC");
      expect(query).toContain("LIMIT $1");
      expect(onlySqlCall().values).toEqual([HIGH_SCORE_LIMIT]);
    });
  });

  it("reads only the two columns the client needs", async () => {
    // Not `SELECT *`. `id` and `created_at` order rows inside the database and are no use
    // to a browser, so they must not travel.
    queueSqlResult([]);
    await fetchHighScores();
    const query = normalizeSql(onlySqlCall().text);
    expect(query).toContain("SELECT name, score");
    expect(query).not.toContain("SELECT *");
  });

  it("returns the rows in the order the database gave them", async () => {
    // The function must not re-sort; the ORDER BY above is the single source of the order.
    queueSqlResult([
      { name: "ada", score: 900 },
      { name: "grace", score: 400 },
    ]);
    await expect(fetchHighScores()).resolves.toEqual([
      { name: "ada", score: 900 },
      { name: "grace", score: 400 },
    ]);
  });

  it("rejects a row whose shape has drifted, rather than passing it on", async () => {
    // A cast would let this through. `score` arriving as a string is the realistic drift --
    // it is what COUNT(*) does, because bigint has no safe JS number.
    queueSqlResult([{ name: "ada", score: "900" }]);
    await expect(fetchHighScores()).rejects.toThrow(
      "Failed to fetch high scores.",
    );
  });

  it("throws a generic error and logs the detail when the query fails", async () => {
    failNextSqlCalls(new Error('relation "high_scores" does not exist'));
    // The message a caller sees must not carry the database's, which is how the route can
    // answer 503 without deciding what to reveal.
    await expect(fetchHighScores()).rejects.toThrow(
      "Failed to fetch high scores.",
    );
    expect(console.error).toHaveBeenCalled();
  });
});

describe("recordHighScore", () => {
  const result = (saved: boolean, scores: unknown[] = []) => [
    { record_high_score: { saved, scores } },
  ];

  it("delegates the whole rule to the database function, in one call", async () => {
    // The rule is NOT in TypeScript, and that is the design rather than an accident.
    // `sql` builds a fresh HTTP client per call, so a read-then-write from here could never
    // be atomic; and one statement with data-modifying CTEs cannot rank the table including
    // its own insert. `migrations/0005_high_scores.sql` records both dead ends. What is left
    // to assert here is that this function does not reintroduce either.
    queueSqlResult(result(true));
    await recordHighScore("ada", 900);

    expect(sqlCalls()).toHaveLength(1);
    expect(normalizeSql(onlySqlCall().text)).toBe(
      "SELECT public.record_high_score($1, $2)",
    );
  });

  it("binds the name and score as parameters, never as text", async () => {
    queueSqlResult(result(true));
    await recordHighScore("Robert'); DROP TABLE high_scores;--", 42);
    const call = onlySqlCall();

    expect(call.values).toEqual(["Robert'); DROP TABLE high_scores;--", 42]);
    expect(normalizeSql(call.text)).not.toContain("DROP TABLE");
  });

  it("returns the board the function reports, so no second read is needed", async () => {
    // A second read could fail after a successful insert and report a stored score as
    // unstored -- which would invite a retry that stores it twice.
    queueSqlResult(
      result(true, [
        { name: "ada", score: 900 },
        { name: "grace", score: 400 },
      ]),
    );
    await expect(recordHighScore("ada", 900)).resolves.toEqual({
      saved: true,
      scores: [
        { name: "ada", score: 900 },
        { name: "grace", score: 400 },
      ],
    });
    expect(sqlCalls()).toHaveLength(1);
  });

  it("reports not saved when the score did not earn a place", async () => {
    // Zero inserted is an ORDINARY outcome, not a failure -- the score was simply too low.
    queueSqlResult(result(false, [{ name: "ada", score: 900 }]));
    await expect(recordHighScore("bob", 1)).resolves.toMatchObject({
      saved: false,
    });
  });

  it("throws a generic error and logs the detail when the statement fails", async () => {
    failNextSqlCalls(
      new Error(
        "function public.record_high_score(text, integer) does not exist",
      ),
    );
    await expect(recordHighScore("ada", 900)).rejects.toThrow(
      "Failed to record high score.",
    );
    expect(console.error).toHaveBeenCalled();
  });

  it("rejects a payload whose shape has drifted", async () => {
    // The function's contract is as much a shape to validate as a table row is. `saved`
    // arriving as a string is what a rewritten function returning text would look like.
    queueSqlResult([{ record_high_score: { saved: "true", scores: [] } }]);
    await expect(recordHighScore("ada", 900)).rejects.toThrow(
      "Failed to record high score.",
    );
  });

  it("rejects a result with no payload at all", async () => {
    queueSqlResult([]);
    await expect(recordHighScore("ada", 900)).rejects.toThrow(
      "Failed to record high score.",
    );
  });
});
