import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import Pagination from "@/components/ui/Pagination";

const render = (page: number, totalPages: number) =>
  renderToStaticMarkup(createElement(Pagination, { page, totalPages }));

/** Every `href` in document order, which is what makes a page reachable at all. */
function hrefs(html: string): string[] {
  return [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]!);
}

/** The text of the element carrying `aria-current`, i.e. the page you are on. */
function currentPage(html: string): string | undefined {
  return /aria-current="page"[^>]*>([^<]*)</.exec(html)?.[1];
}

describe("Pagination", () => {
  // Rendering an empty landmark would give assistive tech something to announce
  // that says nothing, and a one-page blog has no pages to move between.
  it("renders nothing when there is only one page", () => {
    expect(render(1, 1)).toBe("");
    expect(render(1, 0)).toBe("");
  });

  it("links every page, as a real href", () => {
    const html = render(2, 4);

    // Shareable URLs are the reason numbered pages were chosen over "load more",
    // so this asserts the hrefs rather than that four numbers appear.
    //
    // Five, not four: Previous and Next are links too, and page 2 is not one. In
    // document order that is Previous, then 1, 3 and 4, then Next -- so page 1
    // and page 3 each appear twice, reached two ways. My first version of this
    // expectation listed four and the exact-list assertion caught the miscount,
    // which a `toContain` per page would not have.
    expect(hrefs(html)).toEqual([
      "/blog?page=1",
      "/blog?page=1",
      "/blog?page=3",
      "/blog?page=4",
      "/blog?page=3",
    ]);
  });

  it("marks the current page and does not link it", () => {
    const html = render(2, 4);

    expect(currentPage(html)).toBe("2");
    // A link to where you already are is a keyboard stop that does nothing.
    expect(hrefs(html)).not.toContain("/blog?page=2");
  });

  it("omits Previous on the first page and Next on the last", () => {
    const first = render(1, 3);
    expect(first).not.toContain("Previous");
    expect(first).toContain("Next");

    const last = render(3, 3);
    expect(last).toContain("Previous");
    expect(last).not.toContain("Next");

    const middle = render(2, 3);
    expect(middle).toContain("Previous");
    expect(middle).toContain("Next");
  });

  it("points Previous and Next at the adjacent pages", () => {
    const html = render(3, 5);

    // Asserted on the anchors carrying those labels, not on the href list. The
    // first version of this test checked that `/blog?page=2` and `/blog?page=4`
    // appeared *somewhere*, which on page 3 of 5 is true of the page-number links
    // regardless -- so it passed with Previous and Next deleted entirely. Vacuous,
    // and codex caught it.
    const labelled = (label: string) =>
      new RegExp(`<a[^>]*href="([^"]*)"[^>]*>${label}</a>`).exec(html)?.[1];

    expect(labelled("Previous")).toBe("/blog?page=2");
    expect(labelled("Next")).toBe("/blog?page=4");
  });

  it("is a named landmark, so it is distinguishable from the site navigation", () => {
    const html = render(2, 3);

    expect(html).toContain("<nav");
    expect(html).toContain('aria-label="Blog pages"');
  });

  // An ordered list, because the pages have an order and a screen reader
  // announces the count. A pile of anchors would convey neither.
  it("lists the pages in an ordered list", () => {
    const html = render(1, 3);

    expect(html).toContain("<ol");
    expect([...html.matchAll(/<li>/g)]).toHaveLength(3);
  });
});
