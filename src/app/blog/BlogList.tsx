import { getSession } from "@/lib/session";
import PageHeading from "@/components/ui/PageHeading";
import TextLink from "@/components/ui/TextLink";
import MyBlogBodyAbbr from "@/components/MyBlogBodyAbbr";
import { deleteBlogPost } from "@/lib/actions";
import { fetchRecentBlogs } from "@/lib/data";

// Ten to match the LIMIT in fetchRecentBlogs.
export const BlogListSkeleton = () => (
  <>
    <PageHeading>Blog Posts</PageHeading>
    {Array.from({ length: 10 }, (_, index) => (
      <div
        key={index}
        className="mt-4 p-4 border border-border rounded-lg lg:min-w-[600px] lg:w-1/2 h-32 animate-pulse"
      >
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
export default async function BlogList() {
  const session = await getSession();
  const blogs = await fetchRecentBlogs(session);

  return (
    <>
      <div className="flex justify-between items-center lg:max-w-[50%]">
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
          <MyBlogBodyAbbr
            key={blog.id}
            blog={blog}
            session={session}
            deleteBlogPost={deleteBlogPost}
          />
        ))
      )}
    </>
  );
}
