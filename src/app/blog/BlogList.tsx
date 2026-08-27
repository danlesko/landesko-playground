import { getSession } from "@/lib/session";
import PageHeading from "@/components/ui/PageHeading";
import TextLink from "@/components/ui/TextLink";
import BlogBodyAbbr from "@/components/BlogBodyAbbr";
import { deleteBlogPost } from "@/lib/actions";
import { notFound } from "next/navigation";
import { BLOG_PAGE_SIZE, fetchBlogPage } from "@/lib/data";
import { parseBlogPageParam } from "@/lib/blogPage";
import Pagination from "@/components/ui/Pagination";
import { cardClasses } from "@/components/ui/card";
import { contentColumnClasses } from "@/components/ui/layout";

// Reads BLOG_PAGE_SIZE rather than repeating it, so the skeleton cannot drift
// from the page it stands in for -- that drift is a layout shift.
export const BlogListSkeleton = () => (
  <>
    <PageHeading>Blog Posts</PageHeading>
    {Array.from({ length: BLOG_PAGE_SIZE }, (_, index) => (
      <div key={index} className={`${cardClasses} h-32 animate-pulse`}>
        <div className="h-6 bg-muted rounded w-3/4 mb-4"></div>
        <div className="h-4 bg-muted rounded w-full mb-2"></div>
        <div className="h-4 bg-muted rounded w-full mb-2"></div>
      </div>
    ))}
  </>
);

// Split out of ./page.tsx rather than left inline, because ./page.tsx is now a
// synchronous shell whose only job is to declare the Suspense boundary. This is
// the component that actually awaits, so it is also the one the tests can call.
export default async function BlogList({
  searchParams,
}: {
  searchParams: Promise<{ page?: string | string[] }>;
}) {
  // Awaited here and not in ./page.tsx on purpose. That file is a synchronous
  // shell whose only job is to declare the Suspense boundary; making it async to
  // read searchParams would suspend it *above* its own boundary, so the skeleton
  // would stop streaming and the reader would get nothing until the query landed.
  const { page: pageParam } = await searchParams;
  const page = parseBlogPageParam(pageParam);

  const session = await getSession();
  const { blogs, total, totalPages } = await fetchBlogPage(session, page);

  // A well-formed page number past the end names nothing, so it answers 404
  // rather than an empty list. `total > 0` keeps an empty blog on page 1 showing
  // its empty state instead of a 404 -- there is no post to be missing yet.
  if (total > 0 && page > totalPages) notFound();

  return (
    <>
      <div
        className={`flex justify-between items-center ${contentColumnClasses}`}
      >
        <PageHeading>Blog Posts</PageHeading>
        {session?.user && (
          <TextLink href="/blog/create" className="font-bold">
            Create New Post
          </TextLink>
        )}
      </div>
      {blogs.length === 0 ? (
        <p className="mt-4 text-muted">No posts to show yet.</p>
      ) : (
        blogs.map((blog) => (
          <BlogBodyAbbr
            key={blog.id}
            blog={blog}
            session={session}
            deleteBlogPost={deleteBlogPost}
          />
        ))
      )}
      <Pagination page={page} totalPages={totalPages} />
    </>
  );
}
