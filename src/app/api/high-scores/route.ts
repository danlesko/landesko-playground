import { z } from "zod";

import { getSession } from "@/lib/session";
import { requestKey, withinRateLimit } from "@/lib/rateLimit";
import { verifyRecaptcha } from "@/lib/recaptcha";
import {
  HIGH_SCORE_LIMIT,
  deleteHighScore,
  fetchHighScores,
  recordHighScore,
} from "@/lib/high-scores";
import type { HighScore, HighScoreRow } from "@/lib/definitions";

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
    .max(32, "A name must be 32 characters or fewer")
    // No control characters, and no bidirectional overrides. React escapes markup, so this
    // is not about XSS -- it is about a name that can reorder or hide the rest of the row it
    // is rendered in. A right-to-left override in a leaderboard entry garbles every entry
    // after it, and a zero-width run renders as a blank row that cannot be identified for
    // the manual DELETE that moderation depends on.
    //
    // A denylist of ranges rather than an allowlist of letters, deliberately: an allowlist
    // would have to enumerate every script a real person's name can be written in, and
    // getting that wrong means refusing someone their own name.
    .refine((value) => !/[\p{Cc}\p{Cf}]/u.test(value), {
      error: "A name cannot contain control characters",
    }),
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
  captchaValue: z
    .string({
      error: (issue) =>
        issue.code === "invalid_type" ? "A captcha is required" : undefined,
    })
    // A LENGTH BAND, and it is the cheap half of the rate-limiting answer. Every rejected
    // token used to cost a round trip to Google, so an endpoint with no limit in front of it
    // could be used to amplify traffic at them. A real reCAPTCHA token is hundreds of
    // characters; `"x"` is not one, and now costs nothing to refuse. Deliberately a wide band
    // rather than a format: the token is opaque and Google is free to change its shape, so
    // anything tighter risks refusing a valid one.
    .min(20, "That captcha token is not valid")
    .max(4096, "That captcha token is not valid"),
  // Minted by the client, one per game-over panel, and what makes a retry safe: the column is
  // unique and the function checks it first, so a resend after a lost response returns the
  // existing board instead of inserting a second row for the same game.
  submissionId: z.guid({
    error: (issue) =>
      issue.code === "invalid_type" ? "A submission id is required" : undefined,
  }),
});

/**
 * Strips the primary key unless the caller may act on it.
 *
 * The id exists for exactly one purpose -- letting the owner remove an entry -- so it has no
 * business in an anonymous response. Doing it here rather than in two queries keeps one read
 * path: the data layer always reads the id, and the boundary that knows about sessions is the
 * one that decides who sees it.
 */
const visible = (rows: HighScoreRow[], canModerate: boolean): HighScore[] =>
  canModerate ? rows : rows.map(({ name, score }) => ({ name, score }));

/**
 * Whether this request may moderate the board.
 *
 * `session?.user`, never `session` alone. A broken auth configuration makes `auth()` return a
 * TRUTHY object with no user, so a bare `if (session)` fails OPEN -- which for this function
 * would hand every anonymous visitor a delete button.
 */
const canModerate = async (): Promise<boolean> => {
  try {
    // `getSession`, not `auth` directly. Everything under `src/app` reads the session through
    // that memo, and `src/lib/session.test.ts` enforces it -- `cache` only memoizes calls made
    // through the wrapper, so importing `auth` here would bypass it silently. This handler
    // reads it twice on the PUT path, which is exactly what the memo is for.
    const session = await getSession();
    return Boolean(session?.user);
  } catch {
    // A misconfigured or unreachable auth provider must not take the leaderboard down with it.
    // Failing closed here costs the owner a delete button and costs a visitor nothing.
    return false;
  }
};

/**
 * Six attempts a minute from one address, which is generous for a human finishing a game and
 * mean for a loop. See `src/lib/rateLimit.ts` for the honest account of what an in-memory
 * limiter on a serverless platform can and cannot promise.
 */
