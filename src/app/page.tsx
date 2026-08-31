import Image from "next/image";
import PageHeading from "@/components/ui/PageHeading";
import TextLink, { textLinkClasses } from "@/components/ui/TextLink";
import { contentColumnClasses } from "@/components/ui/layout";

export default async function Home() {
  return (
    // One column at every width. This used to be a two-track grid from `lg` up,
    // text on the left and photo on the right; #135 asked for the stacked
    // arrangement everywhere, which is what the page already did below `lg`. The
    // grid utilities are described rather than named here on purpose -- they no
    // longer appear in any class string, so spelling them out would keep emitting
    // their rules from this comment alone.
    //
    // Capped on the shared measure rather than left to fill the content box. Not
    // tidiness: with the grid gone the photo's width is its parent's content box,
    // `100vw - 32px` now that #136 removed the 250px rail, which is 1888px at a
    // 1920px viewport -- a 1888x2516 render
    // of a 1286x1714 portrait. The cap also puts the paragraph on the same measure
    // as the cards and forms, which is what `layout.ts` calls the one content
    // measure -- which #138 then put on every page's own wrapper, so this is no
    // longer the exception it was. /animation's canvas is the only thing that opts
    // out, and deliberately.
    <div className={contentColumnClasses}>
      <PageHeading>Welcome to Landesko's Playground</PageHeading>
      <p className="text-lg mt-2">
        I'm a full-stack software engineer. This is my portfolio and blog — a
        place to experiment with new technologies and write about what I find.
      </p>
      <p className="mt-2 text-sm text-muted">
        Master's from Johns Hopkins University.
      </p>
      {/* A plain list rather than a second `<nav>` landmark: the main nav is
          this site's navigation, and a landmark here would compete with it for
          the same job. The list still gives a screen reader the count. */}
      <ul className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-lg">
        <li>
          <TextLink href="/blog">Read the blog</TextLink>
        </li>
        <li>
          <TextLink href="/animation">See the animation</TextLink>
        </li>
        <li>
          <TextLink href="/contact">Get in touch</TextLink>
        </li>
        <li>
          {/* Off-site, so a bare `<a>` with the shared classes -- next/link
              would render the same anchor without prefetching anything. Left
              in the same tab on purpose: forcing a new one takes the choice
              away and then has to be announced to be honest about it. */}
          <a className={textLinkClasses} href="https://github.com/danlesko">
            GitHub
          </a>
        </li>
        <li>
          <a
            className={textLinkClasses}
            href="https://www.linkedin.com/in/danlesko/"
          >
            LinkedIn
          </a>
        </li>
      </ul>
      {/* An unconditional top margin. It used to be paired with a desktop
          override that zeroed it -- "space them while stacked, don't while side
          by side" -- and with one column that override would remove the gap
          exactly where it is now needed. The override is described rather than
          named for the same reason as the grid utilities above. */}
      <div className="mt-6">
        <Image
          src="/danPool.jpeg"
          alt="Lan Playing Pool"
          width="1286"
          height="1714"
          // `42rem`, and deliberately not `672px`. The cap is a rem value, so it
          // is 672px only while the root font size is 16px -- under text-only
          // zoom, or a changed browser default, the rendered width grows and a
          // px figure here would UNDER-declare and fetch a candidate too small
          // for the box, which is the direction that actually shows. Declaring
          // the same unit the CSS uses cannot drift.
          //
          // From `lg` up this cap decides the width, not the viewport: the
          // content box is `100vw - 32px` -- `<main>`'s padding, and nothing
          // else since #136 took the 250px rail out -- so 992px at the 1024px
          // breakpoint, already wider than 42rem at a default root. Below `lg`
          // there is no cap, so the photo fills the content box.
          //
          // Wrapped in `min()` rather than declaring the cap bare. The cap only
          // wins while it is the smaller of the two, and at a large enough root
          // font it is not: 42rem passes 992px once the root exceeds about
          // 23.6px. Below that the `min()` is inert; above it, it keeps the
          // declaration equal to the rendered width instead of over-declaring.
          // Removing the rail widened the margin here -- the old threshold, with
          // a 742px box, was about 17.7px.
          sizes="(min-width: 1024px) min(42rem, calc(100vw - 32px)), calc(100vw - 32px)"
          className="h-auto w-full"
          priority
        />
      </div>
    </div>
  );
}
