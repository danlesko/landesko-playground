"use client";
import Link from "next/link";
import { ArrowLeft } from "@phosphor-icons/react/dist/ssr";

export default function Error() {
  return (
    <div className="inline-block" style={{ width: "100%" }}>
      <h2 className="text-4xl font-bold text-red-700">Error Fetching Blog</h2>
      <Link
        className="text-xl text-blue-600 hover:text-blue-800 visited:text-purple-600 font-bold"
        href={`/blog`}
      >
        <ArrowLeft size={24} className="inline-block -translate-y-1" /> All Blog
        Posts
      </Link>
      <div className="mt-4 p-4 shadow-md rounded-lg md:w-full lg:min-w-[600px] lg:w-1/2 min-h-32 border border-white overflow-auto">
        <p className="whitespace-pre-line">
          An error occurred while fetching the blog post for the given URL.
          Please make sure that the URL is valid and that you have the
          permission to view the blog by signing in.
        </p>
      </div>
    </div>
  );
}
