"use client";

import dynamic from "next/dynamic";
import React from "react";
import { P5WrapperProps } from "react-p5-wrapper";

import { createFishTankSketch } from "./fishTankSketch";

// Deferred, not just tidied: p5 touches `window` at module scope, so a static
// import breaks the server render. `ssr: false` is what makes that safe and is
// load-bearing.
//
// The explicit type argument is what removes the two casts this used to carry.
// `ReactP5Wrapper` is a `MemoExoticComponent` wrapping a *generic* function, and
// `dynamic` cannot infer props through that — the old code silenced it with an
// inner `as any` and then re-asserted the result with an outer
// `as unknown as NamedExoticComponent<P5WrapperProps>`. The inner cast made the
// outer one unfalsifiable: any prop mismatch would have been erased before the
// assertion could catch it. Naming the props up front lets both go, and `sketch`
// is genuinely part of `P5WrapperProps` (via `InputProps`), so nothing is lost.
const ReactP5Wrapper = dynamic<P5WrapperProps>(
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
