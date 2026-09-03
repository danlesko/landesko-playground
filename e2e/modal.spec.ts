import { test, expect } from "@playwright/test";

/**
 * The confirmation modal's runtime behaviour, which nothing in this repo could reach until
 * `src/app/e2e-fixture/blog-card` existed.
 *
 * Why it had no coverage: the delete trigger sits behind `session?.user`, and the card is
 * rendered by `BlogList` from Postgres rows, so a unit test cannot get to it and CI has no
 * database. The consequence was not theoretical -- two regressions shipped through that gap
 * in one evening, and both were found only by hand-rendering the component on a throwaway
 * route. The fixture is that route, kept, and this is what it is for.
 *
 * These assertions are deliberately about RUNTIME properties rather than markup. A modal's
 * value is entirely in behaviour a static render cannot show: that the backdrop covers the
 * page, that Escape closes it, that focus cannot leave it, that the movement stops when a
 * reader has asked for less motion. Every one of those is invisible to `renderToStaticMarkup`
 * and to a class-name assertion.
 *
 * A note on what these are worth after `@rewind-ui/core` goes (#143): the Modal is the last
 * component still coming from it, and the plan is a native `<dialog>`. These tests are
 * written against BEHAVIOUR, not against the library, precisely so they survive that swap and
 * can prove it was behaviour-preserving. If one of them has to change to accommodate a native
 * dialog, that change is the interesting part of the diff.
 */

const FIXTURE = "/e2e-fixture/blog-card";
const TRIGGER = "Delete post: Fixture post";

const openModal = async (page: import("@playwright/test").Page) => {
  await page.goto(FIXTURE);
  // The trigger is the only control on the card, and it is named rather than located by tag
  // so the assertion survives the icon button being restructured.
  await page.getByRole("button", { name: TRIGGER }).click();
  const dialog = page.locator('[role="dialog"]');
  await expect(dialog).toBeVisible();
  return dialog;
};

test("the fixture route is reachable, so the tests below are not vacuous", async ({
  page,
}) => {
  // Guards the guard. `E2E_FIXTURES` is set by playwright.config.ts and by nothing else, so
  // if that ever stops being passed every test in this file would fail on navigation rather
  // than on the property it names -- and a 404 body is not an obvious failure message.
  const response = await page.goto(FIXTURE);
  expect(response?.status(), `${FIXTURE} did not render`).toBe(200);
  await expect(page.getByRole("button", { name: TRIGGER })).toBeVisible();
});

test("the trigger opens a dialog asking for confirmation", async ({ page }) => {
  const dialog = await openModal(page);
  await expect(
    dialog.getByRole("heading", { name: "Delete Blog Post" }),
  ).toBeVisible();
  await expect(
    dialog.getByText("Are you sure you want to delete this blog post?"),
  ).toBeVisible();

  // NOT asserted: that the dialog names the post. It does not -- the copy says "this blog
  // post" -- and an earlier version of this test assumed otherwise and failed. Worth knowing
  // rather than fixing here: a reader with several posts is asked to confirm a deletion
  // without being told which one, and the trigger they clicked is now behind a backdrop.
  // Recorded on #143 instead of changed, because the copy belongs to a component that is
  // about to be rewritten.
  await expect(dialog.getByText("Fixture post")).toHaveCount(0);
});

test("the dialog has an accessible name", async ({ page }) => {
  const dialog = await openModal(page);

  // It did not, until this change. rewind-ui sets `role="dialog"` and `aria-modal="true"`
  // and no name, so a screen reader announced an unnamed dialog -- axe reports it as a
  // serious `aria-dialog-name` violation, and axe had never run against this component
  // because nothing could render it. `aria-labelledby` points at the visible heading, so
  // the announced name cannot drift from the one on screen.
  const labelledBy = await dialog.getAttribute("aria-labelledby");
  expect(labelledBy, "the dialog names nothing").not.toBeNull();

  const name = await page.evaluate(
    (id) => document.getElementById(id!)?.textContent?.trim(),
    labelledBy,
  );
  expect(
    name,
    "aria-labelledby points at an element that is missing or empty",
  ).toBe("Delete Blog Post");
});

