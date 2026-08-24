import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { formatBlogDateRelative } from "@/lib/blogDate";

/**
 * The buckets and, mostly, their edges.
 *
 * `formatBlogDateRelative` takes `now` as an argument, so none of this fakes a
 * clock -- every case below is two literal instants. That is the reason the
 * function has that signature: the behaviour *is* the boundaries, and a suite
 * that had to advance a fake timer to reach them would test far fewer of them.
 *
 * Sibling of ./date-timezone.test.ts rather than part of it. That file is about
 * one thing -- whether a rendered date survives a change of `TZ` -- and answers
 * it by spawning child processes under two zones. An elapsed duration has no
 * zone at all, so nothing here needs that machinery.
 */

// An arbitrary fixed instant to measure back from. Nothing depends on which one
// it is, since only the difference is used, and it is a `timestamptz` in the DB.
const NOW = Date.parse("2026-08-24T18:00:00.000Z");

const ago = (ms: number) => new Date(NOW - ms);

// Enough for the one structural assertion below: this file has no string or
// regex literal containing a comment opener, so there is nothing for a real
// lexer to get right that this gets wrong.
const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe("formatBlogDateRelative", () => {
  it("says 'now' at zero rather than '0 seconds ago'", () => {
    // The reason the sub-day formatter is `numeric: "auto"`. Worth being exact
    // about what the alternative is: `always` gives "0 seconds ago" here, not
    // "in 0 seconds", because negating a floored 0 yields negative zero and
    // `Intl` reads the sign of a zero. So this is a readability call, not a
    // correctness one -- both renderings are true.
    expect(formatBlogDateRelative(ago(0), NOW)).toBe("now");
  });

  it.each([
    { label: "mid-seconds", elapsed: 30 * SECOND, expected: "30 seconds ago" },
    { label: "mid-minutes", elapsed: 5 * MINUTE, expected: "5 minutes ago" },
    { label: "mid-hours", elapsed: 5 * HOUR, expected: "5 hours ago" },
    { label: "mid-days", elapsed: 3 * DAY, expected: "3 days ago" },
  ])("picks the $label unit", ({ elapsed, expected }) => {
    expect(formatBlogDateRelative(ago(elapsed), NOW)).toBe(expected);
  });

  it.each([
    // Each pair straddles one bucket edge by a millisecond, which is the only
    // way to show the comparison is `<` on the right quantity. A single-sided
    // case passes just as well with the boundary off by an entire unit.
    { at: MINUTE - 1, expected: "59 seconds ago" },
    { at: MINUTE, expected: "1 minute ago" },
    { at: HOUR - 1, expected: "59 minutes ago" },
    { at: HOUR, expected: "1 hour ago" },
    { at: DAY - 1, expected: "23 hours ago" },
    { at: DAY, expected: "1 day ago" },
  ])("renders $at ms as $expected", ({ at, expected }) => {
    expect(formatBlogDateRelative(ago(at), NOW)).toBe(expected);
  });

  it("says '1 day ago', never 'yesterday'", () => {
    // Not a style preference. This function measures elapsed milliseconds, and
    // "yesterday" is a claim about calendar days in some zone: a post 25 hours
    // old, read at 00:30, was two calendar days back. src/lib/blogDate.ts exists
    // because that exact distinction was already got wrong once, so the day
    // bucket is pinned to the wording that is true regardless of the zone.
    for (const elapsed of [DAY, DAY + HOUR, 2 * DAY - 1]) {
      expect(formatBlogDateRelative(ago(elapsed), NOW)).not.toContain(
        "yesterday",
      );
    }
    expect(formatBlogDateRelative(ago(DAY + HOUR), NOW)).toBe("1 day ago");
  });

  it("floors rather than rounds, so it never overstates the age", () => {
    // At 119 minutes, rounding would say "2 hours ago" for something that
    // happened one hour and fifty-nine minutes ago.
    expect(formatBlogDateRelative(ago(119 * MINUTE), NOW)).toBe("1 hour ago");
    expect(formatBlogDateRelative(ago(59 * SECOND), NOW)).toBe(
      "59 seconds ago",
    );
  });

  it("hands back to the absolute date at a week, not a day either side", () => {
    // null is the signal to print the date instead, so these two cases are the
    // difference between a card reading "6 days ago" and reading a full date.
    expect(formatBlogDateRelative(ago(7 * DAY - 1), NOW)).toBe("6 days ago");
    expect(formatBlogDateRelative(ago(7 * DAY), NOW)).toBeNull();
    expect(formatBlogDateRelative(ago(400 * DAY), NOW)).toBeNull();
  });

  it("hands back to the absolute date for an instant in the future", () => {
    // Reachable from real data rather than defensive: `blogs.date` is writable,
    // and a post dated ahead would otherwise format as "in 3 days" -- which the
    // caller would render as a post's age.
    expect(formatBlogDateRelative(ago(-1), NOW)).toBeNull();
    expect(formatBlogDateRelative(ago(-3 * DAY), NOW)).toBeNull();
  });

  it("is not called during a render at the one call site", () => {
    // Structural, and the reason is worth being explicit about: this assertion
    // is the ONLY thing in CI that can see the call site at all. Vitest runs
    // under `environment: "node"` with no DOM, so the effect that supplies `now`
    // cannot be mounted here; and `/blog` needs a database that CI does not
    // have, so the e2e suite skips both blog routes. It is the same gap that
    // makes this component's delete handler untestable except as the extracted
    // `attemptDelete`.
    //
    // What it pins is the property the whole design rests on. `now` has to start
    // null and be filled in from an effect: `useState(Date.now())` runs during
    // render, which puts the server's clock and the browser's clock either side
    // of a bucket edge (a React #418 hydration mismatch) and bakes a relative
    // string into any cached HTML. That regression is invisible -- the page
    // renders, the date looks right, and it is wrong only near a boundary or
    // once a cache entry ages.
    //
    // Verified by hand in a real browser instead, with the client clock pinned
    // to several offsets from a post's own instant: 30s, 3h and 2d each rendered
    // the matching relative string, 9d fell back to the absolute date, and no
    // run produced a hydration error. That cannot run in CI, hence this.
    const source = readFileSync("src/components/MyBlogBodyAbbr.tsx", "utf8");

    expect(source).toContain("formatBlogDateRelative");
    expect(source).toMatch(
      /useEffect\(\(\) => \{\s*setNow\(Date\.now\(\)\);\s*\}, \[\]\);/,
    );
    // Exactly one clock read in the whole file, so the match above accounts for
    // it. Counted over the code with comments removed, because the comment at
    // that call site explains the hazard by naming `Date.now()` -- over the raw
    // text this counts two and fails while the code is correct, which is how it
    // was first written.
    const code = stripComments(source);
    expect(code.match(/Date\.now\(\)/g)).toHaveLength(1);

    // And no clock read spelled some other way, which is the mutation the count
    // above misses: `new Date().getTime()` during render satisfies every
    // assertion so far and reintroduces the whole problem. A denylist cannot be
    // exhaustive -- `performance.timeOrigin`, an imported helper, a `Date`
    // subclass -- so this covers the two spellings someone would plausibly
    // reach for rather than pretending to close the category.
    expect(code).not.toMatch(/new Date\(\s*\)/);
    expect(code).not.toContain("performance.now(");
    // And the initial value is null rather than a clock read, which is what
    // makes the server's markup and the first client render the same string.
    expect(source).toContain("useState<number | null>(null)");
  });

  it("is unaffected by the ambient time zone", () => {
    // The counterpart to ./date-timezone.test.ts, asserted here rather than
    // assumed: a duration is the same number of milliseconds everywhere, so
    // unlike the absolute formats this needs no pinned zone. If a future edit
    // reaches for a calendar unit, it will need one, and this is where that
    // shows up.
    const date = ago(3 * DAY);
    const original = process.env.TZ;
    try {
      const under = (tz: string) => {
        process.env.TZ = tz;
        return formatBlogDateRelative(date, NOW);
      };
      expect(under("UTC")).toBe("3 days ago");
      expect(under("Asia/Tokyo")).toBe("3 days ago");
      expect(under("America/Denver")).toBe("3 days ago");
    } finally {
      process.env.TZ = original;
    }
  });
});
