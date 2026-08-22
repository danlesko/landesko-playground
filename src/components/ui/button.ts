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
