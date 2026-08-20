import { defineConfig, devices } from "@playwright/test";
import { randomBytes } from "node:crypto";

// Not 3000: `pnpm dev` usually owns that, and a suite that silently ran against
// a dev server would prove nothing about the deployed app.
const PORT = 3210;
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  // A smoke suite that needs a retry to go green is reporting something real.
  // Retries here would convert "the sidebar intermittently fails to navigate"
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
      // Regenerated per run and never persisted. Auth.js only requires that a
      // secret exist -- these tests never complete a sign-in -- so there is
      // nothing to be gained by fixing its value, and a constant published in
      // a public repo would be a valid signing key for forged cookies against
      // anyone running this suite.
      AUTH_SECRET: randomBytes(32).toString("hex"),
      // AUTH_URL rather than AUTH_TRUST_HOST: both satisfy the `trustHost`
      // check, but this one names the single origin we expect instead of
      // trusting whatever Host header shows up.
      //
      // One of the two is required. Without either, Auth.js fails the trustHost
      // assertion *before* it ever looks at the secret, `auth()` swallows the
      // resulting UntrustedHost error and returns null, and every route still
      // renders as anonymous. The /blog/create redirect test would then pass
      // because auth is broken rather than because the middleware predicate
      // works -- a green suite proving nothing. See e2e/smoke.spec.ts.
      AUTH_URL: baseURL,
    },
  },
});
