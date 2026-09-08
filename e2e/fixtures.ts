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
