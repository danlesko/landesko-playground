import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement, isValidElement, type ReactElement } from "react";

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

// Everything the header control does not depend on. MainNav is a client
// component that reads a router context this renderer has no provider for, and
// next/font/google fetches at import time.
vi.mock("next/font/google", () => ({
  Montserrat: () => ({ className: "mont" }),
}));
vi.mock("@/components/MainNav", () => ({ default: () => null }));
// These two render a MARKER rather than null, and the markers are asserted below.
//
// The real components render null, so mocking them to null was indistinguishable from not
// mocking them at all -- and worse, from the mock silently going inert. `vi.mock` keyed on a
// module path that nothing imports is a no-op with zero diagnostics, so if either package ever
// moves its `/next` subpath, these lines would stop applying and the real components would load
// in a unit test without anything failing. #130 bumped both across a major (1.x -> 2.x) and the
// subpaths happened to survive; the marker is so that the next major cannot pass quietly.
vi.mock("@vercel/analytics/next", () => ({
  Analytics: () => createElement("div", { "data-mock": "analytics" }),
}));
vi.mock("@vercel/speed-insights/next", () => ({
  SpeedInsights: () => createElement("div", { "data-mock": "speed-insights" }),
}));

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

/**
 * That the two Vercel scripts are still mounted, and that the mocks above are still live.
 *
 * Both assertions come from the same markup on purpose, because the interesting failure is
 * shared: `vi.mock` on a module path that nothing imports does nothing at all and reports
 * nothing. If `@vercel/analytics` moves its `/next` subpath in some future major, the import in
 * layout.tsx changes, the `vi.mock` path stops matching, and the real component -- which renders
 * null -- loads instead. Every existing assertion in this file would still pass.
 *
 * So the mocks render a marker and this looks for it. A missing marker means either the layout
 * stopped mounting the component or the mock went inert, and both are worth failing over.
 */
describe("the Vercel analytics scripts", () => {
  it.each([
    ["analytics", "@vercel/analytics/next"],
    ["speed-insights", "@vercel/speed-insights/next"],
  ])("mounts %s, and its mock is not inert", async (marker, module) => {
    auth.mockResolvedValue(null);
    const markup = renderToStaticMarkup(await renderTree());

    expect(
      markup,
      `no marker for ${marker}: either layout.tsx stopped rendering it, or the vi.mock on "${module}" no longer matches what layout.tsx imports and has silently stopped applying`,
    ).toContain(`data-mock="${marker}"`);
  });
});
