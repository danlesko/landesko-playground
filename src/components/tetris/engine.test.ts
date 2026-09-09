import { describe, expect, it } from "vitest";

import {
  COLS,
  PIECE_COLOURS,
  HIDDEN_ROWS,
  ROWS,
  VISIBLE_ROWS,
  cellsOf,
  createGame,
  dropDistance,
  emptyBoard,
  fits,
  ghostPiece,
  gravityIntervalMs,
  hardDrop,
  levelOf,
  moveLeft,
  moveRight,
  pause,
  previewCells,
  renderCells,
  resume,
  rotateCCW,
  rotateCW,
  softDrop,
  start,
  tick,
  togglePlay,
  type Cell,
  type GameState,
  type Piece,
  type PieceKind,
} from "@/components/tetris/engine";

/**
 * These tests talk to the engine directly, with no p5 stub anywhere, which is the whole
 * reason the rules live in their own module. `fishTankSketch.test.ts` has to express
 * "which way does the fish face" as an assertion about `translate` arguments; nothing
 * here needs that indirection.
 */

/** A board from strings, bottom row last. `.` is empty, any other character is filled. */
const boardOf = (...rows: string[]): Cell[][] => {
  const board = emptyBoard();
  rows.forEach((row, i) => {
    const y = ROWS - rows.length + i;
    row.split("").forEach((char, x) => {
      if (char !== ".") board[y]![x] = "I";
    });
  });
  return board;
};

const playing = (over: Partial<GameState> = {}): GameState => ({
  ...start(createGame(1)),
  ...over,
});

const at = (piece: Piece): string =>
  `${piece.kind}${piece.rotation}@${piece.x},${piece.y}`;

const occupiedRows = (state: GameState): number =>
  state.board.filter((row) => row.some((cell) => cell !== null)).length;

describe("the board", () => {
  it("keeps two rows above the visible field for pieces to spawn into", () => {
    // Not a detail: without them, spawning, rotating near the ceiling and detecting a
    // top-out all become negative-index special cases.
    expect(HIDDEN_ROWS).toBe(2);
    expect(ROWS).toBe(VISIBLE_ROWS + HIDDEN_ROWS);
  });

  it("spawns a piece entirely above the visible field", () => {
    const state = start(createGame(1));
    expect(
      cellsOf(state.piece!).every(([, y]) => y < HIDDEN_ROWS),
      "a spawned piece is already visible, so gravity does not bring it in",
    ).toBe(true);
  });

  it("treats cells above the board as free rather than as collisions", () => {
    // The mistake this guards: bounds-checking `y < 0` as out of play. Every spawn sits
    // there, so a piece could never enter.
    const piece: Piece = { kind: "T", rotation: 0, x: 3, y: -1 };
    expect(fits(emptyBoard(), piece)).toBe(true);
  });

  it("does not let a piece leave the sides or the floor", () => {
    expect(fits(emptyBoard(), { kind: "O", rotation: 0, x: -1, y: 5 })).toBe(
      false,
    );
    expect(
      fits(emptyBoard(), { kind: "O", rotation: 0, x: COLS - 1, y: 5 }),
    ).toBe(false);
    expect(
      fits(emptyBoard(), { kind: "O", rotation: 0, x: 4, y: ROWS - 1 }),
    ).toBe(false);
  });
});

