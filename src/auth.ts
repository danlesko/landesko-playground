import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";

export const { handlers, signIn, signOut, auth } = NextAuth({
  // Upstream owns the issuer now, so do not re-add it here after reading
  // https://github.com/nextauthjs/next-auth/issues/13409. GitHub returns an `iss`
  // parameter in the authorization response, and with no expected issuer to
  // compare against, Auth.js used to fail closed with "unexpected iss (issuer)
  // response parameter value". This file carried
  // `issuer: "https://github.com/login/oauth"` for that. beta.31 fixed it upstream
  // for RFC 9207: `@auth/core`'s GitHub provider sets
  // `issuer: ${baseUrl}/login/oauth` where `baseUrl` defaults to
  // "https://github.com" — the identical string, so removing it changes nothing
  // for github.com, and upstream's version follows `enterprise.baseUrl` where the
  // hardcoded one would have been wrong.
  //
  // `GitHub({})` rather than a bare `GitHub`, which is not cosmetic. `@auth/core`
  // infers provider config from `AUTH_GITHUB_*`, and the two forms take different
  // branches: a bare factory is CALLED with the inferred values
  // (`provider({clientId, clientSecret, issuer, apiKey})`), so an
  // `AUTH_GITHUB_ISSUER` in the environment would reach the provider as a user
  // option and win over the default. Passing an object means the provider already
  // carries an issuer, and inference is `finalProvider.issuer ??= issuer`, which
  // cannot override it. Client id and secret are unaffected either way — those
  // assignments run for both branches, so sign-in still reads `AUTH_GITHUB_ID`
  // and `AUTH_GITHUB_SECRET` from the environment.
  providers: [GitHub({})],
  callbacks: {
    signIn({ profile }) {
      const email = profile?.email ?? "";
      return ["lesko.dan.m@gmail.com", "dalesko@cisco.com"].includes(email);
    },
  },
});
