import { defineConfig, devices } from "@playwright/test";
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import { E2E_DATABASE_URL } from "./e2e/fixtures";
import { CREDENTIAL_ENV_VARS } from "./src/test/credentialEnvVars";

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
// Generated fresh by the RUNNER, and reused only by worker processes. Both halves are
// necessary, and neither is obvious.
//
// This config's module body really does run in every worker, which is why the value has to
// be shared at all: a plain `randomBytes()` would give each worker a different key from the
// one the server was handed, every forged session would be rejected, and that is
// indistinguishable from the auth gate working. Measured rather than assumed, because a
// review disputed it -- logging each module load shows 8 evaluations for a 7-worker run,
// one per `workerProcessEntry.js` plus one in `cli.js`.
//
// But sharing must not mean TRUSTING what was inherited. A bare
// `process.env.E2E_AUTH_SECRET ?? randomBytes(...)` lets an ambient value become the
// server's signing key -- the same defect as the ambient `AUTH_SECRET` this file used to
// read. So the runner always generates, and only a process that is genuinely a worker
// reuses. TWO signals identify one, because `TEST_WORKER_INDEX` alone is just an
// environment variable a shell could carry: Playwright sets it in `workerProcessEntry.js`,
// which is also the entry point such a process is running.
//
// Worth stating what the exposure actually was, since the obvious phrasing overstates it.
// A forged token would NOT verify against production over HTTPS: the salt is the cookie
// name and feeds HKDF, and production uses the `__Secure-` prefixed name, so the derived
// key differs. What matters is that a real key would be handed to a local server and land
// in the traces Playwright writes on failure.
const IS_WORKER =
  process.env.TEST_WORKER_INDEX !== undefined &&
  process.argv[1]?.endsWith("workerProcessEntry.js") === true;
const INHERITED = process.env.E2E_AUTH_SECRET;
// A worker with no inherited secret cannot sign anything the server will accept, and the
// failure that produces is a rejected session -- indistinguishable from the gate working.
// Better to say so than to hand `undefined` to `encode`.
if (IS_WORKER && !INHERITED) {
  throw new Error(
    "TEST_WORKER_INDEX is set but E2E_AUTH_SECRET is not; the runner should have generated and exported it.",
  );
}
const E2E_AUTH_SECRET = IS_WORKER
  ? INHERITED!
  : randomBytes(32).toString("hex");
process.env.E2E_AUTH_SECRET = E2E_AUTH_SECRET;

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
      POSTGRES_URL: E2E_DATABASE_URL,
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
  // Sweeps rows an interrupted previous run left behind. Once, in the runner, before any
  // worker -- see e2e/global-setup.ts for why that placement is the whole point.
  globalSetup: "./e2e/global-setup.ts",
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
      // Cleared FIRST, so everything meaningful below overrides a blank rather than an
      // inherited value. Playwright merges `env` over the ambient environment instead of
      // replacing it, and there is no way to unset a key -- empty string is the unset.
      //
      // Without this the web server inherits whatever the developer has exported, which
      // is not a theoretical concern: `src/test/setup.ts` has cleared the same names for
      // Vitest since it existed, and the one name this config DID handle, AUTH_SECRET,
      // turned out to be handled wrongly (it read the ambient value). A run with real
      // credentials exported reaches a real database, and makes a real signing key the one
      // this suite signs with -- which Playwright then writes into traces on failure.
      //
      // This covers the SERVER-read names only, and the limit is worth stating because it
      // is invisible: `NEXT_PUBLIC_*` values are inlined into the client bundle by
      // `next build`, so by the time this environment exists they are already compiled in
      // and blanking them here does nothing. Measured -- building with a reCAPTCHA site
      // key exported puts it in a chunk and fails four tests no matter what this sets.
      // `pnpm build:e2e` is what clears those, and it has to be the build that does it.
      ...Object.fromEntries(CREDENTIAL_ENV_VARS.map((name) => [name, ""])),
      PORT: String(PORT),
      // Switches on src/app/e2e-fixture/**, which 404s without it. Production never sets
      // it. The fixture exists because the confirmation modal is otherwise unrenderable --
      // its trigger sits behind a session and its card comes from Postgres -- so it had no
      // coverage of any kind, and two regressions shipped through that gap in one evening.
      E2E_FIXTURES: "1",
      // The generated value, always overriding anything ambient -- see the note on
      // the constant above.
      AUTH_SECRET: E2E_AUTH_SECRET,
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
