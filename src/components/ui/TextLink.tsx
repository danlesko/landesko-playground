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
      className={
        className ? `${textLinkClasses} ${className}` : textLinkClasses
      }
      {...props}
    />
  );
}