describe("rotation", () => {
  it("kicks a piece off the left wall to a specific position, not merely somewhere", () => {
    // The assertion names the resulting square deliberately. "Rotation changed something"
    // passes with a wrong kick table, and a wrong table is the characteristic SRS bug --
    // it only misbehaves against a wall, which is exactly the case a loose assertion
    // fails to pin down.
    //
    // A J at x=-1 in rotation 1 occupies the leftmost column. Turning it clockwise there
    // needs the (+1,0) offset, so it must end up one column right of where it asked.
    const state = playing({
      piece: { kind: "J", rotation: 1, x: -1, y: 10 },
    });
    const rotated = rotateCW(state);
    expect(at(rotated.piece!)).toBe("J2@0,10");
  });

  it("uses the offset belonging to the transition, in both directions", () => {
    // One transition is not enough coverage: with only 1>2 asserted, corrupting the 1>0
    // row of the table changed nothing any test could see. Each direction reads a
    // different row, so rotating back has to be checked too.
    //
    // Against the left wall in rotation 1, a J needs the (+1,0) offset going either way,
    // so both land in column 0 rather than at the -1 they asked for.
    const wall = playing({ piece: { kind: "J", rotation: 1, x: -1, y: 10 } });
    expect(at(rotateCW(wall).piece!)).toBe("J2@0,10");
    expect(at(rotateCCW(wall).piece!)).toBe("J0@0,10");

    // In open space every transition takes the identity offset and nothing shifts.
    const open = playing({ piece: { kind: "T", rotation: 0, x: 4, y: 10 } });
    let spun = open;
    for (const expected of ["T1@4,10", "T2@4,10", "T3@4,10", "T0@4,10"]) {
      spun = rotateCW(spun);
      expect(at(spun.piece!)).toBe(expected);
    }
    for (const expected of ["T3@4,10", "T2@4,10", "T1@4,10", "T0@4,10"]) {
      spun = rotateCCW(spun);
      expect(at(spun.piece!)).toBe(expected);
    }
  });

  it("kicks the I piece by two columns, which its own table is needed for", () => {
    // I has a separate kick table because its centre falls between cells. Using the JLSTZ
    // table for it produces a piece that refuses to rotate flat against the left wall.
    const state = playing({ piece: { kind: "I", rotation: 1, x: -2, y: 8 } });
    const rotated = rotateCW(state);
    expect(rotated.piece!.rotation).toBe(2);
    expect(
      cellsOf(rotated.piece!).every(([x]) => x >= 0 && x < COLS),
      "the I piece rotated out of bounds, so its kick table is not being used",
    ).toBe(true);
  });

  it("leaves the piece exactly where it was when every offset is blocked", () => {
    // A fully enclosed piece. The important part is that the state is UNCHANGED rather
    // than nudged: a partial kick here would move a piece the player did not move.
    const board = emptyBoard();
    for (let y = 0; y < ROWS; y += 1) {
      for (let x = 0; x < COLS; x += 1) {
        board[y]![x] = "I";
      }
    }
    for (const [x, y] of cellsOf({ kind: "T", rotation: 0, x: 3, y: 5 })) {
      board[y]![x] = null;
    }
    const state = playing({
      board,
      piece: { kind: "T", rotation: 0, x: 3, y: 5 },
    });
    expect(at(rotateCW(state).piece!)).toBe(at(state.piece!));
  });

  it("does nothing for O, which has no distinct rotations", () => {
    const state = playing({ piece: { kind: "O", rotation: 0, x: 4, y: 5 } });
    expect(rotateCW(state)).toBe(state);
    expect(rotateCCW(state)).toBe(state);
  });

  it("wraps rotation both ways", () => {
    const state = playing({ piece: { kind: "T", rotation: 0, x: 4, y: 8 } });
    expect(rotateCCW(state).piece!.rotation).toBe(3);
    expect(rotateCW(rotateCW(rotateCW(rotateCW(state)))).piece!.rotation).toBe(
      0,
    );
  });
});

