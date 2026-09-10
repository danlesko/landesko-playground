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
});

/**
 * The payload is validated, not cast, even though this app also wrote the server. A cast
 * would make a deployed-version mismatch -- an old client against a new route -- render
 * `undefined` into the board instead of failing in a way the UI can report.
 */
const ScoresPayloadSchema = z.object({ scores: z.array(ScoreSchema) });

const SubmissionPayloadSchema = z.object({
  saved: z.boolean(),
  scores: z.array(ScoreSchema),
});

export type LoadResult =
  | { status: "ok"; scores: HighScore[] }
  | { status: "unavailable" };

export type SubmitResult =
  /** Recorded. `scores` is the board including it. */
  | { status: "saved"; scores: HighScore[] }
  /** The request was fine and the score was simply too low. NOT an error. */
  | { status: "missed"; scores: HighScore[] }
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
    return { status: "ok", scores: parsed.data.scores };
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
    if (!response.ok) return { status: "unavailable" };

    const parsed = SubmissionPayloadSchema.safeParse(await response.json());
    if (!parsed.success) return { status: "unavailable" };
    return {
      // `saved: false` is a success, not a failure: the score was recorded nowhere because
      // it did not beat the tenth place, which is the leaderboard working.
      status: parsed.data.saved ? "saved" : "missed",
      scores: parsed.data.scores,
    };
  } catch {
    return { status: "unavailable" };
  }
}
