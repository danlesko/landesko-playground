import { cache } from "react";
import { getBlog } from "@/lib/data";
import BackLink from "@/components/ui/BackLink";
import PageHeading from "@/components/ui/PageHeading";
import Card from "@/components/ui/Card";
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
  const session = await getSession();
  const params = await props.params;
  const { id } = params;
  const blog = await loadBlog(session, id);

  // Unknown id, or a private post requested without a session. A malformed id
  // already throws this from getBlog when Postgres rejects the uuid cast, so
  // raising the same error keeps all three cases on the same error boundary
  // instead of letting this one fall through to a TypeError below.
  if (!blog) {
    throw new Error("Failed to fetch blog.");
  }

  return (
    <div className="inline-block" style={{ width: "100%" }}>
      <PageHeading>{blog.title}</PageHeading>
      <BackLink />
      <Card>
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
      </Card>
    </div>
  );
}
