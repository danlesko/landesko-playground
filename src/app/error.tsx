"use client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import PageHeading from "@/components/ui/PageHeading";
import TextLink from "@/components/ui/TextLink";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();
  const [retrying, startRetry] = useTransition();

  // `reset()` only clears this boundary's stored error; it does not re-run the
  // server component. Without the refresh it would re-render the same failed
  // payload and land straight back here.
  function retry() {
    startRetry(() => {
      router.refresh();
      reset();
    });
  }

  return (
    <div className="inline-block" style={{ width: "100%" }}>
      <PageHeading>
        <span className="text-danger">Something Went Wrong</span>
      </PageHeading>
      <div className="mt-4 p-4 shadow-md rounded-lg md:w-full lg:min-w-[600px] lg:w-1/2 min-h-32 border border-border overflow-auto">
        <p>
          This page could not be loaded. If the problem is temporary, trying
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
    </div>
  );
}
