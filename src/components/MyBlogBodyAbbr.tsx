"use client";
import { useState } from "react";
import Link from "next/link";
import { Trash } from "@phosphor-icons/react/dist/ssr";
import type { Blog } from "@/src/app/lib/definitions";
import type { Session } from "next-auth";
import { Modal, Button } from "@rewind-ui/core";

interface MyBlogBodyAbbrProps {
  session: Session | null; // Replace 'any' with the appropriate type if available
  blog: Blog;
  deleteBlogPost: (blog: Blog) => void;
}

const MyBlogBodyAbbr = ({
  session,
  blog,
  deleteBlogPost,
}: MyBlogBodyAbbrProps) => {
  const [openModel, setOpenModel] = useState(false);
  return (
    <div
      key={blog.title}
      className="mt-4 p-4 shadow-md rounded-lg md:w-full lg:min-w-[600px] lg:max-w-[50%] min-h-32 max-h-32 border border-white overflow-auto"
    >
      <div className="flow-root">
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-bold">
            <Link
              className="text-blue-600 hover:text-blue-800 visited:text-purple-600"
              href={`/blog/${blog.id}`}
            >
              {blog.title}
            </Link>
          </h3>
          {session?.user && (
            <Trash
              size={24}
              className="text-red-600 hover:text-red-800 visited:text-red-600 cursor-pointer"
              onClick={() => setOpenModel(true)}
            />
          )}
        </div>
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
      <Modal
        open={openModel}
        className="bg-zinc-800"
        onClose={() => setOpenModel(false)}
      >
        <div className="p-4">
          <h2 className="text-2xl font-bold">Delete Blog Post</h2>
          <p className="text-lg">
            Are you sure you want to delete this blog post?
          </p>
          <div className="flex justify-end mt-4">
            <Button
              variant="primary"
              className="mr-2"
              onClick={() => setOpenModel(false)}
            >
              Cancel
            </Button>
            <Button
              color="red"
              onClick={() => {
                deleteBlogPost(blog);
                setOpenModel(false);
              }}
            >
              Delete
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default MyBlogBodyAbbr;
