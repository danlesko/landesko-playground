"use client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import TextLink from "@/components/ui/TextLink";
// Next renders this boundary in place of the whole document, so none of the
// root layout's own CSS is on the page and the semantic colour utilities below
// would emit nothing without this import.
import "./globals.css";

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
  const router = useRouter();
  const [retrying, startRetry] = useTransition();

  // Same reasoning as error.tsx, and it binds harder here: `reset()` only
  // clears the stored error, and the payload it would re-render is the one
  // whose root layout threw. Only the refresh asks the server to run the
  // layout again.
  function retry() {
    startRetry(() => {
      router.refresh();
      reset();
    });
  }

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
        <h1 className="text-4xl font-bold text-danger">Something Went Wrong</h1>
        <div className="mt-4 p-4 shadow-md rounded-lg md:w-full lg:min-w-[600px] lg:w-1/2 min-h-32 border border-border overflow-auto">
          <p>
            This site could not be loaded. If the problem is temporary, trying
            again may help.
          </p>
          {/* `aria-disabled` rather than `disabled`, so the button keeps focus
              while the retry runs; a disabled control drops focus to the body in
              some browsers. It does not block clicks on its own, hence the guard. */}
          <button
            type="button"
            onClick={() => {
              if (!retrying) retry();
            }}
            aria-disabled={retrying}
            className="mt-4 px-4 py-2 rounded font-bold bg-surface text-accent hover:text-accent-hover aria-disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
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
            {retrying ? "Retrying..." : ""}
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
      </body>
    </html>
  );
}
