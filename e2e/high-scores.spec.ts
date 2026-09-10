import { test, expect, type Page } from "@playwright/test";

import {
  SEEDED_SCORES,
  databaseConfigured,
  NO_DATABASE_REASON,
  resetHighScores,
  runSql,
  runSqlConcurrently,
} from "./fixtures";

/**
 * The Tetris leaderboard, in two halves that no other kind of test can cover.
 *
 * THE DATABASE FUNCTION. `record_high_score` holds the entire leaderboard rule -- what
 * qualifies, what is evicted, and the lock that makes concurrent writes safe. None of that is
 * reachable from a mock: `src/lib/high-scores.test.ts` can only assert which statement was
 * sent. So the cases below run against the real Postgres, which is also the only place the
 * concurrency claim can be tested at all.
 *
 * THE BROWSER. Whether the board actually appears over the canvas, and whether declining
 * works. Not a successful save: `pnpm build:e2e` blanks the reCAPTCHA site key on purpose, so
 * the panel correctly reports saving as unavailable here. The save path is covered by
 * `src/components/tetris/SaveScoreForm.interaction.test.ts`, which drives the real component
 * with a stubbed widget. That split is deliberate and the gap is real: nothing exercises a
 * genuine Google verification end to end, which the README already names as a permanent
 * limitation of this suite.
 *
 * SERIAL, and it has to be. These tests TRUNCATE and refill one shared table, so running them
 * in parallel would have each one pulling the board out from under the others -- the same
 * failure the authoring suite hit by deleting rows by prefix. No other spec touches
 * `high_scores`, so serialising this file is enough.
 */
test.describe.configure({ mode: "serial" });

test.beforeEach(async () => {
  test.skip(!databaseConfigured, NO_DATABASE_REASON);
  await resetHighScores();
});

const record = async (name: string, score: number): Promise<string> =>
  runSql(`SELECT public.record_high_score('${name}', ${score})::text`);

const board = async (): Promise<string> =>
  runSql(
    `SELECT coalesce(string_agg(name || ':' || score, ' ' ORDER BY score DESC, created_at ASC, id ASC), '')
     FROM high_scores`,
  );

const rowCount = async (): Promise<number> =>
  Number(await runSql("SELECT count(*) FROM high_scores"));

const fill = async (count: number): Promise<void> => {
  await runSql(`
    TRUNCATE high_scores;
    INSERT INTO high_scores (name, score)
    SELECT 'p' || g, g * 100 FROM generate_series(1, ${count}) g;
  `);
};

test.describe("the database function", () => {
  test("records into an empty table and returns the board", async () => {
    await runSql("TRUNCATE high_scores");
    const result = await record("first", 500);

    expect(result).toContain('"saved": true');
    expect(await board()).toBe("first:500");
  });

  test("accepts a low score while the table is not yet full", async () => {
    // Nine rows, so one more belongs on the board regardless of how small it is. Refusing
    // here would leave the board permanently short.
    await fill(9);
    await record("modest", 1);

    expect(await rowCount()).toBe(10);
    expect(await board()).toContain("modest:1");
  });

  test("displaces the lowest once the table is full, and stays at ten", async () => {
    await fill(10);
    await record("winner", 999999);

    expect(await rowCount()).toBe(10);
    const after = await board();
    expect(after).toContain("winner:999999");
    expect(after, "the lowest score survived a better one").not.toContain(
      "p1:100",
    );
  });

  test("refuses a score EQUAL to the tenth best", async () => {
    // "Higher than the lowest" is strict. A tie must not displace, or every equal score would
    // churn the board without improving it.
    await fill(10);
    await record("tie", 100);

    expect(await rowCount()).toBe(10);
    expect(await board()).not.toContain("tie:");
  });

  test("refuses a score below the tenth best", async () => {
    await fill(10);
    const result = await record("low", 1);

    expect(result).toContain('"saved": false');
    expect(await board()).not.toContain("low:");
  });

  test("heals an over-full table without discarding a better score", async () => {
    // The defect this exists for, reproduced before it was fixed: with eleven rows scoring
    // 1..11, a candidate of 2 beat `min(score) = 1`, so it was accepted -- and the eviction
    // then removed the two lowest, destroying the existing 2 and seating an equal score in its
    // place. Qualification has to be against the TENTH-BEST, not the minimum.
    await runSql(`
      TRUNCATE high_scores;
      INSERT INTO high_scores (name, score)
      SELECT 's' || g, g FROM generate_series(1, 11) g;
    `);
    await record("cheat", 2);

    expect(await rowCount(), "the surplus row was not shed").toBe(10);
    // The EXACT board, in order. Checking only that `s2` survived left room for the wrong row
    // being evicted instead -- the count and that one name would both still look right.
    expect(await board()).toBe(
      "s11:11 s10:10 s9:9 s8:8 s7:7 s6:6 s5:5 s4:4 s3:3 s2:2",
    );
  });

  test("sheds two surplus rows when an over-full table takes a qualifying score", async () => {
    // Twelve rows AND a score that belongs, which is the arithmetic's busiest case: the
    // surplus is `12 - 10 + 1 = 3`, so three go and one arrives. No test covered it.
    await runSql(`
      TRUNCATE high_scores;
      INSERT INTO high_scores (name, score)
      SELECT 's' || g, g FROM generate_series(1, 12) g;
    `);
    await record("earned", 100);

    expect(await rowCount()).toBe(10);
    expect(await board()).toBe(
      "earned:100 s12:12 s11:11 s10:10 s9:9 s8:8 s7:7 s6:6 s5:5 s4:4",
    );
  });

  test("keeps exactly ten rows under simultaneous writes", async () => {
    // The reason the function takes an advisory lock. Without it, twenty writers each read a
    // nine-row table, each insert, and the table ends up wrong -- measured at EIGHT rows
    // locally, because concurrent deletes removed rows while the inserts raced. Losing
    // entries, not just gaining them.
    await fill(9);
    // Through ONE container shell, not twenty `docker compose exec` calls. That distinction is
    // the test: twenty exec invocations each pay startup, so they serialise by accident and
    // this passed with the lock removed. Real overlap leaves the unlocked function at 14 rows,
    // and once at 3 -- having lost six of the nine it started with.
    await runSqlConcurrently(
      Array.from(
        { length: 20 },
        (_, i) => `SELECT public.record_high_score('c${i}', ${1000 + i})`,
      ),
    );

    expect(await rowCount()).toBe(10);
    // Counting rows is not enough, and that was the first version of this test. An
    // implementation that keeps ten rows while LOSING the strongest entries passes a count.
    // These twenty scores are 1000..1019 against nine seeded rows of 100..900, so the exact
    // ten survivors are knowable: the top ten submissions, c10 through c19.
    const survivors = await board();
    for (let i = 10; i < 20; i += 1) {
      expect(survivors, `c${i} was lost under contention`).toContain(
        `c${i}:${1000 + i}`,
      );
    }
    // And none of the losers stayed.
    for (let i = 0; i < 10; i += 1) {
      expect(survivors, `c${i} should have been displaced`).not.toContain(
        `c${i}:`,
      );
    }
  });

  test("stores a 32-character name and a name containing quotes", async () => {
    await runSql("TRUNCATE high_scores");
    // Parameterised through the driver in the app; here the point is the COLUMN accepts it.
    await runSql(`SELECT public.record_high_score(repeat('a', 32), 12345)`);
    await runSql(`SELECT public.record_high_score('O''Brien', 12346)`);

    expect(await board()).toContain("O'Brien:12346");
    expect(await runSql("SELECT max(length(name)) FROM high_scores")).toBe(
      "32",
    );
  });

  test("refuses a blank name and a negative score at the column level", async () => {
    // The route rejects both first. These constraints are the backstop for hand-written SQL,
    // and a constraint nobody has ever seen fire is a constraint that might not work.
    await expect(
      runSql("INSERT INTO high_scores (name, score) VALUES (E' \\t ', 1)"),
    ).rejects.toThrow(/high_scores_name_not_blank/);
    await expect(
      runSql("INSERT INTO high_scores (name, score) VALUES ('x', -1)"),
    ).rejects.toThrow(/high_scores_score_non_negative/);
  });
});

