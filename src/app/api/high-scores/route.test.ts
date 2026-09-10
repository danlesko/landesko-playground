import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/high-scores", () => ({
  HIGH_SCORE_LIMIT: 10,
  fetchHighScores: vi.fn(),
  recordHighScore: vi.fn(),
}));

vi.mock("@/lib/recaptcha", () => ({
  verifyRecaptcha: vi.fn(),
}));

import { fetchHighScores, recordHighScore } from "@/lib/high-scores";
import { verifyRecaptcha } from "@/lib/recaptcha";
import { GET, PUT } from "./route";

/**
 * The leaderboard endpoint.
 *
 * `@/lib/high-scores` is mocked here, unlike in `recaptcha/route.test.ts` which deliberately
 * drives the real verifier. The difference is what each test is protecting: there, the leak
 * being guarded against originates inside the module, so mocking it would make the assertion
 * vacuous. Here the data layer has its own tests against a mocked driver and a real Postgres,
 * and what is left to check is the route's own decisions -- what it validates, what it
 * refuses, and above all the ORDER it does things in.
 *
 * `verifyRecaptchaToken` is mocked because the real one reads a secret from the environment
 * that `src/test/setup.ts` deletes on purpose.
 */

const jsonRequest = (body: string): Request =>
  new Request("https://example.test/api/high-scores", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body,
  });

const submit = (body: unknown): Promise<Response> =>
  PUT(jsonRequest(JSON.stringify(body)));

const valid = {
  name: "Ada",
  score: 900,
  captchaValue: "a-token",
};

const payload = async (response: Response): Promise<Record<string, unknown>> =>
  (await response.json()) as Record<string, unknown>;

