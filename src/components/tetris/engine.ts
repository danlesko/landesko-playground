/**
 * The rules of the game, with no p5, no DOM and no clock.
 *
 * Split out from the renderer because the fish tank is not split and pays for it: its
 * tests need a recording p5 stub to reach any behaviour at all, so an assertion about
 * whether a fish turns around is expressed as an assertion about `translate` arguments.
 * Nothing here needs a stub. `sketch.ts` draws what these functions return and forwards
 * key presses back in; it owns no rules.
 *
 * Time arrives as a parameter for the same reason. `tick(state, elapsedMs)` cannot read a
 * clock, so a test can advance the game by exactly one gravity interval, and the game
 * cannot get easier on a 144Hz monitor.
 */

export const COLS = 10;

/** The 20 rows a player sees. */
export const VISIBLE_ROWS = 20;

/**
 * Two rows above the visible field that pieces spawn into.
 *
 * Not decoration -- a 20-row board cannot implement SRS correctly. Pieces spawn ABOVE the
 * playfield and gravity brings them in, so with no buffer every spawn, every rotation near
 * the ceiling and the top-out test itself becomes a negative-index special case. Two rows
 * is the least that holds a spawned piece completely, and it makes the two distinct losing
 * conditions expressible: see `blockOut` and `lockOut` below.
 *
 * "Game over when a block reaches the top row" -- the obvious rule -- is wrong, and the
 * reason is that it fires while the player still has legal moves.
 */
export const HIDDEN_ROWS = 2;

export const ROWS = VISIBLE_ROWS + HIDDEN_ROWS;

export type PieceKind = "I" | "J" | "L" | "O" | "S" | "T" | "Z";

export type Cell = PieceKind | null;

/**
 * Cyan for I, matching the site's accent, then the conventional Tetris palette.
 *
 * Here rather than in `sketch.ts` because the next-piece preview is DOM, not canvas, and a
 * separate list would let the preview disagree with the board about what a piece looks like
 * -- which was the case in the first draft: every preview was cyan.
 */
export const PIECE_COLOURS: Record<PieceKind, string> = {
  I: "#22d3ee",
  J: "#3b82f6",
  L: "#f97316",
  O: "#facc15",
  S: "#22c55e",
  T: "#a855f7",
  Z: "#ef4444",
};

export type Status = "idle" | "playing" | "paused" | "over";

export type Piece = {
  kind: PieceKind;
  /** 0, 1, 2, 3 -- clockwise from spawn. */
  rotation: number;
  /** Column of the piece box's left edge. May be negative once kicked. */
  x: number;
  /** Row of the piece box's top edge, counting the hidden rows. */
  y: number;
};

export type GameState = {
  /** `board[row][col]`, row 0 being the topmost HIDDEN row. */
  board: Cell[][];
  piece: Piece | null;
  queue: PieceKind[];
  bag: PieceKind[];
  seed: number;
  score: number;
  lines: number;
  status: Status;
  /** Time carried over from the last `tick` that did not complete a gravity step. */
  gravityElapsedMs: number;
  /** How long the piece has rested on a surface. Null when it is not resting. */
  lockElapsedMs: number | null;
  lockResets: number;
  /** Set by the last state-advancing call, for the renderer and the live region. */
  lastEvent: GameEvent | null;
};

export type GameEvent =
  | { type: "started" }
  | { type: "paused" }
  | { type: "resumed" }
  | { type: "locked"; cleared: number; score: number }
  | { type: "over"; score: number };

/**
 * The seven shapes, each in the bounding box SRS defines for it, as strings because a
 * wrong cell is visible here and invisible in a nested array of ones and zeroes.
 *
 * The box size is load-bearing, not stylistic: the kick tables below are expressed
 * relative to these origins, so putting `T` in a 4x4 box or `I` in a 3x3 would leave the
 * offsets referring to a different centre and every wall kick would land wrong.
 */
const SHAPES: Record<PieceKind, string[]> = {
  I: ["....", "IIII", "....", "...."],
  J: ["J..", "JJJ", "..."],
  L: ["..L", "LLL", "..."],
  O: ["OO", "OO"],
  S: [".SS", "SS.", "..."],
  T: [".T.", "TTT", "..."],
  Z: ["ZZ.", ".ZZ", "..."],
};

