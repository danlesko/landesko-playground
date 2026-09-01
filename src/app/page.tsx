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
      {/* An unconditional top margin. It used to be paired with a desktop override
          that zeroed it -- "space them while stacked, don't while side by side" --
          and with one column that override would remove the gap exactly where it is
          now needed. The override is described rather than named for the same reason
          as the grid utilities above.

          The photo keeps its own narrower cap while the text column widened to
          64rem. This is a portrait: at the column's full width it renders 1024x1364,
          taller than the viewport, and it pushed everything else off the first
          screen. 42rem holds it exactly where it was before the column grew, so the
          text gains the width and the photo does not.

          A per-element width, which the rest of this codebase deliberately avoids --
          but the reason it avoids them is siblings disagreeing about their measure,
          and an image is a leaf. It starts at the same left edge as the text and is
          simply narrower, which is an ordinary thing for a figure in a text column
          to be. */}
      <div className="mt-6 max-w-[calc(70vh*1286/1714)]">
        <Image
          src="/danPool.jpeg"
          alt="Lan Playing Pool"
          width="1286"
          height="1714"
          // BOUNDED BY HEIGHT, converted to a width. The photograph is a 1286x1714
          // portrait, so filling the content column made it 1325x1766 at a 1440px
          // viewport -- nearly twice a 900px fold. The bound is therefore `70vh`
          // expressed as the width that produces it, `70vh * 1286 / 1714`, which is
          // why that ratio appears here and in the wrapper's max-width.
          //
          // The conversion lives on the WRAPPER rather than as a max-height on the
          // image, and that is not a style preference -- it is what makes this
          // attribute checkable at all. Cap the height and leave the width automatic
          // and the image is sized as a replaced element from its INTRINSIC size,
          // which for a `w`-descriptor srcset is the candidate's width divided by its
          // computed density -- i.e. whatever `sizes` evaluated to when the candidate
          // was chosen. Measured directly in that form at a 720px viewport height: a
          // `w:384` candidate, natural 378x504, rendered 378x504. So the rendered
          // width WAS the declared width, and `sizes` was describing a length it had
          // itself produced. Any gap between selection time and measurement time then
          // shows up as a width mismatch, which is the failure this form produced
          // (declared 472.67px against a rendered 283.59px). That exact pair did not
          // reproduce under a deliberate sweep of settle times, so treat the specific
          // number as unexplained -- the circularity is the measured part, and it is
          // the part the wrapper form removes. With the image at a full-width rule
          // inside a width-capped wrapper the layout width comes from the containing
          // block, so it cannot depend on which candidate was fetched, or on whether
          // one was fetched at all.
          //
          // NO MEDIA QUERY, because none of the three terms has a breakpoint. The
          // photo's box is the smallest of: the height-derived cap above, the
          // column's `110rem` ceiling, and the column's own width -- `<main>`'s box
          // less a `max(0px, 4vw - 1rem)` gutter a side. All three are needed. The
          // `110rem` term used to be omitted on the grounds that a 42rem photo cap
          // was always smaller; a height-derived cap is not, and above roughly a
          // 1913px viewport width the column stops growing while the cap does not.
          // Codex caught that when the cap changed and the reasoning behind the
          // omission was not revisited.
          //
          // The attribute used to carry a `(min-width: 1024px)` branch purely to
          // mirror a `lg:`-prefixed column. That prefix was removed because it made
          // the content JUMP WIDER by 319px when the window was dragged narrower
          // across 1024px, and the branch went with it.
          //
          // `2rem` and not `32px`, and that distinction cost two rounds. `p-4` is
          // `1rem` a side; the two coincide at a 16px root and diverge at every
          // other. At a 24px root and a 1024px viewport the padding is 48px, so a
          // `32px` term over-declared by 16px. Tailwind's spacing scale is rem
          // throughout, so a px figure standing in for one of its utilities is only
          // ever accidentally right.
          //
          // There was briefly a third term, `- 4rem`, for an inset the column carried
          // while it painted a panel background. That went with the panel; if the
          // column ever gains padding again this needs it back.
          //
          // The e2e test varies the root font size as well as the viewport, which is
          // the only reason either mistake was visible.
          sizes="min(calc(70vh * 1286 / 1714), 110rem, calc(100vw - 2rem - 2*max(0px, 4vw - 1rem)))"
          className="h-auto w-full"
          priority
        />
      </div>
    </div>
  );
}