const boardRegion = (page: Page) =>
  page.getByRole("region", { name: "High scores" });

test.describe("the board in a browser", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/animation");
  });

  test("shows the ten highest before the game starts, highest first", async ({
    page,
  }) => {
    const region = boardRegion(page);
    await expect(region).toBeVisible();

    const rows = region.getByRole("listitem");
    await expect(rows).toHaveCount(SEEDED_SCORES.length);
    // Asserting the ORDER, not just the membership: a broken ORDER BY would still render all
    // three rows.
    await expect(rows.first()).toContainText(SEEDED_SCORES[0].name);
    await expect(rows.last()).toContainText(SEEDED_SCORES[2].name);
  });

  test("is a list outside the game's application region, not canvas text", async ({
    page,
  }) => {
    // Two claims at once. Text painted on the canvas would be invisible to a screen reader,
    // and putting the list INSIDE `role="application"` would tell one to stop navigating and
    // hand keys to the game -- so a reader could not read down it.
    await expect(boardRegion(page).getByRole("list")).toBeVisible();
    await expect(
      page
        .getByRole("application")
        .getByRole("region", { name: "High scores" }),
    ).toHaveCount(0);
  });

  test("hides the board once play begins, and keeps it hidden on pause", async ({
    page,
  }) => {
    // Staying hidden on pause is deliberate. The panel is opaque, so showing it there would
    // cover the stack a player pauses precisely to look at -- and "before the game starts" is
    // what was asked for.
    const region = boardRegion(page);
    await page.getByRole("button", { name: "Play" }).click();
    await expect(region).toBeHidden();

    await page.getByRole("button", { name: "Pause" }).click();
    await expect(region).toBeHidden();
  });

  test("offers a way to decline saving, and records nothing", async ({
    page,
  }) => {
    const before = await board();
    await page.getByRole("application").click();
    await page.keyboard.press("Enter");

    // Hard-drop until the stack tops out. Faster and more reliable than waiting for gravity.
    for (let i = 0; i < 60; i += 1) {
      await page.keyboard.press("Space");
      if ((await page.locator("#tetris-status").innerText()) === "Game over") {
        break;
      }
    }
    await expect(page.locator("#tetris-status")).toHaveText("Game over");

    // The panel offers the way out whether or not a name has been entered, because saving is
    // optional.
    const decline = page.getByRole("button", { name: /No thanks|Don't save/ });
    await expect(decline).toBeVisible();
    await decline.click();
    await expect(decline).toBeHidden();

    expect(await board(), "declining changed the leaderboard").toBe(before);
  });

  test("reports the site key as missing rather than offering a dead save", async ({
    page,
  }) => {
    // `build:e2e` blanks the key on purpose, so this is the state the suite always sees. It is
    // worth asserting rather than working around: a preview deployment without the key sees
    // exactly this, and the game must stay playable.
    await page.getByRole("application").click();
    await page.keyboard.press("Enter");
    for (let i = 0; i < 60; i += 1) {
      await page.keyboard.press("Space");
      if ((await page.locator("#tetris-status").innerText()) === "Game over") {
        break;
      }
    }

    await expect(
      page.getByText(/NEXT_PUBLIC_REACT_APP_SITE_KEY_RECAPTCHA/),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Save my score" }),
    ).toHaveCount(0);
  });
});
