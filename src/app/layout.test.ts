import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";

import {
  auth,
  resetAuthMock,
  sessionWithoutUser,
  signedInSession,
} from "@/test/auth-mock";

vi.mock("@/auth", async () => {
  const { auth: authMock } = await import("@/test/auth-mock");
  return { auth: authMock, signIn: vi.fn(), signOut: vi.fn() };
});

// Everything the header control does not depend on. MySidebar is a client
// component that reads a router context this renderer has no provider for, and
// next/font/google fetches at import time.
vi.mock("next/font/google", () => ({
  Montserrat: () => ({ className: "mont" }),
}));
vi.mock("@/components/MySidebar", () => ({ default: () => null }));
vi.mock("@vercel/analytics/next", () => ({ Analytics: () => null }));
vi.mock("@vercel/speed-insights/next", () => ({ SpeedInsights: () => null }));

import RootLayout from "@/app/layout";

async function renderLayout(): Promise<string> {
  return renderToStaticMarkup(
    (await RootLayout({ children: null })) as ReactElement,
  );
}

// Text content, not the accessible name: `Button` renders a `<button>` with no
// name attribute, so the label IS the name and a name query would be circular.
function buttonLabels(markup: string): string[] {
  return [...markup.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/g)].map((m) =>
    m[1]!.replace(/<[^>]*>/g, "").trim(),
  );
}

beforeEach(() => {
  resetAuthMock();
});

describe("the header auth control", () => {
  it.each([
    { state: "no session", session: null, label: "Login" },
    // The case that pins `Boolean(session?.user)` rather than
    // `Boolean(session)`: a misconfigured provider resolves `auth()` to a
    // truthy object with no user, and the looser guard offers Logout to an
    // anonymous reader.
    {
      state: "a session with no user",
      session: sessionWithoutUser(),
      label: "Login",
    },
    {
      state: "a signed-in session",
      session: signedInSession(),
      label: "Logout",
    },
  ])("reads $label for $state", async ({ session, label }) => {
    auth.mockResolvedValue(session);

    expect(buttonLabels(await renderLayout())).toEqual([label]);
  });

  // Tripwire, not a requirement. The form's `action` is a server-action
  // reference, and this renderer emits none of it -- so no assertion in this
  // file can pin the `signedIn ? signOutOfSession : signInWithGithub` half of
  // the ternary, and inverting it alone leaves every test above green. If this
  // ever fails because React started serialising the reference, that residue is
  // gone: assert the id here instead of deleting the case. Confirming the
  // mapping today needs .next/server/server-reference-manifest.json plus the
  // compiled chunk.
  it("carries no server-action identity in static markup", async () => {
    auth.mockResolvedValue(signedInSession());
    const markup = await renderLayout();

    expect(markup).toContain("<form");
    expect(markup).not.toContain("$ACTION_ID_");
  });
});
