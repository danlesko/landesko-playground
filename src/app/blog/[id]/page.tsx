import { getBlog } from "@/lib/data";
import Link from "next/link";
import { ArrowLeft } from "@phosphor-icons/react/dist/ssr";
import { auth } from "@/auth";

export async function generateMetadata(props: {
  params: Promise<{ id: string }>;
}) {
  const params = await props.params;
  const { id } = params;
  const session = await auth();
  const blog = await getBlog(session, id);
  // This runs alongside the page render rather than instead of it, so when the
  // post is unavailable it only has to keep the literal string "undefined" out
  // of the tab title. The page below is what decides to show the error page.
  const title = blog?.title ?? "Error Fetching Blog";
  const description = "One of many blog posts.";

  return {
    title,
    description,
  };
}

export default async function Blog(props: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const params = await props.params;
  const { id } = params;
  const blog = await getBlog(session, id);

  // Unknown id, or a private post requested without a session. A malformed id
  // already throws this from getBlog when Postgres rejects the uuid cast, so
  // raising the same error keeps all three cases on the same error boundary
  // instead of letting this one fall through to a TypeError below.
  if (!blog) {
    throw new Error("Failed to fetch blog.");
  }

  return (
    <div className="inline-block" style={{ width: "100%" }}>
      <h2 className="text-4xl font-bold">{blog.title}</h2>
      <Link
        className="text-xl text-accent hover:text-accent-hover visited:text-accent-visited font-bold"
        href={`/blog`}
      >
        <ArrowLeft size={24} className="inline-block -translate-y-1" /> All Blog
        Posts
      </Link>
      <div
        key={blog.title}
        className="mt-4 p-4 shadow-md rounded-lg md:w-full lg:min-w-[600px] lg:w-1/2 min-h-32 border border-border overflow-auto"
      >
        <div className="flow-root">
          <h4 className="text-sm font-medium text-muted">
            {new Date(blog.date).toLocaleDateString("en-US", {
              weekday: "long",
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </h4>
        </div>
        <div className="clear-both" />
        <p className="whitespace-pre-line">{blog.content}</p>
      </div>
    </div>
  );
}
