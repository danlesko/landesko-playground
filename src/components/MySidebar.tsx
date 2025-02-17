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
    <aside className="bg-zinc-800 p-4 min-w-[250px] lg:max-w-[250px] text-zinc-300">
      <button
        className={clsx("lg:hidden p-2 text-white bg-purple-600 rounded", {
          "mb-2": isOpen,
        })}
        onClick={toggleMenu}
      >
        <Image src="/menu.png" alt="Menu" width="24" height="24" />
      </button>
      <ul className={`space-y-2 ${isOpen ? "block" : "hidden"} lg:block`}>
        {[
          { href: "/", label: "Home" },
          { href: "/blog", label: "Blog" },
          { href: "/processing", label: "Processing.js" },
          { href: "/contact", label: "Contact" },
          { href: "/credits", label: "Credits" },
        ].map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              className={clsx(
                "block p-2 rounded hover:bg-gray-400 hover:text-zinc-900 focus:bg-purple-600 font-bold",
                {
                  "bg-purple-600": pathname === item.href,
                  "bg-zinc-800": pathname !== item.href,
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
