import Link from "next/link";
import type { ComponentProps } from "react";

// Exported for `<a>` elements — mailto: and off-site hrefs, which next/link
// would render as an anchor anyway but without doing anything useful.
export const textLinkClasses =
  "text-accent hover:text-accent-hover visited:text-accent-visited";

// A caller cannot override the colour via className: there is no tailwind-merge
// in this repo, so both colour utilities end up on the element and the stylesheet's
// own rule order picks the winner, not the order here. Add a variant prop if a
// second colour is ever needed. (Utility names are spelled out nowhere in this
// comment on purpose — the content scanner emits bare ones as real CSS.)
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
