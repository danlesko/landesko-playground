import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@/auth";
import MyBlogBodyAbbr from "@/src/components/MyBlogBodyAbbr";
import { deleteBlogPost } from "@/src/app/lib/actions";

export const metadata: Metadata = {
  title: "Landesko's Playground - Blog",
  description: "Blog Posts",
};

import { fetchRecentBlogs } from "@/src/app/lib/data";

export default async function Blog() {
  const session = await auth();
  const blogs = await fetchRecentBlogs(session);

  return (
    <div className="inline-block" style={{ width: "100%" }}>
      <span className="flex justify-between items-center lg:max-w-[50%]">
        <h2 className="text-4xl font-bold">Blog Posts</h2>
        {session?.user && (
          <Link
            href="/blog/create"
            className="text-blue-600 hover:text-blue-800 visited:text-purple-600 font-bold"
          >
            Create New Post
          </Link>
        )}
      </span>
      {blogs.map((blog) => (
        <MyBlogBodyAbbr
          key={blog.id}
          blog={blog}
          session={session}
          deleteBlogPost={deleteBlogPost}
        />
      ))}
    </div>
  );
}
