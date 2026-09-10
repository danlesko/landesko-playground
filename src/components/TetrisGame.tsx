"use client";

import dynamic from "next/dynamic";
import React from "react";

import { createController, type Action } from "./tetris/controller";
import { createTetrisSketch } from "./tetris/sketch";
import { PIECE_COLOURS, previewCells, type PieceKind } from "./tetris/engine";
import HighScoreList from "./tetris/HighScoreList";
import SaveScoreForm from "./tetris/SaveScoreForm";
import { loadHighScores } from "./tetris/scoreClient";
import type { HighScore } from "@/lib/definitions";

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
  // Everything below the board. Its height is what the board's height budget is measured
  // against, and it is safe to measure because it does not depend on the canvas: the score,
  // the buttons and the instructions are the same size whatever the board does.
  const furnitureRef = React.useRef<HTMLDivElement>(null);
  const headingId = React.useId();

  // `null` until the first request settles, which is what the list renders as "Loading".
  const [scores, setScores] = React.useState<HighScore[] | null>(null);
  const [scoresUnavailable, setScoresUnavailable] = React.useState(false);
  // Set once a WRITE has returned an authoritative board. The initial GET must not overwrite
  // that, and it can: a stalled read started before the save can resolve after it, replacing
  // the board that includes the player's score with the one that predates it -- or marking it
  // unavailable. A ref rather than state because nothing renders from it.
  const boardFromWrite = React.useRef(false);
  // Whether the reader has waved the save panel away for THIS game. Not "is the panel
  // open", which is derived below -- storing that would be storing a copy of the game's own
  // status, and react-hooks 7 rightly objects to the effect it would take to keep in step.
  const [saveDismissed, setSaveDismissed] = React.useState(false);

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
    () => createTetrisSketch(wrapperRef, furnitureRef, controller),
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

  /**
   * Loads the board once, on mount.
   *
   * Client-side rather than server-rendered into the page, deliberately: `/animation` is a
   * static route and reading the database in the page would make every visit dynamic for a
   * list that only the game uses. The cost is a brief "Loading" state on the board, which
   * only shows before anyone has pressed a key.
   *
   * `cancelled` rather than an AbortController: the request is a plain GET with no side
   * effect, so there is nothing to abort that matters -- what has to be prevented is setting
   * state after unmount.
   */
  React.useEffect(() => {
    let cancelled = false;
    void loadHighScores().then((result) => {
      // A save that landed while this was in flight wins: its board is newer and came from
      // the same statement that changed it.
      if (cancelled || boardFromWrite.current) return;
      if (result.status === "ok") setScores(result.scores);
      else setScoresUnavailable(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Everything the reader does goes through here, so that starting a game clears any
   * dismissal from the last one.
   *
   * The alternative was an effect watching the status and setting a piece of state, which is
   * the shape react-hooks 7 warns about -- and it was warning about something real: the panel
   * being open is DERIVED from the game being over, so keeping a second copy in sync was work
   * that did not need doing. Every path that can begin a game is an event handler in this
   * component, so the reset has a natural home.
   */
  const send = React.useCallback(
    (action: Action) => {
      if (action === "toggle" || action === "restart") setSaveDismissed(false);
      controller.send(action);
    },
    [controller],
  );

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    // A press on one of the control buttons is that button's, not the board's, or Space and
    // Enter would both activate the button and play a move.
    if (event.target !== event.currentTarget) return;
    if (event.key === "Escape") {
      send("pause");
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
    send(action);
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
    send("pause");
  };

  // Deliberately short, and deliberately not naming a key: this used to read "Press Enter to
  // play", which is wrong on a phone and was also the longest string in the row that now has
  // to fit on one line. The keyboard hints live in the instructions paragraph, which is only
  // shown where a keyboard is likely.
  // Derived, not stored. Shown when the game is over and the reader has not dismissed it.
  const showSavePanel = summary.status === "over" && !saveDismissed;
  // The two overlays are mutually exclusive: both cover the board, so showing them together
  // would stack an opaque list behind an opaque form. Before a game, or after one once the
  // save panel has been dealt with -- which is exactly when someone wants to see where they
  // placed.
  const showLeaderboard =
    summary.status === "idle" || (summary.status === "over" && !showSavePanel);

  const statusLabel =
    summary.status === "idle"
      ? "Ready"
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
      // One column at every width, board first and centred. It was a two-column row on
      // anything wider than a phone, which put the score and the controls in a tall thin
      // stack beside a tall thin board and wasted the middle of the screen. Underneath also
      // means the board can take the full width of the column instead of sharing it.
      className="flex flex-col items-center gap-4"
    >
      {/* Full width and centring its child, which is doing two jobs: it is what the board is
          measured against -- a block-level element whose width does NOT come from the canvas
          -- and `justify-center` is what centres the board without the wrapper losing that
          width. The focusable child stays `inline-block` so its focus ring hugs the board
          rather than spanning the column. */}
      <div ref={wrapperRef} className="flex w-full justify-center">
        {/* `relative` and content-sized, so the overlay below can be positioned against the
            CANVAS rather than against the full-width measuring wrapper. As a flex item its
            width shrinks to its content. */}
        <div className="relative">
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
            // for `[tabindex]`.
            className="tetris-board inline-block rounded-md outline-offset-4 focus-visible:outline-2 focus-visible:outline-cyan-400"
          >
            <ReactP5Wrapper sketch={sketch} />
          </div>

          {/* A SIBLING of the focusable board, never a child of it. `role="application"` tells
            a screen reader to hand keys to the widget instead of navigating; a list someone
            wants to read line by line must not be inside that.

            Shown before a game starts and after one ends -- NOT while it is merely paused.
            "Before the game starts" is what was asked for, and now that the panel is opaque,
            showing it on pause would hide the stack the player paused to look at.

            And not while the save panel is up, because the two occupy the same space: both
            overlay the board, so rendering both would stack an opaque list under an opaque
            form. The list comes back once the panel is dismissed, which is also when it is
            most useful -- that is when the reader wants to see where they placed. */}
          {showLeaderboard && (
            <HighScoreList
              scores={scores}
              unavailable={scoresUnavailable}
              headingId={headingId}
            />
          )}

          {/* THE SAVE PANEL, over the board rather than under it. Below the board it added
              height at the exact moment the reader needed it, so on a phone it appeared off
              the bottom of the screen and had to be scrolled to.

              Three things in the positioning are doing work. It is centred on the board with
              a translate rather than `inset-0`, so it takes its own height instead of
              stretching. `w-[min(20rem,88vw)]` lets it be WIDER than the board -- necessary,
              because a 122px landscape board cannot hold a form -- while never exceeding the
              viewport. And `max-h-full overflow-y-auto` means the landscape case scrolls
              rather than escaping the board; unlike the leaderboard this element does receive
              pointer events, so scrolling actually works here.

              Opaque, for the reason the leaderboard documents: text over a canvas through a
              translucent layer is text whose contrast axe cannot compute. */}
          {showSavePanel && (
            <div className="absolute left-1/2 top-1/2 max-h-full w-[min(20rem,88vw)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-md bg-slate-950 p-3 shadow-lg">
              <SaveScoreForm
                score={summary.score}
                onScores={(next) => {
                  boardFromWrite.current = true;
                  setScores(next);
                  // A board that came back from a write proves the leaderboard is reachable,
                  // so an earlier failed read must not keep saying otherwise.
                  setScoresUnavailable(false);
                }}
                onDismiss={() => setSaveDismissed(true)}
              />
            </div>
          )}
        </div>
      </div>

      {/* Measured, not guessed: the board's height budget is the viewport less whatever this
          comes to. A constant here would be a magic number that silently stopped matching
          the moment a control was added. */}
      <div
        ref={furnitureRef}
        className="flex w-full flex-col items-center gap-3"
      >
        {/* One row, and the status is IN it rather than on a line of its own. Every row here
            costs the board twice its own height, because the board is 1:2 and height-bound:
            folding three rows into two took the board from 332px wide to 352px on a 390px
            phone. Plain text and not a live region -- wrapping the score in one would
            announce every soft-drop point. Sparse events go through the polite node below. */}
        <dl className="flex flex-wrap items-baseline justify-center gap-x-5 gap-y-1 text-center">
          <div>
            <dt className="text-xs text-slate-400 sm:text-sm">Score</dt>
            <dd className="font-semibold tabular-nums">{summary.score}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-400 sm:text-sm">Lines</dt>
            <dd className="font-semibold tabular-nums">{summary.lines}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-400 sm:text-sm">Level</dt>
            <dd className="font-semibold tabular-nums">{summary.level}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-400 sm:text-sm">Next</dt>
            <dd className="mt-1 flex items-start justify-center gap-2">
              {summary.next.map((kind, i) => (
                <NextPreview key={`${kind}-${i}`} kind={kind} />
              ))}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-400 sm:text-sm">Status</dt>
            <dd id="tetris-status" className="font-semibold">
              {statusLabel}
            </dd>
          </div>
        </dl>

        {/* Play sits with the controls rather than above them, which saves the third row.
            Real buttons rather than hit-testing inside the canvas, which is what makes the
            game usable on a phone at all -- and they are reachable by keyboard and named,
            which canvas-drawn controls could never be. */}
        <div className="flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            onClick={() =>
              send(summary.status === "over" ? "restart" : "toggle")
            }
            // cyan-700, not the 600 this started as: white on #0092b8 is 3.62:1, under the
            // 4.5:1 that 16px text needs, and axe caught it. 700 measures 5.10:1. The hover
            // DARKENS for the same reason -- lightening to 600 would put the hovered state
            // back below the line, where no automated check would look for it.
            className="h-11 rounded-md bg-cyan-700 px-4 font-semibold text-white hover:bg-cyan-800"
          >
            {summary.status === "playing"
              ? "Pause"
              : summary.status === "over"
                ? "Play again"
                : summary.status === "paused"
                  ? "Resume"
                  : "Play"}
          </button>
          {CONTROLS.map(({ label, action, hint }) => (
            <button
              key={action}
              type="button"
              aria-label={hint}
              onClick={() => send(action)}
              className="h-11 w-11 rounded-md bg-slate-700 text-lg text-white hover:bg-slate-600"
            >
              <span aria-hidden="true">{label}</span>
            </button>
          ))}
        </div>

        {/* Kept in the DOM but shown only where a keyboard is plausible AND there is height
            to spare. Three things behind that:

            It describes KEYS, which a touch visitor does not have. Every pixel it occupies
            costs the board twice as much, since the board is 1:2 and height-bound. And the
            height half of the condition is what makes a landscape phone playable at all --
            at 844x390 these three lines were 56px of a 390px viewport, which is a third of
            the board.

            `sr-only` rather than `hidden` because `aria-describedby` points at it: removing
            it from the accessibility tree would take the board's own description with it.

            ONE arbitrary variant rather than `sm:not-sr-only` plus a max-height override,
            because two competing variants at equal specificity are decided by Tailwind's
            emission order -- which is not something to depend on when a single combined
            media query says exactly what is meant. */}
        <p
          id="tetris-instructions"
          className="sr-only max-w-md text-center text-sm text-slate-400 [@media(min-width:640px)and(min-height:560px)]:not-sr-only"
        >
          Click the board or tab to it, then use the arrow keys. Up rotates,
          Space drops, Enter pauses, Escape leaves the board.
        </p>
      </div>

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
