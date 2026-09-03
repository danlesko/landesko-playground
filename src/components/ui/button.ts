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
// captured. Be precise about how far that goes -- the CLASSES were compared for every state,
// and five of them were compared as rendered pixels (resting primary, danger, small, loading
// and disabled, all identical). Hover, focus and active were compared class-for-class only,
// because reaching them needs interaction. Attributes changed too, which is not a
// reproduction: the generated `id` and `aria-disabled` are gone and `type` is now explicit.
//
// Class-wise, dropped only what provably could not apply -- four `data-[has-*-element]`
// classes that exist for a component group this app never imports.
//
// Also dropped: `aria-disabled`. The library set it on every button, `"false"` when enabled.
// A native button with the `disabled` attribute is already exposed as disabled, so the
// attribute was redundant when true and noise when false.
//
// One thing the library did that a native element does NOT, and it is the reason every call
// site now names `type` explicitly: rewind-ui defaulted `type="button"`, while a native
// `<button>` inside a form defaults to submitting it. The two modal buttons relied on that
// default.
//
// Nothing was broken, and the reason is narrower than it first looks. Every page has a form
// -- the header's sign-in control is one, from the root layout -- so "no form on the page" is
// not the answer. The answer was that the library modal PORTALLED to `body`, putting it
// outside that form in the tree, so its buttons could not have submitted it. Never a thing to
// leave a default resting on, and #143 removed even that: a native `<dialog>` is painted in
// the top layer but stays exactly where it is written, so those buttons are now wherever the
// card is. Both name `type="button"` explicitly.
const buttonBase =
  "inline-flex items-center justify-center enabled:cursor-pointer focus:outline-none transition duration-150 ease-in-out focus:z-20 border border-transparent antialiased text-sm rounded-lg shadow-none text-white focus:ring-offset-1 focus:ring-3";

// `focus:ring-3` sits in the base because Tailwind 4 narrowed the default ring-width to 1px, and a
// 1px perimeter does not provide the area WCAG 2.4.11 asks for. 3px is the width these
// buttons have always had.
//
// A real utility rather than the arbitrary-value form this used to use. That form was needed
// when the width had to beat the library's own through tailwind-merge; with native elements
// there is nothing to beat. `ring-3` emits an identical declaration -- they compile into the
// same grouped rule -- and a comment here previously claimed no utility gave exactly 3,
// which was wrong. The arbitrary spelling is deliberately not written out below: naming it
// in a scanned comment emits its rule, which is how it lingered in the stylesheet after the
// class string stopped using it.

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
// The `active:` step is the one part that was not required. The library's own pressed fill
// carried real alpha, and composited over the modal's --surface it resolved to #ca2626 at
// 5.50:1, so it passed on its own. It is overridden anyway because leaving it would make
// *pressing* the button lighter than hovering it: #ca2626 sits between red-600 and red-700.
// The library's utility is described rather than named, because a scanned comment naming it
// emits its rule.
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
