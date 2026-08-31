// The one content measure. Cards, the two forms, the create skeleton and the
// blog list's heading row all share it, so the column has a single width instead
// of four opinions about it.
//
// It replaces a 600px min-width floor paired with a half-width, which was wrong
// at both ends. The floor beat the half-width, so the column stayed 600px until
// its parent reached 1200px -- a 1482px viewport, given the 250px rail of the day and
// 32px of padding -- and only then began to track the viewport, with nothing
// capping it after that. Measured against the old rule:
//
// The `parent` column below is `100vw - 282px`, which is what it was when this
// was written: a 250px left rail plus 32px of `<main>` padding. #136 moved the nav
// to a band under the header, so the parent is now `100vw - 32px` and every figure
// in that column is 250px larger -- 992 / 1248 / 1504 / 1888 / 2528.
//
// The table is kept as it stands because it is a record of the comparison that
// chose 672, and that comparison was made against these numbers. The conclusion
// survives the change and in fact strengthens: the cap bound at every desktop
// width already, since 672 < 742, and it binds by a wider margin against 992. What
// no longer holds is the "never NARROWER than it was" calibration below, which was
// measured against the old parents.
//
// `global-error.tsx` renders its own document with no nav at all, so it always had
// the full body width and these numbers never described it.
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
// 672px is not the *closest* constant to the old 600-627px -- `xl` at 576px is
// nearer. It is chosen so the column is never NARROWER than it was on the sizes
// where it was stable: 600 to 672 at 1024-1440, 627 to 672 at 1536, and only
// above that does the cap bite, which is the runaway it exists to stop. `xl`
// would have shrunk every desktop. 3xl (768px) is the alternative if this now
// reads too narrow.
//
// Not applied to the p5 canvas on /animation. That measures the box it sits in,
// and its wide branch can already ask for more width than that box has -- 855px
// at 1280x720 -- so capping the parent would put the canvas outside its wrapper.
// Note the existing overflow guards would NOT catch that: they run at 320px and
// at 1280x1024, and neither lands where a 672px cap and an 855px request meet.
// So the canvas needs its own decision, and it would not fail loudly first.
//
// THE MEASURE IS STILL 42rem, which is worth being explicit about because the
// max-width no longer says so. The column paints --background over the darker
// --backdrop gutters, and text flush against that panel edge looks wrong, so it
// carries `lg:px-8` -- 2rem each side. The cap is therefore 46rem and the CONTENT
// box is 46 - 4 = 42rem, unchanged. Change one of those two numbers without the
// other and the measure moves silently; the hero's `sizes` attribute declares
// 42rem and its e2e test is what would catch it.
//
// THE VERTICAL PADDING IS NOT DECORATION, and this is the one to leave alone.
// Painting a background here made axe unable to evaluate the contrast of the first
// heading on four desktop routes -- /, /credits, /contact and /animation, the ones
// the a11y matrix covers -- reporting `elmPartiallyObscured`.
//
// The mechanism, read out of axe-core rather than guessed: for the first background
// -painting element in the stack it requires
// `bgElmStyle.display !== "inline" && fullyEncompasses(bgElm, textRects)`, and gives
// up with this flag when that fails. The test is against the TEXT rects, not the
// element's box. With no vertical padding the heading's text rects were not fully
// inside this column, so the check bailed. Nothing overlapped it -- every element's
// box was compared against the heading's and none intersected.
//
// An earlier version of this comment blamed exactly-coincident edges. That was
// wrong: the containment comparison is inclusive, so coincident edges pass on their
// own. What `lg:py-6` supplies is slack around the text rects, which is a different
// thing and fragile in a different way -- shrink it far enough and the flag comes
// back.
//
// Established by bisecting the three changes against axe directly: dropping
// `lg:bg-background` cleared the flag, dropping the backdrop or the horizontal inset
// did not.
//
// So removing this would not just tighten the spacing; it would take those headings
// back out of the contrast gate while `violations` stayed empty. The a11y suite does
// fail, because it asserts the known-unevaluable set rather than only violations --
// but it names axe rather than this line, which is why this is written down here.
//
// `lg:`-prefixed, matching every rule it replaces. Those were all `lg:`-only, so
// below 1024px the column was unconstrained and filled its parent. An unprefixed
// cap would have quietly narrowed the 705-1023px band -- 736px to 672px on a
// 768px tablet -- which is a change nobody asked for and which the measurements
// above do not cover. Keeping the prefix makes the claim exact: nothing below
// `lg` moves.
export const contentColumnClasses =
  "lg:mx-auto lg:max-w-[46rem] lg:bg-background lg:px-8 lg:py-6";
