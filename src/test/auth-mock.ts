import type { Session } from "next-auth";
import { vi } from "vitest";

/**
 * Stand-in for `auth()` from `src/auth.ts`. Mocking the whole module keeps the
 * suite away from NextAuth's provider config and the GitHub network calls it
 * would otherwise make, while leaving the authorization *check* in
 * `src/lib/actions.ts` running for real.
 */
export const auth = vi.fn<() => Promise<Session | null>>();

/** A session that satisfies `session?.user` — i.e. a signed-in owner. */
export function signedInSession(): Session {
  return {
    user: { name: "Dan", email: "owner@example.com" },
    expires: new Date(Date.now() + 60_000).toISOString(),
  };
}

/**
 * A session object that exists but carries no user. NextAuth can return this,
 * and `if (!session)` alone would wrongly treat it as authorized.
 */
export function sessionWithoutUser(): Session {
  return {
    expires: new Date(Date.now() + 60_000).toISOString(),
  };
}

export function resetAuthMock(): void {
  auth.mockReset();
}
