import { beforeEach, describe, expect, it } from "vitest";

import { requestKey, resetRateLimit, withinRateLimit } from "@/lib/rateLimit";

/**
 * The limiter in front of the leaderboard's captcha verification.
 *
 * The clock is injected rather than faked globally, so these are ordinary assertions about a
 * pure-ish function instead of tests that depend on timer mocking.
 */

const options = (now: () => number) => ({ limit: 3, windowMs: 1_000, now });

beforeEach(() => {
  resetRateLimit();
});

describe("withinRateLimit", () => {
  it("allows up to the limit and refuses the next", () => {
    const clock = 0;
    const opts = options(() => clock);

    expect(withinRateLimit("a", opts)).toBe(true);
    expect(withinRateLimit("a", opts)).toBe(true);
    expect(withinRateLimit("a", opts)).toBe(true);
    expect(withinRateLimit("a", opts)).toBe(false);
  });

  it("keeps refusing for the rest of the window rather than letting one through per tick", () => {
    // The attempt is counted even when refused, deliberately. Otherwise a caller hammering the
    // endpoint gets one request through every time the window slides by a millisecond.
    let clock = 0;
    const opts = options(() => clock);
    for (let i = 0; i < 3; i += 1) withinRateLimit("a", opts);

    clock = 500;
    expect(withinRateLimit("a", opts)).toBe(false);
    clock = 900;
    expect(withinRateLimit("a", opts)).toBe(false);
  });

  it("forgets attempts once the window has passed", () => {
    let clock = 0;
    const opts = options(() => clock);
    for (let i = 0; i < 4; i += 1) withinRateLimit("a", opts);

    clock = 1_001;
    expect(withinRateLimit("a", opts)).toBe(true);
  });

  it("counts each key separately, so one caller cannot lock out another", () => {
    // The failure this rules out is a shared bucket: one busy address would then refuse
    // everyone else, which is worse than not limiting at all.
    const clock = 0;
    const opts = options(() => clock);
    for (let i = 0; i < 5; i += 1) withinRateLimit("busy", opts);

    expect(withinRateLimit("quiet", opts)).toBe(true);
  });
});

describe("requestKey", () => {
  const withHeader = (value: string | null): Request =>
    new Request("https://example.test/api/high-scores", {
      headers: value === null ? {} : { "x-forwarded-for": value },
    });

  it("takes the FIRST entry of x-forwarded-for", () => {
    // The first is the client; later entries are proxies. Taking the last would let a caller
    // append a value and choose their own bucket, which is the same as having no limiter.
    expect(
      requestKey(withHeader("203.0.113.7, 70.41.3.18, 150.172.238.178")),
    ).toBe("203.0.113.7");
  });

  it("trims whitespace, because the header is comma-and-space separated", () => {
    expect(requestKey(withHeader("  203.0.113.7 , 70.41.3.18"))).toBe(
      "203.0.113.7",
    );
  });

  it("falls back to a SHARED bucket when the header is absent", () => {
    // Shared, not unique-per-request. A unique fallback would mean no limit at all whenever the
    // header is missing; sharing limits more aggressively, which is the right way to be wrong.
    expect(requestKey(withHeader(null))).toBe("unknown");
    expect(requestKey(withHeader(""))).toBe("unknown");
  });
});
