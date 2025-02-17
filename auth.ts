import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [GitHub],
  callbacks: {
    signIn({ profile }) {
      const email = profile?.email ?? "";
      return ["lesko.dan.m@gmail.com", "dalesko@cisco.com"].includes(email);
    },
  },
});
