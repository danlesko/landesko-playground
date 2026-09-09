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
 * `playwright.config.ts` generates an `E2E_AUTH_SECRET` per run, hands it to the server
 * as its `AUTH_SECRET`, and shares it with this process. Under its own name deliberately,
 * and generated in the runner rather than inherited: reading an ambient `AUTH_SECRET`
 * would make a real signing key the key this suite signs with, and Playwright writes
 * traces on failure. Nothing is committed and no fixed key exists.
 *
 * Worth being precise about the blast radius rather than alarming about it, because the
 * obvious phrasing -- "it would mint a session valid in production" -- is wrong. The salt
 * IS the cookie name (`@auth/core/jwt.js`, `salt = cookieName`) and it feeds HKDF as both
 * key material and info string, while an HTTPS deployment uses the `__Secure-` prefixed
 * name. A token salted with the plain name therefore does not decrypt there. The real
 * exposure is the key itself being handed to a local server and written into traces.
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
 * A session shaped like one the GitHub provider would produce -- the fields the app
 * reads off `session.user`.
 *
 * The lifetime is NOT set here, and an earlier version wrongly claimed it was:
 * `encode()` supplies its own `iat`, `exp` and `jti`, overwriting any `exp` passed in,
 * so it lands with the library's 30-day default. Nothing here depends on the value, and
 * pinning it would take `maxAge` rather than a token field.
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
});

export const signSession = async (token: Record<string, unknown>) => {
  const secret = process.env.E2E_AUTH_SECRET;
  // Asserted rather than defaulted. Without it `encode` would throw something less
  // obvious, and a test that quietly signed with `undefined` would report "session
  // rejected" for the wrong reason.
  expect(
    secret,
    "E2E_AUTH_SECRET is not visible to the test process -- playwright.config.ts generates and shares it",
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
