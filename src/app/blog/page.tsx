import type { Metadata } from "next";
import { auth } from "@/auth";
import PageHeading from "@/components/ui/PageHeading";
import TextLink from "@/components/ui/TextLink";
import MyBlogBodyAbbr from "@/components/MyBlogBodyAbbr";
import { deleteBlogPost } from "@/lib/actions";

export const metadata: Metadata = {
  title: "Landesko's Playground - Blog",
  description: "Blog Posts",
};

import { fetchRecentBlogs } from "@/lib/data";

export default async function Blog() {
  const session = await auth();
  const blogs = await fetchRecentBlogs(session);

  return (
    <div className="inline-block" style={{ width: "100%" }}>
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
    </div>
  );
}
