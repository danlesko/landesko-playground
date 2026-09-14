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

/**
 * Counts drawing calls on the Tetris canvas over a second.
 *
 * Hooks a spread of context methods rather than one, because p5 reaches the canvas by several
 * paths -- an early version of this counted only `fillRect` and reported 60 a second for a
 * two-hundred-cell repaint, which is not a number that can be right.
 *
 * The canvas is found by size rather than by DOM order: `/animation` has two, and p5 assigns
 * their ids in construction order, which is not the order they appear in.
 */
const canvasCallsPerSecond = async (page: Page): Promise<number> => {
  const box = (await board(page).locator("canvas").boundingBox())!;
  return page.evaluate(async (width) => {
    const methods = [
      "fillRect",
      "clearRect",
      "beginPath",
      "fill",
      "stroke",
      "arc",
    ] as const;
    const canvas = Array.from(document.querySelectorAll("canvas")).find(
      (element) => Math.abs(element.getBoundingClientRect().width - width) < 2,
    );
    const context = canvas?.getContext("2d");
    if (!context) return -1;
    let calls = 0;
    for (const method of methods) {
      const original = context[method]?.bind(context);
      if (!original) continue;
      (context as unknown as Record<string, unknown>)[method] = (
        ...args: unknown[]
      ) => {
        calls += 1;
        return (original as (...a: unknown[]) => unknown)(...args);
      };
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return calls;
  }, box.width);
};

test("stops redrawing the board when nobody is playing", async ({ page }) => {
  // A still board redrawn sixty times a second is work for nothing, and this is a page people
  // leave open. Measured before the fix at 24,300 canvas calls a second on a 1280x900 viewport,
  // repainting a two-hundred-cell grid that had not changed.
  await board(page).scrollIntoViewIfNeeded();

  expect(
    await canvasCallsPerSecond(page),
    "the board is repainting while idle",
  ).toBe(0);

  await page.getByRole("button", { name: "Play" }).click();
  expect(
    await canvasCallsPerSecond(page),
    "the board stopped repainting while a game is running",
  ).toBeGreaterThan(0);

  await page.getByRole("button", { name: "Pause" }).click();
  // A short settle first, and the reason is worth recording: `noLoop()` does not cancel a frame
  // the browser has already queued, so measuring immediately catches exactly one repaint -- 405
  // calls, or 1.7% of the running rate, which is the dim being painted. Waiting for that to pass
  // lets this assert the strong thing (nothing at all) rather than a threshold.
  await page.waitForTimeout(400);
  expect(
    await canvasCallsPerSecond(page),
    "the board is still repainting while paused",
  ).toBe(0);
});

test("still repaints a board that has stopped changing", async ({ page }) => {
  // The other half of stopping the loop, and the easier half to get wrong: stopping without
  // painting leaves whatever was on screen at that moment, so the dim that marks a board as
  // not-live would never appear. Sampled as a pixel because that is the only place it exists.
  const centre = async () =>
    page.evaluate(
      async (width) => {
        const canvas = Array.from(document.querySelectorAll("canvas")).find(
          (element) =>
            Math.abs(element.getBoundingClientRect().width - width) < 2,
        );
        const context = canvas?.getContext("2d");
        if (!canvas || !context) return "none";
        const data = context.getImageData(
          Math.floor(canvas.width / 2),
          Math.floor(canvas.height / 2),
          1,
          1,
        ).data;
        return `${data[0]},${data[1]},${data[2]}`;
      },
      (await board(page).locator("canvas").boundingBox())!.width,
    );

  await board(page).scrollIntoViewIfNeeded();
  const idle = await centre();

  await board(page).click();
  await page.keyboard.press("Enter");
  await page.waitForTimeout(300);
  const playing = await centre();
  expect(playing, "the board looks the same running as idle").not.toBe(idle);

  await page.keyboard.press("Enter");
  await page.waitForTimeout(300);
  expect(
    await centre(),
    "pausing did not repaint, so the dim never appeared",
  ).toBe(idle);
});

test("tells you the keyboard shortcut on every control", async ({ page }) => {
  // The reported gap: the shortcuts existed only in a prose sentence at the bottom of the
  // panel, which is easy to miss and hidden entirely below 640px. They are on the buttons now.
  //
  // Both channels are asserted, because they serve different people. `title` is what a mouse
  // user gets by hovering; the accessible name is what a keyboard or screen-reader user gets,
  // and hovering is something only a pointer can do.
  const expected: Array<[string, string, string]> = [
    ["Move left", "←", "left arrow"],
    ["Move right", "→", "right arrow"],
    ["Rotate", "↑", "up arrow"],
    ["Soft drop", "↓", "down arrow"],
    ["Hard drop", "space", "space bar"],
    ["Hold piece", "C", "C"],
  ];

  for (const [action, glyph, spoken] of expected) {
    const control = page.getByRole("button", { name: action });
    await expect(control, `${action} is missing`).toBeVisible();

    const title = await control.getAttribute("title");
    expect(title, `${action} has no tooltip`).toContain(action);
    expect(title, `${action}'s tooltip does not name its key`).toContain(glyph);

    // Spelled out in the name rather than left as a glyph: a screen reader announcing `←` is
    // at the mercy of its own character dictionary.
    const label = await control.getAttribute("aria-label");
    expect(
      label,
      `${action}'s accessible name does not name its key`,
    ).toContain(spoken);
  }

  // And the Play control, which carries visible text so it must NOT get an aria-label -- that
  // would override "Play again" and leave the button lying about what it does.
  const play = page.getByRole("button", { name: "Play", exact: true });
  expect(await play.getAttribute("title")).toContain("Enter");
  expect(
    await play.getAttribute("aria-label"),
    "an aria-label would override the visible text",
  ).toBeNull();
});

test("holds a piece, and only once per piece", async ({ page }) => {
  await board(page).click();
  await page.keyboard.press("Enter");

  const heldSlot = page.locator("dt:has-text('Hold') + dd");
  await expect(heldSlot).toContainText("nothing held");

  await page.keyboard.press("c");
  await expect(heldSlot, "C did not hold the piece").not.toContainText(
    "nothing held",
  );

  // A second hold before anything locks must do nothing -- otherwise the two pieces swap back
  // and forth for ever while gravity runs, which stalls the game.
  const after = await heldSlot.innerHTML();
  await page.keyboard.press("c");
  expect(await heldSlot.innerHTML(), "a second hold was allowed").toBe(after);
});

test("does not claim Shift, so Shift+Tab still navigates", async ({ page }) => {
  // Shift is the other conventional hold binding and is unusable here: this handler
  // preventDefaults every key it claims, so claiming Shift would break backwards keyboard
  // navigation out of the board -- a keyboard trap, which is worse than one missing shortcut.
  await board(page).click();
  await page.keyboard.press("Enter");
  await expect(board(page)).toBeFocused();

  await page.keyboard.press("Shift+Tab");

  await expect(
    board(page),
    "Shift+Tab did not move focus, so the board is trapping it",
  ).not.toBeFocused();
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
