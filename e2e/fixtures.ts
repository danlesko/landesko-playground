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
 * Deletes the rows a test created, BY EXACT TITLE.
 *
 * By title and not by prefix, which is a bug fix rather than a preference. A
 * prefix-matching `afterEach` deletes every authoring row in the database, and under
 * `fullyParallel` that includes the row another test is still using -- so a test that
 * finished first deletes a running test's post and fails it.
 *
 * Measured rather than reasoned, because it first appeared as a single unexplained failure
 * and the obvious diagnosis deserved checking: restoring the prefix delete fails 3 runs in
 * 10, in the create test, on a click whose target the other test's cleanup removed.
 * Per-title is 0 in 18. Worth knowing that the first attempt to reproduce it was INERT --
 * it changed the SQL but left the call site guarded by an empty array, so nothing ran.
 *
 * Rows from a run that was KILLED are not this function's problem and were briefly
 * nobody's: per-title cleanup cannot run if the process does not survive to run it. The
 * suite-start sweep below (`sweepAuthoringRows`, called from globalSetup) is what covers
 * that. `e2e/db/up.sh` also recreates the volume, but `pnpm test:e2e` does not invoke it,
 * so a fresh stack is not something a rerun can rely on.
 *
 * Goes through `docker compose exec postgres psql` rather than through
 * `@vercel/postgres`, and that is the interesting part. The app's driver reaches the
 * database over HTTPS through the proxy, which needs Caddy's CA -- and
 * `NODE_EXTRA_CA_CERTS` is read at process startup, so the config cannot give it to the
 * runner it is already running in. Every attempt from the test process fails with a bare
 * `fetch failed`.
 *
 * Talking to the container is also a stronger guard than any connection string could be.
 * It names a container in this compose project; there is no value of any ambient
 * environment variable that makes it reach a real database.
 */
const AUTHORING_TITLE =
  /^E2E Authoring [0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export const deleteAuthoringRow = async (title: string) => {
  // The whole safety argument for interpolating below, so it is a throw rather than a
  // filter: an unexpected title means the caller is confused, and deleting nothing while
  // reporting success would leak the row.
  //
  // A psql bound parameter was the first attempt and does not work -- `-v name=value` is
  // not interpolated into a `-c` string, so `:'title'` reaches the server literally and
  // errors at the colon.
  //
  // What the pattern buys is narrower than "the exact generated shape", which an earlier
  // comment claimed: it admits UUID-looking values this suite would never produce, such as
  // all zeros. The property that matters is the one it does have -- the VARIABLE part is
  // hex and hyphens only, so no quote, backslash, whitespace or SQL metacharacter can reach
  // the statement. (The fixed prefix does contain spaces, which is why the claim has to be
  // about the suffix.) `execFile` rules out the shell separately.
  if (!AUTHORING_TITLE.test(title)) {
    throw new Error(
      `refusing to delete ${JSON.stringify(title)}: not the ${E2E_TITLE_PREFIX}<uuid> shape this function accepts`,
    );
  }
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const { join } = await import("node:path");
  // `__dirname`, not `import.meta.url`. Playwright transpiles specs and what they import
  // to CommonJS, where `import.meta` is a SyntaxError that takes the run down before any
  // test loads -- the trap e2e/a11y.spec.ts documents, walked into twice in this suite.
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
    `DELETE FROM blogs WHERE title = '${title}'`,
  ]);
};

/**
 * Deletes EVERY authoring row, and is safe only because of where it runs.
 *
 * `globalSetup` runs once in the runner before any worker starts, so there is no test
 * whose row this can remove. The same statement in `afterEach` is the bug the per-title
 * delete above replaced -- it fails 3 runs in 10 by deleting rows other tests are using.
 * Same SQL, opposite correctness, which is why they are separate functions rather than
 * one with a flag.
 *
 * It exists because per-title cleanup cannot cover a killed worker or an interrupted run:
 * nothing gets the chance to delete anything. `e2e/db/up.sh` recreates the volume, so a
 * fresh stack is always clean -- but `pnpm test:e2e` does not invoke it, so a developer
 * rerunning against a still-running stack would otherwise accumulate rows until `/blog`
 * paginated the seeded fixtures off page one.
 */
export const sweepAuthoringRows = async () => {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const { join } = await import("node:path");
  await promisify(execFile)("docker", [
    "compose",
    "-f",
    join(__dirname, "db/compose.yaml"),
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
    // The literal is this file's own constant; no caller-supplied text reaches it.
    "-c",
    `DELETE FROM blogs WHERE title LIKE '${E2E_TITLE_PREFIX}%'`,
  ]);
};
