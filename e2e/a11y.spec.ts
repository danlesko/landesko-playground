import { test, expect } from "@playwright/test";
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

// Same three routes ./smoke.spec.ts covers, and for the same reason: they render
// and hydrate with no database, no session and no env config. /contact needs a
// reCAPTCHA key and /blog needs a database, so both would report the accessibility
// of an error page.
const PUBLIC_ROUTES = ["/", "/animation", "/credits"];

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
  page: import("@playwright/test").Page,
  path: string,
): Promise<AxeRun> => {
  await page.goto(path);
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

for (const path of PUBLIC_ROUTES) {
  test(`${path} has no automatically detectable WCAG violations`, async ({
    page,
  }) => {
    const results = await analyse(page, path);

    // Checked before the violations, because a `runOnly` that matches no rules
    // makes axe return zero violations and this whole file pass while testing
    // nothing. One typo in WCAG_TAGS is enough. 23 rules pass on these routes
    // today, so a floor of 15 leaves room for rules to become inapplicable as
    // the markup changes without leaving room for the suite to go hollow.
    expect(
      results.passes.length,
      "axe ran almost nothing -- check WCAG_TAGS for a typo",
    ).toBeGreaterThan(15);

    expect(summarise(results.violations)).toEqual([]);
  });

  // Split from the test above rather than folded into it, so a *new* thing axe
  // cannot evaluate does not read as a contrast regression, and so neither
  // failure hides the other.
  test(`${path} adds nothing new that axe cannot evaluate`, async ({
    page,
  }) => {
    const { incomplete } = await analyse(page, path);

    // `incomplete` is axe's "a human has to look at this" bucket, and it is the
    // reason a gate wired only to `violations` would have been actively
    // misleading here. The site title sits on the header's gradient, and axe
    // cannot compute a contrast ratio against a gradient at all -- so the title
    // has never been a violation and never will be, however unreadable it gets.
    // It measures 2.55:1 at a 400px viewport, under the 3:1 that its size
    // requires; that is tracked in issue #10 and is a colour decision, not a
    // bug to fix here.
    //
    // So this asserts the *known* unevaluable set rather than ignoring the
    // bucket. Anything newly unevaluable fails, which is the only way an
    // automated pass can report "I did not check this" instead of silently
    // counting it as fine.
    const unevaluable = incomplete.flatMap((result) =>
      result.nodes.map((node) => ({
        rule: result.id,
        // Matched on the reason axe gives up rather than on the element: the
        // title is located by `.pl-1`, a padding utility that #10 may well
        // change, and keying on it would turn a cosmetic edit into a red suite.
        gradient: /background gradient/.test(node.failureSummary ?? ""),
      })),
    );

    // The message names both directions on purpose. This assertion fails when
    // the set grows, which is the point, but also when it shrinks -- and a bare
    // `summarise([])` would print nothing at all and leave the reader with a
    // diff and no idea what to do about it.
    const detail = incomplete.length
      ? `axe could not evaluate:\n  ${summarise(incomplete).join("\n  ")}\n`
      : "axe evaluated everything on this page. If the header gradient is gone, delete the entry below.";

    expect(unevaluable, detail).toEqual([
      { rule: "color-contrast", gradient: true },
    ]);
  });
}
