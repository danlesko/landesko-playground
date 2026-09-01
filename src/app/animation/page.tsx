import type { Metadata } from "next";
import ProcessingDrawing from "@/components/ProcessingDrawing";
import PageHeading from "@/components/ui/PageHeading";
import { contentColumnClasses } from "@/components/ui/layout";

export const metadata: Metadata = {
  title: "Landesko's Playground - Animation",
  description: "Processing.JS Project",
};

export default function Animation() {
  return (
    <>
      {/* The canvas is inside the shared measure, same as the text. The reason for
          the old exception changed rather than the reasoning having been wrong: the
          column was a fixed 64rem, so capping the canvas took it from 1390px to 1024px
          at a 1440px viewport, which was too much to pay for alignment.

          The column is now 92% of the viewport, so the same cap costs 65px -- 1390 to
          1325 -- and buys a shared left edge with everything above it. It was 42px out
          before, which is exactly the sort of near-miss that reads as a mistake rather
          than a decision.

          Note the canvas does not always track the column: its wide branch is bound by
          viewport HEIGHT, so at 1920x900 it is 1145px inside a 1760px column and the
          cap is not what limits it. Alignment still holds, because the wrapper carries
          the measure rather than the canvas. */}
      <div className={contentColumnClasses}>
        <PageHeading>Animation</PageHeading>
        <p className="text-lg mt-2">
          The very first class I ever took in computer science at UNC Asheville
          introduced me to Processing.js where I first learned to code. Being a
          graphic design class, we learned how to create art with code. Here's
          an animation I created in Processing.js. Maybe I'll make some more
          over time!
        </p>

        <h2 className="text-2xl font-semibold mt-6">Fish Tank</h2>
        <p className="text-lg mt-2">
          This animation was modeled after my first project in processing.js.
          It's a simple fish tank simulation. Click to blow bubbles, let the
          goldfish follow your mouse, watch as the purple fish tries to avoid
          it! I did my best attempt to allow it to scale for mobile but there is
          some wonkiness.
        </p>
      </div>
      {/* `mt-6` because there was nothing at all here. Tailwind's preflight zeroes
          paragraph margins, so the canvas butted straight against the copy above it
          while the rest of this page keeps a clear rhythm -- `mt-6` before the `<h2>`
          and `mt-2` before its paragraph. The artwork was the one element on the page
          with no space above it, which read as a rendering fault rather than a layout
          choice. Matches the `<h2>` step rather than inventing a value. */}
      <div className={`${contentColumnClasses} mt-6`}>
        <ProcessingDrawing />
      </div>
    </>
  );
}
