/**
 * How a blog post's date is rendered, in one place because two call sites need
 * to agree and because src/test/date-timezone.test.ts asserts against these
 * exact objects. Copies of them in the test would keep passing if a `timeZone`
 * were dropped from a component, which is the one thing the test exists to
 * catch.
 */

/** The zone the posts are written in, and the only zone their dates mean. */
export const BLOG_TIME_ZONE = "America/Denver";

export const BLOG_DATE_FORMAT: Intl.DateTimeFormatOptions = {
  // `blogs.date` is `timestamptz`, so the value is an instant and an instant is
  // not a day until a zone says which. Left out, this formats in whatever zone
  // the process is in -- UTC on Vercel, Denver locally -- so a post written in
  // the evening printed the following day in production and the correct day in
  // development.
  timeZone: BLOG_TIME_ZONE,
  weekday: "long",
  year: "numeric",
  month: "long",
  day: "numeric",
};

/** As above, plus a time of day. Used by the list, which is a client component:
 * without the pinned zone the server renders in its own zone and the browser
 * re-renders in the visitor's, which is a React #418 hydration text mismatch
 * for every visitor outside the server's zone. */
export const BLOG_DATE_TIME_FORMAT: Intl.DateTimeFormatOptions = {
  ...BLOG_DATE_FORMAT,
  hour: "2-digit",
  minute: "2-digit",
};

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * Where relative stops being the more useful rendering. "6 weeks ago" tells a
 * reader less than the date does, and the further back it goes the worse the
 * trade gets, so past a week this returns null and the caller prints the date.
 */
const RELATIVE_LIMIT = 7 * DAY;

// Two formatters because `numeric` has to differ by unit, and it only differs
// at two values: 0 and 1. `auto` turns 0 seconds into "now" rather than "0
// seconds ago" -- and note it is "0 seconds ago", not "in 0 seconds", because
// the negation below produces negative zero and `Intl` reads the sign of a
// zero. The minute and hour buckets can never hold 0 (each is entered only
// once a whole unit has elapsed), so the choice is invisible there.
const RELATIVE_SUB_DAY = new Intl.RelativeTimeFormat("en-US", {
  numeric: "auto",
});
// Days deliberately do NOT get `auto`, which would render 1 as "yesterday".
// This function measures elapsed time, and "yesterday" is a claim about
// calendar days -- a post from 25 hours ago read at 00:30 was two calendar days
// back, and this file exists because that distinction was already got wrong
// once. "1 day ago" is true however the zones fall.
const RELATIVE_DAYS = new Intl.RelativeTimeFormat("en-US", {
  numeric: "always",
});

/**
 * How long ago a post was written, or null when the date itself is the better
 * answer -- older than RELATIVE_LIMIT, or dated in the future.
 *
 * `now` is a parameter rather than a `Date.now()` in here so that this is a pure
 * function of two instants: every bucket and boundary below is then testable
 * without faking a clock, which matters because the boundaries are the whole
 * behaviour. The caller owns the decision of *when* now is, and that decision
 * is not incidental -- see the note at the call site about why it cannot be
 * taken during a server render.
 *
 * No zone is involved, unlike everything above: an elapsed duration is the same
 * number of milliseconds in every zone. That is also the reason the day bucket
 * says "1 day ago" and not "yesterday".
 */
export function formatBlogDateRelative(date: Date, now: number): string | null {
  const elapsed = now - date.getTime();
  if (elapsed < 0 || elapsed >= RELATIVE_LIMIT) return null;

  // Largest unit that fits, floored, so a value never rounds up into a duration
  // that has not happened yet: at 119 minutes this says "1 hour ago".
  if (elapsed < MINUTE) {
    return RELATIVE_SUB_DAY.format(-Math.floor(elapsed / SECOND), "second");
  }
  if (elapsed < HOUR) {
    return RELATIVE_SUB_DAY.format(-Math.floor(elapsed / MINUTE), "minute");
  }
  if (elapsed < DAY) {
    return RELATIVE_SUB_DAY.format(-Math.floor(elapsed / HOUR), "hour");
  }
  return RELATIVE_DAYS.format(-Math.floor(elapsed / DAY), "day");
}
