import { defineConfig, devices } from "@playwright/test";
import { randomBytes } from "node:crypto";
import { join } from "node:path";

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

// The /blog routes need a database, and `E2E_DATABASE=1` is the single switch that
// says one is present. Four tests depend on it. `pnpm e2e:db:up` starts it and prints the line to run.
//
// One switch rather than making the caller export a connection string, because the
// connection details are not free parameters: the host has to contain `-pooler` or
// `@vercel/postgres` rejects it, and the TLS certificate is issued for a DIFFERENT
// name that the driver derives. Those constraints belong next to the compose file
// that satisfies them, not in whatever a caller happens to type. Same shape as
// E2E_FIXTURES above it.
//
// Absent, those four skip with a reason and everything else runs exactly as before,
// so the suite stays usable without Docker. The two error-boundary tests are the
// mirror image: they skip when this IS set, because a working read leaves no
// boundary to attribute, and CI gives them their own pass without a connection.
const DATABASE = process.env.E2E_DATABASE === "1";
const DATABASE_ENV: Record<string, string> = DATABASE
  ? {
      POSTGRES_URL:
        "postgres://postgres:postgres@db-pooler.localtest.me:5432/main",
      // Caddy's own root, extracted by e2e/db/up.sh. Pointing Node at it keeps TLS
      // verification ON; the alternative, NODE_TLS_REJECT_UNAUTHORIZED=0, would
      // disable it for every request the app makes, which is a lot of blast radius
      // for one self-signed certificate.
      // `__dirname`, not `import.meta.url`. Playwright transpiles this config to
      // CommonJS, where `import.meta` is a SyntaxError that takes the whole run
      // down before any test loads -- the same trap e2e/a11y.spec.ts documents for
      // spec files, and it applies here too.
      NODE_EXTRA_CA_CERTS: join(__dirname, "e2e/db/.caddy-root.crt"),
    }
  : {};

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
      ...DATABASE_ENV,
    },
  },
});
