import type { Metadata } from "next";
import MyProcessingDrawing from "@/src/components/MyProcessingDrawing";

export const metadata: Metadata = {
  title: "Landesko's Playground - Animation",
  description: "Processing.JS Project",
};

export default function Animation() {
  return (
    <>
      <h2 className="text-4xl font-bold">Animation</h2>
      <p className="text-lg mt-2 lg:w-3/4">
        The very first class I ever took in computer science at UNC Asheville
        introduced me to Processing.js where I first learned to code. Being a
        graphic design class, we learned how to create art with code. Here's an
        animation I created in Processing.js. Maybe I'll make some more over
        time!
      </p>

      <h2 className="text-2xl font-bold mt-3">Fish Tank</h2>
      <p className="text-lg mt-1 lg:w-3/4">
        This animation was modeled after my first project in processing.js. It's
        a simple fish tank simulation. Click to blow bubbles, let the goldfish
        follow your mouse, watch as the purple fish tries to avoid it! I did my
        best attempt to allow it to scale for mobile but there is some
        wonkiness.
      </p>
      <MyProcessingDrawing />
    </>
  );
}
