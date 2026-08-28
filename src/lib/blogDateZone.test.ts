import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import MyBlogBodyAbbr from "@/components/MyBlogBodyAbbr";
import type { Blog } from "@/lib/definitions";

// The exact option objects passed at the two render sites, copied verbatim so a
// drift between them and this file shows up as a failure rather than as silence.
//   src/app/blog/[id]/page.tsx      -> DETAIL_OPTIONS  (date only)
//   src/components/MyBlogBodyAbbr.tsx -> ABBR_OPTIONS  (date + hour/minute)
const DETAIL_OPTIONS: Intl.DateTimeFormatOptions = {
  weekday: "long",
  year: "numeric",
  month: "long",
  day: "numeric",
};

const ABBR_OPTIONS: Intl.DateTimeFormatOptions = {
  weekday: "long",
  year: "numeric",
  month: "long",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
};

const DENVER = "America/Denver";

// `blogs.date` is `timestamp(6) without time zone`. actions.ts writes Denver
// wall-clock text into it, and the driver resolves a naive value in the reading
// process's own zone -- verified against @neondatabase/serverless's bundled
// parser, for which `new Date("YYYY-MM-DDTHH:MM:SS")` is an exact stand-in.
const storedWallClock = (naive: string) => new Date(naive.replace(" ", "T"));

const ambientZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

// A 22:30 Denver post: the two zones disagree on the calendar day.
const EVENING_NAIVE = "2026-08-21 22:30:00";
const EVENING_INSTANT = new Date("2026-08-22T04:30:00Z");

// A 14:03 Denver post: the two zones agree on the day but not on the hour.
const MIDDAY_NAIVE = "2026-08-21 14:03:22";
const MIDDAY_INSTANT = new Date("2026-08-21T20:03:22Z");

describe("toLocaleDateString honours explicitly passed time components", () => {
  it("renders hour and minute even though the method is named ...DateString", () => {
    const withTime = MIDDAY_INSTANT.toLocaleDateString("en-US", {
      ...ABBR_OPTIONS,
      timeZone: DENVER,
    });
    const dateOnly = MIDDAY_INSTANT.toLocaleDateString("en-US", {
      ...DETAIL_OPTIONS,
      timeZone: DENVER,
    });

    expect(withTime).toContain(":");
    expect(dateOnly).not.toContain(":");
    expect(withTime.startsWith(dateOnly.replace(/,$/, ""))).toBe(true);
  });
});

describe("why the missing timeZone is invisible today: the errors cancel", () => {
  it("renders the stored wall-clock back verbatim in any ambient zone", () => {
    // Parsed in the ambient zone, then formatted in that same ambient zone.
    const rendered = storedWallClock(MIDDAY_NAIVE).toLocaleDateString(
      "en-US",
      ABBR_OPTIONS,
    );

    // 14:03 is what actions.ts wrote; 02:03 PM is how en-US spells it.
    expect(rendered).toContain("August 21, 2026");
    expect(rendered).toContain("02:03");
    expect(rendered).toContain("PM");
  });

  // The day-boundary case, which is the one that looks like it should break:
  // 22:30 Denver is the next calendar day in UTC. It still round-trips, because
  // the parse zone and the format zone are the same variable.
  it("holds at the day boundary too, where a fixed instant would not", () => {
    const rendered = storedWallClock(EVENING_NAIVE).toLocaleDateString(
      "en-US",
      ABBR_OPTIONS,
    );

    expect(rendered).toContain("August 21, 2026");
    expect(rendered).toContain("10:30");
    expect(rendered).toContain("PM");
  });
});

