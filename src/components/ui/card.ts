// The bordered panel that blog rows, error boundaries, the 404 and the loading
// skeletons all sit in. It was written out by hand in eight places, which is what
// #6 filed: the eight copies had drifted into three different class orderings
// while meaning the same thing.
//
// A class string rather than a wrapper component, following form.ts and
// button.ts. For a bare <div> a component would work too, but this repo has no
// `tailwind-merge`, so a component taking `className` cannot let a caller
// override anything -- both classes would land and stylesheet order would
// decide. A string that callers concatenate makes the additive-only behaviour
// obvious instead of surprising.
//
// Height and overflow are deliberately NOT here. The eight sites genuinely
// differ: five want `min-h-32` so the panel grows with its content, the two
// skeletons and the blog row want a fixed `h-32`, and only some want
// `overflow-auto`. Defaulting either one would mean callers fighting it with a
// competing utility, which is exactly what cannot work here.
//
// The width pair is the interesting part to have in one place. `lg:min-w-[600px]`
// beats `lg:w-1/2`, so the panel is a fixed 600px until its column reaches
// 1200px and only then goes fluid -- the contradiction #6 item 4 is still open
// about. Nothing about that is changed here, but it is now one line to change
// rather than eight.
export const cardClasses =
  "mt-4 p-4 rounded-lg border border-border lg:min-w-[600px] lg:w-1/2";
