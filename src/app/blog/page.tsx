import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Landesko's Playground - Blog",
  description: "Blog Posts",
};

import { fetchRecentBlogs } from "../lib/data";

export default async function Blog() {
  const blogs = await fetchRecentBlogs();
  return (
    <>
      <h2 className="text-4xl font-bold">Blog Posts</h2>
      {blogs.map((blog) => (
        <div
          key={blog.title}
          className="mt-4 p-4 shadow-md rounded-lg w-1/2 h-1/6 border border-white"
        >
          <h3 className="text-lg font-bold">{blog.title}</h3>
          <p className="">{blog.content}</p>
        </div>
      ))}
    </>
  );
}
