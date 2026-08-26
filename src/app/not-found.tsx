import PageHeading from "@/components/ui/PageHeading";
import TextLink from "@/components/ui/TextLink";
import { cardClasses } from "@/components/ui/card";

// Also what `notFound()` renders for a missing or private blog post, since
// there is no closer boundary, hence the link to the post list as well as home.
export default function NotFound() {
  return (
    <div>
      <PageHeading>Page Not Found</PageHeading>
      <div className={`${cardClasses} min-h-32`}>
        <p>
          There is nothing at this URL. It may have moved, or it may never have
          existed.
        </p>
        <p className="mt-4">
          <TextLink href="/" className="font-bold">
            Home
          </TextLink>
          <span aria-hidden="true" className="mx-2 text-muted">
            /
          </span>
          <TextLink href="/blog" className="font-bold">
            Blog Posts
          </TextLink>
        </p>
      </div>
    </div>
  );
}
