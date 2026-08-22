import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Button } from "@rewind-ui/core";
import resolveConfig from "tailwindcss/resolveConfig";

import {
  dangerButtonClasses,
  primaryButtonClasses,
} from "@/components/ui/button";
import tailwindConfig from "../../../tailwind.config";

/**
 * Three separate things have to hold for a filled button to stay readable, and
 * each fails on its own:
 *
 *  1. the token values still measure up under a white label,
 *  2. tailwind-merge still lets the override win over the library's own
 *     background utilities rather than leaving both in the class list, and
 *  3. every call site still carries the override.
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

const backgrounds = (
  props: ComponentProps<typeof Button>,
  className: string,
): string[] => {
  const markup = renderToStaticMarkup(
    createElement(Button, { ...props, className }, "label"),
  );
  return (/class="([^"]*)"/.exec(markup)?.[1] ?? "")
    .split(/\s+/)
    .filter((candidate) => /(^|:)bg-/.test(candidate));
};

const FILLED = [
  {
    name: "primary",
    props: { variant: "primary" },
    override: primaryButtonClasses,
    // Resting fill first; the second covers hover, focus and active, so a white
    // label sits on both.
    tokens: ["brand", "brand-hover"],
    // What identifies a call site in source. Textual, with the same limits as
    // any grep: a renamed prop makes it find nothing, which is what the
    // "is actually found" case below exists to catch.
    needle: 'variant="primary"',
    callSites: 4,
    binding: "primaryButtonClasses",
  },
  {
    name: "danger",
    props: { color: "red" },
    override: dangerButtonClasses,
    tokens: ["danger-fill", "danger-fill-hover"],
    // Matches any rewind-ui component given `color="red"`, not only Button. If a
    // red Alert or Badge is ever added this trips, and the fix is to narrow the
    // search rather than to widen the exclusion -- a red fill that is not a
    // button is a contrast question in its own right.
    needle: 'color="red"',
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
    it("are the only fills the override names", () => {
      const fills = override
        .split(" ")
        .map((candidate) => candidate.replace(/^.*bg-/, ""));
      expect([...new Set(fills)].sort()).toEqual([...tokens].sort());
    });
  },
);

describe.each(FILLED)(
  "the $name override against rewind-ui",
  ({ props, override, tokens }) => {
    // Guards the assumption the fix rests on. rewind-ui hands its own classes
    // and this string to tailwind-merge together; were it to concatenate them
    // instead, both would be emitted and the library's would win on source
    // order, leaving the override inert and this file the only thing that
    // noticed.
    it("replaces every live background the library sets", () => {
      const live = backgrounds(props, override).filter(
        (candidate) => !candidate.startsWith("disabled:"),
      );
      expect(live.sort()).toEqual(override.split(" ").sort());
    });

    // Left to the library on purpose: WCAG exempts inactive controls, and a
    // disabled button that kept the live fill would read as pressable.
    it("leaves the disabled fill alone", () => {
      const disabled = backgrounds(props, override).filter((candidate) =>
        candidate.startsWith("disabled:"),
      );
      expect(disabled).not.toHaveLength(0);
      // Asserted as "still the library's" rather than merely "present": an
      // override that reached the disabled state would satisfy the weaker check.
      expect(
        disabled.filter((candidate) =>
          tokens.some((token) => candidate.includes(token)),
        ),
      ).toEqual([]);
    });
  },
);

describe.each(FILLED)(
  "every $name button in the repo",
  ({ needle, binding, callSites }) => {
    // A count-for-count comparison rather than "the file mentions it somewhere":
    // a file with two such buttons and one override would pass the looser check.
    // This is what catches a call site added later, in a file this change never
    // touched.
    it("carries the override", () => {
      const offenders = sourceFiles("src")
        .map((path) => {
          const text = readFileSync(join(REPO_ROOT, path), "utf8");
          return {
            path,
            buttons: occurrences(text, needle),
            // Two spellings, because one call site interpolates the override
            // into a longer string and the other passes it alone.
            overrides:
              occurrences(text, `\${${binding}}`) +
              occurrences(text, `={${binding}}`),
          };
        })
        .filter(({ buttons, overrides }) => buttons !== overrides);

      expect(offenders).toEqual([]);
    });

    it("is actually found by the search", () => {
      const total = sourceFiles("src").reduce(
        (sum, path) =>
          sum +
          occurrences(readFileSync(join(REPO_ROOT, path), "utf8"), needle),
        0,
      );
      // Without this the check above is vacuously true the moment the search
      // stops finding anything -- a renamed prop, a moved directory.
      expect(total).toBe(callSites);
    });
  },
);

// The tokens can exist in globals.css and still produce no rule: the utility
// only exists if the palette maps it, and an unmapped `bg-danger-fill-hover`
// leaves the hover state with no background at all rather than a dim one.
//
// Resolved through Tailwind rather than by grepping the config for the `var()`
// string. That weaker check passes on a config that maps the variable to a
// *differently named* utility -- nesting `fill` under `hover` would emit
// `bg-danger-hover-fill` and satisfy it while every override above stayed inert.
it("has a real utility behind every fill the overrides name", () => {
  const { theme } = resolveConfig(tailwindConfig);

  const flatten = (value: unknown, prefix = ""): Record<string, string> => {
    if (typeof value === "string") return { [prefix]: value };
    if (typeof value !== "object" || value === null) return {};
    return Object.entries(value).reduce<Record<string, string>>(
      (all, [key, nested]) => ({
        ...all,
        ...flatten(
          nested,
          key === "DEFAULT" ? prefix : prefix ? `${prefix}-${key}` : key,
        ),
      }),
      {},
    );
  };

  const palette = flatten(theme.colors);

  for (const { override } of FILLED) {
    for (const utility of override.split(" ")) {
      const colour = utility.replace(/^.*bg-/, "");
      expect(palette[colour], `bg-${colour} maps to nothing`).toMatch(
        /^var\(--[\w-]+\)$/,
      );
    }
  }
});
