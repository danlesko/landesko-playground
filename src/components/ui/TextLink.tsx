import Link from "next/link";
import type { ComponentProps } from "react";

// Exported for `<a>` elements — mailto: and off-site hrefs, which next/link
// would render as an anchor anyway but without doing anything useful.
export const textLinkClasses =
  "text-accent hover:text-accent-hover visited:text-accent-visited";

export default function TextLink({
  className,
  ...props
}: ComponentProps<typeof Link>) {
  return (
    <Link
      // No tailwind-merge in this repo, so a caller's colour does not override the
      // one above — both land on the element and stylesheet order decides. Add a
      // variant prop if a second colour is ever needed.
      className={
        className ? `${textLinkClasses} ${className}` : textLinkClasses
      }
      {...props}
    />
  );
}