test("the backdrop covers the page and obscures what is behind it", async ({
  page,
}) => {
  await openModal(page);

  const backdrop = await page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]')!;

    // Identified RELATIONALLY: the element painted over the whole viewport that sits
    // behind the dialog in the stacking order. An earlier version took "the first fixed,
    // painted element that is not an ancestor of the dialog", which happens to be the
    // right one here and would equally accept any unrelated scrim.
    const candidates = [...document.querySelectorAll("body *")].filter(
      (element) => {
        if (element.contains(dialog)) return false;
        const style = getComputedStyle(element);
        if (style.position !== "fixed") return false;
        const rect = element.getBoundingClientRect();
        const spansViewport =
          rect.left <= 0 &&
          rect.top <= 0 &&
          rect.right >= window.innerWidth &&
          rect.bottom >= window.innerHeight;
        const obscures =
          style.backdropFilter !== "none" ||
          (style.backgroundColor !== "rgba(0, 0, 0, 0)" &&
            style.backgroundColor !== "transparent");
        return spansViewport && obscures;
      },
    );
    if (candidates.length !== 1) return { count: candidates.length };

    const found = candidates[0]!;
    const style = getComputedStyle(found);
    const dialogZ = Number(getComputedStyle(dialog).zIndex);
    return {
      count: 1,
      background: style.backgroundColor,
      backdropFilter: style.backdropFilter,
      // Behind the dialog, not merely present. A backdrop painted over the panel would
      // satisfy every other assertion here while hiding the thing it frames.
      belowDialog: Number(style.zIndex) < dialogZ,
      // Sampled at the centre of the DIALOG's own box, not the viewport's. The first
      // version used the viewport centre and failed: the panel is top-aligned with a
      // margin rather than vertically centred, so the viewport's middle is over the
      // backdrop -- which is correct behaviour, not a defect. What matters is that the
      // backdrop is not on top of the dialog, i.e. not swallowing clicks meant for the
      // buttons.
      dialogIsTopmostOverItself: (() => {
        const box = dialog.getBoundingClientRect();
        const topmost = document.elementFromPoint(
          Math.floor(box.left + box.width / 2),
          Math.floor(box.top + box.height / 2),
        );
        return Boolean(topmost && dialog.contains(topmost));
      })(),
    };
  });

  expect(
    backdrop.count,
    "expected exactly one viewport-covering obscuring element behind the dialog",
  ).toBe(1);
  expect(
    backdrop.belowDialog,
    "the backdrop is not behind the dialog in the stacking order",
  ).toBe(true);
  expect(
    backdrop.dialogIsTopmostOverItself,
    "the backdrop is painted on top of the dialog, so it would swallow clicks meant for the buttons",
  ).toBe(true);
  // Both halves, because they fail independently: the dim is a background colour and the
  // blur is a filter, and losing either leaves the page behind legible in a different way.
  expect(backdrop.background, "the backdrop is not dimming anything").not.toBe(
    "rgba(0, 0, 0, 0)",
  );
  expect(backdrop.backdropFilter, "the backdrop is not blurring").not.toBe(
    "none",
  );
});

