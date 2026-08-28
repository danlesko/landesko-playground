import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Pins where the EmailJS configuration is read from. #14 records the hazard:
 *
 * > a `NEXT_PUBLIC_` name is an active trap, because the moment any client
 * > component references one of these it silently becomes public again, and
 * > nothing in CI would catch it.
 *
 * `NEXT_PUBLIC_` is a visibility switch rather than an unconditional publish:
 * Next replaces *statically analysable* `process.env.NEXT_PUBLIC_NAME` reads in
 * client-bundled code with the literal value at build time. Nothing leaks today,
 * which #14 established by building with sentinel values and grepping
 * `.next/static` -- absent for all three EmailJS values, present for the
 * reCAPTCHA site key, which is the positive control proving the method could
 * detect exposure at all.
 *
 * WHAT THIS PROVES: these names are read via `process.env` in exactly the files
 * listed below, and nowhere else in the project's build-relevant sources. That
 * is all. In particular it does NOT prove the values stay out of the browser,
 * and three routes to exposure would keep it green:
 *
 *   - data flow. A Server Action may return one of these, or a Server Component
 *     may pass one as a prop to a client component. Both put the value in the
 *     client payload without any new `process.env` read.
 *   - aliasing. A value injected under a different identifier via
 *     `next.config.ts`'s `env` key would not mention a guarded name at all.
 *   - dynamic access. `process.env[computed]` is not matched here, and is also
 *     not inlined by Next, so it is a smaller hazard than it looks.
 *
 * The effect-level check is a build with synthetic sentinel values, asserting
 * they are absent from the browser assets with a deliberately-public sentinel as
 * the positive control. That needs **fake** values, not real ones, so it is
 * CI-able -- it is simply a bigger change than this file and is noted on #14.
 * This is an authoring-time tripwire, and the narrow one.
 */

// `EMAILJS_PRIVATE_KEY` is unprefixed, so a client read yields undefined rather
// than leaking. Included because the same rule expresses the same intent.
// Seven: the three unprefixed names, the three `NEXT_PUBLIC_` ones, and the private
// key. Not "six during the rename", as this used to say — #14 closed with that
// rename accepted as-is, so `contact-actions.ts` reads both spellings indefinitely
// rather than transitionally.
//
// Both spellings are listed because this file's question is where a name is read
// from, not whether it currently resolves to anything. The unprefixed three are
// read and resolve to undefined until someone adds them in Vercel; that makes no
// difference to the check, which is textual.
//
// If the fallback is ever removed, the entries for the dropped spelling fail their
// own per-name check and name the lines to delete — the point of checking each
// name rather than the set.
const SERVER_ONLY_ENV_NAMES = [
  "EMAILJS_SERVICE_ID",
  "EMAILJS_TEMPLATE_ID",
  "EMAILJS_PUBLIC_KEY",
  "NEXT_PUBLIC_EMAILJS_SERVICE_ID",
  "NEXT_PUBLIC_EMAILJS_TEMPLATE_ID",
  "NEXT_PUBLIC_EMAILJS_PUBLIC_KEY",
  "EMAILJS_PRIVATE_KEY",
] as const;

/**
 * An explicit list, not a heuristic. An earlier version of this file inferred
 * "server-only" from a `"use server"` directive, which is wrong in both
 * directions: ordinary Server Components, route handlers and server utilities
 * read env without it, while `"use server"` actually marks Server Actions, which
 * are callable *from* the client. Its failure message also advised adding
 * `"use server"` to a plain utility, which would turn every export in that
 * module into an RPC endpoint. `import "server-only"` is the marker for a
 * server-only utility; a hand-maintained list is the honest instrument here.
 */
const ALLOWED_READERS = ["src/lib/contact-actions.ts"];

const ROOT = process.cwd();

// `allowJs` is on in tsconfig.json, so a `.js` or `.jsx` file is a legitimate
// part of this project even though none exists today. Scanning only `.ts`/`.tsx`
// would leave a hole that nothing announces.
const SOURCE_EXTENSIONS = /\.(?:tsx?|jsx?|mjs|cjs)$/;

// `next.config.ts` sits outside `src/` and can inject values into the client
// build, so the scan cannot stop at `src/`.
const ROOT_FILES = [
  "next.config.ts",
  "next.config.js",
  "next.config.mjs",
  "tailwind.config.ts",
  "playwright.config.ts",
  "vitest.config.ts",
];

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return SOURCE_EXTENSIONS.test(entry.name) ? [full] : [];
  });
}

/** Matches an actual read, not a mention. The names also appear as string
 *  literals in this codebase -- `contact-actions.ts` lists them to report which
 *  are missing -- and an earlier version of this file counted those, so deleting
 *  the real read would have left it green. */
function readsEnv(text: string, name: string): boolean {
  return new RegExp(
    `process\\.env\\s*(?:\\.${name}\\b|\\[\\s*(['"\`])${name}\\1\\s*\\])`,
  ).test(text);
}

/** Test files and test helpers, which are never part of a client bundle, so the
 *  question this file asks does not apply to them. Replaces a single exclusion of
 *  this file by name: `contact-actions.test.ts` legitimately reads these
 *  variables to check which one the action prefers, and the guard flagged it on
 *  its first real encounter. Excluding the category is the honest rule -- naming
 *  each test file would mean editing this list every time one is added, which is
 *  how a guard ends up being disabled to make it quiet. */
const isTestFile = (file: string) =>
  /\.test\.tsx?$/.test(file) || file.startsWith("src/test/");

const scanned = [
  ...walk(join(ROOT, "src")),
  ...ROOT_FILES.map((f) => join(ROOT, f)).filter(existsSync),
]
  .map((file) => ({
    file: relative(ROOT, file),
    text: readFileSync(file, "utf8"),
  }))
  .filter(({ file }) => !isTestFile(file));

describe("EmailJS configuration is read in one place", () => {
  it("scans a plausible number of files, so a broken walk cannot pass", () => {
    expect(scanned.length).toBeGreaterThan(20);
    expect(scanned.map((s) => s.file)).toContain("src/lib/contact-actions.ts");
  });

  // Per name, and on a real `process.env` read. Both matter: the weaker "some
  // name appears somewhere" version passed a mutation that renamed the whole
  // prefixed trio, and a text-based version passes even with every real read
  // deleted, because the diagnostic labels still mention the names.
  it.each(SERVER_ONLY_ENV_NAMES)("%s is actually read somewhere", (name) => {
    const readers = scanned
      .filter(({ text }) => readsEnv(text, name))
      .map(({ file }) => file);

    expect(readers, `nothing reads ${name}; update this list`).not.toEqual([]);
  });

  it("is read only from the files allowed to read it", () => {
    const unexpected = scanned
      .filter(({ file, text }) =>
        SERVER_ONLY_ENV_NAMES.some(
          (name) => readsEnv(text, name) && !ALLOWED_READERS.includes(file),
        ),
      )
      .map(({ file }) => file);

    // If this fails, the question to answer is whether that file can end up in a
    // client bundle. If it genuinely cannot, add it to ALLOWED_READERS and say
    // why; if it can, the value must not be read there.
    expect(
      unexpected,
      "these read EmailJS config and are not in ALLOWED_READERS",
    ).toEqual([]);
  });
});
