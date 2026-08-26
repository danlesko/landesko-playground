// The bordered panel that blog rows, error boundaries, the 404 and the loading
// skeletons all sit in. It was written out by hand in eight places, which is what
// #6 filed: the eight copies expressed the same seven utilities in two different
// sequences.
//
// A class string rather than a wrapper component, following form.ts and
// button.ts. For a bare div a component would work too, but this repo has no
// `tailwind-merge`, so a component taking `className` cannot let a caller
// override anything -- both classes would land and stylesheet order would
// decide. A string that callers concatenate makes the additive-only behaviour
// obvious instead of surprising.
//
// Height and overflow are deliberately NOT here, and the reason is weaker for
// one than the other, so it is worth separating. `overflow-auto` genuinely
// cannot be defaulted: two sites want it absent, and there is no way for them to
// subtract it. Height *could* be -- `min-h-32` in here plus a caller's `h-32`
// resolves to the same 8rem box, because they set different properties and agree
// on the value, so it would be harmless rather than broken. It is left out
// anyway to keep the two dimensions symmetric: a primitive where one of the two
// is overridable and the other silently is not invites exactly the mistake this
// comment would have to warn about.
//
// The width pair is the interesting part to have in one place. The used width is
// `max(600px, half of the enclosing column)` -- `lg:min-w-[600px]` floors what
// `lg:w-1/2` asks for -- so the panel stops being 600px wide only once that
// column passes 1200px. That is the contradiction #6 item 4 is still open about.
// Nothing about it changes here.
//
// It is now one line for these eight, which is not the whole of item 4: the two
// create/contact forms and the create skeleton carry the same width pair without
// being cards, so a full answer still touches four places. Those three are
// item 3's `PageShell` question, not this one.
export const cardClasses =
  "mt-4 p-4 rounded-lg border border-border lg:min-w-[600px] lg:w-1/2";
