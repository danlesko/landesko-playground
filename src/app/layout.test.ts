import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { isValidElement, type ReactElement } from "react";

import {
  auth,
  resetAuthMock,
  sessionWithoutUser,
  signedInSession,
} from "@/test/auth-mock";

const authApi = vi.hoisted(() => ({
  signIn: vi.fn<(provider: string) => Promise<void>>(),
  signOut: vi.fn<() => Promise<void>>(),
}));

vi.mock("@/auth", async () => {
  const { auth: authMock } = await import("@/test/auth-mock");
  return { auth: authMock, ...authApi };
});

// Everything the header control does not depend on. Sidebar is a client
// component that reads a router context this renderer has no provider for, and
// next/font/google fetches at import time.
vi.mock("next/font/google", () => ({
  Montserrat: () => ({ className: "mont" }),
}));
vi.mock("@/components/Sidebar", () => ({ default: () => null }));
vi.mock("@vercel/analytics/next", () => ({ Analytics: () => null }));
vi.mock("@vercel/speed-insights/next", () => ({ SpeedInsights: () => null }));

import RootLayout from "@/app/layout";

async function renderTree(): Promise<ReactElement> {
  return (await RootLayout({ children: null })) as ReactElement;
}

// Text content, not the accessible name: `Button` renders a `<button>` with no
// name attribute, so the label IS the name and a name query would be circular.
function buttonLabels(markup: string): string[] {
  return [...markup.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/g)].map((m) =>
    m[1]!.replace(/<[^>]*>/g, "").trim(),
  );
}

// The action is a function reference, and static markup carries none of it --
// React serialises the form as `action="javascript:throw ..."` with no
// $ACTION_ID_. So the mapping has to be read off the element tree before it is
// serialised, which is also the only place the two actions are distinguishable
// at all in a unit test.
function forms(node: unknown): ReactElement[] {
  if (Array.isArray(node)) return node.flatMap(forms);
  if (!isValidElement(node)) return [];
  const props = node.props as { children?: unknown };
  const nested = forms(props.children);
  return node.type === "form" ? [node, ...nested] : nested;
}

beforeEach(() => {
  resetAuthMock();
  authApi.signIn.mockReset();
  authApi.signOut.mockReset();
});

const STATES = [
  { state: "no session", session: null, label: "Login", signsIn: true },
  // The two cases below differ only in `user`, which is what pins
  // `Boolean(session?.user)` rather than `Boolean(session)`: the looser guard would
  // offer an anonymous reader a logout. Until next-auth 5.0.0-beta.32 a
  // misconfigured provider produced exactly that shape, which is how this case was
  // found; beta.32 parses a non-OK session response as no session, so it is now a
  // type contract (`Session["user"]` is optional) rather than a reachable state.
  {
    state: "a session with no user",
    session: sessionWithoutUser(),
    label: "Login",
    signsIn: true,
  },
  {
    state: "a signed-in session",
    session: signedInSession(),
    label: "Logout",
    signsIn: false,
  },
];

describe("the header auth control", () => {
  it.each(STATES)("reads $label for $state", async ({ session, label }) => {
    auth.mockResolvedValue(session);
    const markup = renderToStaticMarkup(await renderTree());

    expect(buttonLabels(markup)).toEqual([label]);
    // Without this the control is inert whatever its action says, and no
    // assertion below would notice.
    expect(markup).toContain('type="submit"');
  });

  it.each(STATES)(
    "submits to $label for $state",
    async ({ session, signsIn }) => {
      auth.mockResolvedValue(session);
      const found = forms(await renderTree());
      expect(found).toHaveLength(1);

      const { action } = found[0]!.props as { action?: () => Promise<void> };
      expect(action).toBeTypeOf("function");
      await action!();

      expect(authApi.signIn.mock.calls).toEqual(signsIn ? [["github"]] : []);
      expect(authApi.signOut).toHaveBeenCalledTimes(signsIn ? 0 : 1);
    },
  );
});
