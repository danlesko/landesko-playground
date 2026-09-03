import { defineConfig, devices } from "@playwright/test";
import { randomBytes } from "node:crypto";

// Not 3000: `pnpm dev` usually owns that, and a suite that silently ran against
// a dev server would prove nothing about the deployed app.
const PORT = 3210;
const baseURL = `http://localhost:${PORT}`;

// Generated once and shared with the TEST process, not only the server.
//
// Still per-run and still never persisted, which is the part that matters: a
// constant published in a public repo would be a valid signing key for forged
// cookies against anyone running this suite. What changed is that the tests now
// need it. `e2e/auth-gate.spec.ts` mints a session cookie to check that the
// authoring gate admits a real one -- the only way to cover the authenticated
// path, since the GitHub OAuth app has a single callback URL registered against
// production and no local sign-in can complete.
//
// Read-then-generate, and the order is the whole trick. Playwright re-imports this
// config in every WORKER process, so a plain `randomBytes()` runs again there and
// each worker signs with a different key than the server was given -- which looks
// exactly like a rejected session, and cost a debugging round to find. The runner
// generates it and puts it in its own environment; workers are spawned after that
// and inherit it, so `??` finds it already set and reuses it.
//
// Consequence worth naming: if AUTH_SECRET is already in your environment, the
// suite uses that instead of generating one. That is harmless -- the server and the
// tests still agree, which is all this needs -- but it does mean the value is not
// unconditionally per-run.
const AUTH_SECRET = process.env.AUTH_SECRET ?? randomBytes(32).toString("hex");
process.env.AUTH_SECRET = AUTH_SECRET;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  // A smoke suite that needs a retry to go green is reporting something real.
  // Retries here would convert "the nav intermittently fails to navigate"
  // into a silent pass, which is the opposite of why this suite exists.
  retries: 0,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI
    ? [["github"], ["html", { open: "never" }]]
    : [["list"]],
  use: {
    baseURL,
    // No retries, so `on-first-retry` would never produce anything.
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // Production build, not `next dev`: `trustHost` defaults to true whenever
    // NODE_ENV !== "production" (@auth/core lib/utils/env.js), so dev mode does
    // not exercise the same auth path the deployed app takes.
    command: "pnpm start",
    url: baseURL,
    // Deliberately never reused, even locally. Reuse would attach to whatever
    // is already on this port -- including a server started from a different
    // build or without the env below -- and report its behaviour as this
    // commit's. That bit me while mutation-testing this suite: a survivor from
    // the previous run kept serving the old build and every mutation looked
    // undetected. `next start` boots in about a second, so the honest default
    // is cheap.
    reuseExistingServer: false,
    env: {
      PORT: String(PORT),
      // Switches on src/app/e2e-fixture/**, which 404s without it. Production never sets
      // it. The fixture exists because the confirmation modal is otherwise unrenderable --
      // its trigger sits behind a session and its card comes from Postgres -- so it had no
      // coverage of any kind, and two regressions shipped through that gap in one evening.
      E2E_FIXTURES: "1",
      // See the note on the constant above for why it is generated rather than
      // fixed, and why the tests now need the same value the server gets.
      AUTH_SECRET,
      // AUTH_URL rather than AUTH_TRUST_HOST: both satisfy the `trustHost`
      // check, but this one names the single origin we expect instead of
      // trusting whatever Host header shows up.
      //
      // One of the two is required. Without either, Auth.js fails the trustHost
      // assertion *before* it ever looks at the secret, `auth()` swallows the
      // resulting UntrustedHost error and returns null, and every route still
      // renders as anonymous. The /blog/create redirect test would then pass
      // because auth is broken rather than because the proxy predicate
      // works -- a green suite proving nothing. See e2e/smoke.spec.ts.
      AUTH_URL: baseURL,
    },
  },
});
