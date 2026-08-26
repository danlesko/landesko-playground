import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guards the trap #14 names: the EmailJS values are read through
 * `NEXT_PUBLIC_`-prefixed names but are only ever needed on the server.
 *
 * The prefix is a *visibility switch*. Next inlines such a variable into the
 * client bundle at each point client-bundled code references it -- not merely
 * because it is prefixed. So today nothing leaks: the only reader is a
 * `"use server"` module, which was verified empirically on #14 by building with
 * sentinel values and grepping `.next/static` (absent for all three EmailJS
 * values, present for the reCAPTCHA site key, which is the positive control that
 * proved the method could detect exposure at all).
 *
 * The hazard is that this is one import away from being false, silently, and the
 * moment a client component reads one of these the values ship to every visitor.
 * #14 records that "nothing in CI would catch it". This is that check.
 *
 * WHAT THIS PROVES, precisely: no module in `src/` outside a `"use server"` file
 * mentions these names. That is the *cause* a leak would have, not the effect.
 * It cannot prove absence from the built client bundle -- the sentinel build is
 * the only thing that does, and it needs real values, so it does not belong in a
 * unit suite. Treat this as an authoring-time tripwire, not a proof.
 */

// `EMAILJS_PRIVATE_KEY` is unprefixed, so a client read would yield undefined
// rather than leaking it. Included anyway: the same rule expresses the same
// intent, and a client component reaching for it is a bug regardless.
const SERVER_ONLY_ENV_NAMES = [
  "NEXT_PUBLIC_EMAILJS_SERVICE_ID",
  "NEXT_PUBLIC_EMAILJS_TEMPLATE_ID",
  "NEXT_PUBLIC_EMAILJS_PUBLIC_KEY",
  "EMAILJS_PRIVATE_KEY",
] as const;

const SRC = join(process.cwd(), "src");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

/** This file names all four variables in order to check for them, so it would
 *  otherwise report itself. */
const SELF = relative(SRC, __filename);

const referencing = sourceFiles(SRC)
  .map((file) => ({
    file: relative(SRC, file),
    text: readFileSync(file, "utf8"),
  }))
  .filter(({ file }) => file !== SELF)
  .filter(({ text }) =>
    SERVER_ONLY_ENV_NAMES.some((name) => text.includes(name)),
  );

describe("EmailJS configuration stays server-side", () => {
  // Every name individually, not "some name was found somewhere". The weaker
  // version passed a mutation it should have failed: renaming the three
  // prefixed variables left `EMAILJS_PRIVATE_KEY` still matching in the same
  // file, so the list kept looking alive while three quarters of it guarded
  // nothing. Per-name is also self-maintaining -- when the `NEXT_PUBLIC_`
  // prefixes are eventually dropped (the open item on #14) this fails and says
  // exactly which entry to update.
  it.each(SERVER_ONLY_ENV_NAMES)("still has a reader for %s", (name) => {
    const readers = referencing
      .filter(({ text }) => text.includes(name))
      .map(({ file }) => file);

    expect(readers, `nothing reads ${name}; update this list`).not.toEqual([]);
  });

  it("is read only from modules that cannot be bundled for the browser", () => {
    const notServerOnly = referencing
      .filter(({ text }) => !/^\s*(["'])use server\1/.test(text))
      .map(({ file }) => file);

    // Phrased as an invariant rather than as a fixed path, so a second genuine
    // server-side reader is free to exist. The two ways out of a failure here:
    // add `"use server"` if the module really is server-only, or stop reading
    // the value there.
    expect(
      notServerOnly,
      "these read EmailJS config outside a server module",
    ).toEqual([]);
  });

  it("is not referenced from any client component", () => {
    const clientSide = referencing
      .filter(({ text }) => /^\s*(["'])use client\1/.test(text))
      .map(({ file }) => file);

    // A narrower, bluntly-stated version of the check above. It is the one whose
    // failure means the values are actually being published, so it is worth
    // failing on its own terms rather than only as part of the invariant.
    expect(clientSide, "a client component reads EmailJS config").toEqual([]);
  });
});
