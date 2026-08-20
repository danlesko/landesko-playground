import { sql } from "@vercel/postgres";
import { Blog } from "./definitions";
import { unstable_noStore as noStore } from "next/cache";
import { Session } from "next-auth";

export async function fetchRecentBlogs(session: Session | null) {
  noStore();
  // `session?.user`, not `session`: `Session.user` is optional in @auth/core's
  // types, so a session object carrying no user would otherwise be read as
  // signed in here while actions.ts and the UI treat it as anonymous.
  if (session?.user) {
    try {
      const blogs =
        await sql`SELECT * FROM blogs ORDER BY blogs.date DESC LIMIT 10`;
      return blogs.rows as Blog[];
    } catch (error) {
      console.error("Failed to fetch blogs:", error);
      throw new Error("Failed to fetch blogs.");
    }
  } else {
    try {
      const blogs =
        await sql`SELECT * FROM blogs WHERE blogs.private != TRUE ORDER BY blogs.date DESC LIMIT 10`;
      return blogs.rows as Blog[];
    } catch (error) {
      console.error("Failed to fetch blogs:", error);
      throw new Error("Failed to fetch blogs.");
    }
  }
}

export async function getBlog(session: Session | null, id: string) {
  noStore();
  // Same predicate as fetchRecentBlogs; see the note there.
  if (session?.user) {
    try {
      const blog = await sql`SELECT * FROM blogs WHERE id=${id}`;
      return blog.rows[0] as Blog | undefined;
    } catch (error) {
      console.error("Failed to fetch blog:", error);
      throw new Error("Failed to fetch blog.");
    }
  } else {
    try {
      const blog =
        await sql`SELECT * FROM blogs WHERE id=${id} AND private != TRUE`;
      // Also empty when the post exists but is private, so an anonymous
      // request for a private post is indistinguishable from a missing one.
      return blog.rows[0] as Blog | undefined;
    } catch (error) {
      console.error("Failed to fetch blog:", error);
      throw new Error("Failed to fetch blog.");
    }
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
