// The one content measure. Cards, the two forms, the create skeleton and the
// blog list's heading row all share it, so the column has a single width instead
// of four opinions about it.
//
// It replaces a 600px min-width floor paired with a half-width, which was wrong
// at both ends. The floor beat the half-width, so the column stayed 600px until
// its parent reached 1200px -- a 1482px viewport, given the 250px sidebar and
// 32px of padding -- and only then began to track the viewport, with nothing
// capping it after that. Measured against the old rule:
//
//   viewport   parent   old      new
//   1024        742     600      672
//   1280        998     600      672
//   1536       1254     627      672
//   1920       1638     819      672
//   2560       2278    1139      672
//
// So the old rule produced a 1139px line on a wide monitor, which is the same
// over-long-measure problem #6 item 3 raises about the uncapped routes. Dropping
// the floor and keeping the half-width would have gone the other way and given a
// 371px column at 1024px, narrower than a phone. A cap is the only option that
// is right at both ends.
//
// 2xl rather than 3xl on purpose: it is the closest constant to the 600-627px the
// column actually had on the common desktop sizes, so this removes the
// contradiction without also reshaping the page. 3xl (768px) is the defensible
// alternative if the column now reads as too narrow on a large screen.
//
// Not applied to the p5 canvas on /animation. That measures the box it sits in,
// and its wide branch can already ask for more width than that box has -- 855px
// at 1280x720 -- so capping the parent at 672px would put the canvas outside its
// wrapper and trip the overflow guard. The canvas needs its own decision, not
// this one.
export const contentColumnClasses = "max-w-2xl";
