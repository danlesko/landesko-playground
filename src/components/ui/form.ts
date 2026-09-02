// The form controls are NATIVE elements styled by these strings (#143). They used to be
// rewind-ui's Input, Textarea and Checkbox, and this string was only the part of their
// appearance we had to override -- the library ships a light-mode palette and focus styles
// that ignore the theme, so every instance overrode both. Owning the whole string instead
// of half of it removes three of the five rewind-ui components and, with them, the reason
// their style files had to be scanned.
//
// Reproduced from the rendered output rather than reinvented: the previous classes were
// captured after tailwind-merge resolved the library's own against ours, and /contact is
// pixel-identical across the swap. Bare utility words are avoided in this comment because
// the scanner treats them as class candidates and emits them as CSS.
//
// `outline-hidden` and not the `outline-none` the library used. Under Tailwind 4 those are
// different: `outline-none` genuinely removes the outline, while `outline-hidden` keeps the
// transparent one that stays visible under forced colors. Identical in normal rendering,
// better in high contrast.
//
// The `disabled:` pair is load-bearing and predates this change: a disabled field rendered
// the attribute and nothing else, so /contact without a site key presented three fields
// that silently refused to accept typing. Screenshotted before adding it, which is the only
// way it shows up -- every test that asserts the attribute passed either way. CreateBlogForm
// shares the string and never disables its fields, so the pair is inert there.
//
// The greys are the library's, kept so the swap changes nothing: this is a component
// replacement, not a retheme. They are stock-palette values on a themed dark site, which is
// worth revisiting -- `--border` exists for exactly this -- but as its own change with its
// own before-and-after.
const formFieldBase =
  "w-full px-3 text-base border rounded-lg transition-colors duration-100 ease-in-out outline-hidden placeholder:text-gray-400 focus-visible:border-purple-500 bg-surface text-foreground focus:bg-surface focus:text-foreground disabled:opacity-60 disabled:cursor-not-allowed";

// A fixed height, matching the library's single-line control.
export const formInputClasses = `${formFieldBase} h-10 border-gray-300`;

// Vertical padding instead of a height, so the field grows with `rows` or an explicit
// height. `border-gray-200` rather than 300: the library used a lighter border for the
// multi-line control and this keeps that difference.
export const formTextareaClasses = `${formFieldBase} py-3 border-gray-200`;

// `form-checkbox` is @tailwindcss/forms, which is why that plugin is not removable -- it
// supplies the box and its check mark. The rest reproduces the library's appearance: a 20px
// box, `text-purple-500` for the mark, and the 3px focus ring restored for Tailwind 4.
export const formCheckboxClasses =
  "form-checkbox w-5 h-5 rounded-md cursor-pointer border-gray-300 bg-white text-purple-500 hover:text-purple-600 focus:ring-purple-100 focus:ring-offset-1 focus:ring-[3px] outline-hidden";

// THE ONE DELIBERATE APPEARANCE CHANGE in this swap, and it is a contrast fix.
//
// rewind-ui's Checkbox labelled itself `text-gray-700`, a light-mode default it never
// exposed as a prop, so it could not be overridden the way the Input's palette was.
// Measured on the create form's background: 2.11:1, against the 4.5:1 that 16px text needs
// under WCAG 1.4.3. "Make this post private" was effectively unreadable and had been since
// the control was added -- nothing caught it because that form needs a session and no test
// renders it.
//
// `text-foreground` is 11.99:1 on the same background.
export const formCheckboxLabelClasses =
  "cursor-pointer pl-1.5 text-base leading-5 text-foreground";

export const formLabelClasses = "block mt-2 text-base text-foreground";

// Sits on --background, where --danger measures 6.40:1. The element is always
// rendered and empty when valid, so it holds no height until it has text.
export const formErrorClasses = "mt-1 text-sm text-danger";

// The success half of the same element, so a good outcome and a bad one appear in
// the same place with the same type -- colour is the only difference. It does not
// follow that a message costs no layout: an empty paragraph has no line box, so
// gaining text does grow the form, and a long server-authored error wraps.
//
// --accent (cyan-400, 9.80:1) rather than a green, because the palette has no
// success token and this site's positive colour is the cyan accent. Inventing one
// would mean a fourth hue on a page that already carries brand purple, danger red
// and accent cyan.
export const formSuccessClasses = "mt-1 text-sm text-accent";
