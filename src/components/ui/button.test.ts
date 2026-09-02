import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import {
  dangerButtonClasses,
  primaryButtonClasses,
  primaryButtonSmClasses,
} from "@/components/ui/button";

/**
 * Three separate things have to hold for a filled button to stay readable, and
 * each fails on its own:
 *
 *  1. the token values still measure up under a white label,
 *  2. the class strings still name those tokens and nothing else, and
 *  3. every call site still uses a string rather than its own fill.
 *
 * A fourth used to sit between them: that tailwind-merge let our override beat
 * rewind-ui's own background utilities rather than leaving both in the class list.
 * The buttons are native as of #143, so there is nothing to beat, and that
 * assertion -- along with the render helpers it needed -- is gone.
 *
 * Contrast itself is computed here rather than trusted from the comment in
 * globals.css, so retuning a token to something too light fails in this file
 * instead of shipping.
 *
 * Both filled variants run the same body from the table below rather than each
 * getting its own copy. A second copy is how one of the two ends up with a
 * weaker assertion than the other and nobody notices which.
 */

const REPO_ROOT = new URL("../../../", import.meta.url).pathname;

// The override strings carry two concerns now: the background fills these tests are
// about, and a `focus:ring-[3px]` width restored for Tailwind v4 (see button.ts). Every
// fill assertion below selects the fills explicitly rather than assuming the whole
// string is backgrounds -- it used to assume that, and the ring-width class broke three
// assertions at once when it was added.
const fillsOf = (classes: string): string[] =>
  classes.split(" ").filter((candidate) => candidate.includes("bg-"));

const liveFillsOf = (classes: string): string[] =>
  fillsOf(classes).filter((candidate) => !candidate.startsWith("disabled:"));

const luminance = ([r, g, b]: number[]): number => {
  const channel = (value: number) => {
    const s = value / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r!) + 0.7152 * channel(g!) + 0.0722 * channel(b!);
};

const contrast = (a: number[], b: number[]): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
};

const rgb = (hex: string): number[] =>
  [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

const WHITE = [255, 255, 255];

// The label is 14px at the smallest call site, which is *not* WCAG large text --
// that starts at 18.66px bold -- so the threshold is 4.5:1, not 3:1.
const REQUIRED_RATIO = 4.5;

const tokenValue = (name: string): string => {
  const css = readFileSync(join(REPO_ROOT, "src/app/globals.css"), "utf8");
  // The trailing colon is load-bearing: without it `--danger` would match the
  // `--danger-fill` line and the two pairs would measure each other's values.
  const found = new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, "i").exec(css);
  if (!found) throw new Error(`--${name} is not defined in globals.css`);
  return found[1]!;
};

// Two exclusions, both because the search is textual: this file quotes every
// search string, and ./button.ts names both props in prose while containing no
// markup of its own.
const SKIP = /(\.test\.tsx?|components\/ui\/button\.ts)$/;

const sourceFiles = (dir: string): string[] =>
  readdirSync(join(REPO_ROOT, dir), { withFileTypes: true }).flatMap(
    (entry) => {
      const path = `${dir}/${entry.name}`;
      if (entry.isDirectory()) return sourceFiles(path);
      if (SKIP.test(path)) return [];
      return /\.tsx?$/.test(entry.name) ? [path] : [];
    },
  );

const occurrences = (text: string, needle: string): number =>
  text.split(needle).length - 1;

const FILLED = [
  {
    name: "primary",
    override: primaryButtonClasses,
    // Resting fill first; the second covers hover, focus and active, so a white
    // label sits on both.
    tokens: ["brand", "brand-hover"],
    // What identifies a call site in source. It is the class binding itself now, not a
    // library prop -- there is no library prop. That is strictly better for this file's
    // purpose: the thing being checked is "every button carries the string", and a button
    // that forgot it cannot be found by searching for it. The count below is what closes
    // that hole.
    needle: "primaryButtonClasses",
    callSites: 3,
    binding: "primaryButtonClasses",
  },
  {
    // The header's sign-in control, the only one the library rendered at `size="sm"`.
    // Its own entry rather than a special case, so the count assertion covers it too.
    name: "primary (small)",
    override: primaryButtonSmClasses,
    tokens: ["brand", "brand-hover"],
    needle: "primaryButtonSmClasses",
    callSites: 1,
    binding: "primaryButtonSmClasses",
  },
  {
    // One call site, the modal's delete control.
    name: "danger",
    override: dangerButtonClasses,
    tokens: ["danger-fill", "danger-fill-hover"],
    needle: "dangerButtonClasses",
    callSites: 1,
    binding: "dangerButtonClasses",
  },
] as const;

