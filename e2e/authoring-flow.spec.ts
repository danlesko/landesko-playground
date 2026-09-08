import { test, expect } from "@playwright/test";
import {
  PUBLIC_POST,
  databaseConfigured,
  NO_DATABASE_REASON,
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
 * ONE test, not two, and the pairing is deliberate rather than lazy. It is what makes
 * the test self-cleaning, and self-cleaning is a correctness requirement here, not
 * tidiness: `/blog` paginates at ten and orders newest-first, so roughly nine leftover
 * posts would silently push the seeded fixture off page one and break the read-only
 * tests in `smoke.spec.ts` -- a failure that would point at those tests rather than at
 * this one. Deleting what it creates, immediately, is what keeps that impossible.
 *
 * The cost, stated because it is real: a failure between the create and the delete
 * leaks one row, and a create failure and a delete failure look the same in the run
 * output. The alternative -- truncate and reseed per test -- is deterministic but
 * gives up `fullyParallel` for the whole suite, which is a large price for a
 * distinction the assertion messages below already make in practice.
 *
 * These tests DELETE rows, so it is worth being explicit about why they cannot reach a
 * real database, and it is by construction rather than by care. Two independent
 * guards, both verified: with `E2E_DATABASE=1`, `playwright.config.ts` spreads its own
 * `POSTGRES_URL` last into the web server's environment, so it overrides whatever a
 * developer has exported -- checked by exporting a fake production URL and watching
 * these tests still read the seeded rows. And without the flag they skip outright, so
 * an ambient `POSTGRES_URL` alone can never be written to.
 *
 * Transactions were the obvious answer and do not work: `@vercel/postgres` opens a
 * fresh connection per query, so there is no session for a test to hold a transaction
 * open in and no way to make the app join one.
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
// run's, and two runs against the same stack cannot collide.
const uniqueTitle = () =>
  `E2E Authoring ${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

test("creates a post, shows it in the list, then deletes it", async ({
  page,
  context,
}) => {
  test.skip(!databaseConfigured, NO_DATABASE_REASON);
  await signIn(context);

  const title = uniqueTitle();
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
});

test("cancelling the confirmation leaves the post alone", async ({
  page,
  context,
}) => {
  test.skip(!databaseConfigured, NO_DATABASE_REASON);
  await signIn(context);

  // The SEEDED post rather than a created one, because this test does not mutate
  // anything -- so it needs no cleanup and cannot leak. Cancelling is the path where
  // "nothing happened" is the whole assertion, and asserting that about a row this
  // test created would be weaker: a create that silently failed would also produce a
  // list without it.
  const title = PUBLIC_POST.title;

  await page.goto("/blog");
  await page.getByRole("button", { name: `Delete post: ${title}` }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();

  // Still there after a reload, not merely still on screen. The dialog closing proves
  // the UI did nothing; only a fresh read proves the database did nothing.
  await page.reload();
  await expect(page.getByRole("link", { name: title })).toBeVisible();
});
