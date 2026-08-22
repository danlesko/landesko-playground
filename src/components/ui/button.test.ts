import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Button } from "@rewind-ui/core";

import { primaryButtonClasses } from "@/components/ui/button";

/**
 * Three separate things have to hold for the primary button to stay readable,
 * and each fails on its own:
 *
 *  1. the token values still measure up under a white label,
 *  2. tailwind-merge still lets the override win over the library's own
 *     background utilities rather than leaving both in the class list, and
 *  3. every call site still carries the override.
 *
 * Contrast itself is computed here rather than trusted from the comment in
 * globals.css, so retuning a token to something too light fails in this file
 * instead of shipping.
 */

const REPO_ROOT = new URL("../../../", import.meta.url).pathname;

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

// The label is 14px bold at the smallest call site, which is *not* WCAG large
// text -- that starts at 18.66px bold -- so the threshold is 4.5:1, not 3:1.
const REQUIRED_RATIO = 4.5;

const tokenValue = (name: string): string => {
  const css = readFileSync(join(REPO_ROOT, "src/app/globals.css"), "utf8");
  const found = new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, "i").exec(css);
  if (!found) throw new Error(`--${name} is not defined in globals.css`);
  return found[1]!;
};

// Two exclusions, both because the search is textual: this file quotes both
// search strings, and ./button.ts names the prop in prose while containing no
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

describe("the primary button's token values", () => {
  // --brand is the resting fill and --brand-hover covers hover, focus and
  // active, so a white label sits on both.
  it.each(["brand", "brand-hover"])("give %s enough contrast", (name) => {
    const value = tokenValue(name);
    expect(
      contrast(WHITE, rgb(value)),
      `--${name} is ${value}`,
    ).toBeGreaterThanOrEqual(REQUIRED_RATIO);
  });

  // Not cosmetic: if these collapse onto one value the button stops
  // acknowledging the pointer at all, since the fill is its only hover feedback.
  it("keeps hover visibly distinct from rest", () => {
    expect(tokenValue("brand-hover")).not.toBe(tokenValue("brand"));
  });

  // The link between the two halves of this file. Measuring the tokens proves
  // nothing if the class string names a different colour, and every check above
  // would still pass -- it compares the merge result against the override
  // itself, so any value at all survives that one.
  it("are the only fills the override names", () => {
    const fills = primaryButtonClasses
      .split(" ")
      .map((candidate) => candidate.replace(/^.*bg-/, ""));
    expect([...new Set(fills)].sort()).toEqual(["brand", "brand-hover"]);
  });
});

describe("the override against rewind-ui", () => {
  const backgrounds = (className: string): string[] => {
    const markup = renderToStaticMarkup(
      createElement(Button, { variant: "primary", className }, "label"),
    );
    return (/class="([^"]*)"/.exec(markup)?.[1] ?? "")
      .split(/\s+/)
      .filter((candidate) => /(^|:)bg-/.test(candidate));
  };

  // Guards the assumption the fix rests on. rewind-ui hands its own classes and
  // this string to tailwind-merge together; were it to concatenate them instead,
  // both would be emitted and the library's would win on source order, leaving
  // the override inert and this file the only thing that noticed.
  it("replaces every live background the library sets", () => {
    const live = backgrounds(primaryButtonClasses).filter(
      (candidate) => !candidate.startsWith("disabled:"),
    );
    expect(live.sort()).toEqual(primaryButtonClasses.split(" ").sort());
  });

  // Left to the library on purpose: WCAG exempts inactive controls, and a
  // disabled button that kept the live fill would read as pressable.
  it("leaves the disabled fill alone", () => {
    const disabled = backgrounds(primaryButtonClasses).filter((candidate) =>
      candidate.startsWith("disabled:"),
    );
    expect(disabled).not.toHaveLength(0);
    // Asserted as "still the library's" rather than merely "present": an
    // override that reached the disabled state would satisfy the weaker check.
    expect(disabled.filter((candidate) => candidate.includes("brand"))).toEqual(
      [],
    );
  });
});

describe("every primary button in the repo", () => {
  // A count-for-count comparison rather than "the file mentions it somewhere":
  // a file with two primary buttons and one override would pass the looser
  // check. This is what catches a fifth call site added later, in a file this
  // change never touched.
  it("carries the override", () => {
    const offenders = sourceFiles("src")
      .map((path) => {
        const text = readFileSync(join(REPO_ROOT, path), "utf8");
        return {
          path,
          buttons: occurrences(text, 'variant="primary"'),
          overrides: occurrences(text, "${primaryButtonClasses}"),
        };
      })
      .filter(({ buttons, overrides }) => buttons !== overrides);

    expect(offenders).toEqual([]);
  });

  it("is actually found by the search", () => {
    const total = sourceFiles("src").reduce(
      (sum, path) =>
        sum +
        occurrences(
          readFileSync(join(REPO_ROOT, path), "utf8"),
          'variant="primary"',
        ),
      0,
    );
    // Without this the check above is vacuously true the moment the search
    // stops finding anything -- a renamed prop, a moved directory.
    expect(total).toBe(4);
  });

  // The token can exist in globals.css and still produce no rule: the utility
  // only exists if the palette maps it, and an unmapped `bg-brand-hover` leaves
  // the hover state with no background at all rather than a dim one.
  it("has a utility for each token it names", () => {
    const config = readFileSync(join(REPO_ROOT, "tailwind.config.ts"), "utf8");
    for (const token of ["--brand", "--brand-hover"]) {
      expect(config, `${token} is not mapped to a utility`).toContain(
        `var(${token})`,
      );
    }
  });
});
