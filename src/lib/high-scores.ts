import { sql } from "@vercel/postgres";
import { z } from "zod";
import { unstable_noStore as noStore } from "next/cache";
import { HighScoreRow } from "./definitions";

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
 * Not a `SELECT *`, unlike the blog schemas: the query names its three columns and this
 * describes exactly that projection. `created_at` is deliberately not read -- it orders rows
 * inside the database and no caller has any use for it.
 *
 * `id` IS read, which it was not at first. It exists for one caller: the owner needs to be
 * able to remove an entry, and a name-and-score pair is not a safe handle for a delete -- two
 * players can share both. The route strips it for anyone who is not signed in.
 */
const HighScoreRowSchema: z.ZodType<HighScoreRow> = z.object({
  // `z.guid()` rather than `z.uuid()`, matching `data.ts` -- see the note there. The id
  // travels no further than the route, which strips it for anyone but the owner.
  id: z.guid(),
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
export async function fetchHighScores(): Promise<HighScoreRow[]> {
  noStore();
  try {
    const rows = await sql`
      SELECT id, name, score
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
 *
 * `submissionId` is what makes that retry SAFE rather than merely less likely. Removing the
 * second read closed one ambiguity; the underlying one remained, because the database can
 * commit and the response can still be lost -- a dropped connection, a timeout, a closed tab.
 * The panel then truthfully reported a failure that was not one, and a retry inserted a second
 * row for the same game. The id is unique in the table and the function checks for it first,
 * so a replay returns the existing board instead of writing again. See
 * `migrations/0006_high_scores_submission_id.sql` for what that does and does not cover.
 */
export async function recordHighScore(
  name: string,
  score: number,
  submissionId: string,
): Promise<RecordOutcome> {
  noStore();
  try {
    // The driver parses jsonb into a JS value, so this arrives as an object rather than a
    // string. The column name is the function name.
    const result =
      await sql`SELECT public.record_high_score(${name}, ${score}, ${submissionId}::uuid)`;
    const row = result.rows[0] as { record_high_score?: unknown } | undefined;
    return RecordResultSchema.parse(row?.record_high_score);
  } catch (error) {
    console.error("Failed to record high score:", loggable(error));
    throw new Error("Failed to record high score.");
  }
}

/**
 * Removes one entry, by id, for the owner.
 *
 * The only way a forged or offensive row leaves the board, and the reason `fetchHighScores`
 * reads the id at all. Two limits are worth naming rather than fixing here: nothing stops the
 * same score being submitted again -- the board is public and the score comes from a browser --
 * and this takes no lock, because a delete needs none. It removes a specific row or it removes
 * nothing.
 *
 * Authorisation is NOT here. It belongs to the route, which is where a session exists; a data
 * function that silently checked one would be easy to call from somewhere that had not.
 */
export async function deleteHighScore(id: string): Promise<void> {
  noStore();
  try {
    await sql`DELETE FROM high_scores WHERE id = ${id}`;
  } catch (error) {
    console.error("Failed to delete high score:", loggable(error));
    throw new Error("Failed to delete high score.");
  }
}
