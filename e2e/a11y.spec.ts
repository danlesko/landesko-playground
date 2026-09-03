import { test, expect, type Page } from "@playwright/test";
import { createRequire } from "node:module";

/**
 * An automated WCAG pass over the routes that need no database.
 *
 * This exists because the repo had axe-core available and never ran it, so the
 * colour-contrast failure fixed in #88 sat in the header of every page while a
 * green suite reported nothing. Roughly a third of WCAG is machine-checkable,
 * which is the third this file owns; the hand-written assertions in
 * ./smoke.spec.ts own the rest and are not replaceable by this.
 *
 * The `incomplete` bucket is the reason this is not a two-line test -- see below.
 */

// axe is injected into the page rather than driven through @axe-core/playwright.
// That wrapper is one more dependency for a `page.addScriptTag` and an
// `axe.run`, and going direct keeps the version of axe that runs identical to
// the one `eslint-plugin-jsx-a11y` already resolves, so the linter and this
// suite cannot drift apart and disagree about the same rule.
//
// `__filename` rather than `import.meta.url`: Playwright transpiles specs to
// CommonJS, where `import.meta` is a syntax error and the whole file fails to
// load as "no tests found" rather than as an error pointing here.
const axeSource = createRequire(__filename).resolve("axe-core/axe.min.js");

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

/**
 * Both viewports, and the narrow one is not padding.
 *
 * Playwright's project is Desktop Chrome at 1280px, which is at or above the
 * `lg` breakpoint everywhere in this app -- so a desktop-only pass never sees
 * anything gated on `lg:hidden`. `MainNav`'s toggle is exactly that: its
 * `aria-label="Menu"` is the only accessible name it has, over an `aria-hidden`
 * icon that contributes none, and axe skips hidden elements, so deleting that
 * label left a desktop-only version of this suite completely green.
 *
 * 400px is also the width the header title's contrast failure was measured at,
 * so the motivating number in this file's own comments was taken at a viewport
 * the first draft never visited.
 */
const VIEWPORTS = [
  { name: "desktop", width: 1280, height: 720 },
  { name: "mobile", width: 400, height: 800 },
];

/**
 * `ready` is a real requirement, not defensive padding: `page.goto` resolves on
 * `load`, and `/animation` mounts its canvas from a `ssr: false` dynamic chunk
 * that arrives after it. Without the wait, axe scans that route before the thing
 * the route exists for is in the DOM -- silently, as a pass.
 *
 * `/contact` blocks Google, but no longer for the original reason. That reason
 * was that with no site key api.js threw during hydration and React unmounted
 * the route, so an unblocked scan graded the accessibility of an error screen.
 * #51 removed that: with no key the widget is never constructed, so nothing is
 * requested and the block is inert here. It is kept for the *other* direction --
 * a run that does have a key would load Google's iframe, whose accessibility is
 * not ours to grade and would vary with their markup. ./smoke.spec.ts no longer
 * blocks these origins, deliberately: it asserts that nothing is requested,
 * which only means something when nothing is intercepted.
 *
 * /blog is still absent: it needs a database, and without one it renders its
 * error boundary.
 */
// The site title, on every page. It is a `<span>` inside the header, not the
// `<h1>` -- worth stating, because "the title" reads like a heading and the
// assertion below would be wrong if it guessed.
const GRADIENT_TITLE = { rule: "color-contrast", tag: "span", gradient: true };

