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
// Width is not decided here. Every page now carries the shared measure on its own
// top-level wrapper (#138), so a card fills the column it is in. It used to append
// `contentColumnClasses` itself, which
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
// file was carrying it. The stylesheet was built against two copies of src that
// were transpiled identically and differed ONLY in `removeComments`. Holding the
// transform constant is the whole point: an earlier attempt compared raw source
// against transpiled source, which also elides types and imports, so it could not
// attribute the difference to comments at all.
//
// Result, with the transform held constant: **eight candidate names** differed,
// not eight rules. Seven of them are one rule each and cost 220 bytes together.
// The eighth was `prose`, and it alone expanded into 88 rules worth 12,309 bytes.
//
// `prose` is not a utility. It came from `@tailwindcss/typography`, a declared
// plugin that nothing in this app used. Removing it took the stylesheet from
// 121,409 to 109,100 bytes -- 10.1% -- and the before and after files turned out to
// share an identical 4,964-byte prefix and 104,136-byte suffix, so the removal was
// literally one contiguous block and nothing else moved. `max-w-prose` survived,
// as it had to: that one is a CORE width utility and is the only form rewind-ui
// actually uses.
//
// So the durable lesson is not "never write a utility word in a comment", which
// contorts a sentence for about thirty bytes at a time. It is that a PLUGIN can
// make a single word cost a tenth of the stylesheet, and that the way to tell the
// expensive words from the cheap ones is to build twice and diff. The seven cheap
// ones are left in place deliberately -- an explicit 220-byte budget, not a claim
// that core utilities are free. Some core utilities carry keyframes and would not
// be.

export const cardClasses = "mt-4 p-4 rounded-lg border border-border";
