"use client";
import BackLink from "@/components/ui/BackLink";
import PageHeading from "@/components/ui/PageHeading";
import useErrorRetry from "../../useErrorRetry";
import { cardClasses } from "@/components/ui/card";
import { contentColumnClasses } from "@/components/ui/layout";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { retrying, retry } = useErrorRetry(reset);

  return (
    <div className={contentColumnClasses}>
      <PageHeading>
        <span className="text-danger">Error Fetching Blog</span>
      </PageHeading>
      <BackLink />
      <div className={`${cardClasses} min-h-32 overflow-auto`}>
        <p className="whitespace-pre-line">
          The blog post for this URL could not be loaded. If the problem is
          temporary, trying again may help.
        </p>
        {/* `aria-busy`, not `aria-disabled`: the control stays operable while the
            retry runs, and a second click escalates to a full reload. Neither is
            `disabled`, which would drop focus to the body in some browsers. */}
        <button
          type="button"
          onClick={retry}
          aria-busy={retrying}
          className="mt-4 px-4 py-2 rounded font-bold bg-surface text-accent hover:text-accent-hover aria-[busy=true]:opacity-50 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
        >
          Try again
        </button>
        {/* Mounted empty rather than conditionally, and kept off the button: a
            live region that appears at the same moment as its text is often not
            announced at all, and on the focused control its name, state and this
            text would all change at once. `min-h-5` reserves the line. */}
        <p
          role="status"
          aria-atomic="true"
          className="mt-2 min-h-5 text-sm text-muted"
        >
          {retrying ? "Retrying... click Try again to reload the page." : ""}
        </p>
        {error.digest && (
          <p className="mt-4 text-sm text-muted">
            Error digest: <code>{error.digest}</code>
          </p>
        )}
      </div>
    </div>
  );
}
