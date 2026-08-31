// The one content measure. Every route carries it on its own top-level wrapper --
// including the error boundaries, the 404 and the loading states, which render in place
// of a page and so need their own. Cards, forms, the create skeleton and the blog
// heading row do NOT carry it: they used to, and the result was pages where a form knew
// its width and the heading above it did not.
//
// The p5 canvas on /animation is the one deliberate exception. It sizes itself from its
// container, so capping it shrinks the drawing rather than the line length.
//
// UNPREFIXED, AND THAT IS THE POINT. Prefixing it with `lg:` produced a discontinuity
// that reads as a bug rather than a decision: below the breakpoint the column filled the
// viewport, and at 1024px it snapped to the cap. Measured on /contact beforehand --
//
//   viewport   content   % of viewport
//     390px      358px      92%
//     768px      736px      96%
//    1023px      991px      97%
//    1024px      672px      66%   <- collapses by 319px
//    1440px      672px      47%
//    2560px      672px      26%
//
// so dragging a window narrower across 1024px made the content suddenly WIDER by 319px.
// Unprefixed, the width is `min(cap, 100vw - 2rem)` everywhere, which is monotonic by
// construction and cannot grow as the viewport shrinks.
//
// 64rem is chosen rather than picked. Continuity needs the cap to be at least the
// content box at the old breakpoint -- 1024 - 2rem = 992px -- so anything smaller either
// reintroduces a step or narrows the widths below it. 64rem is the smallest standard
// step at or above 992px, which means every width below 1024px is unchanged (the
// viewport constrains the column there, not the cap) while 1440px goes from 47% to 71%.
//
// WHAT IT COSTS, and this is the part to revisit if anything: prose lines get longer.
// An earlier version of this file argued against exactly that, calling a 1139px line the
// over-long-measure problem, and 1024px at 18px text is about 114 characters where 65-75
// is the usual guidance. That argument was not wrong -- it is in tension with a
// continuous column, because continuity forces at least 992px at a 1024px viewport. If
// the long lines matter more than the fill, the fix is a narrower measure for LONG-FORM
// PROSE specifically, not a smaller cap here, which would bring the step back.
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
export const contentColumnClasses = "max-w-5xl";
