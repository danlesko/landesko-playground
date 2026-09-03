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
// Both were unsafe rather than merely redundant. The inner one is why a loader
// resolving to the wrong export used to compile clean — without it that is a
// TS2345. The outer one bypassed compatibility checking on the result outright,
// so it could have hidden a props mismatch as well.
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

const ProcessingDrawing = () => {
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
        // The ref OBJECT is passed, never its value. react-hooks 7, new in
        // eslint-config-next 16, cannot tell those apart at a call site and warns
        // that a function handed a ref "may read its value during render". This
        // one does not: `createFishTankSketch` returns the sketch function
        // immediately, without touching the ref. Everything that reads
        // `wrapperRef.current` is inside that function -- once at sketch
        // construction, then from `setup()` and on resize -- and p5 only runs it
        // when `react-p5-wrapper` instantiates the sketch from an effect. So every
        // read is after mount. Handing a ref to an imperative library this way is
        // the supported pattern, so there is nothing to restructure.
        // eslint-disable-next-line react-hooks/refs
        sketch={createFishTankSketch(wrapperRef, prefersReducedMotion)}
      />
    </div>
  );
};

export default ProcessingDrawing;
