import { test, expect } from "@playwright/test";
import {
  PUBLIC_POST,
  PRIVATE_POST,
  databaseConfigured,
  NO_DATABASE_REASON,
  E2E_TITLE_PREFIX,
  deleteAuthoringRow,
} from "./fixtures";
import { signIn } from "./session";

/**
 * Creating and deleting a post, end to end, against the real database.
 *
 * These are the app's ONLY mutating paths, and until now nothing drove them further
 * than a unit test. `src/lib/actions.test.ts` covers the actions with a mocked `sql`
 * and mocked `next/navigation`, which is worth having but cannot see the form, the
 * confirmation dialog, the redirect, or whether a row actually changed. (Revalidation
 * is not on that list on purpose -- see the note at the end.) Two things had to exist before this was possible: a session that the server
 * accepts (#153) and a database to write to (#159). Both landed; neither used them
 * together.
 *
 * ONE test, not two, because delete is both the second half of the workflow and the
 * cleanup for the first. Leftover rows matter: `/blog` paginates at ten, newest-first,
 * so enough of them push the seeded fixture off page one.
 *
 * WHICH tests that breaks was wrong in the first draft, and the correction is worth
 * keeping because it is counter-intuitive. The create form defaults "private" to
 * CHECKED, so a post this test creates is private -- and the anonymous reads in
 * `smoke.spec.ts` filter private rows out, so they cannot be affected at all. The test
 * at risk is the signed-in one in THIS file, which sees private rows.
 *
 * The pairing is success-path cleanup and nothing more, which is why it is not the only
 * cleanup here. Any failure after the insert -- a locator that times out, a crashed
 * worker, an interrupted run -- leaves a committed row, so `afterEach` deletes the
 * titles the test recorded, through a connection pinned to the local stack. That is what
 * makes the suite safe to fail, rather than only safe to pass.
 *
 * By recorded title and not by prefix, which was a real bug rather than a refinement: a
 * prefix delete in `afterEach` removes rows OTHER tests are still using, and with
 * `fullyParallel` that fails 3 runs in 10. See the note on `deleteAuthoringRow`.
 *
 * A create failure and a delete failure still look similar in the run output; the
 * assertion messages are what distinguish them. Truncate-and-reseed per test would
 * separate them structurally and costs `fullyParallel` for the whole suite.
 *
 * These tests DELETE rows, so it is worth being explicit about why they cannot reach a
 * real database, and it is by construction rather than by care. Two independent
 * guards, both verified: with `E2E_DATABASE=1`, `playwright.config.ts` spreads its own
 * `POSTGRES_URL` last into the web server's environment, so it overrides whatever a
 * developer has exported -- checked by exporting a fake production URL and watching
 * these tests still read the seeded rows. And without the flag they skip outright, so
 * an ambient `POSTGRES_URL` alone can never be written to.
 *
 * Transactions were the obvious answer and do not work, though not for the reason an
 * earlier draft gave: `@vercel/postgres` does expose a pool and `sql.connect()`. The
 * real obstacle is that the writes happen in the SERVER's requests, so a transaction
 * this test owned could never be the one they join.
 *
 * What this does NOT cover, established by mutation rather than assumed: removing
 * `revalidatePath("/blog")` from either action changes nothing here, so neither
 * assertion below is evidence about revalidation. Two candidates for why, and this
 * test cannot separate them -- both actions `redirect("/blog")` afterwards, which
 * refetches, and `data.ts` calls `unstable_noStore()` in every read, so the list is
 * not served from a cache that would need invalidating. Removing the insert and
 * removing the delete DO fail it, which is what the messages now say.
 */

// Unique per run, so a row leaked by a previous failure cannot be mistaken for this
// run's, and two runs against the same stack cannot collide. The prefix is what the
// suite-start sweep in e2e/global-setup.ts matches; per-test cleanup goes by exact title.
const uniqueTitle = () => `${E2E_TITLE_PREFIX}${crypto.randomUUID()}`;

// Runs whether the test passed or failed, which is the point: the in-test delete only
// covers the success path.
//
// Scoped to the titles THIS test created, tracked as it goes. An earlier version deleted
// every authoring row by prefix, which under `fullyParallel` meant a finished test deleted
// a running one's post -- reproduced at 3 failures in 10 runs.
const createdTitles: string[] = [];

test.afterEach(async () => {
  const titles = createdTitles.splice(0);
  if (!databaseConfigured) return;
  for (const title of titles) await deleteAuthoringRow(title);
});