describe("scoring a line clear", () => {
  const filledExcept = (gaps: number[]): string =>
    Array.from({ length: COLS }, (_, x) => (gaps.includes(x) ? "." : "#")).join(
      "",
    );

  it("pays 100, 300, 500 and 800 for one to four rows", () => {
    const cases: Array<[number, number]> = [
      [1, 100],
      [2, 300],
      [3, 500],
      [4, 800],
    ];
    for (const [rows, expected] of cases) {
      // An I piece stood upright fills a single column across four rows, so it completes
      // exactly as many rows as are pre-filled around it.
      const lines = Array.from({ length: rows }, () => filledExcept([0]));
      const board = boardOf(...lines);
      const state = playing({
        board,
        piece: { kind: "I", rotation: 1, x: -2, y: ROWS - 4 },
        score: 0,
        lines: 0,
      });
      const after = hardDrop(state);
      expect(after.lines, `${rows} rows should have cleared`).toBe(rows);
      // Hard drop also pays 2 a cell, and the piece was already at the floor here.
      expect(after.score - dropDistance(state) * 2).toBe(expected);
    }
  });

  it("multiplies by the level the rows were cleared AT", () => {
    // 89 lines, NOT 90, and the difference is the whole test: clearing one row takes the
    // game from level 9 to level 10, so the before and after levels differ and the
    // off-by-one is observable. At 90 lines both sides are level 10 and a mutant that used
    // the wrong one survived.
    const board = boardOf(
      Array.from({ length: COLS }, (_, x) => (x === 0 ? "." : "#")).join(""),
    );
    const state = playing({
      board,
      piece: { kind: "I", rotation: 1, x: -2, y: ROWS - 4 },
      score: 0,
      lines: 89,
    });
    expect(levelOf(89)).toBe(9);
    expect(levelOf(90)).toBe(10);
    const after = hardDrop(state);
    expect(after.score - dropDistance(state) * 2).toBe(900);
  });

  it("drops the rows above a cleared row down", () => {
    const board = boardOf(
      "#........." /* survives, must end up lower */,
      Array.from({ length: COLS }, (_, x) => (x === 9 ? "." : "#")).join(""),
    );
    const state = playing({
      board,
      piece: { kind: "I", rotation: 1, x: 7, y: ROWS - 4 },
      score: 0,
      lines: 0,
    });
    const after = hardDrop(state);
    expect(after.lines).toBe(1);
    // The lone block was two rows off the floor; after one clear it rests on it.
    expect(after.board[ROWS - 1]![0]).not.toBeNull();
  });
});

describe("losing", () => {
  it("ends the game when a piece locks entirely in the hidden rows", () => {
    // LOCK OUT. The stack has reached the ceiling, so the piece never became visible.
    //
    // Column 9 is left open on purpose. A board of COMPLETE rows is a state the game
    // cannot reach -- rows clear the moment a piece locks -- and building one makes this
    // fail over the line-clear arithmetic rather than over the rule under test.
    // The locking piece is kept AWAY from the spawn columns, which took a mutation to
    // discover: with it at x=4 the next piece could not spawn either, so deleting the
    // lock-out rule entirely still ended the game -- by the other rule -- and the test
    // could not tell. Columns 0-1 top out while 3-5 stay clear.
    const board = emptyBoard();
    for (let x = 0; x < COLS - 1; x += 1) board[HIDDEN_ROWS]![x] = "I";
    const state = playing({
      board,
      piece: { kind: "O", rotation: 0, x: 0, y: 0 },
    });
    expect(
      dropDistance(state),
      "the piece must already be resting for this to be a lock-out",
    ).toBe(0);
    const after = hardDrop(state);
    expect(after.status).toBe("over");
    // And the discriminator: the spawn is clear, so nothing here is a block-out.
    expect(fits(after.board, { kind: "T", rotation: 0, x: 3, y: 0 })).toBe(
      true,
    );
    expect(after.lastEvent).toEqual({ type: "over", score: after.score });
  });

  it("ends the game when the NEXT piece cannot spawn, even though this one was visible", () => {
    // BLOCK OUT, and a separate rule from lock-out.
    //
    // Debris in the HIDDEN rows at the spawn columns is what blocks a spawn. Filling the
    // visible field does not -- the first draft of this test did that and reported the
    // game playable, because pieces spawn above the field entirely. The state is reachable:
    // a tall piece locking with cells in both halves leaves exactly this behind.
    const board = emptyBoard();
    for (let x = 3; x <= 5; x += 1) {
      board[0]![x] = "I";
      board[1]![x] = "I";
    }
    const state = playing({
      board,
      piece: { kind: "O", rotation: 0, x: 0, y: VISIBLE_ROWS },
    });
    expect(
      cellsOf(state.piece!).every(([, y]) => y >= HIDDEN_ROWS),
      "this test is meant to lock a VISIBLE piece, so it is not a lock-out",
    ).toBe(true);
    expect(hardDrop(state).status).toBe("over");
  });

  it("does not end the game merely because a block sits in a hidden row", () => {
    // The naive rule -- "over when something reaches the top" -- fires here, while the
    // player still has nine clear columns and every legal move.
    const board = emptyBoard();
    for (let y = 0; y < ROWS; y += 1) board[y]![0] = "I";
    const state = playing({
      board,
      piece: { kind: "O", rotation: 0, x: 4, y: 0 },
    });
    expect(hardDrop(state).status).toBe("playing");
  });
});

