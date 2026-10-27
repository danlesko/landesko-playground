import type { Session } from "next-auth";
import { describe, expect, it } from "vitest";

import { authCallbacks } from "@/lib/authCallbacks";
import { OWNER_GITHUB_IDS } from "@/lib/owner";

const OWNER_ID = OWNER_GITHUB_IDS[0]!;

// The callbacks' parameter types are unions over every provider and session strategy;
// these tests pass only the fields this app's callbacks read.
const signIn = (account: unknown, profile: unknown = {}) =>
  authCallbacks.signIn({ account, profile } as never);
const jwt = (token: Record<string, unknown>, account?: unknown) =>
  authCallbacks.jwt({ token, account } as never) as Record<string, unknown>;
const session = (sessionIn: Session, token: Record<string, unknown>) =>
  authCallbacks.session({ session: sessionIn, token } as never) as Session;

const githubAccount = (providerAccountId: string) => ({
  provider: "github",
  type: "oauth",
  providerAccountId,
});

describe("signIn", () => {
  it("admits the owner's GitHub account", () => {
    expect(signIn(githubAccount(OWNER_ID))).toBe(true);
  });

  // The defect this replaces: the allowlist used to be the profile's email address.
  it("refuses another GitHub account even when it presents the owner's email", () => {
    expect(signIn(githubAccount("1"), { email: "lesko.dan.m@gmail.com" })).toBe(
      false,
    );
  });

  it("refuses the owner's id arriving from a different provider", () => {
    expect(
      signIn({ ...githubAccount(OWNER_ID), provider: "credentials" }),
    ).toBe(false);
  });

  it("refuses a sign-in with no account", () => {
    expect(signIn(null)).toBe(false);
  });
});

describe("jwt", () => {
  it("records the GitHub id on the sign-in request", () => {
    expect(jwt({ sub: "x" }, githubAccount(OWNER_ID))).toMatchObject({
      sub: "x",
      githubId: OWNER_ID,
    });
  });

  // Every request after sign-in arrives with no account, and must keep the recorded id.
  it("keeps the recorded id on later requests", () => {
    expect(jwt({ githubId: OWNER_ID })).toMatchObject({ githubId: OWNER_ID });
  });

  it("records nothing for a token with no GitHub account behind it", () => {
    expect(jwt({ sub: "x" })).not.toHaveProperty("githubId");
  });
});

describe("session", () => {
  const base = (): Session => ({
    user: { name: "Dan", email: "owner@example.com", image: null },
    expires: "2099-01-01T00:00:00.000Z",
  });

  it("copies the GitHub id onto the session user", () => {
    expect(session(base(), { githubId: OWNER_ID }).user).toEqual({
      name: "Dan",
      email: "owner@example.com",
      image: null,
      githubId: OWNER_ID,
    });
  });

  it("leaves the user without an id when the token has none", () => {
    expect(session(base(), {}).user).not.toHaveProperty("githubId");
  });

  it("ignores an id that is not a string", () => {
    expect(session(base(), { githubId: 11219427 }).user).not.toHaveProperty(
      "githubId",
    );
  });

  it("keeps the expiry it was given", () => {
    expect(session(base(), { githubId: OWNER_ID }).expires).toBe(
      "2099-01-01T00:00:00.000Z",
    );
  });
});
