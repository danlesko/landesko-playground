"use client";
import { useEffect, useState } from "react";
import { Trash } from "@phosphor-icons/react/dist/ssr";
import type { Blog } from "@/lib/definitions";
import { BLOG_DATE_TIME_FORMAT, formatBlogDateRelative } from "@/lib/blogDate";
import type { Session } from "next-auth";
import { Modal } from "@rewind-ui/core";
import TextLink from "@/components/ui/TextLink";
import { formErrorClasses } from "@/components/ui/form";
import {
  dangerButtonClasses,
  primaryButtonClasses,
} from "@/components/ui/button";
import { cardClasses } from "@/components/ui/card";

interface BlogBodyAbbrProps {
  session: Session | null;
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

const BlogBodyAbbr = ({ session, blog, deleteBlogPost }: BlogBodyAbbrProps) => {
  const [openModal, setOpenModal] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  // `now` starts null and is only ever set from an effect, and the reason is
  // hydration. This component is server-rendered and then hydrated, so a
  // `Date.now()` taken during render is taken twice, on two machines,
  // milliseconds apart -- and a post sitting on a bucket boundary formats
  // differently either side of it, which is a React #418 mismatch. Starting
  // null makes the server's markup and the client's first render the same
  // string by construction rather than by being close enough in time.
  //
  // Not for caching, which is a distinction worth keeping straight: issue #8
  // proposes `unstable_cache` around the database read, and that is the Data
  // Cache -- it stores the function's return value, not rendered output, so
  // formatting would still run per request and a render-time clock would not go
  // stale from it. Only route-level or component-output caching could freeze a
  // relative string into served HTML, and nothing here does that today.
  //
  // Read once, with no interval. A minute counter ticking on ten cards buys
  // very little and the absolute date is one hover away. The flip side is that
  // a tab left open keeps whatever label it had, including after a
  // back/forward-cache restore -- accepted, not overlooked.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
  }, []);

  const absoluteDate = blog.date.toLocaleDateString(
    "en-US",
    BLOG_DATE_TIME_FORMAT,
  );
  const relativeDate =
    now === null ? null : formatBlogDateRelative(blog.date, now);

  const handleDelete = () => {
    setDeleteError("");
    setOpenModal(false);
    void attemptDelete(deleteBlogPost, blog.id, setDeleteError);
  };

  return (
    <div className={`${cardClasses} h-32 overflow-auto`}>
      <div className="flow-root">
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-semibold">
            <TextLink href={`/blog/${blog.id}`}>{blog.title}</TextLink>
          </h2>
          {session?.user && (
            <button
              type="button"
              aria-label={`Delete post: ${blog.title}`}
              className="text-danger hover:text-danger-hover rounded focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
              onClick={() => setOpenModal(true)}
            >
              <Trash size={24} aria-hidden="true" />
            </button>
          )}
        </div>
        {/* `<time>` rather than the `<p>` this was, because the machine-readable
            instant is now the thing keeping the visible text honest, and
            `dateTime` is where it goes. `title` puts the full date within reach
            of a pointer -- a bonus, not the accessible route to it, since a
            title is hover-only. */}
        <time
          dateTime={blog.date.toISOString()}
          title={absoluteDate}
          className="block text-sm font-medium text-muted"
        >
          {relativeDate ?? absoluteDate}
        </time>
      </div>
      <p className="line-clamp-1">{blog.content}</p>
      {/* Always in the tree and empty when there is nothing to report: a live
          region inserted at the same moment it gains text is the less
          dependable of the two shapes across assistive tech. */}
      <p aria-live="polite" className={formErrorClasses}>
        {deleteError}
      </p>
      <Modal
        open={openModal}
        className="bg-surface"
        onClose={() => setOpenModal(false)}
      >
        <div className="p-4">
          <h2 className="text-2xl font-semibold">Delete Blog Post</h2>
          <p className="text-lg">
            Are you sure you want to delete this blog post?
          </p>
          <div className="flex justify-end mt-4">
            {/* `type="button"` on both, explicitly. rewind-ui's Button defaulted to it;
                a native one inside a form defaults to submitting it. These portal out of
                any form and this page has none, so nothing depended on it -- but a
                default worth relying on is a default worth naming. */}
            <button
              type="button"
              className={`mr-2 ${primaryButtonClasses}`}
              onClick={() => setOpenModal(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className={dangerButtonClasses}
              onClick={handleDelete}
            >
              Delete
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default BlogBodyAbbr;
