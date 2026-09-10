import { z } from "zod";

import { verifyRecaptchaToken } from "@/lib/recaptcha";
import {
  HIGH_SCORE_LIMIT,
  fetchHighScores,
  recordHighScore,
} from "@/lib/high-scores";

/**
 * The Tetris leaderboard endpoint.
 *
 * A Route Handler rather than a server action, which is a departure from the rest of this
 * repo -- every other write goes through `src/lib/actions.ts`. Two reasons. The owner asked
 * for a fetch and a PUT, and the caller is a canvas game that already holds its own state
 * in a plain object: a server action would drag the leaderboard into React's form
 * machinery, where the natural expression is `useActionState` on a form the game does not
 * have. `src/app/api/recaptcha/route.ts` is the shape this follows.
 *
 * PUT rather than POST, as specified. Worth being honest that it is the less conventional
 * choice: PUT is defined as idempotent and this is not -- two identical requests can record
 * two rows. Nothing depends on the distinction here, since no proxy in front of this app
 * retries or caches a PUT, but a reader who expects idempotency from the verb would be
 * wrong.
 *
 * NO CORS HEADERS, deliberately: `next.config.ts` records that they were removed because
 * every route in this app is called same-origin. This one is too.
 */

/**
 * Rejects the request body before it reaches the database.
 *
 * `.trim()` BEFORE the length checks, which is the order this repo already established --
 * there is a measured note in `contact-actions.ts` that `z.email().trim()` rejects a padded
 * address while `.trim().pipe(...)` accepts it. Here it means "   " is a blank name rather
 * than a three-character one, and that the 32 the owner asked for is 32 real characters.
 *
 * The `error` callback form rather than `invalid_type_error`, because zod 4 silently ignores
 * the latter -- also already established in `actions.ts`.
 */
const SubmissionSchema = z.object({
  name: z
    .string({
      error: (issue) =>
        issue.code === "invalid_type" ? "A name is required" : undefined,
    })
    .trim()
    .min(1, "A name is required")
    .max(32, "A name must be 32 characters or fewer"),
  score: z
    .number({
      error: (issue) =>
        issue.code === "invalid_type" ? "A score is required" : undefined,
    })
    .int("A score must be a whole number")
    .min(0, "A score cannot be negative")
    // The INTEGER column's ceiling, and nothing tighter. A "plausibility" bound of ten
    // million was the first version and was actively harmful: it buys no anti-cheat value
    // -- anyone who can complete the captcha can submit any number under the cap -- while
    // creating a board that can be frozen permanently. Ten submissions of exactly the cap
    // would be undisplaceable, because a tie does not qualify and nothing higher is
    // allowed. The only thing an upper bound is genuinely for is keeping a bad request
    // from becoming a database error, so it should be exactly the column's limit.
    //
    // Real score integrity would need server-authoritative gameplay. That is far beyond
    // this feature, and the moderation path in the migration is the answer to a forged
    // entry: delete the row.
    .max(2_147_483_647, "A score cannot be that high"),
  captchaValue: z.string({
    error: (issue) =>
      issue.code === "invalid_type" ? "A captcha is required" : undefined,
  }),
});

export async function GET() {
  try {
    const scores = await fetchHighScores();
    return Response.json({ scores }, { status: 200 });
  } catch {
    // 503 rather than 500, and the distinction is real: the ordinary cause is the
    // `high_scores` table not existing yet, which is a deployment that has not finished
    // rather than a bug. The client treats it as "no leaderboard right now" and still lets
    // the game be played.
    //
    // The message is static. `fetchHighScores` has already logged the detail server-side.
    return Response.json(
      { message: "High scores are unavailable." },
      { status: 503 },
    );
  }
}

export async function PUT(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ message: "Invalid request body" }, { status: 400 });
  }

  const parsed = SubmissionSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      {
        message: "Invalid submission",
        fieldErrors: z.flattenError(parsed.error).fieldErrors,
      },
      { status: 400 },
    );
  }

  const { name, score, captchaValue } = parsed.data;

  // BEFORE the database, so a failed captcha costs a round trip to Google and nothing else.
  const verified = await verifyRecaptchaToken(captchaValue);
  if (!verified) {
    // Static, for the same reason the recaptcha route gives: the upstream error can carry
    // the request details and therefore the secret.
    return Response.json({ message: "Failed to verify" }, { status: 400 });
  }

  try {
    // One call. The database function returns the post-write board itself, which is not a
    // saved round trip so much as a removed failure mode: a separate read after the write
    // could fail on its own and report a stored score as unstored, inviting a retry that
    // then stores it twice.
    const { saved, scores } = await recordHighScore(name, score);
    // 200 whether or not the score earned a place. Not making the top ten is an ORDINARY
    // outcome, not a client error -- the request was well-formed and did exactly what it
    // should. `saved` is how the client tells the two apart.
    return Response.json(
      { saved, scores, limit: HIGH_SCORE_LIMIT },
      { status: 200 },
    );
  } catch {
    return Response.json(
      { message: "Could not record that score." },
      { status: 503 },
    );
  }
}
