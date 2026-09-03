"use client";
import { useEffect, useRef, useState } from "react";
import { Trash } from "@phosphor-icons/react/dist/ssr";
import type { Blog } from "@/lib/definitions";
import { BLOG_DATE_TIME_FORMAT, formatBlogDateRelative } from "@/lib/blogDate";
import type { Session } from "next-auth";
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
  const dialogRef = useRef<HTMLDialogElement>(null);
  // Whether the press that is currently in progress started on the backdrop. See the dialog's
  // pointer handlers below for why a click event cannot answer that on its own.
  const pressStartedOnBackdrop = useRef(false);

  // Drives the element from the state. `openModal` stays the single source of truth and the
  // element is made to match, rather than the element being the state -- calling `showModal()`
  // straight from the click handler puts the DOM and React out of step the moment anything
  // else closes the dialog, and Escape is exactly that.
  //
  // Neither call is guarded on `dialog.open`, and an earlier version guarded both for reasons
  // that turned out to be false. Measured: a second `showModal()` on an already-open modal is
  // a no-op rather than a throw, and `close()` on a closed dialog returns before queueing
  // anything, so it fires no `close` event and cannot feed the state back. React's development
  // double-invoke is therefore already safe. The `dialogRef.current` check IS load-bearing --
  // the dialog is not rendered at all for a viewer who cannot delete.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (openModal) dialog.showModal();
    else dialog.close();
  }, [openModal]);

  // Scroll lock, which is the one piece of the previous behaviour the platform does NOT
  // provide. `showModal()` makes the background inert and unclickable but leaves it
  // scrollable, and the library was locking it -- measured, `body` computed
  // `overflow: hidden` while the old modal was open. A class rather than an inline style
  // so the value lives with the rest of the CSS.
  //
  // The cleanup runs on unmount as well as on close, which matters here specifically:
  // confirming a delete removes the card this component renders, so it can unmount while
  // the dialog is open and would otherwise leave the page unscrollable.
  //
  // NOT reference-counted, and that is a deliberate limit rather than an oversight. Every card
  // toggles the same class, so if two dialogs were open at once, closing either would unlock
  // the page while the other stayed open. Nothing can get there: the first dialog makes the
  // rest of the document inert, so its own card's trigger is the last one anybody can press.
  // A counter would be dead code guarding a state the platform prevents.
  useEffect(() => {
    if (!openModal) return;
    document.body.classList.add("modal-open");
    return () => document.body.classList.remove("modal-open");
  }, [openModal]);

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
      {/* A NATIVE `<dialog>`, replacing rewind-ui's Modal and removing the last reason
          that library was installed (#143).

          The platform supplies, for free, four things the library hand-rolled: a focus
          trap, Escape-to-close, an inert background, and top-layer rendering that needs
          no portal. It also fixes a defect the library had -- its trap was gated on an
          animation's `onfinish`, so for roughly 150ms after opening, focus could tab out
          to the header and nav. `showModal()` makes the rest of the document inert
          immediately, and `e2e/modal.spec.ts` no longer needs the wait that gap forced.

          `openModal` stays the single source of truth and an effect drives the element to
          match, rather than the element being the state. The alternative -- calling
          `showModal()` in the click handler -- puts the DOM and React out of step the
          moment anything else closes the dialog.

          `aria-labelledby` points at the heading. The library set `role="dialog"`,
          `aria-modal`, `aria-hidden` and an id but no name-giving attribute, so a screen
          reader announced an unnamed dialog -- a serious `aria-dialog-name` violation
          that shipped because nothing could render this component until the fixture
          existed. A native dialog is no better on its own; the name is still ours to
          supply. The id is derived from the post so two cards cannot collide.

          NO `role="dialog"` attribute: the element has that role implicitly, and adding
          it would be redundant. Tests locate it by role rather than by selector.

          Gated on `session?.user`, matching the trigger, and that gate is NOT redundant with
          this being a dialog. The library rendered nothing until it was opened, so a signed-out
          visitor never received this markup; a native `<dialog>` is always in the document and
          merely `display: none`, so without the gate every anonymous reader would be served
          the confirmation copy and both buttons for every card on the page. A unit test caught
          exactly that. Nothing is exploitable either way -- `deleteBlogPost` re-checks the
          session server-side, which is the control that matters -- but markup nobody can use
          should not be sent. */}
      {session?.user && (
        <dialog
          ref={dialogRef}
          aria-labelledby={`${blog.id}-delete-heading`}
          onClose={() => setOpenModal(false)}
          // Click-to-dismiss on the backdrop, which the platform does NOT give: a modal
          // dialog's only default close request is Escape. The library closed on an overlay
          // click (`overlayCloseOnClick` defaulted to true, and this call site never opted
          // out), so without this the change would quietly remove an interaction.
          //
          // `event.target === event.currentTarget` is what identifies the backdrop, because
          // `::backdrop` is a pseudo-element and cannot be an event target: a press over it
          // reports the dialog itself, while a press on the panel reports the child it landed
          // on. The panel fills the dialog's padding box, which has no border and no padding,
          // so there is no sliver that looks like panel and reports dialog.
          //
          // POINTERDOWN AND POINTERUP, not `click`, and that is a fix rather than a style
          // choice. A click's target is the nearest common ancestor of the press and the
          // release, so both split-target gestures resolve to the dialog and a single
          // `onClick` check closed on both -- measured: dragging from inside the panel out to
          // the backdrop dismissed the dialog, and so did pressing the backdrop and releasing
          // on the panel. Selecting the confirmation text with the mouse and overshooting is
          // enough to do the first. Requiring both ends to be the backdrop is what the
          // platform's own light-dismiss algorithm does for `closedby="any"`, which this
          // deliberately does not use because that attribute is much newer than everything
          // else here.
          //
          // Keyboard activation of Cancel or Delete cannot reach this: it dispatches `click`
          // with no pointer events at all, and nothing here listens for `click`.
          onPointerDown={(event) => {
            pressStartedOnBackdrop.current =
              event.target === event.currentTarget;
          }}
          onPointerUp={(event) => {
            const releasedOnBackdrop = event.target === event.currentTarget;
            if (pressStartedOnBackdrop.current && releasedOnBackdrop) {
              setOpenModal(false);
            }
            pressStartedOnBackdrop.current = false;
          }}
          // A press that ends outside the window, or is taken over by a scroll or a gesture,
          // never produces `pointerup` -- so without this the next release anywhere would be
          // judged against a stale press.
          onPointerCancel={() => {
            pressStartedOnBackdrop.current = false;
          }}
          className="modal-panel bg-surface text-foreground"
        >
          <div className="p-4">
            <h2
              id={`${blog.id}-delete-heading`}
              className="text-2xl font-semibold"
            >
              Delete Blog Post
            </h2>
            <p className="text-lg">
              Are you sure you want to delete this blog post?
            </p>
            <div className="flex justify-end mt-4">
              {/* `type="button"` on both, explicitly, and this is now load-bearing rather
                  than tidy. The library's Button defaulted to it and portalled these out of
                  the document's tree; a native `<dialog>` renders in the top layer but STAYS
                  where it is written, so if this card is ever placed inside a form these are
                  inside it and a bare `<button>` submits it. */}
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
        </dialog>
      )}
    </div>
  );
};

export default BlogBodyAbbr;
