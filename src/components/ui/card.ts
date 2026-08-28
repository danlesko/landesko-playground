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
// the words in a comment as class candidates, so quoting one keeps emitting its
// rule.
//
// MEASURED, because the blanket version of that rule is the wrong shape and this
// file was carrying it. Built the stylesheet twice -- once normally, once with the
// content globs pointed at a comment-free copy of src produced by the TypeScript
// compiler -- and diffed the emitted rules. Only eight rules differed, worth
// 12,529 bytes, and ONE of them was worth 12,309 of it.
//
// That one was `prose`. Not a utility: `@tailwindcss/typography` was a declared
// plugin that nothing in this app used, and the plugin expands that single
// candidate into 88 rules. The word appeared in exactly three comments, two of
// which were warnings about this very hazard. Removing the plugin took the
// stylesheet from 121,409 to 109,100 bytes, 10.1% of it, and `max-w-prose` --
// which is a core width utility, and the only form rewind-ui actually uses --
// survived, as it had to.
//
// The other seven cost 220 bytes between them. So the durable lesson is not "never
// write a utility word in a comment", which contorts prose for twenty bytes a
// time; it is that a PLUGIN can make one word cost a tenth of the stylesheet, and
// that the way to know is to build it twice and diff rather than to guess. The
// seven cheap ones are left in place deliberately, priced rather than avoided.
import { contentColumnClasses } from "@/components/ui/layout";

export const cardClasses = `mt-4 p-4 rounded-lg border border-border ${contentColumnClasses}`;
