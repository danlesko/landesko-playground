import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@/auth";

export const metadata: Metadata = {
  title: "Landesko's Playground - Blog",
  description: "Blog Posts",
};

import { fetchRecentBlogs } from "@/src/app/lib/data";

export default async function Blog() {
  const blogs = await fetchRecentBlogs();
  const session = await auth();
  return (
    <div className="inline-block" style={{ width: "100%" }}>
      <span className="flex justify-between items-center lg:max-w-[50%]">
        <h2 className="text-4xl font-bold">Blog Posts</h2>
        {session?.user && (
          <Link
            href="/blog/create"
            className="text-blue-600 hover:text-blue-800 visited:text-purple-600"
          >
            Create New Post
          </Link>
        )}
      </span>
      {blogs.map((blog) => (
        <div
          key={blog.title}
          className="mt-4 p-4 shadow-md rounded-lg md:w-full lg:min-w-[600px] lg:max-w-[50%] min-h-32 max-h-32 border border-white overflow-auto"
        >
          <div className="flow-root">
            <h3 className="text-lg font-bold">
              <Link
                className="text-blue-600 hover:text-blue-800 visited:text-purple-600"
                href={`/blog/${blog.id}`}
              >
                {blog.title}
              </Link>
            </h3>
            <h4 className="text-md font-bold">
              {new Date(blog.date).toLocaleDateString("en-US", {
                weekday: "long",
                year: "numeric",
                month: "long",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </h4>
          </div>
          <p className="line-clamp-1">{blog.content}</p>
        </div>
      ))}
    </div>
  );
}
