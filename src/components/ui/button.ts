// The buttons are NATIVE elements styled by these strings (#143). They used to be
// rewind-ui's Button, and these names used to mean only the part of its appearance we
// overrode -- the fills. They now mean the whole button.
//
// The names are reused rather than replaced so the five call sites keep reading the same
// way, but be aware of the widened meaning: `primaryButtonClasses` is no longer "the fill
// override", it is "a primary button". `button.test.ts` was rewritten around that.
//
// Reproduced from the rendered output rather than reinvented, the same method as ui/form.ts:
// each variant was rendered with the props its call site passes and the emitted class list
// captured, so what shipped is what ships. Dropped only what provably could not apply --
// four `data-[has-*-element]` classes that exist for a component group this app never
// imports, and the library's generated `id`, which nothing referenced.
//
// Also dropped: `aria-disabled`. The library set it on every button, `"false"` when enabled.
// A native button with the `disabled` attribute is already exposed as disabled, so the
// attribute was redundant when true and noise when false.
//
// One thing the library did that a native element does NOT, and it is the reason every call
// site now names `type` explicitly: rewind-ui defaulted `type="button"`, while a native
// `<button>` inside a form defaults to submitting it. The two modal buttons relied on that
// default. They portal out of any form and there is no form on that page, so nothing was
// broken -- but "it happens to work because of where the portal lands" is not a thing to
// leave implicit.
const buttonBase =
  "inline-flex items-center justify-center enabled:cursor-pointer focus:outline-none transition duration-150 ease-in-out focus:z-20 border border-transparent antialiased text-sm rounded-lg shadow-none text-white focus:ring-offset-1 focus:ring-[3px]";

// `focus:ring-[3px]` sits in the base because Tailwind 4 narrowed the default ring to 1px
// and a 1px perimeter does not provide the area WCAG 2.4.11 asks for. It was an arbitrary
// value when it had to beat the library's own bare ring-width class through tailwind-merge;
// it stays arbitrary because 3px is the width the buttons have always had, and there is no
// utility for exactly 3.

// rewind-ui's `variant="primary"` filled with #a855f7 under a white label, which measures
// 3.96:1 -- short of the 4.5:1 that 14px bold needs, and 14px bold is not large text (that
// starts at 18.66px bold). Its hover fill, #9333ea, already passed, so this shifts the whole
// scale one step darker and keeps hover a visible change rather than collapsing it onto the
// resting colour.
//
// `disabled:bg-purple-300` is the library's own, kept deliberately. WCAG exempts inactive
// controls, and a disabled button that still looked live would be worse. It is a stock
// palette value rather than a token, which is why the theme-token assertion in the tests
// looks only at the live fills.
const primaryFills =
  "bg-brand hover:bg-brand-hover focus:bg-brand-hover active:bg-brand-hover disabled:bg-purple-300 disabled:hover:bg-purple-300 focus:ring-purple-100";

// The same failure, one variant over: `color="red"` filled with #ef4444 under a white label,
// which measures 3.76:1. Shifted one step darker for the same reason, and it needs its own
// token pair because --danger is a *text* colour (the delete icon) at 2.77:1 under white --
// reusing it would make this worse.
//
// The `active:` step is the one part that was not required. The library's
// `active:bg-red-600/90` carried real alpha, and composited over the modal's --surface it
// resolved to #ca2626 at 5.50:1, so it passed on its own. It is overridden anyway because
// leaving it would make *pressing* the button lighter than hovering it: #ca2626 sits between
// red-600 and red-700.
const dangerFills =
  "bg-danger-fill hover:bg-danger-fill-hover focus:bg-danger-fill-hover active:bg-danger-fill-hover disabled:bg-red-300 disabled:hover:bg-red-300 focus:ring-red-100";

// Two sizes, because the header's control is the only small one. The library called these
// `sm` and `md` and this is what each resolved to.
const sizeMd = "px-4 h-10";
const sizeSm = "px-2.5 h-8";

export const primaryButtonClasses = `${buttonBase} ${primaryFills} ${sizeMd}`;

/** The header's sign-in control, the only button the library rendered at `size="sm"`. */
export const primaryButtonSmClasses = `${buttonBase} ${primaryFills} ${sizeSm}`;

export const dangerButtonClasses = `${buttonBase} ${dangerFills} ${sizeMd}`;