/**
 * Index access with the invariant stated.
 *
 * `noUncheckedIndexedAccess` is on, and every lookup below is provably in range -- four
 * rotations per piece, a board indexed after a bounds check, a bag that was just refilled.
 * The compiler cannot see any of that. A throw is preferable to `as` or `!`: those assert
 * the invariant and discard it, while this one turns a future violation into a named error
 * instead of an `undefined` that flows on and surfaces somewhere unrelated.
 */
const must = <T>(value: T | undefined, what: string): T => {
  if (value === undefined) throw new Error(`tetris: ${what} is missing`);
  return value;
};

/**
 * Turns the matrix a quarter clockwise. Iterates over ROWS to get the column count, which
 * is the same thing here because every shape box is square.
 */
const rotateMatrix = (cells: string[]): string[] =>
  cells.map((_, col) =>
    cells
      .map((row) => must(row[col], "shape cell"))
      .reverse()
      .join(""),
  );

/** All four rotations of every piece, computed once rather than rotated per call. */
const ROTATIONS: Record<PieceKind, string[][]> = Object.fromEntries(
  (Object.keys(SHAPES) as PieceKind[]).map((kind) => {
    const spawn = must(SHAPES[kind], kind);
    const states = [spawn];
    let previous = spawn;
    for (let i = 1; i < 4; i += 1) {
      previous = rotateMatrix(previous);
      states.push(previous);
    }
    return [kind, states];
  }),
) as Record<PieceKind, string[][]>;

/**
 * The offsets SRS tries, in order, when a rotation is blocked -- this is what makes a
 * piece slide out of a wall instead of refusing to turn.
 *
 * Written with y POSITIVE UP, matching every published table, and negated at the point of
 * use. Transcribing them pre-negated is the classic way to end up with kicks that work
 * against walls and fail against floors, because the errors only show in one axis.
 *
 * Keyed `from>to`. `O` is absent: it has no kicks, and its rotation is a no-op anyway.
 */
const KICKS: Record<string, ReadonlyArray<readonly [number, number]>> = {
  // J, L, S, T, Z
  "jlstz:0>1": [
    [0, 0],
    [-1, 0],
    [-1, 1],
    [0, -2],
    [-1, -2],
  ],
  "jlstz:1>0": [
    [0, 0],
    [1, 0],
    [1, -1],
    [0, 2],
    [1, 2],
  ],
  "jlstz:1>2": [
    [0, 0],
    [1, 0],
    [1, -1],
    [0, 2],
    [1, 2],
  ],
  "jlstz:2>1": [
    [0, 0],
    [-1, 0],
    [-1, 1],
    [0, -2],
    [-1, -2],
  ],
  "jlstz:2>3": [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, -2],
    [1, -2],
  ],
  "jlstz:3>2": [
    [0, 0],
    [-1, 0],
    [-1, -1],
    [0, 2],
    [-1, 2],
  ],
  "jlstz:3>0": [
    [0, 0],
    [-1, 0],
    [-1, -1],
    [0, 2],
    [-1, 2],
  ],
  "jlstz:0>3": [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, -2],
    [1, -2],
  ],
  // I has its own table entirely, because its centre of rotation sits between cells.
  "i:0>1": [
    [0, 0],
    [-2, 0],
    [1, 0],
    [-2, -1],
    [1, 2],
  ],
  "i:1>0": [
    [0, 0],
    [2, 0],
    [-1, 0],
    [2, 1],
    [-1, -2],
  ],
  "i:1>2": [
    [0, 0],
    [-1, 0],
    [2, 0],
    [-1, 2],
    [2, -1],
  ],
  "i:2>1": [
    [0, 0],
    [1, 0],
    [-2, 0],
    [1, -2],
    [-2, 1],
  ],
  "i:2>3": [
    [0, 0],
    [2, 0],
    [-1, 0],
    [2, 1],
    [-1, -2],
  ],
  "i:3>2": [
    [0, 0],
    [-2, 0],
    [1, 0],
    [-2, -1],
    [1, 2],
  ],
  "i:3>0": [
    [0, 0],
    [1, 0],
    [-2, 0],
    [1, -2],
    [-2, 1],
  ],
  "i:0>3": [
    [0, 0],
    [-1, 0],
    [2, 0],
    [-1, 2],
    [2, -1],
  ],
};

