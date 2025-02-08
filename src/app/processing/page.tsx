import type { Metadata } from "next";
import MyProcessingDrawing from "@/components/MyProcessingDrawing";

export const metadata: Metadata = {
  title: "Landesko's Playground - Processing",
  description: "Processing.JS Project",
};

export default function Processing() {
  return (
    <>
      <h2 className="text-4xl font-bold">Processing.js Drawings</h2>
      <p className="text-lg mt-2">
        The very first class I ever took in computer science at UNC Asheville
        introduced me to processing.js where I first learned to code some very
        basic stuff.
      </p>

      <h2 className="text-2xl font-bold mt-3">Fish Tank</h2>
      <MyProcessingDrawing />
    </>
  );
}
