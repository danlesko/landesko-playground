"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

const MySidebar = () => {
  const pathname = usePathname();
  return (
    <aside className="bg-zinc-800 p-4 w-64 text-zinc-300">
      <ul className="space-y-2">
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
                "block p-2 rounded hover:bg-gray-400 hover:text-zinc-900 focus:bg-purple-600",
                {
                  "bg-purple-600": pathname === item.href,
                  "bg-zinc-800": pathname !== item.href,
                },
              )}
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
