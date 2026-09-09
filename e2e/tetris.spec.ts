import { test, expect, type Page } from "@playwright/test";

/**
 * The Tetris board, covering only what a browser can answer.
 *
 * The rules are tested in `src/components/tetris/engine.test.ts` -- 45 assertions about
 * rotation, scoring, lock delay and topping out, with no canvas involved. Nothing here
 * repeats any of that. What is left is the part that only exists once a real focus ring, a
 * real key event and a real scroll position are in play:
 *
 *   - Arrow keys must move the piece and NOT scroll the page.
 *   - Tab must still leave. A game that traps the keyboard is worse than one that scrolls.
 *   - Leaving must pause, so a game does not run on in a tab nobody is looking at.
 *
 * Deliberately free of timing assertions. Gravity means the board changes on its own, so
 * anything phrased as "the piece is at row N after 900ms" would be flaky by construction.
 * Every assertion below is about a discrete outcome the player caused.
 */

const board = (page: Page) => page.getByRole("application");

const scoreValue = async (page: Page): Promise<number> =>
  Number(
    await page.locator("dt", { hasText: "Score" }).locator("+ dd").innerText(),
  );

test.beforeEach(async ({ page }) => {
  await page.goto("/animation");
  await board(page).scrollIntoViewIfNeeded();
});

test("does not start playing until the visitor asks it to", async ({
  page,
}) => {
  // A game that autoplays below an aquarium is motion nobody requested. This is also the
  // whole of the reduced-motion answer: there is no decorative animation to withdraw,
  // because nothing moves until now.
  await expect(page.locator("#tetris-status")).toHaveText(
    "Press Enter to play",
  );
  const before = await scoreValue(page);
  await page.waitForTimeout(1500);
  expect(await scoreValue(page), "the board advanced on its own").toBe(before);
});

test("plays from the keyboard once the board is focused", async ({ page }) => {
  await board(page).click();
  await page.keyboard.press("Enter");
  await expect(page.locator("#tetris-status")).toHaveText("Playing");

  // A hard drop pays two a row, so the score moving proves the key reached the game rather
  // than that something merely repainted.
  await page.keyboard.press("Space");
  await expect
    .poll(() => scoreValue(page), { message: "Space did not drop the piece" })
    .toBeGreaterThan(0);
});

test("keeps arrow keys away from the page scroll while the board has focus", async ({
  page,
}) => {
  await board(page).click();
  await page.keyboard.press("Enter");
  const before = await page.evaluate(() => window.scrollY);

  for (let i = 0; i < 4; i += 1) await page.keyboard.press("ArrowDown");

  expect(
    await page.evaluate(() => window.scrollY),
    "pressing Down scrolled the page, so preventDefault is not being applied",
  ).toBe(before);
});

test("still lets a keyboard visitor tab straight back out", async ({
  page,
}) => {
  // The other half of the rule above, and the more important half: swallowing Tab as well
  // would strand someone who reached the board by tabbing. A stray scroll is recoverable;
  // a keyboard trap is not.
  await board(page).click();
  await page.keyboard.press("Tab");

  await expect(
    board(page),
    "focus stayed on the board, so Tab is being swallowed",
  ).not.toBeFocused();
});

test("does not pause when focus moves to its own controls", async ({
  page,
}) => {
  // `relatedTarget` is what makes this work. Without it, tabbing from the board to Rotate
  // would pause the game that the button is there to play.
  await board(page).click();
  await page.keyboard.press("Enter");
  await expect(page.locator("#tetris-status")).toHaveText("Playing");

  await page.getByRole("button", { name: "Rotate" }).focus();
  await expect(page.locator("#tetris-status")).toHaveText("Playing");
});

test("pauses when focus leaves the game altogether", async ({ page }) => {
  await board(page).click();
  await page.keyboard.press("Enter");
  await expect(page.locator("#tetris-status")).toHaveText("Playing");

  // Somewhere outside the game entirely.
  await page.getByRole("link", { name: /home/i }).first().focus();
  await expect(page.locator("#tetris-status")).toHaveText("Paused");
});

test("pauses and releases the board on Escape", async ({ page }) => {
  await board(page).click();
  await page.keyboard.press("Enter");
  await page.keyboard.press("Escape");

  await expect(page.locator("#tetris-status")).toHaveText("Paused");
  await expect(board(page)).not.toBeFocused();
});

test("is playable by pointer alone, through real buttons", async ({ page }) => {
  // Which is what makes it usable on a phone. Controls drawn inside the canvas would need
  // hit testing and could carry no accessible name; these are named and focusable.
  await page.getByRole("button", { name: "Play" }).click();
  await expect(page.locator("#tetris-status")).toHaveText("Playing");

  await page.getByRole("button", { name: "Move left" }).click();
  await page.getByRole("button", { name: "Hard drop" }).click();

  await expect
    .poll(() => scoreValue(page), {
      message: "the hard-drop button did not play a move",
    })
    .toBeGreaterThan(0);
});

test("carries its state as text, not only as pixels", async ({ page }) => {
  // A canvas tells a screen reader nothing, so score, lines, level and status have to exist
  // in the DOM. Asserting the numbers are READABLE rather than that the canvas has a name:
  // an accessible name on an unreadable board would satisfy an axe check while telling a
  // reader nothing.
  //
  // By text rather than by the `term` role, which does not resolve a name from a `<dt>`'s
  // own content and so matched nothing -- a locator that finds no element fails honestly
  // here, but the same mistake in a negative assertion would have passed silently.
  for (const label of ["Score", "Lines", "Level"]) {
    await expect(page.locator("dt", { hasText: label })).toBeVisible();
  }
  await expect(page.locator("#tetris-status")).toBeVisible();

  // And the board points at that text rather than relying on a name of its own.
  await expect(board(page)).toHaveAttribute(
    "aria-describedby",
    /tetris-status/,
  );
});

test("fits a phone without a horizontal scrollbar", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto("/animation");

  const canvas = board(page).locator("canvas");
  const box = await canvas.boundingBox();
  const viewport = page.viewportSize()!;
  expect(box, "no canvas rendered at 320px").not.toBeNull();
  expect(box!.width).toBeLessThanOrEqual(viewport.width);

  // The document, not the canvas: a centred column absorbs a child's overflow into its
  // gutters, so measuring the canvas alone can miss it.
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(viewport.width);
});
