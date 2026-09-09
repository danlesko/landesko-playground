"use client";

import dynamic from "next/dynamic";
import React from "react";

import { createController, type Action } from "./tetris/controller";
import { createTetrisSketch } from "./tetris/sketch";
import { PIECE_COLOURS, previewCells, type PieceKind } from "./tetris/engine";

/**
 * `ssr: false` for the same reason as `ProcessingDrawing`: p5 touches `window` at module
 * scope, so a static import breaks the server render.
 */
const ReactP5Wrapper = dynamic(
  () => import("react-p5-wrapper").then((mod) => mod.ReactP5Wrapper),
  { ssr: false },
);

/**
 * A separate host from `ProcessingDrawing` rather than a prop on it, which was the first
 * plan and is wrong for two concrete reasons.
 *
 * That component rebuilds the entire p5 instance when the reduced-motion preference
 * changes, which is exactly right for an ambient animation and would silently delete a
 * game in progress. And `/animation` is a Server Component, so a sketch factory passed down
 * from it would cross the boundary as a non-serialisable prop. Sixty-nine lines of shared
 * dynamic-import boilerplate is a cheaper duplication than a host that has to serve both.
 */

/**
 * Which keys the game claims.
 *
 * The list is what decides `preventDefault`, and that is the whole point of having one:
 * Down and Space scroll the page, so they have to be swallowed, while Tab must not be --
 * a visitor who lands here by tabbing has to be able to leave the same way. Trapping the
 * keyboard in a game is a worse outcome than a stray scroll.
 */
const KEYS: Record<string, Action> = {
  ArrowLeft: "left",
  ArrowRight: "right",
  ArrowDown: "softDrop",
  ArrowUp: "rotateCW",
  z: "rotateCCW",
  Z: "rotateCCW",
  x: "rotateCW",
  X: "rotateCW",
  " ": "hardDrop",
  Enter: "toggle",
  p: "toggle",
  P: "toggle",
};

/**
 * The actions the operating system's key repeat may fire.
 *
 * Movement and soft drop want it -- holding Left is how you cross the board. Nothing else
 * does, and letting it through was a real defect rather than a rough edge: holding Enter
 * oscillated between paused and playing many times a second, flooding the live region, and
 * holding Space hard-dropped piece after piece at the repeat rate. Rotation is excluded for
 * the same reason it is in every other implementation -- a held key would spin the piece.
 */
const REPEATABLE: ReadonlySet<Action> = new Set<Action>([
  "left",
  "right",
  "softDrop",
]);

const CONTROLS: Array<{ label: string; action: Action; hint: string }> = [
  { label: "←", action: "left", hint: "Move left" },
  { label: "→", action: "right", hint: "Move right" },
  { label: "⟳", action: "rotateCW", hint: "Rotate" },
  { label: "↓", action: "softDrop", hint: "Soft drop" },
  { label: "⤓", action: "hardDrop", hint: "Hard drop" },
];

const NextPreview = ({ kind }: { kind: PieceKind }) => (
  <div
    className="grid gap-px"
    style={{
      gridTemplateColumns: `repeat(${previewCells(kind)[0]?.length ?? 4}, 0.5rem)`,
    }}
  >
    {previewCells(kind)
      .flat()
      .map((filled, i) => (
        <span
          key={i}
          className="block h-2 w-2 rounded-sm"
          // The piece's own colour, from the same map the canvas uses. Hardcoding one made
          // every preview cyan, so the preview told you the shape and lied about the piece.
          style={filled ? { backgroundColor: PIECE_COLOURS[kind] } : undefined}
        />
      ))}
  </div>
);

