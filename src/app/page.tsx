import Image from "next/image";
import PageHeading from "@/components/ui/PageHeading";
import TextLink, { textLinkClasses } from "@/components/ui/TextLink";
import { contentColumnClasses } from "@/components/ui/layout";

export default async function Home() {
  return (
    // One column at every width. This was `lg:grid lg:grid-cols-2` with the text
    // on the left and the photo on the right; #135 asked for the stacked
    // arrangement everywhere, which is what the page already did below `lg`.
    //
    // Capped on the shared measure rather than left to fill the content box. That
    // is not tidiness: with the grid gone the photo's width is the parent's, and
    // the parent is `100vw - 282px` -- 1670px at a 1920px viewport, which for a
    // 1286x1714 portrait is a 1670x2226 image. The cap is also what makes the
    // paragraph read at the same measure as every other route instead of making
    // this the one uncapped page.
    <div className={contentColumnClasses}>
      <PageHeading>Welcome to Landesko's Playground</PageHeading>
      <p className="text-lg mt-2">
        I'm a full-stack software engineer. This is my portfolio and blog — a
        place to experiment with new technologies and write about what I find.
      </p>
      <p className="mt-2 text-sm text-muted">
        Master's from Johns Hopkins University.
      </p>
      {/* A plain list rather than a second `<nav>` landmark: the sidebar is
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
      {/* Unconditional `mt-6`. It used to be `mt-6 lg:mt-0`, which meant "space
          them while stacked, don't while side by side" -- with one column the
          `lg:mt-0` would remove the gap exactly where it is now needed. */}
      <div className="mt-6">
        <Image
          src="/danPool.jpeg"
          alt="Lan Playing Pool"
          width="1286"
          height="1714"
          // From `lg` up the cap above decides this, not the viewport: the
          // content box is `100vw - 282px` (a 250px sidebar plus 32px of
          // `<main>` padding), which is 742px at the 1024px breakpoint and so
          // already wider than the 672px cap. It stays 672px from there up.
          // Below `lg` there is no cap and no sidebar beside it, so the photo
          // fills the content box.
          sizes="(min-width: 1024px) 672px, calc(100vw - 32px)"
          className="h-auto w-full"
          priority
        />
      </div>
    </div>
  );
}