describe("gravity and lock delay", () => {
  const grounded = (): GameState =>
    playing({
      piece: { kind: "O", rotation: 0, x: 4, y: ROWS - 2 },
      gravityElapsedMs: 0,
    });

  it("does not lock the moment a piece lands", () => {
    // Immediate locking makes rotating against the floor impossible and feels like the
    // game snatching pieces away.
    const after = tick(grounded(), 100);
    expect(after.piece).not.toBeNull();
    expect(occupiedRows(after)).toBe(0);
  });

  it("locks once the delay has elapsed", () => {
    const after = tick(grounded(), 600);
    // Two rows, not one: an O piece is two tall and this one is resting on the floor.
    expect(occupiedRows(after)).toBe(2);
  });

  it("gives the player their time back when they move a resting piece", () => {
    let state = tick(grounded(), 400);
    state = moveLeft(state);
    // 400 + 200 would have locked it without the reset.
    state = tick(state, 200);
    expect(occupiedRows(state), "moving did not postpone the lock").toBe(0);
  });

  it("stops giving it back after a bounded number of nudges", () => {
    // Otherwise a player who keeps tapping never locks a piece, and the game stops
    // being a game.
    let state = grounded();
    for (let i = 0; i < 40; i += 1) {
      state = tick(state, 400);
      state = i % 2 === 0 ? moveLeft(state) : moveRight(state);
      if (occupiedRows(state) > 0) break;
    }
    expect(occupiedRows(state)).toBeGreaterThan(0);
  });

  it("cannot use soft drop to keep a grounded piece alive", () => {
    // The property, stated as the code actually achieves it. An earlier version of this
    // test asserted that soft drop does not reset the lock timer, which no mutation could
    // falsify -- a grounded piece has nowhere to drop to, so `softDrop` returns the state
    // untouched and the question never arises. What is worth asserting is the outcome:
    // pressing Down on a resting piece neither moves it nor buys it time.
    const resting = tick(grounded(), 400);
    const pressed = softDrop(resting);
    expect(pressed.piece).toEqual(resting.piece);
    expect(pressed.score, "soft drop paid for a row it did not fall").toBe(
      resting.score,
    );
    // Locking spawns the next piece, so `piece` stays populated -- the board is what shows
    // the old one came to rest.
    expect(
      occupiedRows(tick(pressed, 200)),
      "the lock was postponed",
    ).toBeGreaterThan(0);
  });

  it("restarts the fall cleanly when a piece is moved off its surface", () => {
    const board = boardOf("....##....");
    let state = playing({
      board,
      piece: { kind: "O", rotation: 0, x: 4, y: ROWS - 3 },
    });
    state = tick(state, 300);
    expect(state.lockElapsedMs).not.toBeNull();
    // Sliding off the ledge means the piece is airborne again, so the lock timer must go.
    state = moveLeft(moveLeft(state));
    state = tick(state, 10);
    expect(state.lockElapsedMs).toBeNull();
  });
});