const LOCK_DELAY_MS = 500;

/**
 * How many times moving or rotating may postpone the lock.
 *
 * Without a bound, a player who keeps nudging a resting piece never locks it and the game
 * stops being a game. 15 is the guideline figure.
 */
const MAX_LOCK_RESETS = 15;

/**
 * Longest `elapsedMs` a single `tick` will act on.
 *
 * A fallback, not the mechanism: the host pauses on `visibilitychange`, so returning to a
 * backgrounded tab should not produce a large elapsed value at all. This exists because
 * "should not" is not "cannot" -- a long paint stall or a debugger pause would otherwise
 * drop a piece the full height of the board between two frames.
 */
const MAX_TICK_MS = 1000;

/**
 * Slack on the "is the next step due yet" comparisons, and it is load-bearing.
 *
 * Sixty calls of 1000/60 ms accumulate to 999.9999999999991, not 1000 -- so without this
 * a 60Hz display did NOT drop a piece that a 30Hz display did, purely because binary
 * floating point cannot represent 1/60 of a second. Measured: y=0 against y=1 after the
 * same elapsed second.
 *
 * A PICOSECOND -- 1e-9 of a millisecond, which an earlier version of this comment called a
 * nanosecond and was wrong by three orders of magnitude. It is far below anything the game
 * can express and still a thousand times larger than the representation error, so it removes
 * that class of "one frame late" without changing any behaviour a player could observe.
 * Exact float equality across different step sizes is not achievable -- addition is not
 * associative -- so the alternative is not a stricter engine but a weaker test.
 */
const DUE_EPSILON_MS = 1e-9;

export const emptyBoard = (): Cell[][] =>
  Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => null));

/**
 * A seeded generator, so a test can name the exact pieces it will be dealt.
 *
 * mulberry32. The requirement is reproducibility, not statistical quality -- the shuffle
 * below only has to be unbiased enough that a bag feels random.
 */
const nextRandom = (seed: number): { value: number; seed: number } => {
  const next = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(next ^ (next >>> 15), next | 1);
  t = (t + Math.imul(t ^ (t >>> 7), t | 61)) ^ t;
  return { value: ((t ^ (t >>> 14)) >>> 0) / 4294967296, seed: next };
};

export const cellsOf = (piece: Piece): Array<[number, number]> => {
  const matrix = must(
    must(ROTATIONS[piece.kind], piece.kind)[piece.rotation],
    `${piece.kind} rotation ${piece.rotation}`,
  );
  const cells: Array<[number, number]> = [];
  matrix.forEach((row, dy) => {
    row.split("").forEach((char, dx) => {
      if (char !== ".") cells.push([piece.x + dx, piece.y + dy]);
    });
  });
  return cells;
};

/**
 * Whether a piece may occupy its current position.
 *
 * A row above the board counts as a COLLISION, and the first version had this the other way
 * round -- it let cells sit at negative rows on the reasoning that pieces spawn up there.
 * They do not: every spawn puts its cells in rows 0 and 1, inside the hidden buffer, which
 * is measurable rather than arguable. Nothing legal is ever above row 0.
 *
 * Allowing it was a quiet data-loss bug rather than a harmless permission. An SRS kick can
 * lift a piece two rows (`[0, 2]` in a y-up table), so near the ceiling a rotation could
 * place cells at y = -2; `lockPiece` then writes only the cells with `y >= 0` and DISCARDS
 * the rest, and because the remaining cells reached the visible field it was not a lock-out
 * either -- so play continued with part of a tetromino simply gone.
 *
 * Refusing the position instead means such a rotation fails that kick candidate and tries
 * the next, which is the correct behaviour anyway: you cannot rotate into the ceiling.
 */
export const fits = (board: Cell[][], piece: Piece): boolean =>
  cellsOf(piece).every(([x, y]) => {
    if (x < 0 || x >= COLS || y < 0 || y >= ROWS) return false;
    return must(board[y], `row ${y}`)[x] === null;
  });

