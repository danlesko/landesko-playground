"use client";

import type { HighScore } from "@/lib/definitions";

/**
 * The leaderboard, shown over the board before a game starts.
 *
 * DOM rather than text painted on the canvas, and that is the whole reason this is a
 * component. A canvas conveys nothing to a screen reader and nothing to a text selection, so
 * ten names drawn with `p5.text()` would be ten names only a sighted mouse user could read.
 *
 * It renders as an overlay but is NOT inside the `role="application"` element that wraps the
 * canvas -- it is a sibling, positioned over it. That distinction matters: `application` tells
 * a screen reader to stop its own browse-mode navigation and hand keys to the widget, which
 * is right for a game surface and wrong for a list someone wants to read line by line.
 */

export type HighScoreListProps = {
  /** `null` while the first request is in flight. */
  scores: HighScore[] | null;
  /** True when the leaderboard could not be reached at all. */
  unavailable: boolean;
  /** Ties the section's accessible name to its own heading. */
  headingId: string;
};

const HighScoreList = ({
  scores,
  unavailable,
  headingId,
}: HighScoreListProps) => (
  <section
    aria-labelledby={headingId}
    // `pointer-events-none` is the load-bearing class here, and it took an e2e failure to
    // find. The overlay covers the canvas, so without it this section INTERCEPTS every click
    // aimed at the board -- meaning a player could not click the board to focus it and start
    // playing, which is exactly what the on-screen instructions tell them to do. The list is
    // purely informational and has no business receiving a click.
    //
    // That has a consequence worth naming: an overlay that cannot receive pointer events
    // cannot be SCROLLED by one either. So the rows have to fit unaided in the shortest board
    // this game produces, around 242px tall on a landscape phone -- which is why they are
    // `text-xs` with no row gap. `overflow-y-auto` stays as a safety net, so an unexpected
    // overflow clips rather than escaping the board.
    //
    // The background is OPAQUE, and that is an accessibility decision rather than a visual
    // one. At 85% opacity axe could not compute the contrast of a single line in here --
    // every one came back as "background could not be determined because element contains an
    // image node", because the canvas underneath stays in the colour stack through a
    // translucent layer. Ten lines of text that no automated check can measure is worse than
    // a slightly heavier panel, and the board beneath is empty while this is showing anyway.
    //
    // Making it opaque also meant the contrast started being checked, which immediately found
    // a real failure: see the rank number below.
    className="pointer-events-none absolute inset-0 flex flex-col items-center overflow-y-auto rounded-md bg-slate-950 px-3 py-2 text-xs"
  >
    <h3 id={headingId} className="mb-1 text-sm font-semibold text-accent">
      High scores
    </h3>

    {scores === null && !unavailable && (
      <p className="text-slate-400">Loading…</p>
    )}

    {unavailable && (
      // Deliberately not an error the reader can act on, because they cannot. The ordinary
      // cause is the table not existing yet; the game is unaffected either way.
      <p className="text-center text-slate-400">
        High scores are unavailable right now. The game still works.
      </p>
    )}

    {scores !== null && !unavailable && scores.length === 0 && (
      <p className="text-center text-slate-400">
        No scores yet — yours could be the first.
      </p>
    )}

    {scores !== null && !unavailable && scores.length > 0 && (
      // An ordered list, because the ORDER is the meaning here: a screen reader announcing
      // "list item 3" is telling the reader they are third. A table would need a header row
      // to say as much and would cost more width than the board has.
      <ol className="w-full">
        {scores.map((entry, index) => (
          // Keyed by position rather than by name: two players may share a name, and the
          // list is replaced wholesale on every update, so identity per row buys nothing.
          <li
            key={`${index}-${entry.name}`}
            className="flex items-baseline justify-between gap-2 tabular-nums"
          >
            {/* `text-slate-400`, not 500. The rank sat at 4.23:1 against this panel, under the
                4.5:1 that 12px text needs -- found the moment the panel went opaque and axe
                could measure it at all. 400 is 7.87:1. */}
            <span className="w-5 shrink-0 text-right text-slate-400">
              {index + 1}
            </span>
            {/* ONE LINE PER ROW, clipped with an ellipsis -- not wrapped. A 32-character name
                with no spaces is wider than the board on a phone, and `break-all` let it wrap
                over several lines, which pushed the lower entries out of a panel that cannot
                be scrolled: `pointer-events-none` is what keeps the board clickable, and it
                also means `overflow-y-auto` can never be reached by a pointer. Ten
                single-line rows always fit, so nothing needs scrolling.

                The full name stays in the DOM, so a screen reader reads all of it and the
                `title` gives a pointer user the rest. */}
            <span
              className="min-w-0 grow truncate text-foreground"
              title={entry.name}
            >
              {entry.name}
            </span>
            <span className="shrink-0 font-semibold text-foreground">
              {entry.score}
            </span>
          </li>
        ))}
      </ol>
    )}
  </section>
);

export default HighScoreList;