const ROUTES: {
  path: string;
  blockThirdParty?: true;
  // Which viewports to scan. Absent means both, which is what every real route wants --
  // reflow is exactly the kind of thing this suite should see at 400px. It exists for the
  // fixture, whose incomplete set is not assertable at the narrow width; see there.
  onlyViewports?: string[];
  ready: (page: Page) => Promise<unknown>;
  unevaluable: { rule: string; tag: string; gradient: boolean }[];
}[] = [
  {
    path: "/",
    ready: (page) =>
      expect(page.getByRole("heading", { level: 1 })).toBeVisible(),
    unevaluable: [GRADIENT_TITLE],
  },
  {
    path: "/animation",
    ready: (page) =>
      expect(page.locator("canvas")).toBeVisible({ timeout: 15_000 }),
    unevaluable: [GRADIENT_TITLE],
  },
  {
    path: "/credits",
    ready: (page) =>
      expect(page.getByRole("heading", { level: 1 })).toBeVisible(),
    unevaluable: [GRADIENT_TITLE],
  },
  {
    // The e2e fixture, which exists so the confirmation modal can be rendered at all --
    // see e2e/modal.spec.ts for why nothing else reaches it. Adding it here closed a real
    // gap: axe had never seen that dialog, and it was shipping a SERIOUS
    // `aria-dialog-name` violation, because the library set `role="dialog"` and
    // `aria-modal` and no name. Fixed in the same change by pointing `aria-labelledby` at
    // the heading -- and still authored after #143 replaced that library with a native
    // `<dialog>`, which supplies the role implicitly but no name of its own either.
    //
    // `ready` OPENS the modal, which is the whole point. Scanning this route without
    // clicking would add nothing that `/` does not already cover -- a closed modal is not
    // in the accessibility tree.
    path: "/e2e-fixture/blog-card",
    // DESKTOP ONLY, and the reason is a measured instability rather than a shortcut.
    //
    // At 1280px axe evaluates everything on this route. At 400px the panel is narrow relative
    // to its content and axe declines both the heading and the body copy as
    // `color-contrast: incomplete` -- its `elmPartiallyObscured` path, meaning no
    // background-painting ancestor fully encompassed the text rectangles. That set was already
    // unstable before #143: it came out unevaluable on a developer machine and evaluable in CI
    // at the same width, which is a font-metrics difference changing which rectangles are
    // covered. Whichever way the declaration is written, one of the two environments fails --
    // so the honest move is not to assert an incomplete set at that width. Adding tolerance
    // instead would defeat the point of this file, which is that "axe could not evaluate this"
    // is stated explicitly rather than ignored.
    //
    // What it costs: the modal is not scanned for VIOLATIONS at 400px either, since the two
    // tests share a route list. The modal's own contrast is measured directly in
    // e2e/modal.spec.ts, which is the specific thing this would have covered.
    onlyViewports: ["desktop"],
    ready: async (page) => {
      await page
        .getByRole("button", { name: "Delete post: Fixture post" })
        .click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      // Past the open animation, waited for BY the animation rather than by a duration.
      // The dialog is scannable while its transform is mid-flight, so contrast and overlap
      // results would otherwise be read off a moving target. This replaced a 250ms sleep:
      // the native dialog's animation is a CSS one, so `getAnimations()` sees it, and a
      // promise that resolves when it finishes cannot be wrong about the duration or go
      // stale if the duration changes.
      await dialog.evaluate((element) =>
        Promise.all(
          element.getAnimations().map((animation) => animation.finished),
        ),
      );
    },
    // EMPTY, and both of the entries that used to be here went for reasons worth recording.
    //
    // The gradient title is gone from this route's set even though the header is still in the
    // document, and that absence is a measurement of inertness rather than an oversight.
    // `showModal()` puts the dialog in the top layer and makes everything else inert, and axe
    // models that itself -- it detects the modal dialog and treats nodes outside it as inert in
    // its own virtual tree, rather than querying the browser's accessibility tree -- so it does
    // not reach the header here at all. It is still scanned on every other route.
    //
    // Worth being exact about, because it means this is axe agreeing about inertness rather
    // than the platform reporting it. `e2e/modal.spec.ts` measures the platform directly, by
    // trying to focus a control behind the dialog and finding that it refuses. Two independent
    // instruments; replacing `showModal()` with `show()` trips both.
    //
    // The overlapped body copy is gone because it became EVALUABLE: axe used to decline the
    // library modal's `<p>` and now computes its ratio and passes it. So the modal's contrast
    // is machine-checked at this width for the first time.
    unevaluable: [],
  },
  {
    path: "/contact",
    blockThirdParty: true,
    // The controlled inputs, not the heading. The original reason was that the
    // heading is server-rendered and stayed briefly present on a route in the
    // middle of dying; since #51 it no longer dies, so this is now just the
    // narrower wait, which is still the better one to keep.
    ready: (page) => expect(page.locator('input[name="name"]')).toBeVisible(),
    // The message textarea used to be listed here too: axe declined it with
    // "partially obscured by another element", and that was investigated and
    // found to be axe declining rather than anything wrong in the markup.
    //
    // It is gone as of #51, and the reason is worth being precise about, because
    // "the list got shorter" reads like a fix and this is not one. Nothing about
    // the textarea changed. With no site key the form's controls are now
    // `disabled`, and axe's `color-contrast` matcher bails on a disabled node
    // before evaluating it -- `colorContrastMatches` in axe-core does
    // `if (isDisabled(virtualNode) || isInert(virtualNode)) return false`, read
    // from the installed source rather than inferred from the set changing. So
    // the node left the incomplete bucket because it stopped being checked, not
    // because it became checkable.
    //
    // The consequence to know about: this list is now dependent on whether a
    // site key is configured. CI never has one, so the set below is what CI
    // sees. A local run *with* a key leaves the fields enabled and the
    // `{ color-contrast, textarea }` entry comes back, and this assertion fails
    // on the set having grown. That is the assertion working as designed, not a
    // regression -- restore the entry if this file ever runs against a keyed
    // environment.
    unevaluable: [GRADIENT_TITLE],
  },
];

