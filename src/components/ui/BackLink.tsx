import Link from "next/link";
import { ArrowLeft } from "@phosphor-icons/react/dist/ssr";
import { textLinkClasses } from "@/components/ui/TextLink";

export default function BackLink() {
  return (
    <Link className={`text-xl font-bold ${textLinkClasses}`} href="/blog">
      <ArrowLeft size={24} className="inline-block -translate-y-1" /> All Blog
      Posts
    </Link>
  );
}
