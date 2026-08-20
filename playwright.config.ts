import { defineConfig, devices } from "@playwright/test";

// Not 3000: `pnpm dev` usually owns that, and `reuseExistingServer` below would
// otherwise happily run the suite against a dev server, or against a stale
// production server someone left up.
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
    // Production build, not `next dev`: middleware redirects and the RSC/auth
    // path behave differently enough in dev that a dev-mode pass would not tell
    // us the deployed app works.
    command: "pnpm start",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    env: {
      PORT: String(PORT),
      // Anonymous smoke tests never complete a sign-in, so this only has to
      // exist, not be secret — it is a literal, not a credential, and no real
      // secret belongs in this file.
      //
      // It is here rather than in the CI workflow so that local and CI runs
      // share one definition. Without it Auth.js returns `UntrustedHost` before
      // it ever checks the secret, `auth()` swallows that and yields `null`, and
      // every page still renders as anonymous — which means the redirect test
      // below would pass because auth is *broken* rather than because the
      // middleware predicate works. See e2e/smoke.spec.ts.
      AUTH_SECRET: "playwright-e2e-placeholder-not-a-real-secret",
      AUTH_TRUST_HOST: "true",
    },
  },
});
