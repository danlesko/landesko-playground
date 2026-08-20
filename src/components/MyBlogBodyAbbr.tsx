"use client";
import { useState } from "react";
import Link from "next/link";
import { Trash } from "@phosphor-icons/react/dist/ssr";
import type { Blog } from "@/lib/definitions";
import type { Session } from "next-auth";
import { Modal, Button } from "@rewind-ui/core";

interface MyBlogBodyAbbrProps {
  session: Session | null; // Replace 'any' with the appropriate type if available
  blog: Blog;
  deleteBlogPost: (id: string) => void;
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
      className="mt-4 p-4 shadow-md rounded-lg md:w-full lg:min-w-[600px] lg:max-w-[50%] min-h-32 max-h-32 border border-border overflow-auto"
    >
      <div className="flow-root">
        <div className="flex justify-between items-center">
          <h3 className="text-xl font-semibold">
            <Link
              className="text-accent hover:text-accent-hover visited:text-accent-visited"
              href={`/blog/${blog.id}`}
            >
              {blog.title}
            </Link>
          </h3>
          {session?.user && (
            <Trash
              size={24}
              className="text-danger hover:text-danger-hover cursor-pointer"
              onClick={() => setOpenModel(true)}
            />
          )}
        </div>
        <h4 className="text-sm font-medium text-muted">
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
        className="bg-surface"
        onClose={() => setOpenModel(false)}
      >
        <div className="p-4">
          <h2 className="text-2xl font-semibold">Delete Blog Post</h2>
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
                deleteBlogPost(blog.id);
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
