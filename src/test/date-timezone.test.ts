import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

/**
 * Both blog date render sites format with no `timeZone`, so they resolve in
 * whatever zone the surrounding process happens to be in. These tests measure
 * that dependence directly -- by formatting the same instant in two real
 * processes under two `TZ` values -- rather than reasoning about it, because
 * this suite has no jsdom and cannot render either component.
 *
 * The instant is a post written at 22:30 on 2026-08-21 in Denver. It is chosen
 * because it falls on a different calendar day in UTC, which is the case that
 * makes the bug visible rather than merely present.
 */
const INSTANT = "2026-08-22T04:30:00.000Z";

// Copied verbatim from src/app/blog/[id]/page.tsx.
const DAY: Intl.DateTimeFormatOptions = {
  weekday: "long",
  year: "numeric",
  month: "long",
  day: "numeric",
};

// Copied verbatim from src/components/MyBlogBodyAbbr.tsx, which is a client
// component and so formats twice: once during SSR, once again on hydration.
const DAY_AND_TIME: Intl.DateTimeFormatOptions = {
  ...DAY,
  hour: "2-digit",
  minute: "2-digit",
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
  it("resolves to a different calendar day in UTC than in Denver", () => {
    // A Vercel function runs in UTC; the author and most readers do not.
    expect(formatUnder("UTC", DAY)).toBe("Saturday, August 22, 2026");
    expect(formatUnder("America/Denver", DAY)).toBe("Friday, August 21, 2026");
  });

  it("is stable across zones once timeZone is pinned", () => {
    const pinned = { ...DAY, timeZone: "America/Denver" };
    const utc = formatUnder("UTC", pinned);

    expect(utc).toBe(formatUnder("America/Denver", pinned));
    expect(utc).toBe(formatUnder("Asia/Tokyo", pinned));
    // Pinning does not merely make the output agree, it makes it agree on the
    // day the post was actually written.
    expect(utc).toBe("Friday, August 21, 2026");
  });

  it("disagrees between SSR and hydration for the client component", () => {
    // MyBlogBodyAbbr renders on the server in the server's zone and again in
    // the browser in the visitor's zone. Nothing reconciles the two, so the
    // hydrated text differs from the served HTML for any visitor outside UTC.
    const served = formatUnder("UTC", DAY_AND_TIME);

    expect(served).not.toBe(formatUnder("America/Denver", DAY_AND_TIME));
    expect(served).not.toBe(formatUnder("Asia/Tokyo", DAY_AND_TIME));
  });
});
