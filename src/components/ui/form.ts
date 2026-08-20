// rewind-ui's Input and Textarea ship a light-mode palette and a focus ring
// that ignores the theme, so every instance has to override both. Kept as a
// class string rather than a wrapper component to avoid re-exporting the
// library's prop surface.
export const formControlClasses =
  "bg-surface text-foreground focus:bg-surface focus:text-foreground focus:ring-surface focus:ring-0 focus:ring-offset-0";