describe("a fixed instant formatted without a timeZone is ambient-zone dependent", () => {
  it("is exactly the explicit-timeZone result for whatever zone the process is in", () => {
    for (const instant of [EVENING_INSTANT, MIDDAY_INSTANT]) {
      for (const options of [DETAIL_OPTIONS, ABBR_OPTIONS]) {
        expect(instant.toLocaleDateString("en-US", options)).toBe(
          instant.toLocaleDateString("en-US", {
            ...options,
            timeZone: ambientZone(),
          }),
        );
      }
    }
  });

  it("disagrees on the calendar DAY for an evening post -- the date-only site is affected too", () => {
    const inDenver = EVENING_INSTANT.toLocaleDateString("en-US", {
      ...DETAIL_OPTIONS,
      timeZone: DENVER,
    });
    const inUtc = EVENING_INSTANT.toLocaleDateString("en-US", {
      ...DETAIL_OPTIONS,
      timeZone: "UTC",
    });

    expect(inDenver).toBe("Friday, August 21, 2026");
    expect(inUtc).toBe("Saturday, August 22, 2026");
    expect(inDenver).not.toBe(inUtc);
  });

  it("disagrees on the HOUR for a midday post, where the day is identical", () => {
    const inDenver = MIDDAY_INSTANT.toLocaleDateString("en-US", {
      ...ABBR_OPTIONS,
      timeZone: DENVER,
    });
    const inUtc = MIDDAY_INSTANT.toLocaleDateString("en-US", {
      ...ABBR_OPTIONS,
      timeZone: "UTC",
    });

    // Same day: the date-only detail page cannot see this one at all.
    expect(
      MIDDAY_INSTANT.toLocaleDateString("en-US", {
        ...DETAIL_OPTIONS,
        timeZone: DENVER,
      }),
    ).toBe(
      MIDDAY_INSTANT.toLocaleDateString("en-US", {
        ...DETAIL_OPTIONS,
        timeZone: "UTC",
      }),
    );

    // Different hour: the hour/minute site diverges regardless.
    expect(inDenver).toContain("02:03 PM");
    expect(inUtc).toContain("08:03 PM");
    expect(inDenver).not.toBe(inUtc);
  });
});

describe("an explicit timeZone makes both sites ambient-zone independent", () => {
  it("pins the date-only site", () => {
    expect(
      EVENING_INSTANT.toLocaleDateString("en-US", {
        ...DETAIL_OPTIONS,
        timeZone: DENVER,
      }),
    ).toBe("Friday, August 21, 2026");
  });

  it("pins the hour/minute site", () => {
    expect(
      EVENING_INSTANT.toLocaleDateString("en-US", {
        ...ABBR_OPTIONS,
        timeZone: DENVER,
      }),
    ).toBe("Friday, August 21, 2026 at 10:30 PM");
  });
});

// The real client component, server-rendered exactly as /blog renders it. This
// is the same instrument MyBlogBodyAbbr.test.ts already uses.
function renderAbbrDateText(instant: Date): string {
  const html = renderToStaticMarkup(
    createElement(MyBlogBodyAbbr, {
      session: null,
      blog: {
        id: "11111111-1111-4111-8111-111111111111",
        title: "A post",
        content: "body",
        date: instant,
      } satisfies Blog,
      deleteBlogPost: vi.fn(),
    }),
  );

  const text = /<p class="text-sm font-medium text-muted">([^<]*)<\/p>/.exec(
    html,
  )?.[1];
  if (text === undefined) {
    throw new Error(
      "Could not locate the date paragraph in the rendered markup. The " +
        "component's class list probably changed; fix this extractor rather " +
        "than letting the assertion pass over markup it never found.",
    );
  }
  return text;
}

describe("the real MyBlogBodyAbbr server-renders a zone-dependent date", () => {
  it("emits whatever the rendering process's ambient zone says", () => {
    expect(renderAbbrDateText(EVENING_INSTANT)).toBe(
      EVENING_INSTANT.toLocaleDateString("en-US", {
        ...ABBR_OPTIONS,
        timeZone: ambientZone(),
      }),
    );
  });

  // Supplied per run, so each zone's output is asserted by exact text rather
  // than compared against a formatter that could share the same bug.
  it("matches the exact text this run was told to expect", () => {
    const expected = process.env.EXPECT_ABBR_TEXT;
    if (expected === undefined) {
      throw new Error("Set EXPECT_ABBR_TEXT to run this assertion.");
    }

    expect(renderAbbrDateText(EVENING_INSTANT)).toBe(expected);
  });
});

describe("evidence table", () => {
  it("prints what this process rendered", () => {
    const rows = [
      ["evening, date only", EVENING_INSTANT, DETAIL_OPTIONS],
      ["evening, with time", EVENING_INSTANT, ABBR_OPTIONS],
      ["midday,  date only", MIDDAY_INSTANT, DETAIL_OPTIONS],
      ["midday,  with time", MIDDAY_INSTANT, ABBR_OPTIONS],
    ] as const;

    console.log(
      `\n  TZ=${process.env.TZ ?? "(unset)"}  Intl=${ambientZone()}\n` +
        rows
          .map(
            ([label, instant, options]) =>
              `  ${label}  ambient: ${instant.toLocaleDateString("en-US", options)}`,
          )
          .join("\n"),
    );

    expect(ambientZone()).toBeTruthy();
  });
});