const ALL_KINDS: PieceKind[] = ["I", "J", "L", "O", "S", "T", "Z"];

/**
 * A refilled seven-bag: every piece once, shuffled.
 *
 * Not seven independent random draws, which is what "random pieces" naively means and
 * which produces long droughts -- an S/Z flood with no I piece is unplayable through no
 * fault of the player. A bag bounds the gap between two of the same piece.
 */
const refillBag = (seed: number): { bag: PieceKind[]; seed: number } => {
  const bag = [...ALL_KINDS];
  let s = seed;
  // Fisher-Yates, downwards, so each position is chosen once.
  for (let i = bag.length - 1; i > 0; i -= 1) {
    const r = nextRandom(s);
    s = r.seed;
    const j = Math.floor(r.value * (i + 1));
    const a = must(bag[i], `bag ${i}`);
    const b = must(bag[j], `bag ${j}`);
    bag[i] = b;
    bag[j] = a;
  }
  return { bag, seed: s };
};

/** Takes the next kind, refilling the bag when it runs dry. */
const drawKind = (
  bag: PieceKind[],
  seed: number,
): { kind: PieceKind; bag: PieceKind[]; seed: number } => {
  let source = bag;
  let s = seed;
  if (source.length === 0) {
    const refilled = refillBag(s);
    source = refilled.bag;
    s = refilled.seed;
  }
  const [first, ...rest] = source;
  return { kind: must(first, "bag head"), bag: rest, seed: s };
};

/**
 * Where a piece enters the board.
 *
 * `y: 0` puts the piece box's top row at the top HIDDEN row, so a spawned piece sits
 * entirely above the visible field and gravity carries it in -- which is what SRS
 * specifies and what makes the two losing conditions distinguishable.
 *
 * The x values centre each piece over the board: a 3-wide box starts at column 3, `I`'s
 * 4-wide box also at 3, and `O`'s 2-wide box at 4.
 */
const spawnPiece = (kind: PieceKind): Piece => ({
  kind,
  rotation: 0,
  x: kind === "O" ? 4 : 3,
  y: 0,
});

export const gravityIntervalMs = (level: number): number => {
  // The guideline curve: a level-1 piece falls a row per 0.8s, level 10 about ten times
  // faster. Clamped rather than allowed to reach zero, because a zero interval would make
  // the `while` loop in `tick` spin as long as the piece can keep falling.
  const seconds = Math.pow(0.8 - (level - 1) * 0.007, level - 1);
  return Math.max(16, seconds * 1000);
};

export const levelOf = (lines: number): number => Math.floor(lines / 10) + 1;

export const createGame = (seed = 1): GameState => {
  const first = refillBag(seed);
  const draw = drawKind(first.bag, first.seed);
  const second = drawKind(draw.bag, draw.seed);
  return {
    board: emptyBoard(),
    // No active piece until the player starts. Nothing about this game moves on its own
    // before then -- see the note on `start`.
    piece: null,
    queue: [draw.kind, second.kind],
    bag: second.bag,
    seed: second.seed,
    score: 0,
    lines: 0,
    status: "idle",
    gravityElapsedMs: 0,
    lockElapsedMs: null,
    lockResets: 0,
    lastEvent: null,
  };
};

/**
 * Begins play, from `idle` or from `over`.
 *
 * Starting from `over` is a restart rather than a separate operation, because the two
 * would be the same code and a player pressing Enter after a loss means the same thing
 * either way. The seed carries forward from the finished game, so a restart deals a
 * different sequence.
 */
export const start = (state: GameState): GameState => {
  if (state.status === "playing" || state.status === "paused") return state;
  const fresh = createGame(state.seed);
  const [first, ...queue] = fresh.queue;
  const kind = must(first, "queue head");
  return {
    ...fresh,
    piece: spawnPiece(kind),
    queue: [...queue],
    status: "playing",
    lastEvent: { type: "started" },
  };
};

export const pause = (state: GameState): GameState =>
  state.status === "playing"
    ? { ...state, status: "paused", lastEvent: { type: "paused" } }
    : state;

export const resume = (state: GameState): GameState =>
  state.status === "paused"
    ? { ...state, status: "playing", lastEvent: { type: "resumed" } }
    : state;

