import type { Session } from "next-auth";

// GitHub's numeric account id rather than an email: an email can be detached from one
// account and attached to another, and the GitHub provider takes a primary email
// without checking that it is verified. The id is permanent.
export const OWNER_GITHUB_IDS: readonly string[] = ["11219427"];

export const isOwnerGithubId = (id: unknown): boolean =>
  typeof id === "string" && OWNER_GITHUB_IDS.includes(id);

// Checked against the list on every request rather than once at sign-in, so removing
// an id revokes its existing sessions instead of leaving them valid until they expire.
export const isOwner = (session: Session | null | undefined): boolean =>
  isOwnerGithubId(session?.user?.githubId);