beforeEach(() => {
  vi.mocked(verifyRecaptcha).mockResolvedValue({ ok: true });
  vi.mocked(fetchHighScores).mockResolvedValue([]);
  vi.mocked(recordHighScore).mockResolvedValue({ saved: true, scores: [] });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("GET /api/high-scores", () => {
  it("returns the scores the data layer gives it, in that order", async () => {
    // The route must not sort. The ordering is the query's job, and duplicating it here
    // would let the two disagree.
    vi.mocked(fetchHighScores).mockResolvedValue([
      { name: "ada", score: 900 },
      { name: "grace", score: 400 },
    ]);
    const response = await GET();

    expect(response.status).toBe(200);
    expect(await payload(response)).toEqual({
      scores: [
        { name: "ada", score: 900 },
        { name: "grace", score: 400 },
      ],
    });
  });

  it("answers 503, not 500, when the scores cannot be read", async () => {
    // The ordinary cause is the table not existing yet, which is an unfinished deployment
    // rather than a bug -- and the client is expected to carry on and let the game be
    // played, which it decides from this status.
    vi.mocked(fetchHighScores).mockRejectedValue(
      new Error("Failed to fetch high scores."),
    );
    const response = await GET();

    expect(response.status).toBe(503);
  });

  it("never passes the database's own error to the client", async () => {
    vi.mocked(fetchHighScores).mockRejectedValue(
      new Error('relation "high_scores" does not exist'),
    );
    const body = JSON.stringify(await payload(await GET()));

    expect(body).not.toContain("relation");
    expect(body).not.toContain("high_scores");
  });
});

describe("PUT /api/high-scores", () => {
  it("rejects a body that is not JSON", async () => {
    const response = await PUT(jsonRequest("not json at all"));
    expect(response.status).toBe(400);
    expect(recordHighScore).not.toHaveBeenCalled();
  });

  it("verifies the captcha BEFORE touching the database", async () => {
    // The order is the point, not merely that both happen. A route that recorded the score
    // and then checked the captcha would pass every other test here while leaving the
    // endpoint effectively unprotected.
    vi.mocked(verifyRecaptcha).mockResolvedValue({
      ok: false,
      reason: "rejected",
    });
    const response = await submit(valid);

    expect(response.status).toBe(400);
    expect(
      recordHighScore,
      "the score was recorded despite a failed captcha",
    ).not.toHaveBeenCalled();
  });

  it("separates a REFUSED captcha from an unavailable verifier", async () => {
    // The distinction is the whole point of the richer result. A missing secret, or Google
    // being unreachable, is not the visitor's doing -- answering 400 told them their
    // submission was refused and sent them back round a challenge that could not help.
    vi.mocked(verifyRecaptcha).mockResolvedValue({
      ok: false,
      reason: "unavailable",
    });
    const response = await submit(valid);

    expect(response.status).toBe(503);
    expect(recordHighScore).not.toHaveBeenCalled();
  });

  it("rejects a name carrying control or bidi characters", async () => {
    // Not an XSS guard -- React escapes markup. A right-to-left override garbles every row
    // after it, and a zero-width run renders as a blank entry that cannot be named in the
    // manual DELETE moderation depends on.
    for (const name of ["Ada\u202E", "Ada\u200B", "Ada\u0000"]) {
      vi.mocked(recordHighScore).mockClear();
      const response = await submit({ ...valid, name });
      expect(response.status, JSON.stringify(name)).toBe(400);
      expect(recordHighScore).not.toHaveBeenCalled();
    }
  });

  it("refuses a submission with no captcha at all", async () => {
    const response = await submit({ name: "Ada", score: 900 });
    expect(response.status).toBe(400);
    expect(verifyRecaptcha).not.toHaveBeenCalled();
    expect(recordHighScore).not.toHaveBeenCalled();
  });

  describe("the name", () => {
    it("is trimmed before it reaches the database", async () => {
      await submit({ ...valid, name: "  Ada  " });
      expect(recordHighScore).toHaveBeenCalledWith("Ada", 900);
    });

    it("cannot be blank, and whitespace does not count as characters", async () => {
      for (const name of ["", "   ", "\t\n"]) {
        vi.mocked(recordHighScore).mockClear();
        const response = await submit({ ...valid, name });
        expect(response.status, JSON.stringify(name)).toBe(400);
        expect(recordHighScore).not.toHaveBeenCalled();
      }
    });

    it("accepts exactly 32 characters and refuses 33", async () => {
      // The boundary itself, because an off-by-one here is invisible in every other test.
      const response = await submit({ ...valid, name: "a".repeat(32) });
      expect(response.status).toBe(200);

      vi.mocked(recordHighScore).mockClear();
      const tooLong = await submit({ ...valid, name: "a".repeat(33) });
      expect(tooLong.status).toBe(400);
      expect(recordHighScore).not.toHaveBeenCalled();
    });

    it("counts length AFTER trimming, so padding does not consume the budget", async () => {
      // `z.string().max(32).trim()` would reject this; `.trim().max(32)` accepts it. The
      // order is what this pins.
      const response = await submit({
        ...valid,
        name: `   ${"a".repeat(32)}   `,
      });
      expect(response.status).toBe(200);
      expect(recordHighScore).toHaveBeenCalledWith("a".repeat(32), 900);
    });

    it("stores a name containing SQL rather than interpreting it", async () => {
      // The data layer binds parameters; this asserts the route does not sanitise or reject
      // it, because mangling a player's name would be the wrong fix.
      const hostile = "'); DROP TABLE--";
      await submit({ ...valid, name: hostile });
      expect(recordHighScore).toHaveBeenCalledWith(hostile, 900);
    });
  });

  describe("the score", () => {
    it("must be a whole, non-negative number", async () => {
      for (const score of [-1, 1.5, NaN, "900", null]) {
        vi.mocked(recordHighScore).mockClear();
        const response = await submit({ ...valid, score });
        expect(response.status, String(score)).toBe(400);
        expect(recordHighScore).not.toHaveBeenCalled();
      }
    });

    it("accepts zero", async () => {
      // The client will not OFFER to save a zero, but the endpoint has no business calling
      // it invalid -- topping out immediately is a real game.
      const response = await submit({ ...valid, score: 0 });
      expect(response.status).toBe(200);
      expect(recordHighScore).toHaveBeenCalledWith("Ada", 0);
    });

    it("refuses a score too large to be real, or to fit the column", async () => {
      // Not a defence against forgery -- a plausible fake still gets through. It stops the
      // unbounded case, including values that would overflow INTEGER and turn a bad request
      // into a database error.
      const response = await submit({ ...valid, score: 2_147_483_648 });
      expect(response.status).toBe(400);
      expect(recordHighScore).not.toHaveBeenCalled();
    });
  });

  describe("the outcome", () => {
    it("answers 200 with the new board when the score is saved", async () => {
      vi.mocked(recordHighScore).mockResolvedValue({
        saved: true,
        scores: [{ name: "Ada", score: 900 }],
      });
      const response = await submit(valid);

      expect(response.status).toBe(200);
      expect(await payload(response)).toMatchObject({
        saved: true,
        scores: [{ name: "Ada", score: 900 }],
      });
    });

    it("answers 200, not an error, when the score did not earn a place", async () => {
      // Missing the top ten is an ordinary outcome of a well-formed request. Answering 4xx
      // would make the client treat a working submission as a failure.
      vi.mocked(recordHighScore).mockResolvedValue({
        saved: false,
        scores: [],
      });
      const response = await submit({ ...valid, score: 1 });

      expect(response.status).toBe(200);
      expect(await payload(response)).toMatchObject({ saved: false });
    });

    it("does not read the board a second time", async () => {
      // The database function returns the post-write board itself. An earlier version of
      // this route called `fetchHighScores` after the write, which could fail on its own and
      // report a stored score as unstored -- inviting a retry that stored it twice.
      await submit(valid);
      expect(
        fetchHighScores,
        "the route read the board again after writing",
      ).not.toHaveBeenCalled();
    });

    it("answers 503 when the score cannot be recorded", async () => {
      vi.mocked(recordHighScore).mockRejectedValue(
        new Error("Failed to record high score."),
      );
      const response = await submit(valid);
      expect(response.status).toBe(503);
    });

    it("never passes the database's own error to the client", async () => {
      vi.mocked(recordHighScore).mockRejectedValue(
        new Error('relation "high_scores" does not exist'),
      );
      const body = JSON.stringify(await payload(await submit(valid)));
      expect(body).not.toContain("relation");
      expect(body).not.toContain("high_scores");
    });
  });
});
