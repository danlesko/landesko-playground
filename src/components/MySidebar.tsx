"use client";
import { useState } from "react";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import Link from "next/link";
import Image from "next/image";

const MySidebar = () => {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);

  const toggleMenu = () => {
    setIsOpen(!isOpen);
  };

  return (
    <aside className="bg-surface p-4 min-w-[250px] lg:max-w-[250px] text-foreground">
      <button
        className={clsx(
          "lg:hidden p-2 text-white bg-brand rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
          {
            "mb-2": isOpen,
          },
        )}
        onClick={toggleMenu}
      >
        <Image src="/menu.png" alt="Menu" width="24" height="24" />
      </button>
      <ul className={`space-y-2 ${isOpen ? "block" : "hidden"} lg:block`}>
        {[
          { href: "/", label: "Home" },
          { href: "/blog", label: "Blog" },
          { href: "/animation", label: "Animation" },
          { href: "/contact", label: "Contact" },
          { href: "/credits", label: "Credits" },
        ].map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              className={clsx(
                // Keyboard focus draws a halo rather than changing the
                // background: it used to reuse the active-page background, so
                // the two states were indistinguishable. Avoid bare Tailwind
                // class words in this comment; the scanner emits them as CSS.
                "block p-2 rounded hover:bg-gray-400 hover:text-zinc-900 font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
                {
                  // zinc-300 on --brand is only 3.64:1; white is 5.38:1.
                  "bg-brand text-white": pathname === item.href,
                  "bg-surface": pathname !== item.href,
                },
              )}
              onClick={() => setIsOpen(false)}
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </aside>
  );
};

export default MySidebar;
