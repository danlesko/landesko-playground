import { sql } from "@vercel/postgres";
import { User, Blog } from "./definitions";
import { unstable_noStore as noStore } from "next/cache";

export async function getUser(email: string) {
  noStore();
  try {
    const user = await sql`SELECT * FROM users WHERE email=${email}`;
    return user.rows[0] as User;
  } catch (error) {
    console.error("Failed to fetch user:", error);
    throw new Error("Failed to fetch user.");
  }
}

export async function fetchRecentBlogs() {
  noStore();
  try {
    const blogs =
      await sql`SELECT * FROM blogs ORDER BY blogs.date DESC LIMIT 10`;
    return blogs.rows as Blog[];
  } catch (error) {
    console.error("Failed to fetch blogs:", error);
    throw new Error("Failed to fetch blogs.");
  }
}

export async function getBlog(id: string) {
  noStore();
  try {
    const blog = await sql`SELECT * FROM blogs WHERE id=${id}`;
    return blog.rows[0] as Blog;
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
