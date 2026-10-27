import { describe, expect, it } from "vitest";

import { OWNER_GITHUB_IDS, isOwner, isOwnerGithubId } from "@/lib/owner";
import {
  nonOwnerSession,
  sessionWithoutGithubId,
  sessionWithoutUser,
  signedInSession,
} from "@/test/auth-mock";

describe("isOwnerGithubId", () => {
  it("admits an allowlisted id", () => {
    expect(isOwnerGithubId(OWNER_GITHUB_IDS[0])).toBe(true);
  });

  it.each([
    ["another account's id", "1"],
    ["the id as a number rather than the string the token carries", 11219427],
    ["an empty string", ""],
    ["undefined", undefined],
    ["a prefix of the id", OWNER_GITHUB_IDS[0]!.slice(0, -1)],
  ])("refuses %s", (_label, id) => {
    expect(isOwnerGithubId(id)).toBe(false);
  });
});

describe("isOwner", () => {
  it("admits the owner's session", () => {
    expect(isOwner(signedInSession())).toBe(true);
  });

  it.each([
    ["no session", () => null],
    ["a session with no user", sessionWithoutUser],
    ["a non-owner carrying the owner's email", nonOwnerSession],
    ["a session issued before the id was recorded", sessionWithoutGithubId],
  ])("refuses %s", (_label, makeSession) => {
    expect(isOwner(makeSession())).toBe(false);
  });
});
