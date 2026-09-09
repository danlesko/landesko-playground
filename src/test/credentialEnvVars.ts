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
 * Secrets and third-party configuration. Separate from the connection list only because
 * `@vercel/postgres` falls back across several of the names above, so that group has to
 * be cleared as a set or the fallback finds one that survived.
 */
export const SECRET_ENV_VARS = [
  "AUTH_SECRET",
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
