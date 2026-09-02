import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

/**
 * Guards the narrowed `@source` glob for rewind-ui (#134).
 *
 * globals.css used to scan every one of rewind-ui's 33 compiled style files. The app
 * imports five components, so most of that was candidates for markup that cannot render
 * here -- 32.0% of the gzipped stylesheet, measured.
 *
 * The glob now names ten files, and ten is the load-bearing number. It is NOT the five we
 * import: those render others internally, and Modal in particular renders an Overlay.
 * Narrowing to five builds cleanly, saves more, and leaves the Modal's backdrop unstyled.
 *
 * WHY THIS IS A TEST rather than a comment. The failure mode is silent. Import a sixth
 * component, and Tailwind simply never sees its class strings: the build passes, no
 * warning is emitted, and the component renders with no styling at whatever viewport
 * happens to show it. Nothing else in this suite would notice -- there is no e2e coverage
 * of the Modal, because it needs a database.
 *
 * So this recomputes the answer from the two sources of truth and compares. It does not
 * assert the list is `[Button, ...]`; it asserts the list still EQUALS what the imports
 * require. A frozen expected list would pass while being wrong.
 */

const REPO_ROOT = new URL("../../../", import.meta.url).pathname;
const DIST = join(REPO_ROOT, "node_modules/@rewind-ui/core/dist");
const STYLE_DIR = join(DIST, "theme/styles");

/** Every component name rewind-ui ships a style file for. */
const styleFileNames = (): string[] =>
  readdirSync(STYLE_DIR)
    .filter((file) => file.endsWith(".styles.js"))
    .map((file) => file.replace(".styles.js", ""))
    .sort();

/** The names the `@source` line in globals.css actually covers. */
const globbedNames = (): string[] => {
  const css = readFileSync(join(REPO_ROOT, "src/app/globals.css"), "utf8");
  const line = /@source\s+"[^"]*@rewind-ui\/core[^"]*";/.exec(css);
  if (!line) throw new Error("no rewind-ui @source line in globals.css");

  // A brace list, `{A,B}.styles.js`. A bare `*` would mean the narrowing was reverted,
  // which is a failure rather than something to expand -- say so instead of passing.
  const braces = /\{([^}]+)\}/.exec(line[0]);
  if (!braces) {
    throw new Error(
      `the rewind-ui @source glob is not a brace list, so the #134 narrowing is gone: ${line[0]}`,
    );
  }
  return braces[1]!
    .split(",")
    .map((name) => name.trim())
    .sort();
};

/** The components imported from rewind-ui anywhere in src/. */
const importedComponents = (): string[] => {
  const found = new Set<string>();
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.tsx?$/.test(path) && !/\.test\.tsx?$/.test(path)) {
        const src = readFileSync(path, "utf8");
        for (const match of src.matchAll(
          /import\s*\{([^}]*)\}\s*from\s*"@rewind-ui\/core"/g,
        )) {
          for (const name of match[1]!.split(",")) {
            const clean = name
              .trim()
              .split(/\s+as\s+/)[0]!
              .trim();
            if (clean) found.add(clean);
          }
        }
      }
    }
  };
  walk(join(REPO_ROOT, "src"));
  return [...found].sort();
};

/**
 * Every component reachable from those imports by following relative imports, which is
 * what decides whether a style file is needed. Verified separately that this subtree
 * contains no dynamic imports, so a static walk is complete.
 */
const reachableComponents = (entries: string[]): string[] => {
  const seen = new Set<string>();
  const components = new Set<string>();

  const visit = (file: string) => {
    if (seen.has(file) || !existsSync(file)) return;
    seen.add(file);
    const inComponent = /\/components\/([A-Za-z]+)\//.exec(file);
    if (inComponent) components.add(inComponent[1]!);

    for (const match of readFileSync(file, "utf8").matchAll(
      /from\s*"(\.[^"]+)"/g,
    )) {
      const target = resolve(dirname(file), match[1]!);
      visit(existsSync(target) ? target : `${target}.js`);
    }
  };

  for (const name of entries)
    visit(join(DIST, `components/${name}/${name}.js`));
  return [...components].sort();
};

describe("the rewind-ui @source glob", () => {
  it("covers every style file the imported components can reach", () => {
    const imported = importedComponents();
    expect(
      imported.length,
      "found no rewind-ui imports at all, so this test proves nothing",
    ).toBeGreaterThan(0);

    const shipsAStyleFile = new Set(styleFileNames());
    const required = reachableComponents(imported).filter((name) =>
      shipsAStyleFile.has(name),
    );

    expect(
      globbedNames(),
      `imports ${imported.join(", ")} reach ${required.join(", ")}. A component missing ` +
        "from the glob renders unstyled with a passing build and no warning.",
    ).toEqual(required);
  });

  it("does not name a style file nothing reaches", () => {
    const shipsAStyleFile = new Set(styleFileNames());
    const required = new Set(
      reachableComponents(importedComponents()).filter((name) =>
        shipsAStyleFile.has(name),
      ),
    );
    // The other direction, which the equality above already covers -- kept because it
    // fails with a clearer message when the glob has grown stale rather than short, and
    // because that is the direction a revert would take it.
    expect(
      globbedNames().filter((name) => !required.has(name)),
      "these are scanned but unreachable, so they are dead weight",
    ).toEqual([]);
  });

  it("names only files rewind-ui actually ships", () => {
    const shipped = styleFileNames();
    expect(
      globbedNames().filter((name) => !shipped.includes(name)),
      "a glob entry with no matching file is silently ignored by Tailwind",
    ).toEqual([]);
  });
});
