/**
 * Turns a `?page=` value into a page number.
 *
 * Anything that is not a positive integer becomes page 1 rather than a 404. A
 * malformed page number is nearly always a typo or a stale link, and answering a
 * readable list is friendlier than answering "not found" — the reader still gets
 * the blog, at its start. What *does* 404 is a page number that is well-formed
 * but past the end, which is decided in the list itself because only the database
 * knows where the end is.
 *
 * `string[]` is in the signature because Next hands it over for a repeated
 * parameter (`?page=2&page=3`). That is ambiguous rather than wrong, so it takes
 * the same route as malformed input.
 */
export function parseBlogPageParam(raw: string | string[] | undefined): number {
  if (typeof raw !== "string") return 1;

  // `Number()` is deliberately not used: it accepts "1.5", " 2 ", "0x2", "1e3"
  // and "" (as 0), so every one of those would have to be rejected afterwards
  // anyway. Matching the shape first says exactly what is allowed.
  if (!/^[1-9][0-9]*$/.test(raw)) return 1;

  const page = Number(raw);

  // A page number past this is not a real request, and `OFFSET` would otherwise
  // grow without bound. Postgres takes a bigint offset, so nothing breaks at the
  // database, but a URL is not a reason to scan a table.
  return Number.isSafeInteger(page) ? page : 1;
}
