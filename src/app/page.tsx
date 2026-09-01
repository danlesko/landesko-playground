import Image from "next/image";
import PageHeading from "@/components/ui/PageHeading";
import TextLink, { textLinkClasses } from "@/components/ui/TextLink";
import { contentColumnClasses } from "@/components/ui/layout";

export default async function Home() {
  return (
    // The heading spans the full measure; below it, prose and links sit beside the
    // photo from `lg` up and stack below it under that. #140.
    //
    // The page has now been one track, two, and two again, so the history is worth
    // one paragraph. It was a two-track layout until #135 asked for stacking
    // everywhere. #138 then bounded the photo by HEIGHT, which is what makes two
    // tracks worth revisiting: a height-bounded portrait is about 473px wide at a
    // 1440x900 viewport inside a 1325px column, so a single track leaves most of the
    // width beside it empty. This arrangement is NOT the pre-#135 one -- the heading
    // now spans above both tracks rather than sitting in the left one, and the
    // photo's width comes from its height bound rather than from a track fraction.
    //
    // Track utilities are described rather than named throughout this file, and that
    // is a real constraint rather than a style: Tailwind's content globs include
    // these comments, so naming a utility that no class string uses emits its rule
    // into the stylesheet from the comment alone.
    <div className={contentColumnClasses}>
      <PageHeading>Welcome to Landesko's Playground</PageHeading>
      {/* The gap under the heading lives HERE rather than on the first paragraph,
          which is not cosmetic. Side by side, a top margin on the paragraph offsets
          only the left track, so the photo starts 8px above the first line of prose
          -- 12px at a 24px root, since the scale is rem. Putting it on the row keeps
          both tracks starting at the same place at every root size.

          `lg:items-start` rather than a stretch: the two tracks have unrelated
          heights and nothing should be asked to match the other. */}
      <div className="mt-2 lg:flex lg:items-start lg:gap-x-8">
        {/* `lg:min-w-0` because a flex item's automatic minimum size is its content,
            so without it this track refuses to shrink below its longest line and
            pushes the photo out of the row.

            Be exact about what that does and does not buy, because the first version
            of this comment claimed too much: `min-w-0` lets the track shrink, it does
            NOT make an unbreakable token wrap. A single token longer than the track
            would still overflow the track -- it would just stop widening the row
            first. Nothing here needs `break-words` the way the contact form's error
            notice does, because that notice can contain an arbitrary token and this
            copy is authored; if user-supplied text ever lands in this track, it will.
            */}
        <div className="lg:min-w-0 lg:flex-1">
          {/* NO READING MEASURE on this copy, and that is a decision rather than an
              omission -- it was added and then removed on the owner's call. Worth the
              paragraph because the line length here looks like an obvious thing to
              "fix", and fixing it costs more than it buys.

              The lines ARE long: measured, the first paragraph sets 90 characters at a
              1440px viewport and 135 at 1990px, against the usual 45-75 guidance.

              A 38rem cap fixed that -- 70 characters everywhere -- and made the page
              look worse. The track is the flex remainder, so capping the text does not
              shrink the track; the text just stops short and leaves a hole between it
              and the photo. Measured: 244px at 1440x900 and 627px at 1990x1000. A gap
              in the middle of the composition reads as breakage in a way a long line
              does not.

              The real constraint is that this is roughly 170px of copy in a 1760px row,
              so the empty space exists under any arrangement and the only question is
              where it goes. Filling the track puts it outside the content instead of
              inside it.

              If this comes back, the thing that would ACTUALLY fix it is more copy in
              this track -- the space is the problem, not the measure. Capping the text
              without also closing the gap just moves the defect. */}
          <p className="text-lg">
            I'm a full-stack software engineer. This is my portfolio and blog —
            a place to experiment with new technologies and write about what I
            find.
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
        </div>
        {/* Three width rules, and each is load-bearing.

            `mt-6` spaces the photo from the prose while stacked; `lg:mt-0` removes
            that once they are side by side, where it would only push the photo down.
            This override existed before #135, was removed with the second track, and
            is back with it.

            `max-w-[...]` is the height bound from #138, converted to a width. It
            applies at EVERY width because the photo is a portrait at 1286x1714: left
            to fill its box it renders 1760x2346 at a wide viewport, several times a
            fold. `70vh` is the bound and `* 1286 / 1714` is what turns it into the
            width that produces it.

            `lg:w-[min(...,40%)]` is a floor under the PROSE, not a design ratio. The
            height bound alone would let the photo take as much of the row as the
            viewport is tall, and the widest it gets relative to the row is at the
            `lg` boundary -- at 1024x900 an unclamped photo is 473px of a 942px row,
            leaving 437px of prose. 40% holds it to 377px and leaves 533px. Which of
            the two terms binds changes with the viewport's proportions rather than
            its size: 40% binds at 1024x900, 1280x900 and 2560x1440, the height bound
            binds at 1280x800 and 1440x900.

            `lg:shrink-0` so the resolved width survives the flex pass rather than
            being treated as a starting point.

            One consequence to accept rather than fix: the photo gets NARROWER as the
            window widens across 1024px -- 473px to 377px at a 900px height -- because
            it stops having the row to itself. The outer measure stays monotonic, which
            is the property #138 was filed over; this is a child of it, and stacking
            below `lg` while sharing above it cannot be continuous. */}
        <div className="mt-6 max-w-[calc(70vh*1286/1714)] lg:mt-0 lg:w-[min(calc(70vh*1286/1714),40%)] lg:shrink-0">
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
            // TWO BRANCHES, because #140 gave the photo a different width rule either
            // side of `lg`. Each branch mirrors the wrapper's own classes exactly, and
            // the mirroring is the whole contract -- if one moves and the other does
            // not, the browser picks a candidate for a width the image does not have,
            // and nothing about the page announces it.
            //
            //   at `lg`+  the photo is `min(height-derived cap, 40% of the row)`, and
            //             the row is the content column, so the 40% is taken of
            //             `min(110rem, 100vw - 2rem - 2*max(0px, 4vw - 1rem))`. The gap
            //             does NOT appear: a percentage width on a flex item resolves
            //             against the flex parent's content box before free space is
            //             distributed, so the gap comes out of the prose track only.
            //   below     the photo has the row to itself, so it is the smallest of the
            //             cap, the `110rem` ceiling and the column's own width.
            //
            // A branch was here before and was removed in #138 for a specific reason
            // worth not repeating: it existed to mirror a `lg:`-prefixed COLUMN cap,
            // and that cap made the content jump 319px WIDER when the window was
            // dragged narrower across 1024px. This branch mirrors a prefixed rule on
            // the PHOTO instead, and the column's own cap stays unprefixed, so the
            // defect does not come back with it.
            //
            // The `110rem` term is inert in the second branch -- below 1024px the
            // column cannot reach 1760px -- and is kept anyway so the expression states
            // the same rule the CSS does. It was once omitted from the first branch on
            // the grounds that a 42rem photo cap was always the smaller; a
            // height-derived cap is not, and above a 1913px viewport the column stops
            // growing while the cap does not.
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
            // the only reason either mistake showed up at all.
            sizes="(min-width: 1024px) min(calc(70vh * 1286 / 1714), calc(0.4 * min(110rem, 100vw - 2rem - 2*max(0px, 4vw - 1rem)))), min(calc(70vh * 1286 / 1714), 110rem, calc(100vw - 2rem - 2*max(0px, 4vw - 1rem)))"
            className="h-auto w-full"
            priority
          />
        </div>
      </div>
    </div>
  );
}
