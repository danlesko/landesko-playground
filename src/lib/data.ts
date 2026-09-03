import { sql } from "@vercel/postgres";
import { z } from "zod";
import { Blog } from "./definitions";
import { unstable_noStore as noStore } from "next/cache";
import { Session } from "next-auth";

/**
 * The `Blog` type, as something that runs. Both reads used to end in a cast,
 * which asserts the shape without ever looking, so a column that changed type
 * or went away reached the render sites unnoticed and showed up as an empty
 * heading or an "Invalid Date".
 *
 * Annotated `z.ZodType<Blog>` rather than left to inference, and `Blog` is not
 * re-derived from it with `z.infer`: the schema stays here because `data.ts` is
 * server-only, while `definitions.ts` is imported by a client component, and a
 * runtime `const` there would pull zod into the browser bundle. The annotation
 * is what stops the two drifting — drop a field from this object, or give one
 * the wrong type, and it stops being assignable to `Blog`. Only that direction:
 * an *extra* field here still compiles, because excess properties are not
 * checked through a type parameter. Harmless, since the strip below removes it
 * at runtime anyway.
 *
 * Unknown keys are stripped, which is zod's default and is wanted here rather
 * than merely tolerated. `SELECT *` means a column added to the table would
 * otherwise be handed to `BlogBodyAbbr`, a client component, and so be
 * serialised into the page for anyone to read. `.strict()` would instead fail
 * every read on an additive migration, which is too much.
 */
const BlogRowSchema: z.ZodType<Blog> = z.object({
  // `z.guid()`, matching DeleteBlogSchema in actions.ts -- see the note there for
  // why v4's stricter `z.uuid()` is not used on either side.
  id: z.guid(),
  title: z.string(),
  content: z.string(),
  // Rejects more than a string date. Postgres `timestamp` also admits
  // `infinity`, which the driver parses to the *number* `Infinity` — legal in
  // the column, unreachable through the create action, and previously rendered
  // as "Invalid Date". It now fails here instead.
  //
  // It also rejects `null`, which is what the driver returns for a timestamp it
  // cannot read: its parser only accepts year-first text, so a server whose
  // `DateStyle` is not the default ISO (`SQL, MDY` renders `01/31/2026 …`) hands
  // back `null` for every row. Nothing here can cause that, and the live server
  // is on the default — but it is configuration drift rather than schema drift,
  // so the parser is not only a guard against migrations. Under the old cast
  // that same server produced a page of "Invalid Date"; now it fails loudly.
  date: z.date(),
  private: z.boolean(),
});

/**
 * What the catches below log in place of a parse failure: an allowlisted
 * projection of the `ZodError` rather than the error itself.
 *
 * The original reason no longer applies, and saying so is the point of this
 * paragraph. Under zod 3 a `ZodError` could not be given to `console.error` at
 * all: on this project's Node 24.12.0 it raised `TypeError: Cannot read
 * properties of undefined (reading 'value')` from `formatProperty` in
 * `node:internal/util/inspect`, because zod defined `stack` as an own *accessor*
 * and the inspector read a descriptor it had already consumed. That `TypeError`
 * replaced the generic error the catch means to throw, so a drifted column
 * reached the reader as an inspector crash with nothing logged. Measured again
 * under zod 4.5.4: `inspect(error)` and `console.error("…", error)` both
 * succeed, even though `stack` is still an own accessor. The crash is gone.
 *
 * The other reason survives, and it is now the only one: this pins what is
 * allowed into the log. Only `code` and `path` are copied, plus `expected` for
 * `invalid_type`, which is a type name (`"string"`, `"date"`) and never a value.
 * Deliberately NOT copied: `message`, which zod composes from the issue and
 * which for some codes quotes what it saw.
 *
 * It would be wrong to conclude from v4 that nothing needs allowlisting. v4 is
 * better here than v3 -- a literal or enum issue used to carry the offending
 * value on `received`, and in v4 those carry `values`, the list of *accepted*
 * ones -- but the issue model still declares an optional `input`, `reportInput`
 * puts the offending value on finalized issues, and a custom issue can carry
 * anything through its `params` or its `path`. Nothing here enables any of that.
 * An allowlist keeps it that way whatever a later refinement does, which a
 * comment could not.
 *
 * One case remains outside the guarantee by construction: a custom refinement
 * chooses its own `path`, which zod appends verbatim, so
 * `ctx.addIssue({ path: [someValue] })` would put a value somewhere this
 * function copies. Nothing does that, and a refinement that did would be the
 * thing to fix.
 *
 * Anything that is not a `ZodError` passes through untouched, so a driver error
 * is still logged as itself, with its stack. The only two things thrown inside
 * these `try` blocks are the driver and `parse`.
 *
 * `src/lib/data.test.ts` asserts the exact projection rather than only that the
 * post's content is absent from it. That matters: with the inspect crash gone,
 * every other assertion about this function passes if the reduction is deleted
 * and the raw error is logged, so the shape is what has to be pinned.
 */
