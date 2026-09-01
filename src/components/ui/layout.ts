// The one content measure. Every route carries it on its own top-level wrapper --
// including the error boundaries, the 404 and the loading states, which render in place
// of a page and so need their own. Cards, forms, the create skeleton and the blog
// heading row do NOT carry it: they used to, and the result was pages where a form knew
// its width and the heading above it did not.
//
// The p5 canvas on /animation used to be a deliberate exception, on the grounds that it
// sizes itself from its container so a cap shrinks the drawing rather than the line
// length. That was a real cost against a fixed 64rem column -- it took the canvas from
// 1390px to 1024px. Against a proportional column it is 65px, and the price of the
// exception was that the canvas sat 35-64px left of every other element on the page. It
// now carries the measure like everything else.
//
// CENTRED, WITH PROPORTIONAL GUTTERS. Three utilities, and each is doing something the
// others cannot.
//
// THE GUTTER IS PROPORTIONAL, which is the whole trick. A fixed cap leaves the gutters
// to be whatever remains, so they GROW as the screen does -- a 64rem column left 208px
// either side at 1440px and 448px at 1920px, which is the opposite of what a wide screen
// should do. Here the gutter is `4vw` a side, so the content takes MORE of the screen the
// larger it gets, not less.
//
// `max(0px, 4vw - 1rem)` and not a flat percentage, and the `max()` is the part that
// matters. `<main>` already contributes `1rem` a side, so a flat `92%` would stack a
// second gutter on top of it and narrow phones -- measured, 358px to 329px at a 390px
// viewport, a change nobody asked for. Subtracting that `1rem` means this contributes
// nothing until `4vw` exceeds it, which is a 400px viewport, and below that the column
// fills `<main>`'s box exactly as it did before.
//
// `mx-auto` centres it. The `110rem` ceiling is for ultrawide displays and binds above a
// 1913px viewport at a 16px root, which is `1760 / 0.92` -- not the 2100px this comment
// used to claim, and the gap matters because 1920 is a common desktop width that sits on
// the binding side of it. Two things downstream have to account for the ceiling rather
// than assume it never binds first: the hero photo's `sizes`, and the fish tank's
// height-led width, which keeps growing with viewport height after this has stopped
// growing with viewport width.
//
// MONOTONIC AND CONTINUOUS, which is the property this must not lose. Below the 400px
// crossover the width is `100vw - 2rem`; above it the two `1rem` terms cancel and it is
// exactly `0.92 * 100vw`. Both are non-decreasing in the viewport and they agree at the
// crossover -- 368px either way at 400px -- so there is no step and it cannot get wider
// as the window gets smaller.
//
// That was not true before. The cap used to be `lg:`-prefixed, so below 1024px the
// column filled the viewport and at 1024px it snapped to 672px -- dragging a window
// narrower across that line made the content suddenly 319px WIDER. Measured on
// /contact at the time:
//
//   viewport   content   % of viewport
//     390px      358px      92%
//    1023px      991px      97%
//    1024px      672px      66%   <- collapsed by 319px
//    1440px      672px      47%
//    2560px      672px      26%
//
// Any change here should be checked against that: pick a few widths either side of
// every breakpoint involved and confirm the width never decreases as the viewport
// grows. The e2e suite asserts alignment but not this, because a sweep is the wrong
// shape for it.
//
// WHAT IT COSTS, and it is the thing to revisit rather than the proportion: prose lines
// are long. An earlier version of this file argued against exactly that, calling a
// 1139px line the over-long-measure problem, and this is wider than that on any large
// screen. The tension is real and not resolvable by choosing a different percentage --
// filling the screen and keeping a 65-75 character measure are different goals. If the
// lines matter more, the fix is a narrower measure for LONG-FORM PROSE specifically,
// applied inside this column rather than by shrinking it.
//
// The hero photo already does exactly that, and it is worth knowing WHY its cap is not a
// fixed measure. It is a 1286x1714 portrait, so at the column's full width it rendered
// 1766px tall at a 1440px viewport -- twice a fold. Its cap is therefore derived from a
// height, `70vh` converted to the width that produces it, which is a bound this column
// cannot express and should not try to.
//
// HISTORY, because two earlier shapes are worth not re-deriving:
//
//   - It replaced a 600px min-width floor paired with a half-width, which was wrong at
//     both ends: the floor beat the half-width, so the column stayed 600px until its
//     parent reached 1200px and only then tracked the viewport, uncapped after that. A
//     cap is the only rule that is right at both ends.
//   - It was briefly centred, with the space either side filled in a darker tone and the
//     column painting the page colour back over it as a panel. Both were reverted on the
//     owner's call. One thing learned there is worth keeping: painting a background here
//     put the first heading of four routes OUT of axe's contrast gate, because axe
//     requires the first background-painting ancestor to fully encompass the TEXT rects
//     and a column whose edge meets the text does not. If a fill ever comes back, it
//     needs padding and the a11y suite will say so.
//
// `global-error.tsx` renders its own document with no layout, so it carries the measure
// itself and its parent is the full body width rather than `<main>`'s content box.
export const contentColumnClasses =
  "mx-auto w-[calc(100%-2*max(0px,4vw-1rem))] max-w-[110rem]";
