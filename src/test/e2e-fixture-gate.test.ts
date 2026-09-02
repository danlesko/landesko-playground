import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Keeps the e2e fixtures out of production.
 *
 * `src/app/e2e-fixture/**` renders app components with static props so the confirmation
 * modal can be reached in a browser -- see e2e/modal.spec.ts for why nothing else can. The
 * routes exist in the SAME production build the e2e suite runs against, deliberately: a
 * build that differed from the one under test would make the coverage worthless. So the only
 * thing standing between a fixture and the live site is `E2E_FIXTURES`.
 *
 * WHY A SOURCE READ rather than a request. The e2e suite always sets that variable, so no
 * test in it can observe the disabled state; asserting the 404 would need a second server
 * started without the flag, which is a lot of machinery for one assertion. This reads the
 * file instead. It is weaker than a request -- it cannot prove `notFound()` is actually
 * reached -- but it does catch the change that would matter: someone removing the guard.
 *
 * Verified by hand at the time of writing, which the file read cannot do: with the variable
 * unset the route answers 404, and with `E2E_FIXTURES=1` it answers 200 and renders the
 * delete trigger.
 */

const REPO_ROOT = new URL("../../", import.meta.url).pathname;
const FIXTURE_DIR = "src/app/e2e-fixture";

const fixturePages = (dir: string): string[] => {
  const absolute = join(REPO_ROOT, dir);
  return readdirSync(absolute).flatMap((entry) => {
    const path = `${dir}/${entry}`;
    if (statSync(join(REPO_ROOT, path)).isDirectory())
      return fixturePages(path);
    return /page\.tsx?$/.test(entry) ? [path] : [];
  });
};

describe("every e2e fixture route", () => {
  const pages = fixturePages(FIXTURE_DIR);

  it("is discovered by this test, so the assertions below are not vacuous", () => {
    // Without this, deleting the fixtures OR renaming the directory would make every
    // assertion below iterate an empty list and pass.
    expect(pages.length, `no page files under ${FIXTURE_DIR}`).toBeGreaterThan(
      0,
    );
  });

  it.each(fixturePages(FIXTURE_DIR))("%s is gated on E2E_FIXTURES", (path) => {
    const source = readFileSync(join(REPO_ROOT, path), "utf8");

    // The exact comparison, not merely a mention of the variable. `process.env.E2E_FIXTURES`
    // used truthily would let `E2E_FIXTURES=false` switch the route on.
    expect(
      source,
      'the route does not compare E2E_FIXTURES against "1"',
    ).toMatch(/process\.env\.E2E_FIXTURES\s*===\s*"1"/);

    // Imports AND comments stripped first, and both exclusions were earned by mutation
    // rather than foresight. Searching the raw source for `notFound()` matched the
    // `import { notFound } from "next/navigation"` line; stripping only imports then matched
    // a COMMENT in the fixture that discusses `notFound()`. Either way, deleting the guard
    // left this assertion passing. Two rounds of the same mistake: a text search finds the
    // word wherever it appears, including where it is being talked about.
    const body = source
      .split("\n")
      .filter(
        (line) =>
          !/^\s*import\b/.test(line) && !/^\s*(\/\/|\*|\/\*)/.test(line),
      )
      .join("\n");

    expect(
      body,
      "the route reads E2E_FIXTURES but never calls notFound(), so the gate does nothing",
    ).toMatch(/notFound\(\)/);
  });
});
