"use client";
import { useState } from "react";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import Link from "next/link";
import Image from "next/image";

// Referenced by both the toggle's `aria-controls` and the list's `id`, so the
// two cannot drift apart. MySidebar is rendered once, in the root layout, so a
// constant is unique on the page.
const MENU_ID = "sidebar-menu";

const MySidebar = () => {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);

  const toggleMenu = () => {
    setIsOpen(!isOpen);
  };

  // A `nav` rather than an `aside`: this is the site's primary navigation, so
  // the `complementary` landmark `aside` carries was simply wrong. This is the
  // page's only navigation landmark now that the top bar is a `banner`, so the
  // name is belt-and-braces rather than load-bearing: it keeps a future second
  // nav from arriving as an unnamed, indistinguishable one.
  return (
    <nav
      aria-label="Main"
      className="bg-surface p-4 min-w-[250px] lg:max-w-[250px] text-foreground"
    >
      <button
        type="button"
        // `aria-expanded` tracks `isOpen`, which is the whole truth only below
        // the large breakpoint. At and above it the list is always laid out and
        // this toggle is dropped from the layout -- and an element dropped that
        // way is absent from the accessibility tree, so this attribute is never
        // conveyed while it disagrees with what is on screen. Proven with an
        // accessibility snapshot in e2e/smoke.spec.ts rather than assumed.
        aria-expanded={isOpen}
        aria-controls={MENU_ID}
        // The name was coming from the icon's `alt`. Stating it here keeps the
        // button named if the icon is ever swapped out (#10 wants a Phosphor
        // one). The icon then goes decorative -- not to prevent a doubled name,
        // since `aria-label` already replaces descendant content in the name
        // computation, but so the image stops being a node of its own.
        aria-label="Menu"
        className={clsx(
          "lg:hidden p-2 text-white bg-brand rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
          {
            "mb-2": isOpen,
          },
        )}
        onClick={toggleMenu}
      >
        <Image src="/menu.png" alt="" width="24" height="24" />
      </button>
      <ul
        id={MENU_ID}
        className={`space-y-2 ${isOpen ? "block" : "hidden"} lg:block`}
      >
        {[
          { href: "/", label: "Home" },
          { href: "/blog", label: "Blog" },
          { href: "/animation", label: "Animation" },
          { href: "/contact", label: "Contact" },
          { href: "/credits", label: "Credits" },
        ].map((item) => {
          // Read once and used for both the styling and `aria-current`: the
          // active page was already styled, so the state existed all along and
          // was just never exposed non-visually. Sharing the comparison is what
          // stops the two representations of it from ever disagreeing.
          const isActive = pathname === item.href;

          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={clsx(
                  // Keyboard focus draws a halo rather than changing the
                  // background: it used to reuse the active-page background, so
                  // the two states were indistinguishable. Avoid bare Tailwind
                  // class words in this comment; the scanner emits them as CSS.
                  "block p-2 rounded hover:bg-gray-400 hover:text-zinc-900 font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
                  {
                    // zinc-300 on --brand is only 3.64:1; white is 5.38:1.
                    "bg-brand text-white": isActive,
                    "bg-surface": !isActive,
                  },
                )}
                onClick={() => setIsOpen(false)}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
};

export default MySidebar;
