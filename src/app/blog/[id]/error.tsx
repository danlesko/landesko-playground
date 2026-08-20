"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { ArrowLeft } from "@phosphor-icons/react/dist/ssr";

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
      <h2 className="text-4xl font-bold text-danger">Error Fetching Blog</h2>
      <Link
        className="text-xl text-accent hover:text-accent-hover visited:text-accent-visited font-bold"
        href={`/blog`}
      >
        <ArrowLeft size={24} className="inline-block -translate-y-1" /> All Blog
        Posts
      </Link>
      <div className="mt-4 p-4 shadow-md rounded-lg md:w-full lg:min-w-[600px] lg:w-1/2 min-h-32 border border-border overflow-auto">
        <p className="whitespace-pre-line">
          The blog post for this URL could not be loaded. If the problem is
          temporary, trying again may help.
        </p>
        <button
          type="button"
          onClick={retry}
          disabled={retrying}
          aria-live="polite"
          className="mt-4 px-4 py-2 rounded font-bold bg-surface text-accent hover:text-accent-hover disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
        >
          {retrying ? "Retrying..." : "Try again"}
        </button>
        {error.digest && (
          <p className="mt-4 text-sm text-muted">
            Error digest: <code>{error.digest}</code>
          </p>
        )}
      </div>
    </div>
  );
}
