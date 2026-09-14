import { z } from "zod";

import type { HighScore } from "@/lib/definitions";

/**
 * The browser's half of the leaderboard: one GET and one PUT against
 * `/api/high-scores`.
 *
 * A plain `.ts` module rather than logic inside the component, for two reasons. It is the
 * first client-side `fetch()` in this repo, so the parsing and the failure taxonomy are new
 * and worth testing directly; and `vitest.config.ts` includes `src/**\/*.test.ts` only, so
 * anything that needs a test without mounting a component belongs in a file shaped like
 * this one.
 *
 * Every function returns a DISCRIMINATED RESULT rather than throwing. The caller is a game
 * that must keep working when the leaderboard does not -- the table may not exist yet in
 * production -- so "unavailable" has to be an ordinary value the UI handles, not an
 * exception it might forget to catch.
 */

const ENDPOINT = "/api/high-scores";

const ScoreSchema = z.object({
  name: z.string(),
  score: z.number().int(),
  // Present only for the owner: the route strips it for everyone else, because its only use is
  // removing an entry. Optional here rather than in two schemas, since the two responses differ
  // by exactly this field.
  id: z.string().optional(),
});

/**
 * The payload is validated, not cast, even though this app also wrote the server. A cast
 * would make a deployed-version mismatch -- an old client against a new route -- render
 * `undefined` into the board instead of failing in a way the UI can report.
 */
const ScoresPayloadSchema = z.object({
  scores: z.array(ScoreSchema),
  // Absent on an older deployment, so defaulted rather than required -- a missing flag must
  // mean "no moderation controls", never a crash.
  canModerate: z.boolean().optional(),
});

const SubmissionPayloadSchema = z.object({
  saved: z.boolean(),
  scores: z.array(ScoreSchema),
  canModerate: z.boolean().optional(),
});

/** A row as the browser has it: the id is present only when the reader may act on it. */
export type ClientScore = HighScore & { id?: string };

export type LoadResult =
  | { status: "ok"; scores: ClientScore[]; canModerate: boolean }
  | { status: "unavailable" };

export type SubmitResult =
  /** Recorded. `scores` is the board including it. */
  | { status: "saved"; scores: ClientScore[]; canModerate: boolean }
  /** The request was fine and the score was simply too low. NOT an error. */
  | { status: "missed"; scores: ClientScore[]; canModerate: boolean }
  /** Refused for going too fast. Distinct from `rejected` because it is worth waiting out. */
  | { status: "rate-limited" }
  /** The server refused it -- a failed captcha or a name it would not take. */
  | { status: "rejected" }
  /** The leaderboard could not be reached, or answered something unreadable. */
  | { status: "unavailable" };

export async function loadHighScores(): Promise<LoadResult> {
  try {
    // `no-store` explicitly. Route Handler GETs are uncached by default in Next 16, but
    // that is the SERVER's policy -- this says the browser must not serve a leaderboard
    // from its own cache after a score has changed it.
    const response = await fetch(ENDPOINT, { cache: "no-store" });
    if (!response.ok) return { status: "unavailable" };
    const parsed = ScoresPayloadSchema.safeParse(await response.json());
    if (!parsed.success) return { status: "unavailable" };
    return {
      status: "ok",
      scores: parsed.data.scores,
      canModerate: parsed.data.canModerate === true,
    };
  } catch {
    // A network failure, an aborted navigation, or a body that is not JSON. All the same
    // to a reader: there is no board to show.
    return { status: "unavailable" };
  }
}

export async function submitHighScore(submission: {
  name: string;
  score: number;
  captchaValue: string;
  /** One per game-over panel, so a resend after a lost response cannot store a second row. */
  submissionId: string;
}): Promise<SubmitResult> {
  try {
    const response = await fetch(ENDPOINT, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(submission),
    });

    // 400 is the server refusing this submission -- a stale captcha token, or a name that
    // did not survive validation. Distinguished from 503 because the two need different
    // words: one is worth trying again with a different name, the other is not the reader's
    // doing at all.
    if (response.status === 400) return { status: "rejected" };
    // Worth its own state: "you are going too fast" is actionable in a way that neither a
    // refusal nor an outage is, and the wording has to say so.
    if (response.status === 429) return { status: "rate-limited" };
    if (!response.ok) return { status: "unavailable" };

    const parsed = SubmissionPayloadSchema.safeParse(await response.json());
    if (!parsed.success) return { status: "unavailable" };
    return {
      // `saved: false` is a success, not a failure: the score was recorded nowhere because
      // it did not beat the tenth place, which is the leaderboard working.
      status: parsed.data.saved ? "saved" : "missed",
      scores: parsed.data.scores,
      canModerate: parsed.data.canModerate === true,
    };
  } catch {
    return { status: "unavailable" };
  }
}

/**
 * Removes one entry. Only the owner can, and the server is what decides that.
 *
 * A 404 from an anonymous caller is deliberate on the server's side -- see the route -- so this
 * reports it as `unavailable` rather than inventing a "forbidden" the UI would have to word.
 * A visitor never sees the control at all.
 */
export async function removeHighScore(
  id: string,
): Promise<
  { status: "removed"; scores: ClientScore[] } | { status: "unavailable" }
> {
  try {
    const response = await fetch(ENDPOINT, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (!response.ok) return { status: "unavailable" };
    const parsed = ScoresPayloadSchema.safeParse(await response.json());
    if (!parsed.success) return { status: "unavailable" };
    return { status: "removed", scores: parsed.data.scores };
  } catch {
    return { status: "unavailable" };
  }
}
