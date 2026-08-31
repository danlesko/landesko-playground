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
  // Centred, not left-anchored. The canvas is deliberately not on the site's content
  // measure -- capping it would take it from 1390px to 672px at a 1440px viewport --
  // but that left it starting at the content box's left edge while the page's text is
  // centred, so the two had centre lines 9px apart. Centring here fixes the alignment
  // without touching the canvas's dimensions.
  //
  // Safe for the sizing logic: `measureAvailableWidth` reads THIS element's
  // `clientWidth`, and a full-width flex container has the same width as the block it
  // replaces. The canvas is sized by p5 rather than by the layout, so it is a flex
  // item that shrinks to its own content instead of stretching.
  return (
    <div ref={wrapperRef} className="flex justify-center">
      <ReactP5Wrapper
        sketch={createFishTankSketch(wrapperRef, prefersReducedMotion)}
      />
    </div>
  );
};

export default ProcessingDrawing;