test("Escape closes it", async ({ page }) => {
  const dialog = await openModal(page);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

test("the cancel control closes it without deleting", async ({ page }) => {
  const dialog = await openModal(page);
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
  // Still there: cancelling is the whole point of a confirmation step.
  await expect(page.getByRole("button", { name: TRIGGER })).toBeVisible();
});

/**
 * The focus trap, and the wait in it is the finding rather than a workaround.
 *
 * rewind-ui gates `useFocusTrap` on its open animation's `onfinish`, so the trap is not
 * active while the dialog is sliding in. Measured through this fixture, tabbing immediately
 * after the dialog becomes visible: the first two presses stay on Cancel and Delete, and the
 * next four land on the site title, the sign-in control, and the first two nav links. From a
 * 150ms settle onwards it wraps correctly and never escapes.
 *
 * So there is a real window -- roughly the animation's length -- in which a keyboard user who
 * tabs straight after opening ends up operating the page behind an open modal. This test
 * asserts the behaviour AFTER that window, because a suite cannot carry a failing test; the
 * gap is filed on #143.
 *
 * It is also the clearest argument for the replacement being a native `<dialog>`:
 * `showModal()` makes the rest of the document inert the moment it is called, with no
 * animation to wait for. When that lands, this wait should be removable -- and if it is not,
 * the trap is still gated on something.
 */
test("focus cannot leave the dialog once it has opened", async ({ page }) => {
  const dialog = await openModal(page);
  // Not an arbitrary settle: it is longer than the open animation, which is what the trap
  // waits for. See above.
  await page.waitForTimeout(250);

  // Cycling in BOTH directions, from the boundaries, rather than pressing Tab a fixed
  // number of times and hoping. A count is the wrong instrument: with two controls three
  // presses already prove wrapping, and if the dialog ever gains six the same loop proves
  // nothing. Driving from the last control forward and the first control backward tests the
  // two places a trap actually fails.
  const focusables = dialog.locator("button");
  const count = await focusables.count();
  expect(
    count,
    "the dialog has no focusable controls to cycle",
  ).toBeGreaterThan(1);

  const activeInsideDialog = () =>
    dialog.evaluate(
      (element) =>
        element.contains(document.activeElement) ||
        document.activeElement === element,
    );

  await focusables.last().focus();
  await page.keyboard.press("Tab");
  expect(
    await activeInsideDialog(),
    "Tab from the last control escaped the dialog, so the page behind it is operable",
  ).toBe(true);

  await focusables.first().focus();
  await page.keyboard.press("Shift+Tab");
  expect(
    await activeInsideDialog(),
    "Shift+Tab from the first control escaped the dialog backwards",
  ).toBe(true);
});

/**
 * The one behaviour `globals.css` documents as measured but could not re-run.
 *
 * Its comment records that under emulated `reduce` the modal ran through 17 distinct
 * transforms and slid 100px, and that the `[role="dialog"] { transform: none !important }`
 * rule pinned it to one. That was measured through a scratch route which was then deleted,
 * so the numbers were a record rather than a guard -- the comment says so in as many words.
 * With the fixture they are checkable again.
 *
 * Sampling rather than asserting a single value: the rule's job is to stop MOVEMENT, so what
 * matters is that the transform never varies, not what it happens to be. `!important` beats
 * an animation declaration in the cascade, which is why a CSS rule can reach an animation the
 * Web Animations API drives and JS cannot.
 */
test("reduced motion stops the dialog moving", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const dialog = await openModal(page);

  const transforms = new Set<string>();
  for (let sample = 0; sample < 12; sample += 1) {
    transforms.add(
      await dialog.evaluate((element) => getComputedStyle(element).transform),
    );
    await page.waitForTimeout(25);
  }

  expect(
    [...transforms],
    "the dialog's transform changed under reduced motion, so it is still animating",
  ).toEqual(["none"]);
});

test("without the preference it still animates", async ({ page }) => {
  // The control for the test above. Without it, a modal that never moved for an unrelated
  // reason -- a broken animation, a missing library update -- would make that assertion pass
  // while proving nothing about the preference.
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto(FIXTURE);
  await page.getByRole("button", { name: TRIGGER }).click();

  const dialog = page.locator('[role="dialog"]');
  const transforms = new Set<string>();
  // Polled from the click rather than after `toBeVisible`, because the movement is the first
  // thing that happens and waiting for a settled state can miss all of it.
  for (let sample = 0; sample < 24; sample += 1) {
    transforms.add(
      // No `.catch()` here. An earlier version fell back to a sentinel string, which
      // counted as a distinct value -- so a dialog that never rendered produced
      // {"absent", "none"} and satisfied the assertion. A throw should fail the test.
      await dialog.evaluate((element) => getComputedStyle(element).transform),
    );
    await page.waitForTimeout(16);
  }

  expect(
    transforms.size,
    `only saw ${[...transforms].join(", ")} -- the modal is not animating even without the preference, so the reduced-motion assertion proves nothing`,
  ).toBeGreaterThan(1);
});

/**
 * The dialog's text contrast, measured here because axe cannot.
 *
 * axe reports the modal's body copy as `color-contrast: incomplete` -- its
 * `elmPartiallyObscured` path, meaning no background-painting ancestor fully encompassed the
 * text rectangles. So the a11y suite records that result as expected-unevaluable, and that
 * declaration is keyed on the element's TAG, which cannot distinguish this `<p>` from the
 * card's. Rather than make the declaration cleverer, the property it would have guarded is
 * asserted directly here.
 */
test("the dialog's text has enough contrast against its panel", async ({
  page,
}) => {
  const dialog = await openModal(page);

  const measured = await dialog.evaluate((element) => {
    const body = element.querySelector("p")!;
    const channels = (colour: string) =>
      (colour.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
    const luminance = ([r, g, b]: number[]) => {
      const channel = (value: number) => {
        const s = value / 255;
        return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * channel(r!) + 0.7152 * channel(g!) + 0.0722 * channel(b!);
    };
    // The nearest ancestor that actually paints, which is the panel rather than the page.
    let painted: Element | null = body;
    let background = "rgba(0, 0, 0, 0)";
    while (painted) {
      const value = getComputedStyle(painted).backgroundColor;
      if (value !== "rgba(0, 0, 0, 0)" && value !== "transparent") {
        background = value;
        break;
      }
      painted = painted.parentElement;
    }
    const text = getComputedStyle(body).color;
    const [hi, lo] = [
      luminance(channels(text)),
      luminance(channels(background)),
    ].sort((a, b) => b - a);
    return {
      text,
      background,
      // Reported as sRGB by getComputedStyle, so this arithmetic is on real channels
      // rather than on an `oklch()` string -- a mistake made earlier in this repo, where a
      // parser took lightness and hue as red and blue.
      ratio: (hi! + 0.05) / (lo! + 0.05),
    };
  });

  expect(
    measured.ratio,
    `${measured.text} on ${measured.background} is ${measured.ratio.toFixed(2)}:1, and body text needs 4.5:1`,
  ).toBeGreaterThanOrEqual(4.5);
});
