import TextLink from "@/components/ui/TextLink";
import { contentColumnClasses } from "@/components/ui/layout";

/**
 * Page links for the blog list.
 *
 * Every page is a real `<a href>` to `/blog?page=N`, which is the whole reason
 * numbered pages were chosen over "load more": the URLs are shareable, they work
 * with JavaScript off, and a crawler can reach post 11. A button that fetched the
 * next page would give up all three.
 *
 * Rendered as a `<nav>` with its own name, so it is a landmark a screen-reader
 * user can jump to and is distinguishable from the site navigation. The current
 * page carries `aria-current="page"` and is deliberately NOT a link: a link to
 * where you already are is a keyboard stop that does nothing.
 *
 * Previous and Next are omitted rather than disabled at the ends. A disabled link
 * is not a real thing in HTML -- `<a>` has no `disabled` -- and the usual
 * imitations either stay focusable while doing nothing or need `aria-disabled`
 * plus a click handler to suppress. Leaving them out is honest and costs nothing,
 * since the page numbers are all present anyway.
 *
 * Every page number is listed, with no ellipsis. That is right for a blog with
 * tens of posts and wrong for one with thousands; the point at which it needs
 * windowing is the point at which someone should decide what the window looks
 * like, and guessing now would be a control nobody has seen.
 */
export default function Pagination({
  page,
  totalPages,
}: {
  page: number;
  totalPages: number;
}) {
  // One page is not a pagination control, and rendering an empty landmark would
  // give assistive tech something to announce that says nothing.
  if (totalPages <= 1) return null;

  const pages = Array.from({ length: totalPages }, (_, index) => index + 1);

  return (
    <nav
      aria-label="Blog pages"
      className={`mt-6 flex items-center gap-4 ${contentColumnClasses}`}
    >
      {page > 1 && (
        <TextLink href={`/blog?page=${page - 1}`} className="font-bold">
          Previous
        </TextLink>
      )}

      <ol className="flex items-center gap-3">
        {pages.map((number) => (
          <li key={number}>
            {number === page ? (
              <span aria-current="page" className="font-bold text-foreground">
                {number}
              </span>
            ) : (
              <TextLink href={`/blog?page=${number}`}>{number}</TextLink>
            )}
          </li>
        ))}
      </ol>

      {page < totalPages && (
        <TextLink href={`/blog?page=${page + 1}`} className="font-bold">
          Next
        </TextLink>
      )}
    </nav>
  );
}
