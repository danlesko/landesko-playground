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
            href="https://www.flaticon.com/free-icon/slider_3264933?term=playground+slide&page=1&position=7&origin=tag&related_id=3264933"
            title="kid and baby icons"
          >
            Site Icon - Flaticon
          </a>
        </li>
      </ul>
    </>
  );
}
