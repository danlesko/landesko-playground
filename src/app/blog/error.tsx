"use client";
import BackLink from "@/components/ui/BackLink";
import PageHeading from "@/components/ui/PageHeading";
import useErrorRetry from "../useErrorRetry";
import { cardClasses } from "@/components/ui/card";
import { contentColumnClasses } from "@/components/ui/layout";

/**
 * At `blog/` rather than `blog/[id]/`, and the level is the whole point (#154).
 *
 * This file used to live at `blog/[id]/error.tsx`, where it could not catch the
 * error it was written for. A segment's `error.tsx` wraps that segment's
 * CHILDREN, not its own layout -- and the database read is in
 * `blog/[id]/layout.tsx`, deliberately, because a lookup above every Suspense
 * boundary on the route is the only way `notFound()` can still set a real 404
 * status (see the long note in that file, and #52). So the read threw straight
 * past its own segment's boundary.
 *
 * Measured before moving it, against a build with no `POSTGRES_URL`: requesting
 * `/blog/<uuid>` answered 500 and rendered the root `app/error.tsx` -- "Something
 * Went Wrong" -- not "Error Fetching Blog". The tailored boundary was
 * unreachable for the only error it names.
 *
 * One level up it sits above both the `[id]` layout and `/blog`'s own page, so it
 * catches the read on both routes. That fixes `/blog` too, which never had a
 * boundary of its own and was also falling through to the root one.
 *
 * The `blog/[id]/error.tsx` this replaces is deleted rather than kept. With the
 * read in the layout there is nothing left for it to catch that this file would
 * not catch identically -- `page.tsx` reuses the layout's memo, so if the layout
 * resolved, the page has its row. A boundary that cannot fire for the error in
 * its own heading is worse than no boundary: it reads like coverage.
 *
 * `BackLink` points at `/blog`, which is self-referential when it is `/blog`
 * itself that failed. Kept anyway: it is the useful escape from a broken post,
 * which is the more common case, and from the list it is a reload by another
 * name. "Try again" is the primary action either way.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { retrying, retry } = useErrorRetry(reset);

  return (
    <div className={contentColumnClasses}>
      <PageHeading>
        <span className="text-danger">Error Fetching Blog</span>
      </PageHeading>
      <BackLink />
      <div className={`${cardClasses} min-h-32 overflow-auto`}>
        {/* Wording covers a failed list and a failed post, because one boundary
            now serves both. It said "The blog post for this URL" while it only
            served `[id]`. */}
        <p className="whitespace-pre-line">
          The blog could not be loaded. If the problem is temporary, trying
          again may help.
        </p>
        {/* `aria-busy`, not `aria-disabled`: the control stays operable while the
            retry runs, and a second click escalates to a full reload. Neither is
            `disabled`, which would drop focus to the body in some browsers. */}
        <button
          type="button"
          onClick={retry}
          aria-busy={retrying}
          className="mt-4 px-4 py-2 rounded font-bold bg-surface text-accent hover:text-accent-hover aria-[busy=true]:opacity-50 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
        >
          Try again
        </button>
        {/* Mounted empty rather than conditionally, and kept off the button: a
            live region that appears at the same moment as its text is often not
            announced at all, and on the focused control its name, state and this
            text would all change at once. `min-h-5` reserves the line. */}
        <p
          role="status"
          aria-atomic="true"
          className="mt-2 min-h-5 text-sm text-muted"
        >
          {retrying ? "Retrying... click Try again to reload the page." : ""}
        </p>
        {error.digest && (
          <p className="mt-4 text-sm text-muted">
            Error digest: <code>{error.digest}</code>
          </p>
        )}
      </div>
    </div>
  );
}