function loggable(error: unknown): unknown {
  if (!(error instanceof z.ZodError)) return error;
  return {
    name: error.name,
    issues: error.issues.map((issue) => ({
      code: issue.code,
      path: issue.path,
      // `expected`, not v3's `received`, which v4 removed. Both are type names
      // rather than values; `expected` says what the column should have held,
      // which is the more useful half when a column's type drifts.
      ...(issue.code === "invalid_type" ? { expected: issue.expected } : {}),
    })),
  };
}

/** Rows per page. Exported because the list skeleton renders this many
 *  placeholders and drifting the two apart is a layout shift. */
export const BLOG_PAGE_SIZE = 10;

/**
 * `COUNT(*)` comes back as a Postgres `bigint`, which the driver hands over as a
 * *string* rather than a number — 8 bytes does not fit a JS number, so it refuses
 * to guess. Parsed rather than passed through `Number()` so an unparseable value
 * fails here with the other parse failures instead of silently producing `NaN`
 * and, through `Math.ceil`, a page count of `NaN`.
 *
 * `z.coerce.number()` alone was not enough, and the reason is the whole point of
 * the column being a bigint: a count above `Number.MAX_SAFE_INTEGER` coerces
 * *successfully* to an imprecise number, and `.int()` accepts it because the
 * rounded value is still an integer. So the one input the wider type exists for
 * would have been silently rounded. Checked explicitly instead. It is
 * unreachable for a blog and costs one comparison.
 */
const CountRowSchema = z.object({
  total: z.union([z.string(), z.number()]).transform((value, ctx) => {
    const total = Number(value);
    if (!Number.isSafeInteger(total) || total < 0) {
      ctx.addIssue({
        // The raw string rather than `z.ZodIssueCode.custom`, which v4
        // deprecates in favour of the literal codes.
        code: "custom",
        // No value in the message: `loggable` copies `path` and `code`, and for a
        // custom issue it copies neither `received` nor `message`, but a row must
        // not be one edit away from the log either way.
        message: "count is not a safe non-negative integer",
      });
      return z.NEVER;
    }
    return total;
  }),
});

/**
 * One page of posts, newest first, plus how many pages there are.
 *
 * `ORDER BY date DESC, id DESC` and not `date DESC` alone. `OFFSET` only means
 * anything against a *total* order: with ties on `date` the database may return
 * them in any order per query, so two posts sharing a timestamp could both
 * appear on page 1 and page 2, or neither. `id` is the tiebreak because it is the
 * primary key, so the pair is unique by construction and the order is total.
 *
 * That tiebreak is the substantive half of the cursor pagination #42 raises.
 * The other half does not survive numbered pages: a cursor cannot address "page
 * 5", which is what a page number *is*. So this is offset pagination with a
 * deterministic sort, and the residual weakness is inherent rather than
 * overlooked — publishing a post while someone reads page 2 shifts a row from
 * page 1 down into it. For a personal blog that is the right trade against
 * losing shareable page URLs.
 */
