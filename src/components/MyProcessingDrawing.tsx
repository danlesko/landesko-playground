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

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeToReducedMotion(onChange: () => void) {
  const query = window.matchMedia(REDUCED_MOTION_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

const getReducedMotion = () => window.matchMedia(REDUCED_MOTION_QUERY).matches;

// The server cannot know the preference, so it renders as if motion were fine.
// That costs nothing: the p5 wrapper is a client-only dynamic import, so no
// canvas exists until after the real value is known.
const getReducedMotionOnServer = () => false;

const MyProcessingDrawing = () => {
  const wrapperRef = React.useRef<HTMLDivElement>(null);
  const prefersReducedMotion = React.useSyncExternalStore(
    subscribeToReducedMotion,
    getReducedMotion,
    getReducedMotionOnServer,
  );

  // A new sketch identity on toggle is the point, not a missed memoisation:
  // ReactP5Wrapper responds by tearing the instance down and building it again,
  // which is what applies the change without a reload.
  return (
    <div ref={wrapperRef}>
      <ReactP5Wrapper
        sketch={createFishTankSketch(wrapperRef, prefersReducedMotion)}
      />
    </div>
  );
};

export default MyProcessingDrawing;
