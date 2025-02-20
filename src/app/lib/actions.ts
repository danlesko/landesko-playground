"use server";
import { sql } from "@vercel/postgres";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

const NewBlogSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(100),
  content: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const CreateBlog = NewBlogSchema.omit({ id: true, date: true });

export async function createBlog(formData: FormData) {
  const { title, content } = CreateBlog.parse({
    title: formData.get("title"),
    content: formData.get("content"),
  });

  // Developer lives in Denver, CO
  const date = new Date().toLocaleString("en-US", {
    timeZone: "America/Denver",
    hourCycle: "h23",
  });
  await sql`
    INSERT INTO blogs (title, content, date)
    VALUES (${title}, ${content}, ${date})
    `;

  revalidatePath("/blog");
  redirect("/blog");
}
