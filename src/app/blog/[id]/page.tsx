import { notFound } from "next/navigation";
import { BLOG_DATE_FORMAT } from "@/lib/blogDate";
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

  // Unreachable at runtime, and kept deliberately. ./layout.tsx has already
  // served the 404 by the time this renders, and it shares this exact memo, so
  // `blog` cannot be undefined here -- a throw from this line would also be too
  // late to set a status. What it does is narrow `blog` for the JSX below, which
  // nothing else can do, and keep the page correct on its own terms if that
  // layout is ever moved or removed. Read it as a type guard plus a seatbelt,
  // not as a branch that runs.
  if (!blog) {
    notFound();
  }

  return (
    <div>
      <PageHeading>{blog.title}</PageHeading>
      <BackLink />
      <div
        key={blog.title}
        className="mt-4 p-4 rounded-lg lg:min-w-[600px] lg:w-1/2 min-h-32 border border-border overflow-auto"
      >
        <div className="flow-root">
          <p className="text-sm font-medium text-muted">
            {blog.date.toLocaleDateString("en-US", BLOG_DATE_FORMAT)}
          </p>
        </div>
        <div className="clear-both" />
        <p className="whitespace-pre-line">{blog.content}</p>
      </div>
    </div>
  );
}
