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
// Width is no longer decided here. It comes from `contentColumnClasses`, which
// the two forms, the create skeleton and the blog list's heading row share, so
// the column has one measure rather than four opinions. The min-width floor and
// half-width pair this used to carry, and the contradiction between them, are
// gone -- see ./layout.ts for what replaced them and why.
//
// Neither old class is named literally anywhere here on purpose: Tailwind reads
// comment prose as class candidates, so quoting one keeps emitting its rule.
import { contentColumnClasses } from "@/components/ui/layout";

export const cardClasses = `mt-4 p-4 rounded-lg border border-border ${contentColumnClasses}`;
