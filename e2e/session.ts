import { expect, type BrowserContext } from "@playwright/test";
import { encode } from "next-auth/jwt";

/**
 * Minting a session the server will accept, without involving GitHub.
 *
 * next-auth 5 with no adapter keeps the session as a JWT in a signed cookie, and
 * `next-auth/jwt` exports the same `encode` the library uses -- so a test can sign
 * one. That is the only way to reach the authenticated paths at all: the GitHub OAuth
 * app has a single callback URL registered against production, so no local or preview
 * sign-in can complete.
 *
 * `playwright.config.ts` generates one `AUTH_SECRET` per run and shares it with this
 * process. Nothing is committed, and no fixed key exists to be reused against anyone
 * running the suite.
 *
 * Extracted here because two specs need it: `auth-gate.spec.ts`, which checks the gate
 * from both sides, and `authoring-flow.spec.ts`, which drives create and delete.
 */

// `authjs.session-token` on http, `__Secure-` prefixed on https. The cookie name
// doubles as the encryption salt, which is an Auth.js convention rather than
// something this repo chose -- getting it wrong produces a cookie the server
// silently ignores, which would look exactly like a rejected session.
export const SESSION_COOKIE = "authjs.session-token";

/**
 * A session shaped like one the GitHub provider would produce. `sub` and an expiry
 * are what `auth()` needs to treat it as live; the rest is what the app reads off
 * `session.user`.
 *
 * Note the email does NOT have to be one of the two the `signIn` callback in
 * `src/auth.ts` allows. That callback runs during sign-in, not on session read, so it
 * is not part of what this exercises -- worth knowing before reading a passing test
 * as evidence that the allowlist works.
 */
export const sessionToken = () => ({
  name: "Test Author",
  email: "author@example.test",
  sub: "test-subject",
  exp: Math.floor(Date.now() / 1000) + 60 * 60,
});

export const signSession = async (token: Record<string, unknown>) => {
  const secret = process.env.AUTH_SECRET;
  // Asserted rather than defaulted. Without it `encode` would throw something less
  // obvious, and a test that quietly signed with `undefined` would report "session
  // rejected" for the wrong reason.
  expect(
    secret,
    "AUTH_SECRET is not visible to the test process -- playwright.config.ts is what shares it",
  ).toBeTruthy();
  return encode({ salt: SESSION_COOKIE, secret: secret!, token });
};

/** Puts a valid signed session on the context, so the next navigation is authored. */
export const signIn = async (context: BrowserContext) => {
  await context.addCookies([
    {
      name: SESSION_COOKIE,
      value: await signSession(sessionToken()),
      domain: "localhost",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
};
