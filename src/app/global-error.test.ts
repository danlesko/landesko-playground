import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// `useRouter()` throws outside an app-router context, so it is stubbed just
// enough to let the module render. Whether the retry actually recovers was
// checked against a production server, which is the only place it can be:
// nothing here can mount a router.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {} }),
}));

import GlobalError from "@/app/global-error";

function render(error: Error & { digest?: string }): string {
  return renderToStaticMarkup(
    createElement(GlobalError, { error, reset: () => {} }),
  );
}

describe("global-error", () => {
  // The invariant that is easy to lose in a refactor: this boundary replaces
  // the whole document, so a shell of its own is not optional. Markup rather
  // than the element tree because the <html>/<body> pair is the assertion.
  it("renders its own document shell", () => {
    const markup = render(new Error("boom"));
    expect(markup.startsWith('<html lang="en">')).toBe(true);
    expect(markup).toContain("<body");
    expect(markup).toContain("Something Went Wrong");
  });

  it("offers a retry and a way home", () => {
    const markup = render(new Error("boom"));
    expect(markup).toContain("Try again");
    expect(markup).toContain('href="/"');
  });

  it("shows the digest only when Next attached one", () => {
    const withDigest = render(
      Object.assign(new Error("boom"), { digest: "abc123" }),
    );
    expect(withDigest).toContain("abc123");
    expect(render(new Error("boom"))).not.toContain("Error digest");
  });
});
