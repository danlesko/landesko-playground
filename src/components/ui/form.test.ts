import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  formCheckboxLabelClasses,
  formInputClasses,
  formTextareaClasses,
} from "@/components/ui/form";

/**
 * Guards the form controls' own appearance, now that they are native elements styled by
 * these strings rather than rewind-ui components (#143).
 *
 * The contrast assertion exists because of a defect this replacement fixed, and the shape
 * of that defect is the reason it is a test. rewind-ui's Checkbox labelled itself
 * `text-gray-700` -- a light-mode default it never exposed as a prop, so unlike the Input's
 * palette it could not be overridden at the call site. On this site's background that
 * measured about 1.7:1 against the 4.5:1 that 16px text requires, so "Make this post
 * private" was effectively unreadable, and had been since the control was added.
 *
 * Nothing caught it, and not for the reason you would guess: a unit test DOES render this
 * form's markup, in src/test/form-labels.test.ts. It just never asserted a colour. The
 * create form needs a session, so no e2e test reaches it and axe never ran against it.
 *
 * The number is also a correction. A first pass reported 2.11:1, measured by reading the
 * label's computed colour in a browser -- but Tailwind 4 returns `oklch()` for its palette,
 * and the probe's parser took the three numbers as sRGB channels, so lightness and hue
 * angle landed where red and blue belonged. The conclusion survived only because the true
 * figure is lower.
 *
 * So this checks the property from the source instead: the label must name a colour whose
 * token clears 4.5:1 against `--background`. That cannot catch every way the label could go
 * wrong -- it says nothing about what the browser finally paints -- but it does catch the
 * one that actually happened, which is a hardcoded grey chosen for a light background.
 */

const REPO_ROOT = new URL("../../../", import.meta.url).pathname;

/** WCAG 1.4.3 for text below 18.66px bold. The label is 16px. */
const REQUIRED_RATIO = 4.5;

const rgb = (hex: string): number[] =>
  [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

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

/**
 * Resolves a token to its literal value. The trailing colon in the pattern is load-bearing
 * for the same reason it is in button.test.ts: without it `--danger` would match the
 * `--danger-fill` line.
 */
const tokenValue = (name: string): string => {
  const css = readFileSync(join(REPO_ROOT, "src/app/globals.css"), "utf8");
  const found = new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, "i").exec(css);
  if (!found) throw new Error(`--${name} is not defined in globals.css`);
  return found[1]!;
};

/**
 * The colour utility a class string names, e.g. `text-foreground` -> `foreground`.
 *
 * Digits are ALLOWED in the name on purpose, so `text-gray-700` is recognised as a colour
 * rather than skipped. That matters for the failure message: if this pattern rejected stock
 * palette shades, reverting the label to one would fail with "found 0 colour utilities"
 * instead of naming the actual problem, which is that the shade has no token behind it.
 */
const colourToken = (classes: string): string => {
  const found = classes
    .split(/\s+/)
    .filter((candidate) => /^text-[a-z]+(-[a-z0-9]+)*$/.test(candidate))
    // Type sizes, not colours.
    .filter((candidate) => !/^text-(xs|sm|base|lg|[0-9]?xl)$/.test(candidate));
  if (found.length !== 1) {
    throw new Error(
      `expected exactly one colour utility, found ${found.length}: ${found.join(", ")}`,
    );
  }
  return found[0]!.replace(/^text-/, "");
};

describe("the checkbox label", () => {
  it("names a themed colour rather than a hardcoded grey", () => {
    const token = colourToken(formCheckboxLabelClasses);
    // The specific failure being guarded: a stock-palette grey chosen for a light
    // background. Those are not declared in globals.css, so `tokenValue` throws on them --
    // which is the assertion, but say why rather than relying on the throw.
    expect(
      () => tokenValue(token),
      `text-${token} is not backed by a token in globals.css, so it is a stock palette ` +
        "value and its contrast against this site's background is unknown",
    ).not.toThrow();
  });

  it("clears 4.5:1 against the page background", () => {
    const token = colourToken(formCheckboxLabelClasses);
    const ratio = contrast(
      rgb(tokenValue(token)),
      rgb(tokenValue("background")),
    );
    expect(
      ratio,
      `text-${token} measures ${ratio.toFixed(2)}:1 on --background, and 16px text needs ` +
        `${REQUIRED_RATIO}:1. rewind-ui's own label was about 1.7:1 here.`,
    ).toBeGreaterThanOrEqual(REQUIRED_RATIO);
  });
});

describe("the text field strings", () => {
  // Both are built from one shared base, so a change to the base reaches both. These pin
  // the two things that differ, because the difference is deliberate: it reproduces
  // rewind-ui's own distinction between the single-line and multi-line control, and the
  // whole point of the swap was that it changed no pixels.
  it("give the single-line control a fixed height and the multi-line one padding", () => {
    expect(formInputClasses).toContain("h-10");
    expect(formTextareaClasses).toContain("py-3");
    expect(
      formTextareaClasses,
      "a fixed height on the textarea would stop `rows` and an explicit height working",
    ).not.toContain("h-10");
  });

  it("suppresses the outline without painting one under forced colors", () => {
    // Tailwind 4 split these. `outline-none` removes the outline; `outline-hidden` keeps a
    // TRANSPARENT one, which forced-colors mode paints. `outline-hidden` looks like the
    // accessible choice and is the wrong one here, because a utility is unconditional: every
    // field would carry a visible outline in high-contrast mode while unfocused. The
    // forced-colors fallback belongs in globals.css, where it is scoped to `:focus-visible`.
    for (const classes of [formInputClasses, formTextareaClasses]) {
      expect(classes).toContain("outline-none");
      expect(
        classes,
        "outline-hidden is unconditional, so it would paint an outline on an unfocused field",
      ).not.toContain("outline-hidden");
    }
  });

  it("clears any box shadow, as the library did explicitly", () => {
    // Preflight does not clear input shadows on every engine, so this is not redundant --
    // the library named it and dropping it would be a cross-browser difference rather than
    // a no-op.
    for (const classes of [formInputClasses, formTextareaClasses]) {
      expect(classes).toContain("shadow-none");
    }
  });
});
