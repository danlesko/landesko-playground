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
  id: z.string().uuid(),
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
 * What the catches below log in place of a parse failure.
 *
 * A `ZodError` cannot be given to `console.error` at all. Measured on this
 * project's Node 24.12.0: `console.error("…", zodError)` raises
 * `TypeError: Cannot read properties of undefined (reading 'value')` from
 * `formatProperty` in `node:internal/util/inspect`, because zod defines `stack`
 * as an own *accessor* and the inspector reads a descriptor it has already
 * consumed. That `TypeError` would replace the generic error the catch means to
 * throw, so a drifted column would reach the reader as an inspector crash with
 * nothing logged — the opposite of what sharing the catch is for.
 *
 * Reducing the error also pins what is allowed into the log, which a comment on
 * its own could not. Only `code` and `path` are copied, plus `received` for
 * `invalid_type`, where zod sets it to a `ZodParsedType` name and never to the
 * value. That matters because `ZodError.message` serialises the issues array
 * whole, and a literal or an enum issue *does* carry the offending value — on
 * `received`, which is not copied for those codes. So growing this schema in
 * either direction cannot start leaking a row.
 *
 * One case is not covered by construction: a custom refinement chooses its own
 * `path`, which `makeIssue` appends verbatim (zod 3.24.2,
 * `helpers/parseUtil.js`), so `ctx.addIssue({ path: [someValue] })` would put a
 * value somewhere this function copies. Nothing here does that, and a refinement
 * that did would be the thing to fix — but the guarantee below is about the
 * declared fields, not about any issue zod can be asked to produce.
 *
 * Anything that is not a `ZodError` passes through untouched, so a driver error
 * is still logged as itself, with its stack. The only two things thrown inside
 * these `try` blocks are the driver and `parse`, and driver errors carry a
 * normal `stack` value and inspect fine.
 */
function loggable(error: unknown): unknown {
  if (!(error instanceof z.ZodError)) return error;
  return {
    name: error.name,
    issues: error.issues.map((issue) => ({
      code: issue.code,
      path: issue.path,
      ...(issue.code === "invalid_type" ? { received: issue.received } : {}),
    })),
  };
}

/** Rows per page. Exported because the list skeleton renders this many
 *  placeholders and drifting the two apart is a layout shift. */
export const BLOG_PAGE_SIZE = 10;

/**
 * `COUNT(*)` comes back as a Postgres `bigint`, which the driver hands over as a
 * *string* rather than a number — 8 bytes does not fit a JS number, so it refuses
 * to guess. `z.coerce` rather than `Number()` so a driver that ever returned
 * something unparseable fails here with the other parse failures instead of
 * silently producing `NaN` and, through the `Math.ceil` below, a page count of
 * `NaN`.
 */
const CountRowSchema = z.object({
  total: z.coerce.number().int().nonnegative(),
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
  const offset = (page - 1) * BLOG_PAGE_SIZE;

  try {
    // Separate tagged templates rather than an interpolated predicate, so each
    // query text stays a literal the driver parameterises. The page size and
    // offset are interpolated *values*, so they arrive as bound parameters.
    const blogs = signedIn
      ? await sql`SELECT * FROM blogs ORDER BY blogs.date DESC, blogs.id DESC LIMIT ${BLOG_PAGE_SIZE} OFFSET ${offset}`
      : await sql`SELECT * FROM blogs WHERE blogs.private != TRUE ORDER BY blogs.date DESC, blogs.id DESC LIMIT ${BLOG_PAGE_SIZE} OFFSET ${offset}`;

    // A second query, which is the cost #42 predicted: "any real fix adds a
    // second query shape". It has to carry the same privacy predicate as the
    // read above, or an anonymous reader is offered pages that are empty for
    // them.
    const counted = signedIn
      ? await sql`SELECT COUNT(*) AS total FROM blogs`
      : await sql`SELECT COUNT(*) AS total FROM blogs WHERE blogs.private != TRUE`;

    // Inside the existing `try` on purpose: a failed parse takes the same route
    // as a failed query — logged server-side, reported to the reader as the
    // generic message. What reaches the log is the reduction in `loggable`, not
    // the `ZodError`; see the note there for why that is not optional.
    const { total } = CountRowSchema.parse(counted.rows[0]);

    return {
      blogs: z.array(BlogRowSchema).parse(blogs.rows),
      total,
      // Floored at 1 so an empty blog still has a page 1 to be on, rather than
      // "page 1 of 0".
      totalPages: Math.max(1, Math.ceil(total / BLOG_PAGE_SIZE)),
    };
  } catch (error) {
    console.error("Failed to fetch blogs:", loggable(error));
    throw new Error("Failed to fetch blogs.");
  }
}

export async function getBlog(session: Session | null, id: string) {
  noStore();
  // Same predicate as fetchRecentBlogs; see the note there.
  try {
    // The anonymous query is also empty when the post exists but is private, so
    // an anonymous request for a private post is indistinguishable from a
    // missing one.
    const blog = session?.user
      ? await sql`SELECT * FROM blogs WHERE id=${id}`
      : await sql`SELECT * FROM blogs WHERE id=${id} AND private != TRUE`;
    // `.optional()`, because no row is the ordinary answer here — a missing post
    // and a private one both land on it — so `undefined` has to pass while a row
    // of the wrong shape still fails. See the note in fetchRecentBlogs.
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
