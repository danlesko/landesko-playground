// rewind-ui's `variant="primary"` fills with #a855f7 under a white label, which
// measures 3.96:1 — short of the 4.5:1 that 14px bold needs, and 14px bold is
// not large text (that starts at 18.66px bold). Its hover fill, #9333ea, already
// passes, so this shifts the whole scale one step darker and keeps hover a
// visible change rather than collapsing it onto the resting colour.
//
// Kept as a class string rather than a wrapper component for the same reason as
// ./form.ts: a wrapper would mean re-exporting the library's prop surface.
// `Button` puts its own classes and this one through tailwind-merge, so these
// replace the library's background utilities instead of racing them at equal
// specificity. `disabled:` is deliberately not overridden — WCAG exempts
// inactive controls, and a disabled button that still looked live would be worse.
export const primaryButtonClasses =
  "bg-brand hover:bg-brand-hover focus:bg-brand-hover active:bg-brand-hover";

// The same failure, one variant over: `color="red"` fills with #ef4444 under a
// white label, which measures 3.76:1. Shifted one step darker for the same
// reason, and it needs its own token pair because --danger is a *text* colour
// (the delete icon) at 2.77:1 under white -- reusing it would make this worse.
//
// The `active:` override is the one part that is not required. The library's
// `active:bg-red-600/90` carries real alpha, and composited over the modal's
// --surface it resolves to #ca2626 at 5.50:1, so it passes on its own. It is
// overridden anyway because leaving it would make *pressing* the button lighter
// than hovering it: #ca2626 sits between red-600 and red-700.
export const dangerButtonClasses =
  "bg-danger-fill hover:bg-danger-fill-hover focus:bg-danger-fill-hover active:bg-danger-fill-hover";
