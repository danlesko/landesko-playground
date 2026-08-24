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
