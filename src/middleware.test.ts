import type { Session } from "next-auth";
import type { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

import { sessionWithoutUser, signedInSession } from "@/test/auth-mock";

/**
 * The real `auth()` from `@/auth` does two things when used as middleware: it
 * resolves the session, then calls the handler with the request augmented as
 * `req.auth`. Only the first half needs replacing — it would otherwise pull in
 * NextAuth's provider config, read AUTH_* secrets and try to reach GitHub. So
 * the mock is a pass-through: the exported default *is* the handler written in
 * `middleware.ts`, and each test supplies the `req.auth` value that the real
 * wrapper would have resolved.
 *
 * Nothing here decides whether the request is authorized. The predicate under
 * test runs for real, and the assertions are on the Response it produces.
 *
 * What this deliberately does not cover: the wrapper's own behaviour — turning
 * a returned undefined into `NextResponse.next()`, and re-issuing the refreshed
 * session cookie. Exercising that would mean signing a real JWT and would test
 * next-auth rather than this repository's authorization predicate.
 */
vi.mock("@/auth", () => ({
  auth: (handler: MiddlewareHandler) => handler,
}));

// Hoisted above this import, so `middleware.ts` receives the mock.
import middleware from "@/middleware";

/** The shape next-auth passes to a middleware handler. */
type AuthedRequest = NextRequest & { auth: Session | null };
type MiddlewareHandler = (req: AuthedRequest) => Response | undefined;

const ORIGIN = "https://example.test";
const PROTECTED_URL = `${ORIGIN}/blog/create`;

/**
 * A request for the protected route carrying `session` as its resolved
 * session. A real `NextRequest` is used rather than a hand-rolled object so
 * that `req.nextUrl.origin` — which the redirect target is built from — is
 * computed by Next, not by the test.
 */
async function requestWith(session: Session | null): Promise<AuthedRequest> {
  const { NextRequest } = await import("next/server");
  const req = new NextRequest(PROTECTED_URL) as AuthedRequest;
  req.auth = session;
  return req;
}

function run(req: AuthedRequest): Response | undefined {
  return (middleware as unknown as MiddlewareHandler)(req);
}

function expectRedirectToHome(response: Response | undefined): void {
  expect(response).toBeInstanceOf(Response);
  expect(response?.status).toBe(302);
  expect(response?.headers.get("location")).toBe(`${ORIGIN}/`);
}

describe("middleware on /blog/create", () => {
  it("redirects an anonymous visitor to the home page", async () => {
    expectRedirectToHome(run(await requestWith(null)));
  });

  // The bug this file pins. `Session.user` is optional in @auth/core's types,
  // so this object satisfies `req.auth` while `createBlog`/`updateBlog` reject
  // it as Unauthorized. Under `if (!req.auth)` the form would render and then
  // fail every submit.
  it("redirects a session that carries no user", async () => {
    expectRedirectToHome(run(await requestWith(sessionWithoutUser())));
  });

  // The other direction: the guard must not be so strict that it locks out the
  // owner. The handler returns undefined to mean "no opinion"; the real
  // `auth()` wrapper turns that into a `NextResponse.next()` continuation.
  it("lets a signed-in user through without a redirect", async () => {
    expect(run(await requestWith(signedInSession()))).toBeUndefined();
  });

  // Guards against over-tightening. @auth/core builds the JWT-strategy session
  // as `user: { name: token.name, email: token.email, image: token.picture }`
  // (@auth/core/lib/actions/session.js), so a token carrying none of those
  // claims yields a `user` object whose every field is undefined. That user is
  // signed in. A predicate reaching one level deeper — `req.auth?.user?.name`
  // — would redirect them, and this is the case that catches it.
  it("lets a signed-in user with no profile claims through", async () => {
    const claimless: Session = {
      user: { name: undefined, email: undefined, image: undefined },
      expires: new Date(Date.now() + 60_000).toISOString(),
    };

    expect(run(await requestWith(claimless))).toBeUndefined();
  });
});

it("only guards the authoring route", async () => {
  const { config } = await import("@/middleware");
  expect(config.matcher).toBe("/blog/create");
});
