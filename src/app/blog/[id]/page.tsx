import { cache } from "react";
import { getBlog } from "@/lib/data";
import { notFound } from "next/navigation";
import BackLink from "@/components/ui/BackLink";
import PageHeading from "@/components/ui/PageHeading";
import { auth } from "@/auth";

// `generateMetadata` and the component below render in the same request and both
// need the same session and the same post, which was four sequential awaits.
//
// Caching `auth` is what makes caching `getBlog` work at all: `cache` keys on
// argument identity, so two `loadBlog(session, id)` calls only collapse if both
// receive the very same session object. Uncached, `auth()` returns a fresh one
// each time and every lookup would miss.
const getSession = cache(auth);
const loadBlog = cache(getBlog);

export async function generateMetadata(props: {
  params: Promise<{ id: string }>;
}) {
  const params = await props.params;
  const { id } = params;
  const session = await getSession();
  const blog = await loadBlog(session, id);
  // Runs alongside the page render rather than instead of it, so it still has
  // to name the unavailable case; the page below is what serves the 404. The
  // shared `loadBlog` memo does not remove the need for the fallback.
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

  // Unknown id and a private post requested without a session both arrive here
  // as undefined, so both render the same 404 and stay indistinguishable.
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
