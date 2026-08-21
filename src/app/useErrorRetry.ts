"use client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

// Shared by all three error boundaries, which otherwise had this logic copied
// verbatim three times.
export default function useErrorRetry(reset: () => void) {
  const router = useRouter();
  const [retrying, startRetry] = useTransition();

  function retry() {
    // A second click while the first is still pending escalates to a full
    // document load. Next's Flight fetch has no timeout, so a server that
    // accepts the request and never answers leaves the transition pending
    // forever; blocking the click instead of escalating it made the button --
    // and on global-error the whole page -- a dead end with no way out but the
    // browser's own reload button.
    if (retrying) {
      window.location.reload();
      return;
    }

    // `reset()` only clears this boundary's stored error; it does not re-run the
    // server component. Without the refresh it would re-render the same failed
    // payload and land straight back here.
    startRetry(() => {
      router.refresh();
      reset();
    });
  }

  return { retrying, retry };
}