const RATE_LIMIT = { limit: 6, windowMs: 60_000 };

export async function GET() {
  try {
    const owner = await canModerate();
    const scores = await fetchHighScores();
    return Response.json(
      { scores: visible(scores, owner), canModerate: owner },
      { status: 200 },
    );
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

  const { name, score, captchaValue, submissionId } = parsed.data;

  // AFTER validation and BEFORE the captcha, which is the only order that helps: a request
  // refused here has cost one in-memory lookup and nothing else -- no Google round trip and no
  // database call. See the note on `withinRateLimit` for what this does and does not promise.
  if (!withinRateLimit(requestKey(req), RATE_LIMIT)) {
    return Response.json(
      { message: "Too many attempts. Try again shortly." },
      { status: 429 },
    );
  }

  // BEFORE the database, so a failed captcha costs a round trip to Google and nothing else.
  const verification = await verifyRecaptcha(captchaValue);
  if (!verification.ok) {
    // The two failures get different statuses, which is a fix rather than a refinement.
    // Collapsing them into 400 told a visitor their submission was REFUSED when the actual
    // cause was a missing secret or Google being unreachable -- sending them back round a
    // challenge that could never help. 503 is the same answer the database's outage gets,
    // and the client already words that as "not your doing".
    //
    // Both messages are static: the upstream error can carry the request details and
    // therefore the secret.
    return verification.reason === "rejected"
      ? Response.json({ message: "Failed to verify" }, { status: 400 })
      : Response.json(
          { message: "Verification is unavailable." },
          { status: 503 },
        );
  }

  try {
    // One call. The database function returns the post-write board itself, which is not a
    // saved round trip so much as a removed failure mode: a separate read after the write
    // could fail on its own and report a stored score as unstored, inviting a retry that
    // then stores it twice.
    const { saved, scores } = await recordHighScore(name, score, submissionId);
    // 200 whether or not the score earned a place. Not making the top ten is an ORDINARY
    // outcome, not a client error -- the request was well-formed and did exactly what it
    // should. `saved` is how the client tells the two apart.
    const owner = await canModerate();
    return Response.json(
      {
        saved,
        scores: visible(scores, owner),
        canModerate: owner,
        limit: HIGH_SCORE_LIMIT,
      },
      { status: 200 },
    );
  } catch {
    return Response.json(
      { message: "Could not record that score." },
      { status: 503 },
    );
  }
}

/**
 * Removes one entry. Owner only.
 *
 * Exists because two of the leaderboard's limits have the same answer. Ten forged
 * ceiling scores would freeze the board -- nothing can displace a tie, and nothing above the
 * INTEGER maximum is accepted -- and a name that is offensive rather than merely wrong needs
 * removing too. Both were previously "run a DELETE by hand", which is a real answer only for
 * someone with a psql prompt open.
 *
 * It reuses the existing GitHub sign-in and its two-address allowlist, so this adds an endpoint
 * rather than an authorisation model.
 */
export async function DELETE(req: Request) {
  if (!(await canModerate())) {
    // 404, not 403. A 403 confirms the endpoint exists and does something worth protecting; an
    // anonymous caller has no business learning either.
    return Response.json({ message: "Not found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ message: "Invalid request body" }, { status: 400 });
  }

  const parsed = z.object({ id: z.guid() }).safeParse(body);
  if (!parsed.success) {
    return Response.json({ message: "Invalid id" }, { status: 400 });
  }

  try {
    await deleteHighScore(parsed.data.id);
    // The board AFTER the delete, so the caller does not have to ask for it. Ids included --
    // this caller is the owner by definition, having reached this line.
    const scores = await fetchHighScores();
    return Response.json({ scores, canModerate: true }, { status: 200 });
  } catch {
    return Response.json(
      { message: "Could not remove that score." },
      { status: 503 },
    );
  }
}
