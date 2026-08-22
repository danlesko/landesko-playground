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
 * otherwise be handed to `MyBlogBodyAbbr`, a client component, and so be
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
  date: z.date(),
  private: z.boolean(),
});

export async function fetchRecentBlogs(session: Session | null) {
  noStore();
  // `session?.user`, not `session`: `Session.user` is optional in @auth/core's
  // types, so a session object carrying no user would otherwise be read as
  // signed in here while actions.ts and the UI treat it as anonymous.
  try {
    // Two separate tagged templates rather than an interpolated predicate, so
    // each query text stays a literal the driver parameterises.
    const blogs = session?.user
      ? await sql`SELECT * FROM blogs ORDER BY blogs.date DESC LIMIT 10`
      : await sql`SELECT * FROM blogs WHERE blogs.private != TRUE ORDER BY blogs.date DESC LIMIT 10`;
    // Inside the existing `try` on purpose: a failed parse takes the same route
    // as a failed query — logged server-side, reported to the reader as the
    // generic message. A `ZodError` carries the field path and the type names
    // only, never the offending value, so nothing from a private post reaches
    // the log.
    return z.array(BlogRowSchema).parse(blogs.rows);
  } catch (error) {
    console.error("Failed to fetch blogs:", error);
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
    console.error("Failed to fetch blog:", error);
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