describe("tick is frame-rate independent", () => {
  it("reaches the same board from 60fps and 30fps", () => {
    // The property that matters: difficulty must not depend on the monitor. Advancing by
    // at most one row per call -- the obvious implementation -- fails this.
    const run = (step: number, calls: number): GameState => {
      let state = playing({ piece: { kind: "O", rotation: 0, x: 4, y: 0 } });
      for (let i = 0; i < calls; i += 1) state = tick(state, step);
      return state;
    };
    const fast = run(1000 / 60, 60);
    const slow = run(1000 / 30, 30);
    expect(slow.piece!.y).toBe(fast.piece!.y);
    expect(slow.board).toEqual(fast.board);
  });

  it("applies several rows of fall in one call rather than at most one", () => {
    // At level 10 a row takes about 64ms, so half a second is several rows.
    //
    // Level 1 cannot demonstrate this and the first draft tried: its interval is 1000ms
    // and a single call is capped at 1000ms, so the test passed against a
    // one-row-per-call implementation -- the very thing it was meant to rule out.
    const state = playing({
      piece: { kind: "O", rotation: 0, x: 4, y: 0 },
      lines: 90,
    });
    const after = tick(state, 500);
    expect(after.piece!.y).toBe(Math.floor(500 / gravityIntervalMs(10)));
    expect(after.piece!.y).toBeGreaterThan(4);
  });

  it("ignores a nonsense elapsed time instead of poisoning the accumulator", () => {
    // `NaN >= interval` is false, so a bad value would fail silently and permanently.
    const state = playing({ piece: { kind: "O", rotation: 0, x: 4, y: 0 } });
    for (const bad of [NaN, Infinity, -Infinity, -16, 0]) {
      expect(tick(state, bad), `tick accepted ${bad}`).toBe(state);
    }
  });

  it("caps a single call so a stalled tab cannot drop a piece the whole board", () => {
    const state = playing({ piece: { kind: "O", rotation: 0, x: 4, y: 0 } });
    const after = tick(state, 5 * 60 * 1000);
    // The cap is 1000ms and level 1 falls a row per 1000ms, so one row -- not twenty.
    expect(after.piece!.y).toBe(1);
  });

  it("does nothing at all unless the game is playing", () => {
    for (const status of ["idle", "paused", "over"] as const) {
      const state = playing({ status });
      expect(tick(state, 5000), status).toBe(state);
    }
  });

  it("speeds up with the level and never reaches zero", () => {
    expect(gravityIntervalMs(1)).toBeGreaterThan(gravityIntervalMs(5));
    expect(gravityIntervalMs(5)).toBeGreaterThan(gravityIntervalMs(10));
    // A zero interval would spin the loop inside `tick`.
    expect(gravityIntervalMs(50)).toBeGreaterThanOrEqual(16);
  });
});

describe("the piece bag", () => {
  it("deals all seven kinds before repeating any", () => {
    // Seven independent draws would allow an S/Z flood with no I piece, which is
    // unplayable through no fault of the player.
    let state = start(createGame(7));
    const dealt: PieceKind[] = [state.piece!.kind, ...state.queue];
    while (dealt.length < 7) {
      state = hardDrop(state);
      if (state.status !== "playing") break;
      dealt.push(state.queue[state.queue.length - 1]!);
    }
    expect(new Set(dealt.slice(0, 7)).size).toBe(7);
  });

  it("deals the same sequence for the same seed and a different one otherwise", () => {
    const sequence = (seed: number) => {
      const game = start(createGame(seed));
      return [game.piece!.kind, ...game.queue].join("");
    };
    expect(sequence(42)).toBe(sequence(42));
    expect(sequence(42)).not.toBe(sequence(43));
  });
});

describe("the lifecycle", () => {
  it("moves nothing until the player starts it", () => {
    const idle = createGame(1);
    expect(idle.status).toBe("idle");
    expect(idle.piece).toBeNull();
    expect(tick(idle, 10_000)).toBe(idle);
  });

  it("pauses and resumes, and only from the state that makes sense", () => {
    const game = start(createGame(1));
    expect(pause(game).status).toBe("paused");
    expect(resume(pause(game)).status).toBe("playing");
    // Resuming something that is not paused must not start it.
    expect(resume(game)).toBe(game);
    expect(pause(createGame(1))).toStrictEqual(createGame(1));
  });

  it("treats one key as start, pause, resume and restart by status", () => {
    let state = createGame(1);
    state = togglePlay(state);
    expect(state.status).toBe("playing");
    state = togglePlay(state);
    expect(state.status).toBe("paused");
    state = togglePlay(state);
    expect(state.status).toBe("playing");
    state = togglePlay({ ...state, status: "over", score: 999 });
    expect(state.status).toBe("playing");
    expect(state.score, "a restart kept the old score").toBe(0);
  });

  it("clears the board on restart", () => {
    const board = boardOf("##########".replace("#", "."));
    const over = playing({ board, status: "over", lines: 5, score: 400 });
    const restarted = start(over);
    expect(restarted.lines).toBe(0);
    expect(occupiedRows(restarted)).toBe(0);
  });

  it("refuses to move a piece that is not in play", () => {
    for (const status of ["idle", "paused", "over"] as const) {
      const state = playing({ status });
      expect(moveLeft(state), status).toBe(state);
      expect(rotateCW(state), status).toBe(state);
      expect(softDrop(state), status).toBe(state);
      expect(hardDrop(state), status).toBe(state);
    }
  });
});

