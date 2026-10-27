import type { Session } from "next-auth";
import { vi } from "vitest";
import { OWNER_GITHUB_IDS } from "@/lib/owner";

/**
 * Stand-in for `auth()` from `src/auth.ts`. Mocking the whole module keeps the
 * suite away from NextAuth's provider config and the GitHub network calls it
 * would otherwise make, while leaving the authorization *check* in
 * `src/lib/actions.ts` running for real.
 */
export const auth = vi.fn<() => Promise<Session | null>>();

/** A signed-in owner. */
export function signedInSession(): Session {
  return {
    user: {
      name: "Dan",
      email: "owner@example.com",
      githubId: OWNER_GITHUB_IDS[0],
    },
    expires: new Date(Date.now() + 60_000).toISOString(),
  };
}

/**
 * A real session for someone who is not the owner. It carries the owner's EMAIL, so a
 * check that still trusted the address would wrongly admit it.
 */
export function nonOwnerSession(): Session {
  return {
    user: { name: "Someone", email: "owner@example.com", githubId: "1" },
    expires: new Date(Date.now() + 60_000).toISOString(),
  };
}

/**
 * The owner's session as issued before the GitHub id was recorded in the token. It must
 * be refused, which means signing in again once after this change deploys.
 */
export function sessionWithoutGithubId(): Session {
  return {
    user: { name: "Dan", email: "owner@example.com" },
    expires: new Date(Date.now() + 60_000).toISOString(),
  };
}

/**
 * A session object that exists but carries no user, so `if (!session)` alone would
 * wrongly treat it as authorized.
 *
 * Synthetic, and worth being precise about since it used to be observed behaviour.
 * next-auth returned exactly this shape from a misconfigured provider until
 * 5.0.0-beta.32, which now parses any non-OK session response as no session
 * (GHSA-8fpg-xm3f-6cx3). On beta.32, with this app's config, nothing produces it:
 * a successful JWT session always carries a user, and there is no
 * `callbacks.session` here that could strip one.
 *
 * Kept anyway, because `Session["user"]` is optional in @auth/core's types, so the
 * shape is legal and a future session callback could return it. It pins a type
 * contract now rather than a live upstream behaviour.
 */
export function sessionWithoutUser(): Session {
  return {
    expires: new Date(Date.now() + 60_000).toISOString(),
  };
}

export function resetAuthMock(): void {
  auth.mockReset();
}
