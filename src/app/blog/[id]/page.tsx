import { notFound } from "next/navigation";
import BackLink from "@/components/ui/BackLink";
import PageHeading from "@/components/ui/PageHeading";
import { getSession, loadBlog } from "./loaders";

export async function generateMetadata(props: {
  params: Promise<{ id: string }>;
}) {
  const params = await props.params;
  const { id } = params;
  const session = await getSession();
  const blog = await loadBlog(session, id);
  // Runs alongside the render rather than instead of it, so it still has to
  // name the unavailable case; ./layout.tsx is what serves the 404. Throwing
  // `notFound()` from here would not set the status either -- metadata resolves
  // before the shell flushes, which makes it look like it should work, and it
  // measures 200. The shared `loadBlog` memo does not remove the need for this
  // fallback.
  const title = blog?.title ?? "Blog Post Not Found";
  const description = "One of many blog posts.";

  return {
    title,
    description,
  };
}

export default async function Blog(props: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  const params = await props.params;
  const { id } = params;
  const blog = await loadBlog(session, id);

  // ./layout.tsx has already served the 404 by the time this renders -- it is
  // what makes the status truthful, which a throw from here cannot do. This is
  // kept because it is the only thing that narrows `blog` for the JSX below,
  // and because a page that trusted an ancestor to have checked would break
  // silently if that layout were ever moved or removed.
  if (!blog) {
    notFound();
  }

  return (
    <div className="inline-block" style={{ width: "100%" }}>
      <PageHeading>{blog.title}</PageHeading>
      <BackLink />
      <div
        key={blog.title}
        className="mt-4 p-4 shadow-md rounded-lg lg:min-w-[600px] lg:w-1/2 min-h-32 border border-border overflow-auto"
      >
        <div className="flow-root">
          <p className="text-sm font-medium text-muted">
            {new Date(blog.date).toLocaleDateString("en-US", {
              weekday: "long",
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </p>
        </div>
        <div className="clear-both" />
        <p className="whitespace-pre-line">{blog.content}</p>
      </div>
    </div>
  );
}
