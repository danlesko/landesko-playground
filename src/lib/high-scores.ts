import { sql } from "@vercel/postgres";
import { z } from "zod";
import { unstable_noStore as noStore } from "next/cache";
import { HighScore } from "./definitions";

/**
 * The Tetris leaderboard: read the top ten, and record a score if it earns a place.
 *
 * Separate from `data.ts` because nothing here is about blogs and because the write is
 * unlike anything in `actions.ts` -- it is anonymous, it is reached over HTTP rather than
 * as a server action, and its whole difficulty is a single statement that has to be right
 * rather than a form that has to be validated.
 */

/** How many rows the board shows, and the cap the table is held at. */
export const HIGH_SCORE_LIMIT = 10;

/**
 * Not a `SELECT *`, unlike the blog schemas: the query names `name` and `score` and this
 * describes exactly that projection. `id` and `created_at` are deliberately not read --
 * they order the rows inside the database and the client has no use for either, so they
 * do not travel.
 */
const HighScoreRowSchema: z.ZodType<HighScore> = z.object({
  name: z.string(),
  // The column is INTEGER, and the driver hands back a number for it -- unlike COUNT(*),
  // which arrives as a string because it is bigint. Worth stating because the two look
  // interchangeable in a query and are not.
  score: z.number().int(),
});

/**
 * Reduces a ZodError to the fields that are safe to log, copied from `data.ts`.
 *
 * Duplicated rather than exported from there on purpose: `data.ts` explains at length that
 * its own test pins this exact projection, and sharing it would couple two modules'
 * logging to one test. It is nine lines.
 *
 * The reason it exists at all is not tidiness. `console.error(prefix, zodError)` THROWS on
 * Node 24: the class defines an own `stack` accessor that crashes `formatProperty`, so the
 * log line that was supposed to explain a shape drift replaces the real error with an
 * inspect failure.
 */
function loggable(error: unknown): unknown {
  if (!(error instanceof z.ZodError)) return error;
  return {
    name: error.name,
    issues: error.issues.map((issue) => ({
      code: issue.code,
      path: issue.path,
      ...(issue.code === "invalid_type" ? { expected: issue.expected } : {}),
    })),
  };
}

/**
 * The top ten, highest first.
 *
 * `LIMIT 10` is not only a page size -- it is what makes the row cap a guarantee rather
 * than a hope. `recordHighScore` keeps the table at ten, but if a race ever leaves an
 * eleventh row, this read is what stops anyone seeing it.
 *
 * The ordering is total, which matters for a leaderboard: `score DESC` alone leaves two
 * equal scores in whatever order the scan produced, so the board could reshuffle between
 * reads with no score having changed. `created_at ASC` puts the earlier of two equal
 * scores first -- getting there first is the tiebreak a player would expect -- and `id`
 * settles the case where two rows share a timestamp to the microsecond.
 */
export async function fetchHighScores(): Promise<HighScore[]> {
  noStore();
  try {
    const rows = await sql`
      SELECT name, score
      FROM high_scores
      ORDER BY score DESC, created_at ASC, id ASC
      LIMIT ${HIGH_SCORE_LIMIT}
    `;
    // Parsed inside the try, so a drifted column takes the query's failure path rather
    // than surfacing as an unhandled rejection from a different stack.
    return z.array(HighScoreRowSchema).parse(rows.rows);
  } catch (error) {
    console.error("Failed to fetch high scores:", loggable(error));
    throw new Error("Failed to fetch high scores.");
  }
}

/**
 * What `record_high_score` returns: whether the score earned a place, and the board as it
 * stands afterwards.
 */
const RecordResultSchema = z.object({
  saved: z.boolean(),
  scores: z.array(HighScoreRowSchema),
});

export type RecordOutcome = z.output<typeof RecordResultSchema>;

/**
 * Records a score if it earns a place, evicts what it displaces, and returns the resulting
 * board -- all inside one database function.
 *
 * The rule does NOT live here, and that is the point. Three shapes were tried; the first two
 * are wrong and `migrations/0005_high_scores.sql` explains each at length. In short:
 *
 *   - Reading the standing and then writing from here cannot be made safe. `sql` builds a
 *     fresh HTTP client per call, so two calls are two round trips with no shared
 *     transaction, and another submission can land between them.
 *   - One statement with data-modifying CTEs cannot work either: every CTE sees the same
 *     snapshot, so a trim ranks the table without the new row. And qualifying against
 *     `min(score)` lets an equal score displace a better one whenever the table is
 *     over-full -- measured, not theorised.
 *
 * So the whole operation is `public.record_high_score`, a VOLATILE function that takes a
 * transaction-scoped advisory lock and then re-reads. Measured against Postgres 17: twenty
 * simultaneous submissions leave exactly ten rows, where the same function without the lock
 * left EIGHT -- concurrent deletes removing rows while their inserts raced. The failure was
 * losing entries, not just gaining them.
 *
 * The function also returns the post-write board, which removes a failure mode rather than
 * saving a round trip: a separate read after the write can fail on its own and make a score
 * that WAS stored look unstored, prompting a retry that stores it twice.
 */
export async function recordHighScore(
  name: string,
  score: number,
): Promise<RecordOutcome> {
  noStore();
  try {
    // The driver parses jsonb into a JS value, so this arrives as an object rather than a
    // string. The column name is the function name.
    const result =
      await sql`SELECT public.record_high_score(${name}, ${score})`;
    const row = result.rows[0] as { record_high_score?: unknown } | undefined;
    return RecordResultSchema.parse(row?.record_high_score);
  } catch (error) {
    console.error("Failed to record high score:", loggable(error));
    throw new Error("Failed to record high score.");
  }
}
