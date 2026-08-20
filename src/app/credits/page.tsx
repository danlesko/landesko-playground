import type { Metadata } from "next";
import PageHeading from "@/components/ui/PageHeading";
import { textLinkClasses } from "@/components/ui/TextLink";

export const metadata: Metadata = {
  title: "Landesko's Playground - Credits",
  description: "Credits for Landesko's Playground",
};

const credits = [
  {
    href: "https://www.flaticon.com",
    title: "Flaticon",
    label: "Site Icons - Flaticon",
  },
  {
    href: "https://nextjs.org/",
    title: "NextJS",
    label: "Framework - NextJS 15",
  },
  {
    href: "https://tailwindcss.com/",
    title: "TailwindCSS",
    label: "Styling - Tailwind CSS",
  },
  {
    href: "https://rewind-ui.dev/",
    title: "RewindUI",
    label: "Component Library (Used Minimally) - Rewind UI",
  },
];

export default function Credits() {
  return (
    <>
      <PageHeading>Credits</PageHeading>
      <p className="text-lg mt-2">
        Thanks to the following resources for helping me build this site:
      </p>
      <ul className="list-disc ml-8">
        {credits.map((credit) => (
          <li key={credit.href}>
            <a
              className={textLinkClasses}
              href={credit.href}
              title={credit.title}
            >
              {credit.label}
            </a>
          </li>
        ))}
      </ul>
    </>
  );
}
