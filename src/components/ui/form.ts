// rewind-ui's Input and Textarea ship a light-mode palette and focus styles
// that ignore the theme, so every instance has to override both. Kept as a
// class string rather than a wrapper component, which would mean re-exporting
// the library's prop surface. Bare utility words are avoided in this comment
// because the scanner treats them as class candidates and emits them as CSS.
// The `disabled:` pair is here because rewind-ui's Input and Textarea render the
// attribute and nothing else: a disabled control looked pixel-identical to a live
// one, so /contact without a site key presented three fields that silently
// refused to accept typing. Screenshotted before adding it, which is the only way
// this shows up -- every test that asserts the attribute passed either way.
// CreateBlogForm shares this string and never disables its fields, so the pair is
// inert there rather than a change to that form.
export const formControlClasses =
  "bg-surface text-foreground focus:bg-surface focus:text-foreground focus:ring-surface focus:ring-0 focus:ring-offset-0 disabled:opacity-60 disabled:cursor-not-allowed";

export const formLabelClasses = "block mt-2 text-base text-foreground";

// Sits on --background, where --danger measures 6.40:1. The element is always
// rendered and empty when valid, so it holds no height until it has text.
export const formErrorClasses = "mt-1 text-sm text-danger";
