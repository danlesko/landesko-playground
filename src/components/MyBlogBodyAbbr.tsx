"use client";
import { useState } from "react";
import { Trash } from "@phosphor-icons/react/dist/ssr";
import type { Blog } from "@/lib/definitions";
import type { Session } from "next-auth";
import { Modal, Button } from "@rewind-ui/core";
import TextLink from "@/components/ui/TextLink";
import { formErrorClasses } from "@/components/ui/form";

interface MyBlogBodyAbbrProps {
  session: Session | null; // Replace 'any' with the appropriate type if available
  blog: Blog;
  deleteBlogPost: (id: string) => Promise<void>;
}

const DELETE_FAILED_MESSAGE = "Could not delete this post. Please try again.";

// A successful delete ends in `redirect()`, which signals by rejecting, so
// success and failure arrive here as the same kind of event. Matched on `digest`
// rather than `message` because a production build replaces the message of
// anything thrown in a server action with a generic notice. The trailing
// separator is load-bearing: the digest is `NEXT_REDIRECT;<type>;<url>;<status>;`
// and without it this also swallows anything merely starting with the code.
const isRedirect = (error: unknown) =>
  typeof error === "object" &&
  error !== null &&
  "digest" in error &&
  typeof error.digest === "string" &&
  error.digest.startsWith("NEXT_REDIRECT;");

/** Separated from the component because it is only reachable through a click,
 * and this project's Vitest setup has no DOM to click in — as a plain function
 * the redirect-versus-failure decision stays testable. */
export const attemptDelete = async (
  deleteBlogPost: (id: string) => Promise<void>,
  id: string,
  onFailure: (message: string) => void,
) => {
  try {
    await deleteBlogPost(id);
  } catch (error) {
    // The router has already navigated by the time a redirect lands here, so
    // there is nothing left to rethrow to and nothing to report.
    if (isRedirect(error)) return;
    onFailure(DELETE_FAILED_MESSAGE);
  }
};

const MyBlogBodyAbbr = ({
  session,
  blog,
  deleteBlogPost,
}: MyBlogBodyAbbrProps) => {
  const [openModel, setOpenModel] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const handleDelete = () => {
    setDeleteError("");
    setOpenModel(false);
    void attemptDelete(deleteBlogPost, blog.id, setDeleteError);
  };

  return (
    <div className="mt-4 p-4 shadow-md rounded-lg lg:min-w-[600px] lg:w-1/2 h-32 border border-border overflow-auto">
      <div className="flow-root">
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-semibold">
            <TextLink href={`/blog/${blog.id}`}>{blog.title}</TextLink>
          </h2>
          {session?.user && (
            <button
              type="button"
              aria-label={`Delete post: ${blog.title}`}
              className="text-danger hover:text-danger-hover rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
              onClick={() => setOpenModel(true)}
            >
              <Trash size={24} aria-hidden="true" />
            </button>
          )}
        </div>
        <p className="text-sm font-medium text-muted">
          {new Date(blog.date).toLocaleDateString("en-US", {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
      </div>
      <p className="line-clamp-1">{blog.content}</p>
      {/* Always in the tree and empty when there is nothing to report: a live
          region inserted at the same moment it gains text is the less
          dependable of the two shapes across assistive tech. */}
      <p aria-live="polite" className={formErrorClasses}>
        {deleteError}
      </p>
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
            <Button color="red" onClick={handleDelete}>
              Delete
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default MyBlogBodyAbbr;
