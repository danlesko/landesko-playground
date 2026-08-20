import { beforeEach, vi } from "vitest";

// There is a real production Postgres behind POSTGRES_URL. Nothing in this
// suite may reach it, so the connection strings are removed from the
// environment before any module can read them. Every test that touches the
// data layer also mocks `@vercel/postgres`; this is the second line of
// defence, so that a missing mock fails with "missing connection string"
// instead of quietly opening a socket to production.
const CONNECTION_ENV_VARS = [
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

for (const name of CONNECTION_ENV_VARS) {
  delete process.env[name];
}

// Real secrets must not leak into assertions or console output either.
delete process.env.SITE_SECRET_RECAPTCHA;
delete process.env.AUTH_SECRET;
delete process.env.AUTH_GITHUB_SECRET;

/**
 * Any outbound HTTP request that a test has not explicitly stubbed is a bug in
 * the test, not something to tolerate: it would make the suite depend on the
 * network and could hit a third party with a real token.
 */
export function forbiddenFetch(): never {
  throw new Error(
    "Unexpected network access in a test. Stub global fetch for this case.",
  );
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(forbiddenFetch));
});

// Fail loudly at load time if the guard above is ever undone.
for (const name of CONNECTION_ENV_VARS) {
  if (process.env[name] !== undefined) {
    throw new Error(
      `${name} is still set inside the test process; refusing to run against a real database.`,
    );
  }
}