interface AxeNode {
  html: string;
  target: string[];
  failureSummary?: string;
}
interface AxeResult {
  id: string;
  impact?: string;
  help: string;
  nodes: AxeNode[];
}
interface AxeRun {
  violations: AxeResult[];
  incomplete: AxeResult[];
  passes: AxeResult[];
  inapplicable: AxeResult[];
}

// Declared rather than cast through `any`: the injected script is the only
// reason `axe` exists on `window`, so its shape has to be asserted somewhere,
// and naming it here means the destructuring below is type-checked instead of
// silently returning `any` to every caller.
type AxeWindow = Window &
  typeof globalThis & {
    axe: { run(context: Document, options: unknown): Promise<AxeRun> };
  };

const analyse = async (
  page: Page,
  route: (typeof ROUTES)[number],
  viewport: (typeof VIEWPORTS)[number],
): Promise<AxeRun> => {
  await page.setViewportSize({
    width: viewport.width,
    height: viewport.height,
  });
  if (route.blockThirdParty) {
    await page.route("**://*.google.com/**", (request) => request.abort());
    await page.route("**://*.gstatic.com/**", (request) => request.abort());
  }
  await page.goto(route.path);
  await route.ready(page);
  await page.addScriptTag({ path: axeSource });
  return page.evaluate(
    (tags) =>
      (window as AxeWindow).axe.run(document, {
        runOnly: { type: "tag", values: tags },
      }),
    WCAG_TAGS,
  );
};

// One readable line per failing node, and the assertions below compare *these*
// against an empty list rather than comparing axe's own result objects. That is
// not cosmetic: `expect(violations).toEqual([])` prints every nested `tags`,
// `impact` and `any`/`all` array in the diff, which buries the two facts a
// reader needs -- which rule, and which element.
//
// Identified by rule and by markup, never by axe's `target` selector. When this
// was written the failing element was a `<button>` whose only selector was its
// React-generated id (`#_R_2bb_`), which changes between builds, so a target
// here would send the next reader looking for a name nothing has any more.
const summarise = (results: AxeResult[]): string[] =>
  results.flatMap((result) =>
    result.nodes.map(
      (node) =>
        `${result.id} | ${node.html.slice(0, 100)} | ${(
          node.failureSummary ?? result.help
        )
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean)
          .join(" ")
          .slice(0, 160)}`,
    ),
  );

/**
 * The floor that catches a hollow run, and it counts DISTINCT rules considered.
 *
 * A `runOnly` that matches no rules makes axe return zero violations, which would make every
 * assertion below pass while checking nothing -- one typo in WCAG_TAGS is enough. An earlier
 * draft floored `passes.length` at 15, and the precise reason that is the wrong instrument is
 * worth stating, because the obvious version of the complaint is false: a total typo does trip
 * it, since `["wcag2a-typo"]` measures 0 passes. What it does not trip is the loss of a single
 * tag, which is the realistic edit. Dropping `wcag21aa` was measured at 19-24 passes -- above
 * 15 on all eight combinations, so that mutant survived a `passes` floor and dies here.
 *
 * Raising the `passes` floor is not the fix either: `passes` is markup-dependent (24 on
 * /contact at desktop, 19 on / at mobile in that same run), so a floor tight enough to catch
 * 19 would fail on a legitimate page.
 *
 * This counted `passes + violations + incomplete + inapplicable` until #143, on the stated
 * reasoning that every rule lands in exactly one bucket so the sum is the rule set's size.
 * That reasoning is wrong, and the modal fixture is what exposed it: a rule with some nodes
 * passing and others unevaluable appears in TWO buckets, so the sum double-counts it.
 * `color-contrast` did exactly that on every route, which is why the sum measured a suspiciously
 * round 62 while the rule set has only 61 rules in it. When the dialog moved to a native
 * `<dialog>` its text became evaluable, `incomplete` emptied, and the sum fell to 61 on that
 * route alone -- a floor tripping on an accessibility IMPROVEMENT, and for a reason that had
 * nothing to do with the tags it exists to guard.
 *
 * Counting distinct ids is what the comment always claimed. Measured 61 on every
 * route/viewport combination, and unlike the sum it does not move with markup or with whether
 * an animation has settled. Tag drops still trip it: 59 without `wcag21aa`, 58 without
 * `wcag2aa`, 56 with `wcag2a` alone, 5 without `wcag2a`, 0 on a typo.
 *
 * One gap, stated rather than papered over: removing `wcag21a` leaves 61, because in axe's
 * current mapping every rule it selects is also selected by another tag. No count-based floor
 * can catch that -- the old sum measured 62 either way too -- and inventing a per-tag
 * assertion to cover a tag that contributes nothing would be theatre.
 *
 * (axe-core is pinned exactly in package.json, so this cannot drift without someone choosing
 * to bump it.)
 */
