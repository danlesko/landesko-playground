import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";

export const { handlers, signIn, signOut, auth } = NextAuth({
  // GitHub now returns an `iss` parameter in the authorization response. Without
  // an expected issuer to compare it against, Auth.js fails closed with
  // "unexpected iss (issuer) response parameter value". See
  // https://github.com/nextauthjs/next-auth/issues/13409
  providers: [GitHub({ issuer: "https://github.com/login/oauth" })],
  callbacks: {
    signIn({ profile }) {
      const email = profile?.email ?? "";
      return ["lesko.dan.m@gmail.com", "dalesko@cisco.com"].includes(email);
    },
  },
});