describe("drops and the ghost", () => {
  it("puts the ghost exactly where a hard drop would land", () => {
    // Derived from the same collision test as the drop, so the hint cannot disagree with
    // the outcome -- which is the bug a separately-computed ghost invites.
    const state = playing({
      board: boardOf("....##...."),
      piece: { kind: "T", rotation: 0, x: 3, y: 4 },
    });
    const ghost = ghostPiece(state)!;
    expect(ghost.y).toBe(state.piece!.y + dropDistance(state));
    expect(fits(state.board, ghost)).toBe(true);
    expect(fits(state.board, { ...ghost, y: ghost.y + 1 })).toBe(false);
  });

  it("pays two a row for a hard drop and one for a soft drop", () => {
    const state = playing({
      piece: { kind: "O", rotation: 0, x: 4, y: 0 },
      score: 0,
    });
    const distance = dropDistance(state);
    expect(hardDrop(state).score).toBe(distance * 2);
    expect(softDrop(state).score).toBe(1);
  });

  it("shows no ghost while the piece is still out of sight", () => {
    // A spawned piece is invisible for its first second, so a ghost then is an outline
    // hovering over the stack with nothing to explain it. Looked like a rendering fault in
    // a browser, which is where it was found rather than reasoned about.
    const state = playing({ piece: { kind: "T", rotation: 0, x: 3, y: 0 } });
    expect(
      cellsOf(state.piece!).every(([, y]) => y < HIDDEN_ROWS),
      "this test needs a piece that is entirely hidden",
    ).toBe(true);
    expect(ghostPiece(state)).toBeNull();

    // One row lower it has broken the surface, so the hint is useful and appears.
    const entering = playing({ piece: { kind: "T", rotation: 0, x: 3, y: 1 } });
    expect(ghostPiece(entering)).not.toBeNull();
  });

  it("gives every piece a colour, so the preview and the board agree", () => {
    // Shared with the canvas deliberately: a second list made every DOM preview cyan.
    const kinds: PieceKind[] = ["I", "J", "L", "O", "S", "T", "Z"];
    for (const kind of kinds) {
      expect(PIECE_COLOURS[kind], kind).toMatch(/^#[0-9a-f]{6}$/);
    }
    expect(
      new Set(Object.values(PIECE_COLOURS)).size,
      "two pieces share a colour",
    ).toBe(7);
  });

  it("hides the ghost when the game is not running", () => {
    expect(ghostPiece(playing({ status: "paused" }))).toBeNull();
    expect(ghostPiece(createGame(1))).toBeNull();
  });
});

describe("what the renderer is handed", () => {
  it("gives exactly the visible rows, not the hidden ones", () => {
    const grid = renderCells(playing());
    expect(grid).toHaveLength(VISIBLE_ROWS);
    expect(grid[0]).toHaveLength(COLS);
  });

  it("draws the solid piece over its own ghost where they overlap", () => {
    // A piece already resting sits on top of its ghost. Painting the ghost second would
    // show the player their own piece as a hint.
    const state = playing({
      piece: { kind: "O", rotation: 0, x: 4, y: ROWS - 2 },
    });
    const grid = renderCells(state);
    const row = grid[VISIBLE_ROWS - 1]!;
    expect(row[4]).toEqual({ kind: "O", ghost: false });
  });

  it("marks the ghost separately from the piece", () => {
    const state = playing({ piece: { kind: "T", rotation: 0, x: 3, y: 2 } });
    const flat = renderCells(state).flat();
    expect(flat.some((cell) => cell?.ghost === true)).toBe(true);
    expect(flat.some((cell) => cell?.ghost === false)).toBe(true);
  });

  it("shows no active piece before the game starts", () => {
    expect(
      renderCells(createGame(1))
        .flat()
        .every((cell) => cell === null),
    ).toBe(true);
  });

  it("describes a preview shape as a grid of filled cells", () => {
    // The T's spawn row is `.T.` over `TTT`, so exactly four cells are filled.
    expect(previewCells("T").flat().filter(Boolean)).toHaveLength(4);
    expect(previewCells("I").flat().filter(Boolean)).toHaveLength(4);
    expect(previewCells("O").flat().filter(Boolean)).toHaveLength(4);
  });
});
