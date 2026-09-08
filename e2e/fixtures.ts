/**
 * The rows `e2e/db/init/init.sh` seeds, named once so two spec files cannot drift
 * apart on them.
 *
 * The SQL is the source of truth, not this file. If they disagree the tests fail
 * loudly -- a missing post, not a subtle wrong answer -- but there is no reason to
 * write the same UUID in three places when two of them can share.
 *
 * `E2E_DATABASE` is exported alongside because every test that uses these fixtures
 * has to skip without it, and reading the flag in one place keeps the reason string
 * consistent across the files that check it.
 */
export const PUBLIC_POST = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "A Public Post For The E2E Suite",
  body: "The body of the public post",
};

export const PRIVATE_POST = {
  id: "22222222-2222-4222-8222-222222222222",
  title: "A Private Post For The E2E Suite",
};

/** Not seeded, and must not be: the point is that it resolves to nothing. */
export const UNKNOWN_POST_ID = "99999999-9999-4999-8999-999999999999";

export const databaseConfigured = process.env.E2E_DATABASE === "1";

export const NO_DATABASE_REASON =
  "no database configured -- run `pnpm e2e:db:up` and set E2E_DATABASE=1";

/**
 * The connection string for the local stack, named here so it is stated once.
 *
 * The shape is not free: the host must contain `-pooler` or `@vercel/postgres` rejects
 * it, and the certificate the stack serves is issued for the `api.` name the driver
 * derives from this one. See `e2e/db/compose.yaml`.
 */
export const E2E_DATABASE_URL =
  "postgres://postgres:postgres@db-pooler.localtest.me:5432/main";

/**
 * Every row the authoring tests create starts with this, so cleanup can find rows a
 * failed run left behind without touching the seeded fixtures.
 */
export const E2E_TITLE_PREFIX = "E2E Authoring ";

/**
 * Deletes any row the authoring tests created, including from a run that died between
 * the insert and the delete.
 *
 * Goes through `docker compose exec postgres psql` rather than through
 * `@vercel/postgres`, and that is the interesting part. The app's driver reaches the
 * database over HTTPS through the proxy, which needs Caddy's CA -- and
 * `NODE_EXTRA_CA_CERTS` is read at process startup, so the config cannot give it to the
 * runner it is already running in. Every attempt from the test process fails with a
 * bare `fetch failed`.
 *
 * Talking to the container is also a stronger guard than any connection string could
 * be. It names a container in this compose project; there is no value of any ambient
 * environment variable that makes it reach a real database. The title prefix is the
 * second guard -- no seeded fixture can match it.
 */
export const cleanupAuthoringRows = async () => {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const { join } = await import("node:path");
  // `__dirname`, not `import.meta.url`. Playwright transpiles specs and what they
  // import to CommonJS, where `import.meta` is a SyntaxError that takes the run down
  // before any test loads -- the trap e2e/a11y.spec.ts documents, and the second time
  // it has been walked into in this suite.
  const compose = join(__dirname, "db/compose.yaml");
  await promisify(execFile)("docker", [
    "compose",
    "-f",
    compose,
    "exec",
    "-T",
    "postgres",
    "psql",
    "--username",
    "postgres",
    "--dbname",
    "main",
    "--no-psqlrc",
    "-v",
    "ON_ERROR_STOP=1",
    "-c",
    // Parameterised by prefix rather than interpolating anything a test chose. The
    // literal is this file's own constant, so there is no caller-supplied text here.
    `DELETE FROM blogs WHERE title LIKE '${E2E_TITLE_PREFIX}%'`,
  ]);
};