/**
 * The one entry point a key handler needs for Enter, so the mapping from key to meaning
 * does not get duplicated in the host and in a test.
 */
export const togglePlay = (state: GameState): GameState => {
  if (state.status === "playing") return pause(state);
  if (state.status === "paused") return resume(state);
  return start(state);
};

/**
 * Replaces the active piece if the new position is legal, and resets the lock timer if it
 * was running.
 *
 * The reset is why moving and rotating go through here rather than assigning `piece`: a
 * piece resting on a surface should get its 500ms again when the player nudges it, up to
 * the reset cap. Skipping that is what makes a game feel like it snatches pieces away.
 */
const tryReplace = (state: GameState, next: Piece): GameState => {
  if (!fits(state.board, next)) return state;

  // Grounded is decided GEOMETRICALLY, from where the piece now is, rather than from
  // whether a tick has already noticed it landed. The difference is small but real: keyed
  // off the timer, inputs made between landing and the next frame reset nothing and were
  // free, while inputs made just after sliding off a ledge still spent a reset.
  const grounded = !fits(state.board, { ...next, y: next.y + 1 });
  if (!grounded) return { ...state, piece: next, lockElapsedMs: null };

  const resting = state.lockElapsedMs;
  // Landing for the first time starts the clock and costs nothing. Only a move made while
  // ALREADY resting spends one of the postponements.
  if (resting === null) return { ...state, piece: next, lockElapsedMs: 0 };
  const canReset = state.lockResets < MAX_LOCK_RESETS;
  return {
    ...state,
    piece: next,
    lockElapsedMs: canReset ? 0 : resting,
    lockResets: canReset ? state.lockResets + 1 : state.lockResets,
  };
};

const movable = (state: GameState): boolean =>
  state.status === "playing" && state.piece !== null;

export const moveLeft = (state: GameState): GameState =>
  movable(state)
    ? tryReplace(state, { ...state.piece!, x: state.piece!.x - 1 })
    : state;

export const moveRight = (state: GameState): GameState =>
  movable(state)
    ? tryReplace(state, { ...state.piece!, x: state.piece!.x + 1 })
    : state;

const rotate = (state: GameState, delta: number): GameState => {
  if (!movable(state)) return state;
  const piece = state.piece!;
  // `O` has no kick table and no visible rotation, so turning it is a no-op rather than a
  // special case threaded through the offsets below.
  if (piece.kind === "O") return state;
  const to = (piece.rotation + delta + 4) % 4;
  const key = `${piece.kind === "I" ? "i" : "jlstz"}:${piece.rotation}>${to}`;
  const table = must(KICKS[key], key);
  for (const [dx, dy] of table) {
    // `-dy`: the tables are written y-up, the board is y-down.
    const candidate = {
      ...piece,
      rotation: to,
      x: piece.x + dx,
      y: piece.y - dy,
    };
    if (fits(state.board, candidate)) return tryReplace(state, candidate);
  }
  // Every offset blocked. Returning the state unchanged is correct, and is also the
  // failure mode that looks like "rotation is broken" when the kick table is wrong --
  // which is why the tests assert a specific kicked POSITION, not merely that something
  // changed.
  return state;
};

export const rotateCW = (state: GameState): GameState => rotate(state, 1);
export const rotateCCW = (state: GameState): GameState => rotate(state, -1);

/** Where the active piece would come to rest. Drives the ghost and the hard drop. */
export const dropDistance = (state: GameState): number => {
  if (state.piece === null) return 0;
  let distance = 0;
  while (
    fits(state.board, { ...state.piece, y: state.piece.y + distance + 1 })
  ) {
    distance += 1;
  }
  return distance;
};

/**
 * Where the active piece would land, or null when there is nothing to hint at.
 *
 * Withheld while the piece is still entirely in the hidden rows, which is not fussiness --
 * it looked like a rendering fault. A freshly spawned piece is invisible for its first
 * second, so the board showed an outline hovering over the stack with no piece anywhere to
 * explain it. Seen in a browser, not reasoned about.
 */
export const ghostPiece = (state: GameState): Piece | null => {
  if (state.piece === null || state.status !== "playing") return null;
  const visible = cellsOf(state.piece).some(([, y]) => y >= HIDDEN_ROWS);
  if (!visible) return null;
  return { ...state.piece, y: state.piece.y + dropDistance(state) };
};

