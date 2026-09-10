import { afterEach, describe, expect, it, vi } from "vitest";

import {
  loadHighScores,
  submitHighScore,
} from "@/components/tetris/scoreClient";

/**
 * The browser's half of the leaderboard.
 *
 * `src/test/setup.ts` replaces global fetch with one that THROWS, so every test here has to
 * stub it deliberately -- which is what makes the "unavailable" paths honest rather than
 * accidental.
 */

const respondWith = (body: unknown, status = 200): void => {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(typeof body === "string" ? body : JSON.stringify(body), {
          status,
          headers: { "Content-Type": "application/json" },
        }),
    ),
  );
};

const failNetwork = (): void => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    }),
  );
};

const lastRequest = () => vi.mocked(fetch).mock.calls[0]!;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("loadHighScores", () => {
  it("returns the scores the server sent, in that order", async () => {
    respondWith({
      scores: [
        { name: "ada", score: 900 },
        { name: "grace", score: 400 },
      ],
    });
    await expect(loadHighScores()).resolves.toEqual({
      status: "ok",
      scores: [
        { name: "ada", score: 900 },
        { name: "grace", score: 400 },
      ],
    });
  });

  it("asks the browser not to serve a cached board", async () => {
    // The server already declines to cache this. What this covers is the OTHER cache: after
    // a save changes the board, a browser-cached response would show the old one.
    respondWith({ scores: [] });
    await loadHighScores();
    const [url, init] = lastRequest();
    expect(url).toBe("/api/high-scores");
    expect((init as RequestInit).cache).toBe("no-store");
  });

  it("reports unavailable rather than throwing when the table is missing", async () => {
    // 503 is what the route answers before the migration has run. The game has to stay
    // playable, so this must be a value the UI can render, not an exception.
    respondWith({ message: "High scores are unavailable." }, 503);
    await expect(loadHighScores()).resolves.toEqual({ status: "unavailable" });
  });

  it("reports unavailable when the network fails outright", async () => {
    failNetwork();
    await expect(loadHighScores()).resolves.toEqual({ status: "unavailable" });
  });

  it("refuses a payload of the wrong shape instead of rendering it", async () => {
    // What an old client talking to a changed route looks like. Casting would put
    // `undefined` on the board; this reports it as unavailable.
    respondWith({ scores: [{ name: "ada", score: "900" }] });
    await expect(loadHighScores()).resolves.toEqual({ status: "unavailable" });
  });

  it("survives a body that is not JSON at all", async () => {
    respondWith("<!doctype html><title>proxy error</title>");
    await expect(loadHighScores()).resolves.toEqual({ status: "unavailable" });
  });
});

describe("submitHighScore", () => {
  const submission = { name: "Ada", score: 900, captchaValue: "token" };

  it("PUTs the submission as JSON", async () => {
    respondWith({ saved: true, scores: [] });
    await submitHighScore(submission);
    const [url, init] = lastRequest();
    const request = init as RequestInit;

    expect(url).toBe("/api/high-scores");
    expect(request.method).toBe("PUT");
    expect(JSON.parse(String(request.body))).toEqual(submission);
  });

  it("reports saved, with the board that now includes the score", async () => {
    respondWith({ saved: true, scores: [{ name: "Ada", score: 900 }] });
    await expect(submitHighScore(submission)).resolves.toEqual({
      status: "saved",
      scores: [{ name: "Ada", score: 900 }],
    });
  });

  it("distinguishes 'did not make the top ten' from a failure", async () => {
    // The single most important distinction in this module. A 200 with `saved: false` means
    // the leaderboard worked and the score was too low -- telling the reader their save
    // failed would be a lie, and prompting a retry would be pointless.
    respondWith({ saved: false, scores: [{ name: "ada", score: 900 }] });
    await expect(submitHighScore(submission)).resolves.toEqual({
      status: "missed",
      scores: [{ name: "ada", score: 900 }],
    });
  });

  it("separates a refused submission from an unreachable one", async () => {
    // 400 is the reader's captcha or name; 503 is not their doing. They need different
    // words, so they cannot collapse into one state.
    respondWith({ message: "Failed to verify" }, 400);
    await expect(submitHighScore(submission)).resolves.toEqual({
      status: "rejected",
    });

    respondWith({ message: "Could not record that score." }, 503);
    await expect(submitHighScore(submission)).resolves.toEqual({
      status: "unavailable",
    });
  });

  it("reports unavailable when the network fails", async () => {
    failNetwork();
    await expect(submitHighScore(submission)).resolves.toEqual({
      status: "unavailable",
    });
  });

  it("refuses a success payload of the wrong shape", async () => {
    respondWith({ saved: "yes", scores: [] });
    await expect(submitHighScore(submission)).resolves.toEqual({
      status: "unavailable",
    });
  });
});