describe.each(FILLED)(
  "the $name button's token values",
  ({ tokens, override }) => {
    it.each(tokens)("give %s enough contrast", (name) => {
      const value = tokenValue(name);
      expect(
        contrast(WHITE, rgb(value)),
        `--${name} is ${value}`,
      ).toBeGreaterThanOrEqual(REQUIRED_RATIO);
    });

    // Not cosmetic: if these collapse onto one value the button stops
    // acknowledging the pointer at all, since the fill is its only hover
    // feedback.
    it("keeps hover visibly distinct from rest", () => {
      expect(tokenValue(tokens[1]!)).not.toBe(tokenValue(tokens[0]!));
    });

    // The link between the two halves of this file. Measuring the tokens proves
    // nothing if the class string names a different colour, and every check
    // above would still pass -- it compares the merge result against the
    // override itself, so any value at all survives that one.
    // The LIVE fills only. The strings also carry `disabled:bg-*`, which is the
    // library's own stock-palette value kept deliberately -- WCAG exempts inactive
    // controls and a disabled button that looked live would be worse. It has no token
    // behind it, so it is excluded here and asserted separately below.
    it("names exactly these live fills and no others", () => {
      const fills = liveFillsOf(override).map((candidate) =>
        candidate.replace(/^.*bg-/, ""),
      );
      expect([...new Set(fills)].sort()).toEqual([...tokens].sort());
    });

    it("dims the disabled state with a fill of its own", () => {
      const disabled = fillsOf(override).filter((candidate) =>
        candidate.startsWith("disabled:"),
      );
      expect(
        disabled.length,
        "without a disabled fill an inactive button keeps the live colour and reads as pressable",
      ).toBeGreaterThan(0);
    });
  },
);

/**
 * What replaced "every rewind-ui Button carries the fill override".
 *
 * That assertion's subject is gone. It counted `variant="primary"` props and required each
 * to be accompanied by the override string, which worked because the library prop marked
 * every button that needed one. With native elements there is no such marker -- and "every
 * `<button>` carries one of these strings" is FALSE by design, because the repo also has
 * bespoke buttons: the nav toggle, the delete icon on a blog card, and the retry control in
 * each error boundary, all with their own classes.
 *
 * So two narrower properties, and between them they cover the same risk:
 *
 * What is left is narrower: each string is used exactly as many times as expected. A
 * change-detector rather than a proof -- it fails when a call site is added or removed
 * without anyone revisiting this file, which is the failure that actually happens.
 *
 * A SECOND CHECK WAS TRIED AND ABANDONED, and the reason is worth keeping so it is not
 * tried again. The remaining hazard is a future button written with `bg-brand` inline: it
 * would look right and silently miss the 3px focus ring, the disabled fill and the sizing.
 * Asserting that nothing names those fills directly finds two legitimate uses in MainNav --
 * the nav toggle and the active nav item -- because `bg-brand` is the brand fill generally,
 * not a button's. An allowlist of two files to guard one hypothetical is more exclusion than
 * assertion, so the risk is documented instead of policed. What WOULD close it properly is
 * a lint rule scoped to `<button>` elements, or making the strings the only way to get the
 * fill at all.
 */
describe.each(FILLED)("the $name button string", ({ binding, callSites }) => {
  it(`is used at exactly ${callSites} call site(s)`, () => {
    // The two usage spellings, and deliberately NOT a bare search for the binding:
    // that also matches the import statement, which is how an earlier version of this
    // double-counted every file.
    const used = sourceFiles("src").reduce((sum, path) => {
      const text = readFileSync(join(REPO_ROOT, path), "utf8");
      return (
        sum +
        occurrences(text, `\${${binding}}`) +
        occurrences(text, `={${binding}}`)
      );
    }, 0);
    expect(
      used,
      "a call site was added or removed without updating this expectation",
    ).toBe(callSites);
  });
});