const LINE_SCORES = [0, 100, 300, 500, 800];

/**
 * Writes the piece into the board, clears full rows, scores them and spawns the next.
 *
 * The two ways to lose both live here, and they are genuinely different rules:
 *
 *   - LOCK OUT: the piece just locked entirely within the hidden rows. It never became
 *     visible, so the stack has reached the ceiling.
 *   - BLOCK OUT: the NEXT piece does not fit where it spawns.
 *
 * Only checking one of them is the usual mistake. Lock-out alone misses a stack that
 * leaves the spawn columns blocked while the edges are low; block-out alone lets the
 * player keep stacking into the hidden rows as long as the middle stays clear.
 */
const lockPiece = (state: GameState): GameState => {
  const piece = state.piece!;
  const board = state.board.map((row) => [...row]);
  for (const [x, y] of cellsOf(piece)) {
    if (y >= 0) must(board[y], `row ${y}`)[x] = piece.kind;
  }

  const lockedOut = cellsOf(piece).every(([, y]) => y < HIDDEN_ROWS);

  const kept = board.filter((row) => row.some((cell) => cell === null));
  const cleared = ROWS - kept.length;
  while (kept.length < ROWS) {
    kept.unshift(Array.from({ length: COLS }, () => null));
  }

  const lines = state.lines + cleared;
  const score =
    state.score +
    must(LINE_SCORES[cleared], `${cleared} lines`) * levelOf(state.lines);

  if (lockedOut) {
    return {
      ...state,
      board: kept,
      piece: null,
      lines,
      score,
      status: "over",
      lastEvent: { type: "over", score },
    };
  }

  const [nextKind, ...restQueue] = state.queue;
  const draw = drawKind(state.bag, state.seed);
  const entering = spawnPiece(must(nextKind, "queue head"));

  const base: GameState = {
    ...state,
    board: kept,
    lines,
    score,
    queue: [...restQueue, draw.kind],
    bag: draw.bag,
    seed: draw.seed,
    gravityElapsedMs: 0,
    lockElapsedMs: null,
    // Per piece, not per game: the next piece gets its own budget of postponements.
    lockResets: 0,
  };

  if (!fits(kept, entering)) {
    return {
      ...base,
      piece: null,
      status: "over",
      lastEvent: { type: "over", score },
    };
  }

  return {
    ...base,
    piece: entering,
    lastEvent: { type: "locked", cleared, score },
  };
};

/**
 * Down one row for one point, WITHOUT resetting the lock timer.
 *
 * Not routed through `tryReplace` for exactly that reason. Letting a soft drop reset the
 * timer means holding Down keeps a grounded piece alive indefinitely, which is the
 * opposite of what the key is for.
 */
export const softDrop = (state: GameState): GameState => {
  if (!movable(state)) return state;
  const next = { ...state.piece!, y: state.piece!.y + 1 };
  if (!fits(state.board, next)) return state;
  return { ...state, piece: next, score: state.score + 1, gravityElapsedMs: 0 };
};

/** Straight down, two points a row, and locks at once -- lock delay does not apply. */
export const hardDrop = (state: GameState): GameState => {
  if (!movable(state)) return state;
  const distance = dropDistance(state);
  const dropped: GameState = {
    ...state,
    piece: { ...state.piece!, y: state.piece!.y + distance },
    score: state.score + distance * 2,
  };
  return lockPiece(dropped);
};

/**
 * Advances the game by `elapsedMs`.
 *
 * Consumes the whole interval -- up to `MAX_TICK_MS`, which is the one exception -- rather
 * than at most one step, so a slow frame drops a piece as far as it should have fallen
 * instead of silently making the game easier. The
 * remainder is carried in `gravityElapsedMs`, which is what keeps behaviour independent of
 * frame rate: 60 calls of 16ms and 30 calls of 33ms produce the same board.
 *
 * Rejects nonsense rather than propagating it. A non-finite or negative `elapsedMs` -- a
 * `deltaTime` read before p5's first frame, say -- would otherwise poison the accumulator
 * for the rest of the game, and `NaN >= interval` is false, so it would fail silently.
 */
