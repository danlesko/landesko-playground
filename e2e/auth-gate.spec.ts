import { test, expect } from "@playwright/test";
import { encode } from "next-auth/jwt";

/**
 * The authoring gate, from both sides.
 *
 * Until this file the authenticated path through that gate had NO coverage of any
 * kind. `src/proxy.test.ts` replaces `auth()` with a pass-through, so it tests the
 * matcher and the redirect but never the wrapper, and the e2e suite only ever
 * requested `/blog/create` anonymously. Signing in for real is not available: the
 * GitHub OAuth app has a single callback URL registered against production, so no
 * local or preview sign-in can complete.
 *
 * What makes it testable anyway is that next-auth 5 with no adapter keeps the
 * session as a JWT in a signed cookie, and `next-auth/jwt` exports the same
 * `encode` the library uses. So a test can mint a session the server will accept
 * without involving GitHub. `playwright.config.ts` generates one `AUTH_SECRET` per
 * run and shares it with this process; nothing is committed and no fixed key
 * exists to be reused against anyone.
 *
 * Written as the acceptance criterion for #153, the `middleware.ts` -> `proxy.ts`
 * rename, and it is now the thing standing behind it. That rename moved the gate from the Edge runtime to Node -- `proxy` is
 * node-only and not configurable -- and doing that with nothing observing whether
 * a real session is still admitted would be changing the runtime of an auth
 * decision blind. These assertions ran green against `middleware.ts` FIRST, before the
 * rename, so a failure here means the rename rather than the test.
 *
 * Both directions, because only one of them is the interesting half. "Rejects
 * anonymous" already passed when the gate was accidentally open in one direction:
 * a predicate of `req.auth` rather than `req.auth?.user` admits a session with no
 * user, and `Session.user` is optional in @auth/core's types. So a test that only
 * checks the redirect cannot see the gate failing OPEN.
 */

// `authjs.session-token` on http, `__Secure-` prefixed on https. The cookie name
// doubles as the encryption salt, which is an Auth.js convention rather than
// something this repo chose -- getting it wrong produces a cookie the server
// silently ignores, which would look exactly like a rejected session.
const SESSION_COOKIE = "authjs.session-token";

const signSession = async (token: Record<string, unknown>) => {
  const secret = process.env.AUTH_SECRET;
  // Asserted rather than defaulted. Without it `encode` would throw something
  // less obvious, and a test that quietly signed with `undefined` would report
  // "session rejected" for the wrong reason.
  expect(
    secret,
    "AUTH_SECRET is not visible to the test process -- playwright.config.ts is what shares it",
  ).toBeTruthy();
  return encode({
    salt: SESSION_COOKIE,
    secret: secret!,
    token,
  });
};

// A session shaped like one the GitHub provider would produce. `sub` and an
// expiry are what `auth()` needs to treat it as live; the rest is what the app
// reads off `session.user`.
const sessionToken = {
  name: "Test Author",
  email: "author@example.test",
  sub: "test-subject",
  exp: Math.floor(Date.now() / 1000) + 60 * 60,
};

test("the authoring route admits a real signed session", async ({
  page,
  context,
}) => {
  await context.addCookies([
    {
      name: SESSION_COOKIE,
      value: await signSession(sessionToken),
      domain: "localhost",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);

  await page.goto("/blog/create");

  // Asserted on the URL first: the failure mode being guarded is a redirect, and
  // "we are still on the route we asked for" is the whole claim. A content
  // assertion alone would also pass on a page that redirected somewhere that
  // happens to contain a heading.
  await expect(
    page,
    "a valid session was redirected away from /blog/create, so the gate rejects real sessions",
  ).toHaveURL(/\/blog\/create$/);

  // And that the authoring form actually rendered, not just that the URL stuck.
  await expect(page.getByRole("textbox", { name: /title/i })).toBeVisible();
});

test("the authoring route rejects a cookie signed with the wrong key", async ({
  page,
  context,
}) => {
  // Signed correctly, then corrupted. Not a random string: a malformed cookie
  // could be rejected by the decoder before the signature is ever checked, which
  // would pass this test without proving the signature is verified. Flipping
  // characters inside a structurally valid token is what exercises that.
  const valid = await signSession(sessionToken);
  const tampered =
    valid.slice(0, -6) + (valid.slice(-6) === "aaaaaa" ? "bbbbbb" : "aaaaaa");
  expect(tampered).not.toBe(valid);

  await context.addCookies([
    {
      name: SESSION_COOKIE,
      value: tampered,
      domain: "localhost",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);

  await page.goto("/blog/create");

  await expect(
    page,
    "a tampered session cookie reached /blog/create, so the signature is not being verified",
  ).toHaveURL(/\/$/);
});

test("the authoring route still rejects an anonymous visitor", async ({
  page,
}) => {
  // The control for the two above. Without it, a gate that redirected everything
  // would satisfy the tampered-cookie test, and a gate that admitted everything
  // would satisfy neither -- but this pins which of the three outcomes is which.
  await page.goto("/blog/create");

  await expect(page).toHaveURL(/\/$/);
});
