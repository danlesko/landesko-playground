import Image from "next/image";
import PageHeading from "@/components/ui/PageHeading";
import TextLink, { textLinkClasses } from "@/components/ui/TextLink";

export default async function Home() {
  return (
    // Two columns from `lg` up, and deliberately with no `gap`. A grid gap is
    // taken out of the tracks, so `gap-8` would make each column
    // `calc((100vw - 282px - 2rem) / 2)` -- 16px narrower than the `sizes` below
    // declares. The gutter is `lg:pr-8` on the text column instead, which leaves
    // the image track at exactly half the content box and the contract intact.
    <div className="lg:grid lg:grid-cols-2">
      <div className="lg:pr-8">
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
      </div>
      {/* Space between the two halves only while they are stacked. From `lg` up
          they sit in adjacent columns, where a top margin would just push the
          photo out of line with the heading. */}
      <div className="mt-6 lg:mt-0">
        <Image
          src="/danPool.jpeg"
          alt="Lan Playing Pool"
          width="1286"
          height="1714"
          // The sidebar is a constant 250px from `lg` up and <main> adds 16px of
          // padding either side, so this column is never the 100vw that the
          // removed `layout="responsive"` prop was declaring on its behalf.
          sizes="(min-width: 1024px) calc((100vw - 282px) / 2), calc(100vw - 32px)"
          className="h-auto w-full"
          priority
        />
      </div>
    </div>
  );
}
