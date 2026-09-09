/**
 * Every environment variable that can carry a real credential into a test run.
 *
 * Shared by the two suites, which is the point of the file. `src/test/setup.ts` DELETES
 * these before Vitest loads a module; `playwright.config.ts` sets them EMPTY in the web
 * server's environment, because Playwright merges `env` over the ambient one rather than
 * replacing it and there is no way to unset a key. Same list, two mechanisms.
 *
 * It lived only in setup.ts until the e2e suite grew a database and a forged session.
 * That combination is what made the omission matter: the config was reading an ambient
 * `AUTH_SECRET`, so a developer with production credentials exported had the suite mint
 * a session that verified against production. One name being handled and eighteen not
 * was the actual bug, so the list moved here rather than being copied.
 *
 * `NEXT_PUBLIC_` names belong here too even though they are public by design. A real
 * reCAPTCHA site key changes what the contact page DOES -- the widget is constructed and
 * calls Google -- so a run with one exercises a different code path from CI, and
 * `smoke.spec.ts` asserts that nothing is requested from those origins.
 */
export const CONNECTION_ENV_VARS = [
  "POSTGRES_URL",
  "POSTGRES_URL_NON_POOLING",
  "POSTGRES_URL_NO_SSL",
  "POSTGRES_PRISMA_URL",
  "POSTGRES_HOST",
  "POSTGRES_USER",
  "POSTGRES_PASSWORD",
  "POSTGRES_DATABASE",
  "DATABASE_URL",
] as const;

/**
 * Secrets and third-party configuration, kept as a separate group from the connection
 * strings purely for readability -- both are cleared together.
 *
 * An earlier version of this comment claimed `@vercel/postgres` falls back across the
 * names above, which is not true of the installed 0.10.0: it reads `POSTGRES_URL` and
 * `POSTGRES_URL_NON_POOLING` and nothing else. The remaining seven are defence in depth
 * against a different client being introduced, not a fallback chain.
 */
export const SECRET_ENV_VARS = [
  "AUTH_SECRET",
  // The Auth.js fallbacks, which are easy to miss and were: next-auth reads
  // `AUTH_SECRET ?? NEXTAUTH_SECRET` (next-auth/lib/env.js), and @auth/core additionally
  // collects `AUTH_SECRET_1..3` for key rotation (@auth/core/lib/utils/env.js, a literal
  // `for (const i of [1, 2, 3])`). Clearing AUTH_SECRET alone therefore does not stop a
  // real key being used -- it UNCOVERS the next one down.
  "NEXTAUTH_SECRET",
  "AUTH_SECRET_1",
  "AUTH_SECRET_2",
  "AUTH_SECRET_3",
  "AUTH_GITHUB_ID",
  "AUTH_GITHUB_SECRET",
  "SITE_SECRET_RECAPTCHA",
  "NEXT_PUBLIC_REACT_APP_SITE_KEY_RECAPTCHA",
  "EMAILJS_PRIVATE_KEY",
  "EMAILJS_PUBLIC_KEY",
  "EMAILJS_SERVICE_ID",
  "EMAILJS_TEMPLATE_ID",
  "NEXT_PUBLIC_EMAILJS_PUBLIC_KEY",
  "NEXT_PUBLIC_EMAILJS_SERVICE_ID",
  "NEXT_PUBLIC_EMAILJS_TEMPLATE_ID",
] as const;

export const CREDENTIAL_ENV_VARS = [
  ...CONNECTION_ENV_VARS,
  ...SECRET_ENV_VARS,
] as const;
