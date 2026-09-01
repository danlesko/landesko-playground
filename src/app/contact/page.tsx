import ContactForm from "@/components/ContactForm";
import type { Metadata } from "next";
import PageHeading from "@/components/ui/PageHeading";
import { textLinkClasses } from "@/components/ui/TextLink";
import { contentColumnClasses } from "@/components/ui/layout";

export const metadata: Metadata = {
  title: "Landesko's Playground - Contact",
  description: "Contact Dan Lesko",
};

export default function Contact() {
  return (
    <div className={contentColumnClasses}>
      <PageHeading>Contact</PageHeading>
      <p className="text-lg mt-2">
        Email me directly at:{" "}
        <a className={textLinkClasses} href="mailto:lesko.dan.m@gmail.com">
          lesko.dan.m@gmail.com
        </a>
      </p>
      <p className="text-lg mt-2">Or through the web here:</p>
      <ContactForm />
    </div>
  );
}
