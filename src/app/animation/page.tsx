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
      {/* The text gets the shared measure; `<ProcessingDrawing />` below does NOT,
          and that is the one deliberate exception on the site. The canvas sizes
          itself from its container, so capping it would shrink the drawing rather
          than a line length -- at a 1440px viewport it would go from 1390px to the
          column's 1024px. `ui/layout.ts` says not to cap it and this is why.
          
          They do not share a left edge, and they are not meant to. They DO share a
          centre line, but only because the canvas centres itself in its own wrapper
          -- see ProcessingDrawing. Without that it sat at the content box's left
          edge and the two centres were 9px apart, which is what an earlier version
          of this comment wrongly described as already centred. */}
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
      <ProcessingDrawing />
    </>
  );
}
