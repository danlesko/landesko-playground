"use client";

import dynamic from "next/dynamic";
import React from "react";
import { P5WrapperProps } from "react-p5-wrapper";

import { createFishTankSketch } from "./fishTankSketch";

// Importing this way removes window is not defined error
const ReactP5Wrapper = dynamic(
  () => import("react-p5-wrapper").then((mod) => mod.ReactP5Wrapper as any),
  {
    ssr: false,
  },
) as unknown as React.NamedExoticComponent<P5WrapperProps>;

const MyProcessingDrawing = () => {
  const wrapperRef = React.useRef<HTMLDivElement>(null);

  return (
    <div ref={wrapperRef}>
      <ReactP5Wrapper sketch={createFishTankSketch(wrapperRef)} />
    </div>
  );
};

export default MyProcessingDrawing;
