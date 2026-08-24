import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { BLOG_DATE_FORMAT, BLOG_DATE_TIME_FORMAT } from "@/lib/blogDate";

/**
 * Whether a blog date renders the same in every zone, measured by formatting
 * the same instant in two real child processes under two `TZ` values rather
 * than reasoning about it -- this suite has no jsdom and cannot render either
 * component.
 *
 * The options are IMPORTED, not copied. Both render sites use these exact
 * objects, so deleting a `timeZone` from either one fails the tests below.
 * Local copies would keep passing over that deletion, which is the single thing
 * these tests exist to prevent.
 *
 * The instant is a post written at 22:30 on 2026-08-21 in Denver, chosen
 * because it falls on a different calendar day in UTC -- the case that makes
 * the difference visible rather than merely present.
 */
const INSTANT = "2026-08-22T04:30:00.000Z";

const withoutZone = ({ ...options }: Intl.DateTimeFormatOptions) => {
  delete options.timeZone;
  return options;
};

function formatUnder(tz: string, options: Intl.DateTimeFormatOptions): string {
  const script = `process.stdout.write(new Date(${JSON.stringify(
    INSTANT,
  )}).toLocaleDateString("en-US", ${JSON.stringify(options)}))`;
  return execFileSync(process.execPath, ["-e", script], {
    env: { ...process.env, TZ: tz },
    encoding: "utf8",
  });
}

describe("blog date formatting and the ambient time zone", () => {
  it("would resolve to a different calendar day per zone without a pinned one", () => {
    // Why the zone has to be named at all: a Vercel function runs in UTC, the
    // author and most readers do not, and an instant is not a day until
    // something says which zone's day.
    const unpinned = withoutZone(BLOG_DATE_FORMAT);

    expect(formatUnder("UTC", unpinned)).toBe("Saturday, August 22, 2026");
    expect(formatUnder("America/Denver", unpinned)).toBe(
      "Friday, August 21, 2026",
    );
  });

  it("renders the detail page date identically in every zone", () => {
    const denver = formatUnder("America/Denver", BLOG_DATE_FORMAT);

    expect(formatUnder("UTC", BLOG_DATE_FORMAT)).toBe(denver);
    expect(formatUnder("Asia/Tokyo", BLOG_DATE_FORMAT)).toBe(denver);
    // Agreeing is not enough on its own -- they have to agree on the day the
    // post was actually written.
    expect(denver).toBe("Friday, August 21, 2026");
  });

  it("renders the list date identically in every zone, to the minute", () => {
    // MyBlogBodyAbbr is a client component, so it formats twice: once during
    // SSR in the server's zone, once again on hydration in the visitor's. Any
    // disagreement here is a React #418 hydration text mismatch in production.
    const denver = formatUnder("America/Denver", BLOG_DATE_TIME_FORMAT);

    expect(formatUnder("UTC", BLOG_DATE_TIME_FORMAT)).toBe(denver);
    expect(formatUnder("Asia/Tokyo", BLOG_DATE_TIME_FORMAT)).toBe(denver);
    expect(denver).toContain("10:30 PM");
  });

  it("would disagree between SSR and hydration without a pinned zone", () => {
    // The failure the test above is guarding against, shown to be real rather
    // than hypothetical.
    const unpinned = withoutZone(BLOG_DATE_TIME_FORMAT);
    const served = formatUnder("UTC", unpinned);

    expect(served).not.toBe(formatUnder("America/Denver", unpinned));
    expect(served).not.toBe(formatUnder("Asia/Tokyo", unpinned));
  });
});

/**
 * The tests above prove the shared options are correct. They cannot prove the
 * components use them: this suite runs under `environment: "node"` with no DOM,
 * and the two `/blog` routes need a database that CI does not have -- which is
 * why the e2e suite skips them. So the link between option object and rendered
 * output is asserted structurally, over the source text.
 *
 * Crude on purpose. Without it, inlining a format object back into either
 * component leaves every test above green, since they would still be exercising
 * a shared constant nothing renders.
 */
describe("the render sites use the shared options", () => {
  const sites = [
    {
      path: "src/app/blog/[id]/page.tsx",
      constant: "BLOG_DATE_FORMAT",
    },
    {
      path: "src/components/MyBlogBodyAbbr.tsx",
      constant: "BLOG_DATE_TIME_FORMAT",
    },
  ];

  for (const { path, constant } of sites) {
    it(`${path} formats with ${constant}`, () => {
      const source = readFileSync(path, "utf8");

      // Matched with a whitespace-tolerant pattern rather than a literal
      // substring: the call is over 80 characters once it is assigned to
      // anything, so Prettier wraps its arguments, and a literal would then fail
      // on formatting while the file still does exactly the right thing.
      expect(source).toMatch(
        new RegExp(`toLocaleDateString\\(\\s*"en-US",\\s*${constant},?\\s*\\)`),
      );
      // No second, inline options object anywhere in the file. `weekday` is the
      // marker: it appears in every variant of these options and nowhere else.
      expect(source).not.toContain("weekday:");
      expect(source).not.toContain("timeZone:");
    });
  }
});
