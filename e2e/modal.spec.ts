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
 * These were written against BEHAVIOUR rather than against the library that used to render
 * this modal, so that they could survive the swap to a native `<dialog>` in #143 and say
 * whether it preserved behaviour. It did not entirely, and both differences are improvements
 * this file now asserts rather than tolerates:
 *
 *   - The focus trap no longer has a dead window. The library gated it on an animation
 *     callback, so tabbing in the first ~150ms operated the page behind the modal; the wait
 *     that accommodated that is GONE from the test below, and its absence is the assertion.
 *   - The backdrop is no longer an element. `::backdrop` in the top layer is not reachable by
 *     `querySelector`, so the test that identified it relationally now reads it as a
 *     pseudo-element.
 *
 * Everything else -- the name, Escape, cancel, reduced motion, contrast -- passes unchanged
 * against both implementations, which is the useful half of the result.
 */

const FIXTURE = "/e2e-fixture/blog-card";
const TRIGGER = "Delete post: Fixture post";

const openModal = async (page: import("@playwright/test").Page) => {
  await page.goto(FIXTURE);
  // The trigger is the only control on the card, and it is named rather than located by tag
  // so the assertion survives the icon button being restructured.
  await page.getByRole("button", { name: TRIGGER }).click();
  // By ROLE, not by attribute. Nothing authors `role="dialog"` any more -- a native
  // `<dialog>` carries it implicitly -- so the old attribute selector would match nothing and
  // every test here would fail on the locator rather than on its subject.
  const dialog = page.getByRole("dialog");
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
  // Still recorded rather than fixed after the #143 rewrite: changing what the dialog says
  // is a copy decision, and the copy on this site is not mine to author. The rewrite kept
  // the wording deliberately so that the swap was provably behaviour-only.
  await expect(dialog.getByText("Fixture post")).toHaveCount(0);
});