test("creates a post, shows it in the list, then deletes it", async ({
  page,
  context,
}) => {
  test.skip(!databaseConfigured, NO_DATABASE_REASON);
  await signIn(context);

  const title = uniqueTitle();
  createdTitles.push(title);
  const body = `Body for ${title}`;

  await page.goto("/blog/create");

  // By label, not by name attribute: what a reader can find is the point, and a form
  // whose labels stopped resolving would still submit fine.
  await page.getByLabel("Title").fill(title);
  await page.getByLabel("Content").fill(body);
  await page.getByRole("button", { name: "Create Post" }).click();

  // The action ends in `redirect("/blog")`, so arriving there is part of the claim --
  // a create that succeeded but left the reader on the form would be a defect.
  await expect(page).toHaveURL(/\/blog$/);

  const created = page.getByRole("link", { name: title });
  await expect(
    created,
    "the created post is not in the list, so the insert did not happen",
  ).toBeVisible();

  // The detail route too, which is what proves a row exists rather than that the list
  // happened to render something. `notFound()` in the layout means a 404 here would
  // mean no row.
  await created.click();
  await expect(page).toHaveURL(/\/blog\/[0-9a-f-]{36}$/);
  // Kept for the delete assertions below, which need the row's own URL rather than its
  // title to tell deletion from concealment.
  const detailUrl = page.url();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  await expect(page.getByText(body, { exact: false })).toBeVisible();

  // --- and now delete it, which is the other half and the cleanup at once ---

  await page.goto("/blog");
  // The trigger only exists for a signed-in reader, so its presence is also a check
  // that the forged session survived the navigation.
  await page.getByRole("button", { name: `Delete post: ${title}` }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Delete" }).click();

  // `deleteBlogPost` ends in `redirect("/blog")` as well, so we land back on the list.
  await expect(page).toHaveURL(/\/blog$/);
  await expect(
    page.getByRole("link", { name: title }),
    "the post is still listed after deleting it, so the delete did not happen",
  ).toHaveCount(0);

  // The ROW, not just the link. Absence from the list is satisfied by anything that
  // hides it -- a renamed title, a flipped privacy flag -- so the detail URL captured
  // before the delete is what distinguishes "deleted" from "no longer findable".
  const gone = await page.request.get(detailUrl);
  expect(
    gone.status(),
    "the detail route still answers for the deleted post, so the row is hidden rather than deleted",
  ).toBe(404);

  // And that ONLY that row went. `DELETE FROM blogs` with no predicate satisfies every
  // assertion above, and would then break other tests somewhere else in the run --
  // where it would look like their bug.
  await page.goto("/blog");
  await expect(
    page.getByRole("link", { name: PUBLIC_POST.title }),
    "the seeded public post is gone, so the delete removed more than its target",
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: PRIVATE_POST.title }),
    "the seeded private post is gone, so the delete removed more than its target",
  ).toBeVisible();
});

test("cancelling the confirmation leaves every post alone", async ({
  page,
  context,
}) => {
  test.skip(!databaseConfigured, NO_DATABASE_REASON);
  await signIn(context);

  // The SEEDED posts rather than created ones, because this test does not mutate
  // anything -- so it needs no cleanup and cannot leak. "Nothing happened" is also a
  // stronger claim about a row this test did not create: asserting it about its own
  // post would pass equally if the create had silently failed.
  await page.goto(`/blog/${PUBLIC_POST.id}`);
  const bodyBefore = await page.getByRole("main").innerText();

  await page.goto("/blog");
  await page
    .getByRole("button", { name: `Delete post: ${PUBLIC_POST.title}` })
    .click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();

  // The dialog closing proves only that the UI did nothing. These read the database
  // again, and check the CONTENTS rather than the title -- an action that fired and
  // edited the row while leaving its title would satisfy a title-only assertion.
  await page.goto(`/blog/${PUBLIC_POST.id}`);
  expect(
    await page.getByRole("main").innerText(),
    "the post changed after cancelling, so something was submitted",
  ).toBe(bodyBefore);

  // And that cancelling did not take a different row instead. The dialog names no post,
  // so a handler wired to the wrong id would look identical from the button that opened
  // it.
  await page.goto("/blog");
  await expect(
    page.getByRole("link", { name: PRIVATE_POST.title }),
    "a different seeded post disappeared, so cancelling deleted the wrong row",
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: PUBLIC_POST.title }),
  ).toBeVisible();
});
