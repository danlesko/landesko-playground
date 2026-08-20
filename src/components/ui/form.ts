// rewind-ui's Input and Textarea ship a light-mode palette and focus styles
// that ignore the theme, so every instance has to override both. Kept as a
// class string rather than a wrapper component, which would mean re-exporting
// the library's prop surface. Bare utility words are avoided in this comment
// because the scanner treats them as class candidates and emits them as CSS.
export const formControlClasses =
  "bg-surface text-foreground focus:bg-surface focus:text-foreground focus:ring-surface focus:ring-0 focus:ring-offset-0";

export const formLabelClasses = "block mt-2 text-base text-foreground";
