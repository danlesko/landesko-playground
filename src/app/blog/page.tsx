import type { Metadata } from "next";
import { auth } from "@/auth";
import PageHeading from "@/components/ui/PageHeading";
import TextLink from "@/components/ui/TextLink";
import MyBlogBodyAbbr from "@/components/MyBlogBodyAbbr";
import { deleteBlogPost } from "@/lib/actions";
import { fetchRecentBlogs } from "@/lib/data";

export const metadata: Metadata = {
  title: "Landesko's Playground - Blog",
  description: "Blog Posts",
};

export default async function Blog() {
  const session = await auth();
  const blogs = await fetchRecentBlogs(session);

  return (
    <>
      <div className="flex justify-between items-center md:w-full lg:min-w-[600px] lg:w-1/2">
        <PageHeading>Blog Posts</PageHeading>
        {session?.user && (
          <TextLink href="/blog/create" className="font-bold">
            Create New Post
          </TextLink>
        )}
      </div>
      {blogs.map((blog) => (
        <MyBlogBodyAbbr
          key={blog.id}
          blog={blog}
          session={session}
          deleteBlogPost={deleteBlogPost}
        />
      ))}
    </>
  );
}
