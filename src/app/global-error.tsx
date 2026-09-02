"use client";
import TextLink from "@/components/ui/TextLink";
import useErrorRetry from "./useErrorRetry";
// Next renders this boundary in place of the whole document, so none of the
// root layout's own CSS is on the page and the semantic colour utilities below
// would emit nothing without this import.
import "./globals.css";
import { cardClasses } from "@/components/ui/card";
import { contentColumnClasses } from "@/components/ui/layout";

// Catches errors thrown by the root layout itself, which `error.tsx` cannot:
// that boundary renders *inside* the layout. Hence the <html>/<body> here, and
// hence no Montserrat — the layout's webfont is not loaded either, and a
// failure page should not wait on one. Tailwind's preflight sans-serif stack
// stands in.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // The escalation in this hook matters most here: nothing of the site survives
  // on this page, so a stuck retry leaves the user with no other control to try
  // — the Home link needs the same server and, already being at `/`, does not
  // even change the pathname that would otherwise auto-reset the boundary.
  const { retrying, retry } = useErrorRetry(reset);

  return (
    <html lang="en">
      <body className="antialiased bg-background text-foreground p-4">
        {/* The layout's `metadata` export goes with the layout: without this the
            document really has no <title> at all, and the tab falls back to the
            raw URL. React hoists it into <head>. */}
        <title>Something Went Wrong - Landesko&apos;s Playground</title>
        {/* Written inline rather than through a heading primitive: with the
            layout gone this is the document's only heading, so its level must
            not be changeable by an edit in another file. */}
        <div className={contentColumnClasses}>
          <h1 className="text-4xl font-bold text-danger">
            Something Went Wrong
          </h1>
          <div className={`${cardClasses} min-h-32 overflow-auto`}>
            <p>
              This site could not be loaded. If the problem is temporary, trying
              again may help.
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
            {/* Mounted empty rather than conditionally: a live region that appears
              at the same moment as its text is often not announced at all. */}
            <p
              role="status"
              aria-atomic="true"
              className="mt-2 min-h-5 text-sm text-muted"
            >
              {retrying
                ? "Retrying... click Try again to reload the page."
                : ""}
            </p>
            <p className="mt-4">
              <TextLink href="/" className="font-bold">
                Home
              </TextLink>
            </p>
            {error.digest && (
              <p className="mt-4 text-sm text-muted">
                Error digest: <code>{error.digest}</code>
              </p>
            )}
          </div>
        </div>
      </body>
    </html>
  );
}
