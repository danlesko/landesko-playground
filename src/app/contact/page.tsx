import MyContactForm from "@/src/components/MyContactForm";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Landesko's Playground - Contact",
  description: "Contact Dan Lesko",
};

export default function Contact() {
  return (
    <>
      <h2 className="text-4xl font-bold">Contact</h2>
      <p className="text-lg mt-2">
        Email me directly at:{" "}
        <a
          className="text-blue-600 hover:text-blue-800 visited:text-purple-600"
          href="mailto:lesko.dan.m@gmail.com"
        >
          lesko.dan.m@gmail.com
        </a>
      </p>
      <p className="text-lg mt-2">Or through the web here:</p>
      <MyContactForm />
    </>
  );
}
