import type { Session } from "next-auth";
import type { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

import { sessionWithoutUser, signedInSession } from "@/test/auth-mock";

// Pass-through so the predicate itself runs for real: only session resolution
// is replaced, which would otherwise read AUTH_* secrets and reach GitHub.
vi.mock("@/auth", () => ({
  auth: (handler: ProxyHandler) => handler,
}));

// Hoisted above this import, so `proxy.ts` receives the mock.
import proxy from "@/proxy";

/** The shape next-auth passes to the handler. */
type AuthedRequest = NextRequest & { auth: Session | null };
type ProxyHandler = (req: AuthedRequest) => Response | undefined;

const ORIGIN = "https://example.test";
const PROTECTED_URL = `${ORIGIN}/blog/create`;

// A real NextRequest, not a stub, so `nextUrl.origin` in the redirect target
// is computed by Next rather than by the test.
async function requestWith(session: Session | null): Promise<AuthedRequest> {
  const { NextRequest } = await import("next/server");
  const req = new NextRequest(PROTECTED_URL) as AuthedRequest;
  req.auth = session;
  return req;
}

function run(req: AuthedRequest): Response | undefined {
  return (proxy as unknown as ProxyHandler)(req);
}

function expectRedirectToHome(response: Response | undefined): void {
  expect(response).toBeInstanceOf(Response);
  expect(response?.status).toBe(302);
  expect(response?.headers.get("location")).toBe(`${ORIGIN}/`);
}

describe("proxy on /blog/create", () => {
  it("redirects an anonymous visitor to the home page", async () => {
    expectRedirectToHome(run(await requestWith(null)));
  });

  // The bug this pins: satisfies `req.auth`, but actions.ts rejects it, so
  // under `if (!req.auth)` the form rendered and then failed every submit.
  it("redirects a session that carries no user", async () => {
    expectRedirectToHome(run(await requestWith(sessionWithoutUser())));
  });

  // undefined is the handler's "no opinion"; the wrapper turns it into next().
  it("lets a signed-in user through without a redirect", async () => {
    expect(run(await requestWith(signedInSession()))).toBeUndefined();
  });

  // Guards against over-tightening: @auth/core always builds `user` from the
  // name/email/picture claims, so all-undefined fields still mean signed in.
  it("lets a signed-in user with no profile claims through", async () => {
    const claimless: Session = {
      user: { name: undefined, email: undefined, image: undefined },
      expires: new Date(Date.now() + 60_000).toISOString(),
    };

    expect(run(await requestWith(claimless))).toBeUndefined();
  });
});

it("only guards the authoring route", async () => {
  const { config } = await import("@/proxy");
  expect(config.matcher).toBe("/blog/create");
});