const RULE_FLOOR = 61;

for (const viewport of VIEWPORTS) {
  for (const route of ROUTES) {
    if (route.onlyViewports && !route.onlyViewports.includes(viewport.name)) {
      continue;
    }
    const label = `${route.path} at ${viewport.name}`;

    test(`${label} has no automatically detectable WCAG violations`, async ({
      page,
    }) => {
      const results = await analyse(page, route, viewport);

      const considered = new Set(
        [
          ...results.passes,
          ...results.violations,
          ...results.incomplete,
          ...results.inapplicable,
        ].map((result) => result.id),
      ).size;
      expect(
        considered,
        "axe considered too few rules -- check WCAG_TAGS for a typo or a dropped tag",
      ).toBeGreaterThanOrEqual(RULE_FLOOR);

      expect(summarise(results.violations)).toEqual([]);
    });

    // Split from the test above rather than folded into it, so a *new* thing axe
    // cannot evaluate does not read as a contrast regression, and so neither
    // failure hides the other.
    test(`${label} adds nothing new that axe cannot evaluate`, async ({
      page,
    }) => {
      const { incomplete } = await analyse(page, route, viewport);

      // `incomplete` is axe's "a human has to look at this" bucket, and it is the
      // reason a gate wired only to `violations` would have been actively
      // misleading here. The site title sits on the header's gradient, and axe
      // cannot compute a contrast ratio against a gradient at all -- so the title
      // has never been a violation and never will be, however unreadable it gets.
      // It measured 2.52:1 at the 400px viewport above, under the 3:1 its size
      // requires, for as long as this list was green -- that was #105, fixed by
      // the `text-white` on the title. Nothing automated here would catch it
      // coming back; a gradient contrast ratio has to be looked at.
      //
      // So this asserts the *known* unevaluable set rather than ignoring the
      // bucket. Anything newly unevaluable fails, which is the only way an
      // automated pass can report "I did not check this" instead of silently
      // counting it as fine.
      const unevaluable = incomplete
        .flatMap((result) =>
          result.nodes.map((node) => ({
            rule: result.id,
            // The element's tag, not its classes and not axe's `target`. Keying
            // on `.pl-1` would turn a padding change into a red suite, and
            // `target` is a React-generated id that moves between builds -- but
            // recording nothing about the element at all meant moving the
            // gradient onto a different element left this assertion identical.
            tag: /^<(\w+)/.exec(node.html)?.[1] ?? "?",
            // Matched on the reason axe gives up rather than on the element.
            gradient: /background gradient/.test(node.failureSummary ?? ""),
          })),
        )
        // Sorted so the expectation does not encode DOM order. Two nodes of the
        // same rule arrive in tree order, which a reflow could swap and turn
        // into a failure that says nothing about accessibility.
        .sort((a, b) =>
          `${a.rule}|${a.tag}`.localeCompare(`${b.rule}|${b.tag}`),
        );

      // The message names both directions on purpose. This assertion fails when
      // the set grows, which is the point, but also when it shrinks -- and a bare
      // `summarise([])` would print nothing at all and leave the reader with a
      // diff and no idea what to do about it.
      const detail = incomplete.length
        ? `axe could not evaluate:\n  ${summarise(incomplete).join("\n  ")}\n`
        : "axe evaluated everything on this page. If the header gradient is gone, delete the entry below.";

      expect(unevaluable, detail).toEqual(
        [...route.unevaluable].sort((a, b) =>
          `${a.rule}|${a.tag}`.localeCompare(`${b.rule}|${b.tag}`),
        ),
      );
    });
  }
}