test("the dialog has an accessible name", async ({ page }) => {
  const dialog = await openModal(page);

  // It did not, before the fixture existed to show it. The library set `role="dialog"` and
  // `aria-modal="true"` and no name, so a screen reader announced an unnamed dialog -- a
  // serious `aria-dialog-name` violation that axe had never reported because nothing in the
  // repo could render the component for it to scan.
  //
  // The native element does not fix this on its own: `<dialog>` has an implicit role and no
  // implicit name either. `aria-labelledby` is authored, and it points at the VISIBLE
  // heading rather than repeating the string, so the announced name cannot drift from the
  // one on screen.
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

test("the backdrop dims and blurs the page behind the dialog", async ({
  page,
}) => {
  const dialog = await openModal(page);

  // `::backdrop` is a pseudo-element in the top layer, not a node, so there is nothing to
  // find with `querySelector` -- the previous version of this test identified the library's
  // backdrop relationally among `body *` and would now report zero candidates.
  const backdrop = await dialog.evaluate((element) => {
    const style = getComputedStyle(element, "::backdrop");
    return {
      background: style.backgroundColor,
      backdropFilter: style.backdropFilter,
    };
  });

  // The EXACT colour, not merely "something other than transparent", and the difference
  // matters: Chromium's UA sheet already paints `dialog::backdrop` at rgba(0, 0, 0, 0.1)
  // (measured), so a non-transparency check passes even if this repo's rule is deleted
  // entirely. Asserting the authored value is what makes the assertion able to fail.
  //
  // A pseudo-element that was never generated reports rgba(0, 0, 0, 0) instead, so this also
  // catches the dialog being open without a backdrop at all.
  expect(
    backdrop.background,
    "the backdrop is not this repo's dim -- rgba(0, 0, 0, 0.1) means the UA default is showing and the rule was lost, and rgba(0, 0, 0, 0) means no backdrop was generated",
  ).toBe("rgba(24, 24, 27, 0.5)");

  // Independent of the dim, and this one the UA does not provide: its default is `none`, so
  // any non-`none` value here came from this repo. Both halves are asserted because losing
  // either leaves the page behind legible in a different way.
  expect(
    backdrop.backdropFilter,
    "the backdrop is not blurring the page behind it",
  ).toBe("blur(8px)");

  // Hit-testing, because a backdrop painted OVER the panel would satisfy both assertions
  // above while swallowing every click meant for the buttons. Sampled at the centre of the
  // dialog's own box rather than the viewport's: the panel is top-aligned with a margin, so
  // the viewport centre is legitimately over backdrop.
  //
  // The old z-index comparison is gone: a top-layer dialog computes `z-index: auto`
  // (measured), so comparing numbers there compared NaN against NaN. Painting order between
  // a dialog and its own backdrop is a spec guarantee rather than something this repo sets,
  // and hit-testing is the property that actually matters.
  const panelIsHittable = await dialog.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const topmost = document.elementFromPoint(
      Math.floor(box.left + box.width / 2),
      Math.floor(box.top + box.height / 2),
    );
    return Boolean(topmost && element.contains(topmost));
  });
  expect(
    panelIsHittable,
    "something is painted on top of the dialog, so it would swallow clicks meant for the buttons",
  ).toBe(true);
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
 * The focus trap. Two things in this test are the finding: the absence of a wait, and what
 * "trapped" is asserted to mean.
 *
 * The library gated `useFocusTrap` on its open animation's `onfinish`, so the trap was not
 * active while the dialog slid in. Measured through this fixture against that version, tabbing
 * immediately after the dialog became visible: the first two presses stayed on Cancel and
 * Delete, and the next four landed on the site title, the sign-in control, and the first two
 * nav links. Only from a 150ms settle onwards did it wrap. So there was a real window, about
 * the length of the animation, in which a keyboard user who tabbed straight after opening
 * ended up operating the page behind an open modal. This test carried a 250ms `waitForTimeout`
 * to assert the behaviour after that window, because a suite cannot carry a failing test, with
 * the gap filed on #143.
 *
 * #143 closed it: `showModal()` makes the rest of the document inert the moment it is called,
 * with no animation to wait for. The wait is deleted rather than shortened -- if the trap were
 * gated on anything again this test would fail, which is the point of removing it entirely.
 *
 * The other change is the invariant. "Focus stays inside the dialog" is what a JS trap does and
 * is NOT what the platform does, so asserting it would have failed against a correct native
 * dialog. Measured, tabbing from Cancel: Delete, then `<body>`, then back to Cancel, cycling
 * forever. That `<body>` step is the browser passing focus out of the document -- to its own UI
 * in a real window -- and bringing it back, and it is normal. Nothing is reachable there.
 *
 * So the property asserted is the one that actually matters, and it is strictly stronger than
 * "never leaves the dialog" would be for the failure mode that shipped: focus never lands on
 * an element BEHIND the dialog. A press that reached the header's sign-in control fails; a
 * press that parks on `<body>` does not.
 */
test("no amount of tabbing reaches a control behind the dialog", async ({
  page,
}) => {
  // The return value is unused: this test reads the active element through `page.evaluate`
  // rather than through the locator, because what it needs is a comparison against
  // `document.activeElement`. `openModal` is still the right way in -- it asserts the dialog
  // opened, so a failure below cannot be a dialog that never appeared.
  await openModal(page);

  // Named so the failure message can say WHICH control was reached. The old version reported
  // only "focus escaped", which does not distinguish the browser's own UI from the nav.
  const focusLanding = () =>
    page.evaluate(() => {
      const dialog = document.querySelector("dialog[open]")!;
      const active = document.activeElement;
      if (
        !active ||
        active === document.body ||
        active === document.documentElement
      ) {
        return "outside the document";
      }
      if (dialog.contains(active)) return "inside the dialog";
      return `BEHIND the dialog: <${active.tagName.toLowerCase()}> ${(
        active.getAttribute("aria-label") ??
        active.textContent ??
        ""
      )
        .trim()
        .slice(0, 40)}`;
    });

  // Enough presses to go round the cycle several times, from the first frame after opening
  // with no settle. The measured cycle is three long, so eight covers it more than twice --
  // and a count is safe here in a way it is not for proving wrapping, because every press is
  // checked rather than only the last.
  const landings = new Set<string>();
  for (let press = 0; press < 8; press += 1) {
    await page.keyboard.press("Tab");
    landings.add(await focusLanding());
  }
  // Backwards too, which is the other place a trap fails.
  for (let press = 0; press < 8; press += 1) {
    await page.keyboard.press("Shift+Tab");
    landings.add(await focusLanding());
  }

  expect(
    [...landings].filter((landing) => landing.startsWith("BEHIND")),
    "tabbing reached a control behind the open dialog, so the page under it is operable",
  ).toEqual([]);

  // The control for the assertion above, which would otherwise pass on a dialog whose controls
  // are all unreachable -- focus parked outside the document for all sixteen presses would
  // produce an empty list too.
  expect(
    landings.has("inside the dialog"),
    "tabbing never landed in the dialog at all, so the assertion above proves nothing",
  ).toBe(true);
});

test("the page behind the dialog is inert, not merely covered", async ({
  page,
}) => {
  // A trap that only intercepts Tab still leaves the page behind reachable by other means.
  // The library's was JS over a visual overlay; `showModal()` makes the background genuinely
  // inert, which is a stronger claim than "a backdrop is painted over it" -- and it is what
  // lets `body.modal-open` be responsible for nothing but the scroll lock.
  await openModal(page);

  // The header's own control, located by role. Measured: the header has exactly one focusable
  // element and it is this button -- the site title next to it is a `<span>`, not a link, so
  // an earlier version of this test that looked for a link named after the site found nothing
  // and failed on the locator rather than on inertness.
  const behind = page.getByRole("button", { name: "Login" });
  await expect(
    behind,
    "there is no control behind the dialog to try, so this test would pass vacuously",
  ).toBeAttached();

  const took = await behind.evaluate((element: HTMLElement) => {
    element.focus();
    return document.activeElement === element;
  });
  expect(
    took,
    "a control behind the dialog took focus when asked directly, so the background is not inert",
  ).toBe(false);
});

/**
 * The one behaviour `globals.css` documented as measured but could not re-run.
 *
 * Against the library version, under emulated `reduce`, the modal ran through 17 distinct
 * transforms and slid 100px, and a `[role="dialog"] { transform: none !important }` rule
 * pinned it to one. `!important` was the only lever available: the slide was driven through
 * the Web Animations API, which no JS in this app could reach, and an author `!important`
 * declaration outranks an animation declaration in the cascade. Those numbers came from a
 * scratch route that was then deleted, so the comment recording them was a record rather than
 * a guard, and said so.
 *
 * That rule is now GONE and this test still passes, which is the useful result. The native
 * dialog animates through a CSS `animation`, so the blanket `animation-duration: 0.01ms`
 * already in the `prefers-reduced-motion` block reaches it -- no special-casing, and nothing
 * left that only a `!important` override can hold down.
 *
 * Sampling rather than asserting a single value: the job is to stop MOVEMENT, so what matters
 * is that the transform never varies, not what it happens to be.
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

  const dialog = page.getByRole("dialog");
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
