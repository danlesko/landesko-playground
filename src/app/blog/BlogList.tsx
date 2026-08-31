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
  // shell whose only job is to declare the Suspense boundary, and awaiting there
  // would delay the boundary itself until searchParams resolved -- so the
  // fallback could not be flushed first. Stated as a delay and not as "the
  // skeleton would never show", which is what an earlier version of this comment
  // claimed and is too strong: searchParams is not I/O, so the delay is small.
  // Passing the promise down keeps the shell synchronous either way.
  const { page: pageParam } = await searchParams;
  const page = parseBlogPageParam(pageParam);

  const session = await getSession();
  const { blogs, totalPages } = await fetchBlogPage(session, page);

  // A well-formed page number past the end names nothing, so it answers 404
  // rather than an empty list.
  //
  // No empty-blog exemption. An earlier version exempted `total === 0`, reasoning
  // that there is no post to be past the end of -- which made an empty blog answer
  // 200 for every page number while a five-post blog answered 404 for page 2. The
  // same URL shape treated two ways, for no reason a reader could see.
  // `totalPages` is floored at 1, so page 1 still renders its empty state and only
  // page 2 and up are missing.
  if (page > totalPages) notFound();

  return (
    <>
      <div className="flex justify-between items-center">
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
