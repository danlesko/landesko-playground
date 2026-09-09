import { beforeEach, vi } from "vitest";
import { CREDENTIAL_ENV_VARS } from "./credentialEnvVars";

// There is a real production Postgres behind POSTGRES_URL. Nothing in this
// suite may reach it, so the connection strings are removed from the
// environment before any module can read them. Every test that touches the
// data layer also mocks `@vercel/postgres`; this is the second line of
// defence, so that a missing mock fails with "missing connection string"
// instead of quietly opening a socket to production.
//
// The list moved to ./credentialEnvVars so playwright.config.ts can clear the same
// names. It had drifted in the way that matters: the e2e config was reading an ambient
// AUTH_SECRET while this file was deleting it.
for (const name of CREDENTIAL_ENV_VARS) {
  delete process.env[name];
}

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

// Fail loudly at load time if the guard above is ever undone. Covers the whole
// credential list now, not just the connection strings: a surviving AUTH_SECRET is as
// much a problem as a surviving POSTGRES_URL, and that asymmetry is what let the e2e
// config read one for as long as it did.
for (const name of CREDENTIAL_ENV_VARS) {
  if (process.env[name] !== undefined) {
    throw new Error(
      `${name} is still set inside the test process; refusing to run against real credentials.`,
    );
  }
}