export const tick = (state: GameState, elapsedMs: number): GameState => {
  if (state.status !== "playing" || state.piece === null) return state;
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return state;

  let remaining = Math.min(elapsedMs, MAX_TICK_MS);
  let current = state;

  while (
    remaining > 0 &&
    current.status === "playing" &&
    current.piece !== null
  ) {
    const grounded = !fits(current.board, {
      ...current.piece,
      y: current.piece.y + 1,
    });

    if (grounded) {
      const resting = current.lockElapsedMs ?? 0;
      const untilLock = LOCK_DELAY_MS - resting;
      if (remaining + DUE_EPSILON_MS >= untilLock) {
        remaining -= untilLock;
        current = lockPiece(current);
      } else {
        current = { ...current, lockElapsedMs: resting + remaining };
        remaining = 0;
      }
      continue;
    }

    // Airborne, so any lock timer belongs to a surface the piece has left.
    const airborne =
      current.lockElapsedMs === null
        ? current
        : { ...current, lockElapsedMs: null };
    const interval = gravityIntervalMs(levelOf(airborne.lines));
    const untilDrop = interval - airborne.gravityElapsedMs;
    if (remaining + DUE_EPSILON_MS >= untilDrop) {
      remaining -= untilDrop;
      current = {
        ...airborne,
        piece: { ...airborne.piece!, y: airborne.piece!.y + 1 },
        gravityElapsedMs: 0,
      };
    } else {
      current = {
        ...airborne,
        gravityElapsedMs: airborne.gravityElapsedMs + remaining,
      };
      remaining = 0;
    }
  }

  return current;
};

export type RenderCell = { kind: PieceKind; ghost: boolean } | null;

/**
 * The 20 visible rows with the active piece and its ghost composed in, so the renderer
 * draws a grid and owns no rules.
 *
 * The ghost goes down first: where the two overlap -- a piece already at rest, or one
 * pushed against the floor -- the solid piece must win, or the player sees their own piece
 * rendered as a hint.
 */
export const renderCells = (state: GameState): RenderCell[][] => {
  const grid: RenderCell[][] = state.board
    .slice(HIDDEN_ROWS)
    .map((row) =>
      row.map((cell) => (cell ? { kind: cell, ghost: false } : null)),
    );

  const place = (piece: Piece | null, ghost: boolean) => {
    if (!piece) return;
    for (const [x, y] of cellsOf(piece)) {
      const row = y - HIDDEN_ROWS;
      if (row >= 0 && row < VISIBLE_ROWS)
        must(grid[row], `row ${row}`)[x] = { kind: piece.kind, ghost };
    }
  };

  place(ghostPiece(state), true);
  place(state.status === "playing" ? state.piece : null, false);
  return grid;
};

/** The shape of a queued piece, for the preview. */
/**
 * The spawn shape as a boolean grid, TRIMMED of empty rows and columns.
 *
 * Trimmed because the raw matrices are different sizes for reasons that have nothing to do
 * with how a piece looks: `I` lives in a 4x4 box with one filled row, `O` in a 2x2, and the
 * rest in a 3x3 with an empty bottom row. Rendered directly, the preview's footprint changed
 * with every piece, and since it sits in the score row that nudged the whole page as the queue
 * advanced.
 *
 * Trimming makes the widths 4, 3 and 2 and the heights 1 or 2 -- still not uniform, which is
 * why the CALLER draws this centred inside a fixed box rather than relying on the grid itself
 * to be a constant size. Padding to a fixed 4x4 here would have been the other option and
 * looks worse: a 3-wide piece cannot be centred in 4 columns without a half-cell offset.
 */
export const previewCells = (kind: PieceKind): boolean[][] => {
  const rows = must(must(ROTATIONS[kind], kind)[0], `${kind} spawn`).map(
    (row) => row.split("").map((char) => char !== "."),
  );
  const width = rows[0]?.length ?? 0;
  const usedColumn = (x: number) => rows.some((row) => row[x] === true);
  const columns = Array.from({ length: width }, (_, x) => x).filter(usedColumn);
  return rows
    .filter((row) => row.some(Boolean))
    .map((row) => columns.map((x) => row[x] === true));
};