export async function fetchBlogPage(session: Session | null, page: number) {
  noStore();
  // `session?.user`, not `session`: `Session.user` is optional in @auth/core's
  // types, so a session object carrying no user would otherwise be read as
  // signed in here while actions.ts and the UI treat it as anonymous.
  const signedIn = Boolean(session?.user);

  try {
    // The count runs FIRST, and that ordering is load-bearing rather than
    // stylistic. `page` comes from a query string, so before this the offset was
    // whatever an unbounded page number multiplied out to -- `?page=900719925474099`
    // asked the database to skip 9e15 rows, which it answers by scanning. Knowing
    // the total first means the offset below is only ever computed for a page that
    // exists, so it is bounded by the table.
    //
    // It has to carry the same privacy predicate as the read, or an anonymous
    // reader is offered page links for posts they cannot see. Two separate tagged
    // templates rather than an interpolated predicate, so each query text stays a
    // literal the driver parameterises.
    const counted = signedIn
      ? await sql`SELECT COUNT(*) AS total FROM blogs`
      : await sql`SELECT COUNT(*) AS total FROM blogs WHERE blogs.private != TRUE`;

    // Inside the existing `try` on purpose: a failed parse takes the same route
    // as a failed query — logged server-side, reported to the reader as the
    // generic message. What reaches the log is the reduction in `loggable`, not
    // the `ZodError`; see the note there for why that is not optional.
    const { total } = CountRowSchema.parse(counted.rows[0]);

    // Floored at 1 so an empty blog still has a page 1 to be on, rather than
    // "page 1 of 0".
    const totalPages = Math.max(1, Math.ceil(total / BLOG_PAGE_SIZE));

    // Out of range, so there is nothing to read. Returning it rather than
    // throwing keeps the 404 decision in the component, where the router is: this
    // module is also called from tests that have no router.
    if (page > totalPages) return { blogs: [], total, totalPages, page };

    const offset = (page - 1) * BLOG_PAGE_SIZE;

    // The page size and offset are interpolated *values*, so they arrive as bound
    // parameters rather than as query text.
    //
    // `migrations/0004_blogs_date_id_index.sql` indexes `(date, id)` for this
    // ordering. Changing the sort columns or their order does not break anything,
    // it just silently stops the index applying -- so it wants a NEW migration,
    // not an edit to that one, which has already been run.
    const blogs = signedIn
      ? await sql`SELECT * FROM blogs ORDER BY blogs.date DESC, blogs.id DESC LIMIT ${BLOG_PAGE_SIZE} OFFSET ${offset}`
      : await sql`SELECT * FROM blogs WHERE blogs.private != TRUE ORDER BY blogs.date DESC, blogs.id DESC LIMIT ${BLOG_PAGE_SIZE} OFFSET ${offset}`;

    return {
      blogs: z.array(BlogRowSchema).parse(blogs.rows),
      total,
      totalPages,
      page,
    };
  } catch (error) {
    console.error("Failed to fetch blogs:", loggable(error));
    throw new Error("Failed to fetch blogs.");
  }
}

export async function getBlog(session: Session | null, id: string) {
  noStore();
  // Same predicate as fetchBlogPage; see the note there.
  try {
    // The anonymous query is also empty when the post exists but is private, so
    // an anonymous request for a private post is indistinguishable from a
    // missing one.
    const blog = session?.user
      ? await sql`SELECT * FROM blogs WHERE id=${id}`
      : await sql`SELECT * FROM blogs WHERE id=${id} AND private != TRUE`;
    // `.optional()`, because no row is the ordinary answer here — a missing post
    // and a private one both land on it — so `undefined` has to pass while a row
    // of the wrong shape still fails. See the note in fetchBlogPage.
    return BlogRowSchema.optional().parse(blog.rows[0]);
  } catch (error) {
    console.error("Failed to fetch blog:", loggable(error));
    throw new Error("Failed to fetch blog.");
  }
}

export async function deleteBlog(id: string) {
  noStore();
  try {
    await sql`DELETE FROM blogs WHERE id=${id}`;
  } catch (error) {
    console.error("Failed to delete blog:", error);
    throw new Error("Failed to delete blog.");
  }
}