// The tokens can exist in globals.css and still produce no rule: the utility
// only exists if the palette maps it, and an unmapped `bg-danger-fill-hover`
// leaves the hover state with no background at all rather than a dim one.
//
// Resolved through Tailwind rather than by grepping the config for the `var()`
// string. That weaker check passes on a config that maps the variable to a
// *differently named* utility -- nesting `fill` under `hover` would emit
// `bg-danger-hover-fill` and satisfy it while every override above stayed inert.
it("declares a theme token for every fill the overrides name", () => {
  // Reads globals.css's `@theme` block. This used to resolve `tailwind.config.ts`
  // through `tailwindcss/resolveConfig`; v4 is CSS-first and that file is gone, so the
  // palette now has exactly one declaration site and this reads it.
  //
  // WEAKER than what it replaced, and worth saying so rather than claiming parity. The
  // old check handed the config to Tailwind's own resolver, so it could only pass if
  // Tailwind agreed the name existed. This reads the file with a regex, so it would also
  // pass on a declaration that is commented out, nested somewhere invalid, or otherwise
  // never reaches the compiler. What it does still catch is the thing the comment below
  // cares about -- nesting `fill` under `hover` would declare
  // `--color-danger-hover-fill` and fail here, where a grep for the `var()` string would
  // not -- and it catches an outright missing token.
  //
  // The stronger version compiles globals.css with Tailwind and asserts on the emitted
  // rule. That means a real compile inside a unit test, which is why it is not done here;
  // it is the right follow-up if this ever passes over a real defect.
  const themeBlock = /@theme\s*\{([\s\S]*?)\n\}/.exec(
    readFileSync(join(REPO_ROOT, "src/app/globals.css"), "utf8"),
  );
  if (!themeBlock) throw new Error("no @theme block in globals.css");

  const palette = Object.fromEntries(
    [...themeBlock[1]!.matchAll(/--color-([\w-]+):\s*([^;]+);/g)].map(
      ([, name, value]) => [name!, value!.trim()],
    ),
  );
  expect(
    Object.keys(palette).length,
    "@theme declared no colours, so every assertion below would pass vacuously",
  ).toBeGreaterThan(0);

  for (const { override } of FILLED) {
    // Live fills only: `disabled:bg-purple-300` is a stock shade by design.
    for (const utility of liveFillsOf(override)) {
      const colour = utility.replace(/^.*bg-/, "");
      expect(palette[colour], `bg-${colour} maps to nothing`).toMatch(
        /^var\(--[\w-]+\)$/,
      );
    }
  }
});

/**
 * The focus indicator, which the fill assertions above deliberately ignore.
 *
 * Tailwind v4 narrowed the default ring to 1px, and a 1px perimeter does not provide the
 * area WCAG 2.4.11 asks for. The width is therefore named explicitly. It was an arbitrary
 * value when it had to beat rewind-ui's own bare ring-width class through the tailwind-merge
 * instance the library bundled; the buttons are native now, so nothing has to be beaten --
 * it stays arbitrary only because 3px is the width these buttons have always had and no
 * utility gives exactly 3.
 *
 * That deleted a second assertion along with the library: it used to check that the merge
 * still treated an arbitrary width as conflicting with a bare one, which was an assumption
 * about a vendored transitive dependency. There is nothing left to assume.
 */
describe.each(FILLED)("the $name button's focus indicator", ({ override }) => {
  it("names an explicit 3px width", () => {
    expect(override.split(" ")).toContain("focus:ring-[3px]");
  });

  it("names a ring colour, so the indicator is not currentColor", () => {
    // v4's bare default is `currentColor`, which on these white-labelled fills would be a
    // white ring on a coloured button -- legible, but not the colour that shipped.
    expect(
      override.split(" ").filter((c) => /^focus:ring-[a-z]+-\d{2,3}$/.test(c)),
    ).toHaveLength(1);
  });
});
