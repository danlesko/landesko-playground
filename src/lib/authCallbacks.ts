import type { NextAuthConfig } from "next-auth";
import { isOwnerGithubId } from "@/lib/owner";

export const authCallbacks = {
  signIn({ account }) {
    return (
      account?.provider === "github" &&
      isOwnerGithubId(account.providerAccountId)
    );
  },
  // `account` is only present on the sign-in request, so the id is captured once and
  // carried in the token from then on.
  jwt({ token, account }) {
    if (account?.provider === "github")
      token.githubId = account.providerAccountId;
    return token;
  },
  // @auth/core copies only name, email and picture from the token onto `session.user`.
  session({ session, token }) {
    if (session.user && typeof token.githubId === "string") {
      session.user.githubId = token.githubId;
    }
    return session;
  },
} satisfies NextAuthConfig["callbacks"];
