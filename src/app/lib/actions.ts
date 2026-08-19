"use server";
import { sql } from "@vercel/postgres";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { deleteBlog } from "@/src/app/lib/data";

const NewBlogSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(100),
  content: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  privateBlog: z.union([
    z.string().transform((data) => data === "on"),
    z.literal(null).transform(() => false),
  ]),
});

const CreateBlog = NewBlogSchema.omit({ id: true, date: true });

const DeleteBlogSchema = z.object({ id: z.string().uuid() });

// Have to use the variable name "privateBlog" because "private" is a reserved word
export async function createBlog(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  const { title, content, privateBlog } = CreateBlog.parse({
    title: formData.get("title"),
    content: formData.get("content"),
    privateBlog: formData.get("private"),
  });

  // Developer lives in Denver, CO
  const date = new Date().toLocaleString("en-US", {
    timeZone: "America/Denver",
    hourCycle: "h23",
  });
  await sql`
    INSERT INTO blogs (title, content, date, private)
    VALUES (${title}, ${content}, ${date}, ${privateBlog})
    `;

  revalidatePath("/blog");
  redirect("/blog");
}

export async function deleteBlogPost(id: string) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  const { id: blogId } = DeleteBlogSchema.parse({ id });

  await deleteBlog(blogId);

  revalidatePath("/blog");
  // redirect() signals by throwing, so it must stay outside of any try/catch.
  redirect("/blog");
}
