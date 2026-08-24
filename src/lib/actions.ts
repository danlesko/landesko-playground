"use server";
import { sql } from "@vercel/postgres";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { deleteBlog } from "@/lib/data";

const NewBlogSchema = z.object({
  id: z.string().uuid(),
  // Messages are shown verbatim to the reader, so they say what to do rather
  // than describing the constraint. A missing field arrives as null, which
  // trips invalid_type before min ever runs.
  title: z
    .string({ invalid_type_error: "Title is required" })
    .min(1, "Title is required")
    .max(100, "Title must be 100 characters or fewer"),
  content: z
    .string({ invalid_type_error: "Content is required" })
    .min(1, "Content is required"),
  privateBlog: z.union([
    z.string().transform((data) => data === "on"),
    z.literal(null).transform(() => false),
  ]),
});

// `date` is not a field here. The database supplies it with `NOW()`, so there is
// no submitted value to validate. It used to be declared above as a
// `/^\d{4}-\d{2}-\d{2}$/` string and then omitted here, which validated nothing
// and described a format the column never held.
const CreateBlog = NewBlogSchema.omit({ id: true });

const DeleteBlogSchema = z.object({ id: z.string().uuid() });

// Derived from the schema rather than written out, so adding a field to
// CreateBlog cannot leave this type quietly behind.
export type CreateBlogState = {
  fieldErrors?: z.inferFlattenedErrors<typeof CreateBlog>["fieldErrors"];
  // React resets an uncontrolled form on every action submission -- react-dom
  // 19.1's startHostTransition calls requestFormReset before running the
  // action, with no opt-out -- so a rejected submission has to carry the text
  // back or the reader loses what they wrote along with being told it is wrong.
  values?: { title: string; content: string; privateBlog: boolean };
};

const asText = (value: FormDataEntryValue | null): string =>
  typeof value === "string" ? value : "";

// Have to use the variable name "privateBlog" because "private" is a reserved word
export async function createBlog(
  _prevState: CreateBlogState,
  formData: FormData,
): Promise<CreateBlogState> {
  const session = await auth();
  // Still a throw, not a returned error: an anonymous caller has nothing to
  // correct in the form, and surfacing it as field text would imply they do.
  if (!session?.user) throw new Error("Unauthorized");

  const parsed = CreateBlog.safeParse({
    title: formData.get("title"),
    content: formData.get("content"),
    privateBlog: formData.get("private"),
  });
  if (!parsed.success) {
    return {
      fieldErrors: parsed.error.flatten().fieldErrors,
      values: {
        title: asText(formData.get("title")),
        content: asText(formData.get("content")),
        privateBlog: formData.get("private") === "on",
      },
    };
  }
  const { title, content, privateBlog } = parsed.data;

  // `NOW()` rather than a value built here. The column is `timestamptz`, so it
  // stores an instant, and the only zone-free way to name "now" is to let the
  // database do it. What this replaced formatted the current time as Denver
  // wall-clock text (`"8/21/2026, 14:03:22"`) and inserted that into what was
  // then a naive column, which recorded a reading with no record of the zone it
  // was read in — so the stored value was six or seven hours from the instant it
  // meant, and nothing said which.
  await sql`
    INSERT INTO blogs (title, content, date, private)
    VALUES (${title}, ${content}, NOW(), ${privateBlog})
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
