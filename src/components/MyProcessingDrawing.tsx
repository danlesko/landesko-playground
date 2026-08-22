"use client";

import dynamic from "next/dynamic";
import React from "react";

import { createFishTankSketch } from "./fishTankSketch";

// `ssr: false` is load-bearing rather than tidiness: p5 touches `window` at
// module scope, so a static import breaks the server render.
//
// This call used to carry two casts — an inner `mod.ReactP5Wrapper as any` and
// an outer `as unknown as React.NamedExoticComponent<P5WrapperProps>` — and
// neither was needed: `dynamic` infers the props from the loader on its own.
// The inner `as any` was the one that cost something, because it erased the
// loader's return type before the outer assertion could look at it, so a loader
// resolving to the wrong export compiled clean. Without it that is a TS2345.
const ReactP5Wrapper = dynamic(
  () => import("react-p5-wrapper").then((mod) => mod.ReactP5Wrapper),
  { ssr: false },
);

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
