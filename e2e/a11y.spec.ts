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
 * anything gated on `lg:hidden`. `MySidebar`'s toggle is exactly that: its
 * `aria-label="Menu"` is the only accessible name it has, over an `aria-hidden`
 * icon that contributes none, and axe skips hidden elements, so deleting that
 * label left a desktop-only version of this suite completely green.
 *
 * 400px is also the width the header title's 2.55:1 is measured at, so the
 * motivating number in this file's own comments was taken at a viewport the
 * first draft never visited.
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
 * `/contact` needs Google blocked to be scannable at all. With no site key,
 * Google's api.js throws during hydration and React unmounts the whole route,
 * so an unblocked scan would grade the accessibility of "Application error".
 * ./smoke.spec.ts blocks the same two origins for the same reason. /blog is
 * still absent: it needs a database, and without one it renders its error
 * boundary.
 */
// The site title, on every page. It is a `<span>` inside the header, not the
// `<h1>` -- worth stating, because "the title" reads like a heading and the
// assertion below would be wrong if it guessed.
const GRADIENT_TITLE = { rule: "color-contrast", tag: "span", gradient: true };

const ROUTES: {
  path: string;
  blockThirdParty?: true;
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
    path: "/contact",
    blockThirdParty: true,
    // The controlled inputs, not the heading: the heading is server-rendered and
    // is briefly present even on the route that is in the middle of dying, which
    // is the race ./smoke.spec.ts documents.
    ready: (page) => expect(page.locator('input[name="name"]')).toBeVisible(),
    // The message textarea, which axe declines with "partially obscured by
    // another element". Nothing obscures it: measured at both viewports, zero
    // elements in the document intersect its box, hit-testing all four corners
    // and its centre returns the textarea itself on top, and every ancestor
    // fully contains it. It also carries its own opaque background, so its
    // contrast is computable in principle -- axe simply declines to.
    //
    // Listed rather than fixed because there is nothing to fix in the markup.
    // The mechanism is deliberately not asserted here: `overflow: auto` on the
    // textarea is the obvious suspect and it was not tested, so do not write it
    // down as the cause.
    unevaluable: [
      GRADIENT_TITLE,
      { rule: "color-contrast", tag: "textarea", gradient: false },
    ],
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
// Identified by rule and by markup, never by axe's `target` selector. On this
// app the failing element is a rewind-ui `<button>` whose only selector is its
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
 * The floor that catches a hollow run, and it counts rules *considered* rather
 * than rules passed.
 *
 * A `runOnly` that matches no rules makes axe return zero violations, which
 * would make every assertion below pass while checking nothing -- one typo in
 * WCAG_TAGS is enough. An earlier draft floored `passes.length` at 15, and the
 * precise reason that is the wrong instrument is worth stating, because the
 * obvious version of the complaint is false: a total typo does trip it, since
 * `["wcag2a-typo"]` measures 0 passes. What it does not trip is the loss of a
 * single tag, which is the realistic edit. Dropping `wcag21aa` was measured at
 * 60 rules considered with `passes` at 19-24 -- above 15 on all eight
 * combinations, so that mutant survived a `passes` floor and dies here.
 *
 * Raising the `passes` floor is not the fix either: `passes` is markup-dependent
 * (24 on /contact at desktop, 19 on / at mobile in that same run), so a floor
 * tight enough to catch 19 would fail on a legitimate page.
 *
 * Every rule axe considers lands in exactly one of the four buckets, so their
 * total is the size of the selected rule set -- measured 62 on all eight
 * route/viewport combinations, invariant to the markup. Dropping tags moves it:
 * 62 with all four, 60 with the two 2.1 tags removed, 56 with `wcag2a` alone.
 * So `>= 62` fails on the loss of any tag while tolerating a future axe adding
 * rules. (axe-core is pinned exactly in package.json, so it cannot drift here
 * without someone choosing to bump it.)
 */
const RULE_FLOOR = 62;

for (const viewport of VIEWPORTS) {
  for (const route of ROUTES) {
    const label = `${route.path} at ${viewport.name}`;

    test(`${label} has no automatically detectable WCAG violations`, async ({
      page,
    }) => {
      const results = await analyse(page, route, viewport);

      const considered =
        results.passes.length +
        results.violations.length +
        results.incomplete.length +
        results.inapplicable.length;
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
      // It measures 2.55:1 at the 400px viewport above, under the 3:1 that its
      // size requires; that is tracked in issue #10 and is a colour decision,
      // not a bug to fix here.
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
