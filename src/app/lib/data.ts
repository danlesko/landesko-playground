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
