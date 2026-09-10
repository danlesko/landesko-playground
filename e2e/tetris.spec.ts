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
  await expect(page.locator("#tetris-status")).toHaveText("Ready");
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

test("ignores the operating system's key repeat for pause and hard drop", async ({
  page,
}) => {
  // Only reachable in a browser: `keyboard.press` never sets `repeat`, so this dispatches
  // the event the way a held key would arrive. Without the filter, holding Enter oscillated
  // between paused and playing many times a second and flooded the live region.
  await board(page).click();
  await page.keyboard.press("Enter");
  await expect(page.locator("#tetris-status")).toHaveText("Playing");

  // SEVEN, an odd number, and that is the whole test. With eight the mutation check
  // exposed this as vacuous: each unfiltered repeat toggles, so an even count lands back on
  // "Playing" and the assertion passed with the filter deleted.
  const repeated = (key: string) =>
    page.evaluate((k) => {
      const target = document.querySelector('[role="application"]')!;
      for (let i = 0; i < 7; i += 1) {
        target.dispatchEvent(
          new KeyboardEvent("keydown", { key: k, repeat: true, bubbles: true }),
        );
      }
    }, key);

  await repeated("Enter");
  await expect(
    page.locator("#tetris-status"),
    "a held Enter toggled the game",
  ).toHaveText("Playing");

  // Movement is the opposite case and must still repeat, or holding Left could not cross
  // the board. A held soft drop has to keep paying its one point a row.
  const before = await scoreValue(page);
  await repeated("ArrowDown");
  await expect
    .poll(() => scoreValue(page), {
      message:
        "a held ArrowDown was ignored, so repeat is filtered too broadly",
    })
    .toBeGreaterThan(before);
});

test("hands the keyboard to the board when Play is clicked", async ({
  page,
}) => {
  // Reported from the preview: on a desktop, clicking Play started the game and then ignored
  // every arrow key, because the click left focus on the BUTTON. The on-screen instructions
  // say to click the board, so anyone who used the button instead was left with a running game
  // and dead controls.
  //
  // Never touches the board, which is the point of the test.
  await page.getByRole("button", { name: "Play" }).click();

  await expect(
    board(page),
    "Play did not hand focus to the board",
  ).toBeFocused();

  const before = await scoreValue(page);
  await page.keyboard.press("Space");
  await expect
    .poll(() => scoreValue(page), {
      message: "a key pressed after clicking Play did not reach the game",
    })
    .toBeGreaterThan(before);
});

test("keeps the direction buttons usable by keyboard rather than stealing focus", async ({
  page,
}) => {
  // The other half of the same decision. Play hands focus to the board; the direction buttons
  // deliberately do NOT, because a keyboard visitor who tabs to "Move left" and presses Enter
  // should be able to press it again rather than have the control become one-shot.
  await page.getByRole("button", { name: "Play" }).click();
  const left = page.getByRole("button", { name: "Move left" });
  await left.focus();
  await page.keyboard.press("Enter");

  await expect(
    left,
    "activating a direction button moved focus away",
  ).toBeFocused();
});

test("keeps the next-piece preview a constant size", async ({ page }) => {
  // Also reported from the preview: the shapes are different widths -- I is 4x1, O is 2x2, the
  // rest 3x2 -- so a preview sized to its own content reflowed the score row and nudged the
  // page on every piece. The box is fixed and the shape is centred inside it now.
  await board(page).click();
  await page.keyboard.press("Enter");

  const sizes = new Set<string>();
  for (let i = 0; i < 14; i += 1) {
    for (const cell of await page
      .locator("dt:has-text('Next') + dd > span")
      .all()) {
      const box = await cell.boundingBox();
      if (box) sizes.add(`${Math.round(box.width)}x${Math.round(box.height)}`);
    }
    await page.keyboard.press("Space");
    await page.waitForTimeout(80);
  }

  // Fourteen hard drops walks through more than one bag, so every kind has been previewed.
  expect(
    [...sizes],
    "the preview box changes size between pieces, which reflows the score row",
  ).toHaveLength(1);
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

test("puts the board above the controls, centred, at every width", async ({
  page,
}) => {
  // The layout the owner asked for, asserted as RELATIONSHIPS rather than pixel sizes: the
  // board's size depends on the measured height of the furniture, which depends on the font,
  // so any exact figure here would be a screenshot test wearing a disguise.
  for (const [width, height] of [
    [1280, 900],
    [820, 1180],
    [390, 844],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.goto("/animation");
    const canvas = board(page).locator("canvas");
    await expect(canvas).toBeVisible({ timeout: 15_000 });

    const box = (await canvas.boundingBox())!;
    const controls = (await page
      .getByRole("button", { name: "Hard drop" })
      .boundingBox())!;
    const section = (await page.locator("#tetris").boundingBox())!;

    expect(
      controls.y,
      `${width}x${height}: the controls are not below the board`,
    ).toBeGreaterThan(box.y + box.height);

    // Centred within the game's own box, which is what "in the centre" means here -- the
    // box is itself centred by the shared content column.
    const boardCentre = box.x + box.width / 2;
    const sectionCentre = section.x + section.width / 2;
    expect(
      Math.abs(boardCentre - sectionCentre),
      `${width}x${height}: the board is off centre by ${Math.round(boardCentre - sectionCentre)}px`,
    ).toBeLessThanOrEqual(2);
  }
});

test("fits the board and its controls on one screen", async ({ page }) => {
  // The point of sizing the board from the measured furniture height. It regressed once
  // already and silently: the margin left for this was 24px while the flex gap alone was 16,
  // so on a 390x844 phone the control buttons sat three pixels below the fold and could not
  // be reached without scrolling away from the board.
  for (const [width, height] of [
    [390, 844],
    [320, 700],
    [844, 390],
    [1280, 900],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.goto("/animation");
    const canvas = board(page).locator("canvas");
    await expect(canvas).toBeVisible({ timeout: 15_000 });
    await page.locator("#tetris").scrollIntoViewIfNeeded();

    const box = (await canvas.boundingBox())!;
    const controls = (await page
      .getByRole("button", { name: "Hard drop" })
      .boundingBox())!;
    const used = controls.y + controls.height - box.y;

    expect(
      used,
      `${width}x${height}: board plus controls need ${Math.round(used)}px of a ${height}px viewport`,
    ).toBeLessThanOrEqual(height);
    // Room to spare, not merely a fit -- a reader scrolling by hand will not land on the
    // exact pixel, and a fit with no slack is one wrapped row away from breaking.
    expect(
      height - used,
      `${width}x${height}: only ${Math.round(height - used)}px of slack`,
    ).toBeGreaterThanOrEqual(24);
  }
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
