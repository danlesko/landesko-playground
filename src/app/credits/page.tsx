import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Landesko's Playground - Credits",
  description: "Credits for Landesko's Playground",
};

export default function Credits() {
  return (
    <>
      <h2 className="text-4xl font-bold">Credits</h2>
      <p className="text-lg mt-2">
        Thanks to the following resources for helping me build this site:
      </p>
      <ul className="list-disc ml-8">
        <li>
          <a
            className="text-blue-600 hover:text-blue-800 visited:text-purple-600"
            href="https://www.flaticon.com"
            title="Flaticon"
          >
            Site Icons - Flaticon
          </a>
        </li>
        <li>
          <a
            className="text-blue-600 hover:text-blue-800 visited:text-purple-600"
            href="https://nextjs.org/"
            title="NextJS"
          >
            Framework - NextJS 15
          </a>
        </li>
        <li>
          <a
            className="text-blue-600 hover:text-blue-800 visited:text-purple-600"
            href="https://tailwindcss.com/"
            title="TailwindCSS"
          >
            Styling - Tailwind CSS
          </a>
        </li>
        <li>
          <a
            className="text-blue-600 hover:text-blue-800 visited:text-purple-600"
            href="https://rewind-ui.dev/"
            title="RewindUI"
          >
            Component Library (Used Minimally) - Rewind UI
          </a>
        </li>
      </ul>
    </>
  );
}
