import {
  createGame,
  hardDrop,
  moveLeft,
  moveRight,
  pause,
  rotateCCW,
  rotateCW,
  softDrop,
  start,
  tick,
  togglePlay,
  levelOf,
  type GameEvent,
  type GameState,
} from "./engine";

/**
 * Holds the one authoritative game state and lets p5 and React each touch it the way that
 * suits them.
 *
 * The alternative -- React owning the state and passing it into the sketch -- was the first
 * instinct and is wrong here: gravity advances every animation frame, so it would re-render
 * the component sixty times a second to move a square down one row every second. This layer
 * exists so the canvas can run at frame rate while React only re-renders when something a
 * READER can see changes: the score, the level, the status.
 *
 * The split also decides where input lives. p5 does not handle keys at all -- see
 * `TetrisGame.tsx` for why the browser's own focus routing is the right mechanism -- so the
 * component sends actions in here and the sketch never learns about them.
 */

export type Action =
  | "left"
  | "right"
  | "rotateCW"
  | "rotateCCW"
  | "softDrop"
  | "hardDrop"
  | "toggle"
  | "pause"
  | "restart";

/**
 * What React renders. Everything a reader needs, and nothing that changes per frame -- the
 * board is deliberately absent so that moving a piece does not re-render the DOM.
 */
export type Summary = {
  score: number;
  lines: number;
  level: number;
  status: GameState["status"];
  next: GameState["queue"];
  /** The last thing worth announcing, or null. */
  announcement: string | null;
  /**
   * Increments with every announcement, including a repeat of the same sentence.
   *
   * The reason is measured elsewhere in this repo: a live region whose text does not change
   * announces NOTHING, so two single-line clears in a row would produce one announcement.
   * Keying the element on this forces React to replace the node, which counts as a change.
   * Clearing the text after reading it -- the other obvious fix -- does not work, because
   * React batches the set and the clear into one commit and the region never sees the text.
   */
  revision: number;
};

const announce = (event: GameEvent | null, state: GameState): string | null => {
  if (!event) return null;
  switch (event.type) {
    case "started":
      return "Game started.";
    case "paused":
      return "Paused.";
    case "resumed":
      return "Resumed.";
    case "over":
      return `Game over. Final score ${event.score}.`;
    case "locked":
      // Only line clears, not every piece. Announcing all of them would talk over the
      // player continuously and tell them nothing they cannot see.
      if (event.cleared === 0) return null;
      return `${event.cleared} ${event.cleared === 1 ? "line" : "lines"} cleared. Score ${state.score}.`;
  }
};

const summarise = (
  state: GameState,
  announcement: string | null,
  revision: number,
): Summary => ({
  score: state.score,
  lines: state.lines,
  level: levelOf(state.lines),
  status: state.status,
  next: state.queue,
  announcement,
  revision,
});

const sameSummary = (a: Summary, b: Summary): boolean =>
  a.score === b.score &&
  a.lines === b.lines &&
  a.level === b.level &&
  a.status === b.status &&
  a.announcement === b.announcement &&
  a.revision === b.revision &&
  a.next.length === b.next.length &&
  a.next.every((kind, i) => kind === b.next[i]);

export type Controller = ReturnType<typeof createController>;

/**
 * @param seed the deal for the board rendered before anyone plays. FIXED by the caller, not
 *   random: this component server-renders, and the next-piece preview is derived from the
 *   seed, so a random one here would produce different markup on the server and the client.
 * @param newSeed called when a game actually STARTS, which only ever happens from an event
 *   handler on the client, so it is free to be random.
 */
export const createController = (seed: number, newSeed: () => number) => {
  let state = createGame(seed);
  let revision = 0;
  let summary = summarise(state, null, revision);
  const listeners = new Set<() => void>();

  const commit = (next: GameState) => {
    const previous = state;
    state = next;
    // `lastEvent` is only meaningful for the call that set it. Carrying it forward would
    // repeat an announcement on the next frame.
    const event = next.lastEvent === previous.lastEvent ? null : next.lastEvent;
    const announcement = announce(event, next);
    if (announcement !== null) revision += 1;
    const candidate = summarise(next, announcement, revision);
    if (sameSummary(candidate, summary)) return;
    summary = candidate;
    listeners.forEach((listener) => listener());
  };

  return {
    /**
     * The stable snapshot `useSyncExternalStore` requires. It has to be the SAME object
     * until something changes, or React re-renders forever.
     */
    snapshot: (): Summary => summary,

    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    /** The board, for the renderer. Read every frame, so it is not part of the summary. */
    state: (): GameState => state,

    /** Advances gravity. Called from `draw`, with p5's own frame delta. */
    advance: (elapsedMs: number) => commit(tick(state, elapsedMs)),

    send: (action: Action) => {
      switch (action) {
        case "left":
          return commit(moveLeft(state));
        case "right":
          return commit(moveRight(state));
        case "rotateCW":
          return commit(rotateCW(state));
        case "rotateCCW":
          return commit(rotateCCW(state));
        case "softDrop":
          return commit(softDrop(state));
        case "hardDrop":
          return commit(hardDrop(state));
        case "toggle":
          // A fresh deal whenever this begins a game rather than resuming one, so two
          // games in a row are not identical.
          return commit(
            state.status === "idle" || state.status === "over"
              ? start({ ...state, status: "over", seed: newSeed() })
              : togglePlay(state),
          );
        case "pause":
          return commit(pause(state));
        case "restart":
          return commit(start({ ...state, status: "over", seed: newSeed() }));
      }
    },
  };
};