const TetrisGame = () => {
  const wrapperRef = React.useRef<HTMLDivElement>(null);

  // One controller for the life of the component. A new one per render would restart the
  // game on every keystroke.
  //
  // Seeded with a CONSTANT, and randomised only when a game starts. This component
  // server-renders, and the next-piece preview comes from the seed, so `Math.random()` here
  // would make the server's markup disagree with the client's.
  const [controller] = React.useState(() =>
    createController(1, () => Math.floor(Math.random() * 2 ** 31)),
  );

  const summary = React.useSyncExternalStore(
    controller.subscribe,
    controller.snapshot,
    controller.snapshot,
  );

  /**
   * Built once and never rebuilt, which is the reason this component exists separately from
   * `ProcessingDrawing`: that one deliberately gives the wrapper a new sketch identity when
   * the reduced-motion preference changes, and ReactP5Wrapper responds by tearing the p5
   * instance down. For an ambient animation that is how the change gets applied. Here it
   * would delete a game in progress.
   *
   * There is nothing left for it to react to in any case -- see `sketch.ts` on why the
   * reduced-motion flag was removed rather than threaded through.
   *
   * The ref OBJECT is passed, never its value. react-hooks 7 cannot tell those apart at a
   * call site and warns that the function "may read its value during render"; this one
   * does not. `createTetrisSketch` returns immediately, and every `wrapperRef.current` read
   * happens inside the returned sketch, which react-p5-wrapper only invokes from an effect.
   */
  const sketch = React.useMemo(
    // eslint-disable-next-line react-hooks/refs
    () => createTetrisSketch(wrapperRef, controller),
    [controller],
  );

  /**
   * Pauses when the tab goes away.
   *
   * Not politeness: p5's `deltaTime` spans the whole time a tab was hidden, so coming back
   * would hand the engine minutes at once. The engine caps a single tick as a backstop, but
   * the cap exists for stalls -- this is the case it should never have to cover.
   */
  React.useEffect(() => {
    const onHidden = () => {
      if (document.hidden) controller.send("pause");
    };
    document.addEventListener("visibilitychange", onHidden);
    return () => document.removeEventListener("visibilitychange", onHidden);
  }, [controller]);

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    // A press on one of the control buttons is that button's, not the board's, or Space and
    // Enter would both activate the button and play a move.
    if (event.target !== event.currentTarget) return;
    if (event.key === "Escape") {
      controller.send("pause");
      event.currentTarget.blur();
      return;
    }
    const action = KEYS[event.key];
    if (!action) return;
    // Only after deciding the key IS handled, so Tab, F5 and the browser's own shortcuts
    // keep working.
    event.preventDefault();
    // Held keys still have to be swallowed -- the default action is what scrolls -- so this
    // comes after `preventDefault` rather than instead of it.
    if (event.repeat && !REPEATABLE.has(action)) return;
    controller.send(action);
  };

  /**
   * Pauses when focus leaves the game, but not when it moves to a control inside it.
   *
   * `relatedTarget` is what distinguishes those. Without the check, tabbing from the board
   * to the Rotate button would pause the game the button is meant to play.
   */
  const onBlur = (event: React.FocusEvent<HTMLDivElement>) => {
    const next = event.relatedTarget;
    if (next instanceof Node && event.currentTarget.contains(next)) return;
    controller.send("pause");
  };

  const statusLabel =
    summary.status === "idle"
      ? "Press Enter to play"
      : summary.status === "paused"
        ? "Paused"
        : summary.status === "over"
          ? "Game over"
          : "Playing";

  return (
    <div
      id="tetris"
      // The whole game, so `onBlur` can tell "left the game" from "moved within it".
      onBlur={onBlur}
      className="flex flex-col gap-4 sm:flex-row sm:items-start"
    >
      {/* Block-level and ref'd for measurement, which the focusable child cannot be: an
          `inline-block` takes its width FROM the canvas, so sizing the canvas from it is
          circular and pins the board at its minimum. */}
      <div ref={wrapperRef} className="min-w-0 sm:flex-1">
        <div
          tabIndex={0}
          // `application` so arrow keys reach the game instead of being taken by a screen
          // reader's own browse-mode navigation, which is the documented pattern for a
          // keyboard-driven widget. The cost is real and worth naming: it changes how a
          // screen reader treats this subtree, and a canvas board is not something it can
          // convey anyway. What makes it acceptable is that nothing DEPENDS on the mode --
          // every move also exists as a named button below, which works in browse mode.
          // Not verified against real assistive technology, which is the honest caveat.
          role="application"
          aria-labelledby="tetris-heading"
          aria-describedby="tetris-instructions tetris-status"
          onKeyDown={onKeyDown}
          // A focusable div gets no focus ring of its own, and the forced-colors fallback in
          // globals.css covers button/input/textarea only -- there is a matching rule there
          // for `[tabindex]` now.
          className="tetris-board inline-block rounded-md outline-offset-4 focus-visible:outline-2 focus-visible:outline-cyan-400"
        >
          <ReactP5Wrapper sketch={sketch} />
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {/* Ordinary text, not a live region. Wrapping the score in one would announce every
            soft-drop point. Sparse events go through the polite node at the bottom. */}
        <dl className="grid grid-cols-3 gap-x-4 gap-y-1 text-lg sm:grid-cols-1">
          <div>
            <dt className="text-sm text-slate-400">Score</dt>
            <dd className="font-semibold tabular-nums">{summary.score}</dd>
          </div>
          <div>
            <dt className="text-sm text-slate-400">Lines</dt>
            <dd className="font-semibold tabular-nums">{summary.lines}</dd>
          </div>
          <div>
            <dt className="text-sm text-slate-400">Level</dt>
            <dd className="font-semibold tabular-nums">{summary.level}</dd>
          </div>
        </dl>

        <div>
          <p className="text-sm text-slate-400">Next</p>
          <div className="mt-1 flex gap-3">
            {summary.next.map((kind, i) => (
              <NextPreview key={`${kind}-${i}`} kind={kind} />
            ))}
          </div>
        </div>

        <p id="tetris-status" className="text-lg font-semibold">
          {statusLabel}
        </p>

        <button
          type="button"
          onClick={() =>
            controller.send(summary.status === "over" ? "restart" : "toggle")
          }
          // cyan-700, not the 600 this started as: white on #0092b8 is 3.62:1, under the
          // 4.5:1 that 16px text needs, and axe caught it. 700 measures 5.10:1. The hover
          // DARKENS for the same reason -- lightening to 600 would put the hovered state
          // back below the line, where no automated check would look for it.
          className="rounded-md bg-cyan-700 px-4 py-2 font-semibold text-white hover:bg-cyan-800"
        >
          {summary.status === "playing"
            ? "Pause"
            : summary.status === "over"
              ? "Play again"
              : summary.status === "paused"
                ? "Resume"
                : "Play"}
        </button>

        {/* Real buttons rather than hit-testing inside the canvas, which is what makes the
            game usable on a phone at all -- and they are reachable by keyboard and named,
            which canvas-drawn controls could never be. */}
        <div className="flex gap-2">
          {CONTROLS.map(({ label, action, hint }) => (
            <button
              key={action}
              type="button"
              aria-label={hint}
              onClick={() => controller.send(action)}
              className="h-11 w-11 rounded-md bg-slate-700 text-lg text-white hover:bg-slate-600"
            >
              <span aria-hidden="true">{label}</span>
            </button>
          ))}
        </div>

        <p id="tetris-instructions" className="max-w-xs text-sm text-slate-400">
          Click the board or tab to it, then use the arrow keys. Up rotates,
          Space drops, Enter pauses, Escape leaves the board.
        </p>
      </div>

      {/* Sparse announcements only: started, paused, a line clear, game over. `atomic` so a
          part-updated sentence is never read. */}
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {/* Keyed on the revision, so clearing two single rows in a row is announced twice.
            A live region whose text is unchanged says nothing at all -- measured elsewhere
            in this repo, and clearing the text after reading it does not help because React
            batches the set and the clear into one commit. */}
        <span key={summary.revision}>{summary.announcement ?? ""}</span>
      </div>
    </div>
  );
};

export default TetrisGame;
