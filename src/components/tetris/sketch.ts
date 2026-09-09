import type { RefObject } from "react";
import type { P5CanvasInstance } from "react-p5-wrapper";

import { COLS, PIECE_COLOURS, VISIBLE_ROWS, renderCells } from "./engine";
import type { Controller } from "./controller";

/**
 * Draws the board. Owns no rules and no input.
 *
 * Every frame is `renderCells(state)` painted as a grid, so there is nothing here to get
 * wrong about collision, scoring or rotation -- those are decided in `engine.ts` and tested
 * without a canvas. The one judgement this file makes is how big a cell should be.
 *
 * There is no `prefersReducedMotion` parameter, which is a deliberate difference from the
 * fish tank rather than an omission. That sketch takes one because it animates continuously
 * whether or not anyone asked, so the preference has something to withdraw. This one has
 * nothing: the board is still until the player starts it, a piece moves only when gravity or
 * a key moves it, and there is no flash, easing or particle anywhere -- the ghost is a flat
 * outline and a line clear is instant. Honouring the preference by freezing a game the
 * player deliberately started would just break it.
 *
 * A first draft did take the flag and used it to change an overlay's opacity by a few
 * percent, which dressed up "we handle reduced motion" as a feature while doing nothing a
 * reader would notice -- and, because the value was captured once, would not have tracked a
 * change anyway.
 */

const GRID = "#1e293b";
const EMPTY = "#0f172a";
const BORDER = "#334155";

/**
 * Height NOT given to the board: the flex gap under it, plus slack so the whole game can be
 * framed on one screen without the reader landing a scroll to the pixel.
 *
 * A constant is right here, unlike the height of the furniture itself, which is measured --
 * an earlier version reserved five rows' worth of height for the furniture as a whole, a
 * guess dressed up as arithmetic that neither knew nor tracked what was below the board.
 *
 * The VALUE was measured rather than chosen. At 24 this was quietly almost nothing: the
 * `gap-4` between the board and the furniture is already 16 of it, so the real slack was
 * 8px, and scrolling the board into view on a 390x844 phone put the control buttons at
 * y=847 -- three pixels below the fold, unreachable without scrolling again. Every viewport
 * tested had the same fault. 64 leaves 40-64px, which survives an ordinary scroll.
 *
 * It costs board size, and that is the trade: 352px wide on that phone against 332px, or
 * 90% of the viewport against 85%. Filling the screen and having the controls on it are
 * competing goals, and controls that cannot be reached are worse than a slightly smaller
 * board.
 */
const BOARD_MARGIN_PX = 64;

export function createTetrisSketch(
  wrapperRef: RefObject<HTMLDivElement | null>,
  furnitureRef: RefObject<HTMLDivElement | null>,
  controller: Controller,
) {
  return function sketch(p5: P5CanvasInstance) {
    let cell = 24;

    /**
     * Sizes the CELL, not the canvas, and takes the smaller of what width and height allow.
     *
     * A Tetris board is 1:2, so a width-led rule -- which is what the fish tank uses, and
     * correctly, for a landscape scene -- produces a board twice as tall as the column is
     * wide and pushes the score off the screen on any laptop. Height has to participate, and
     * on a phone it is the binding constraint rather than a safety net.
     *
     * `innerHeight` rather than a `vh` unit for the same reason `dvh` exists: on mobile the
     * visible viewport shrinks when browser chrome appears, and `innerHeight` already
     * reports the live value.
     */
    const measureCell = () => {
      // Both refs must be on BLOCK-level elements whose size does not come from the canvas.
      // Measured the hard way for the width: with that ref on the focusable `inline-block`
      // wrapper, the element's width was derived from the canvas inside it, so the canvas
      // was sized from itself and settled at its floor -- an 82x162 board on a 1280x900
      // viewport. The furniture is safe to measure for the opposite reason: a score, five
      // buttons and a paragraph are the same height whatever the board does.
      const available = wrapperRef.current?.clientWidth ?? 0;
      // Less the two pixels of border the canvas adds below, or a 280px box produces a
      // 282px canvas and the board overhangs its container by exactly the frame.
      const fromWidth = available > 0 ? (available - 2) / COLS : Infinity;

      // The height the board may have is the viewport less what sits under it. This is why
      // "fill the screen on a phone" resolves to a HEIGHT question and not a width one: a
      // 10x20 board is 1:2, so at any phone width the height runs out first, and the way to
      // make the board bigger is to give the furniture less -- which is why the keyboard
      // instructions are `sr-only` below `sm`.
      const furniture = furnitureRef.current?.offsetHeight ?? 0;
      const spare = p5.windowHeight - furniture - BOARD_MARGIN_PX;
      const fromHeight = (spare - 2) / VISIBLE_ROWS;

      // Floored so cell boundaries land on whole pixels and the grid does not shimmer. The
      // lower bound keeps the board usable in a very short window instead of letting it
      // collapse to nothing; the page scrolls rather than the board disappearing.
      return Math.max(10, Math.floor(Math.min(fromWidth, fromHeight)));
    };

    const boardWidth = () => COLS * cell;
    const boardHeight = () => VISIBLE_ROWS * cell;

    const applySize = () => {
      cell = measureCell();
      p5.resizeCanvas(boardWidth() + 2, boardHeight() + 2);
    };

    p5.setup = () => {
      cell = measureCell();
      p5.createCanvas(boardWidth() + 2, boardHeight() + 2);
      p5.noStroke();
    };

    p5.windowResized = () => {
      applySize();
    };

    /**
     * Redraws every frame and advances gravity by p5's own frame delta.
     *
     * Runs unconditionally: see the note at the top of this file for why there is no
     * reduced-motion branch. A line-clear flash is absent regardless of any preference,
     * because photosensitivity is not something `prefers-reduced-motion` reliably reports.
     */
    p5.draw = () => {
      controller.advance(p5.deltaTime);
      const state = controller.state();

      p5.background(EMPTY);
      p5.stroke(BORDER);
      p5.noFill();
      p5.rect(0.5, 0.5, boardWidth() + 1, boardHeight() + 1);
      p5.noStroke();

      const grid = renderCells(state);
      for (let row = 0; row < VISIBLE_ROWS; row += 1) {
        for (let col = 0; col < COLS; col += 1) {
          const value = grid[row]?.[col] ?? null;
          const x = 1 + col * cell;
          const y = 1 + row * cell;
          if (value === null) {
            // A faint lattice, so the player can count columns without it competing with
            // the pieces.
            p5.fill(GRID);
            p5.rect(x, y, cell - 1, cell - 1);
            continue;
          }
          const colour = PIECE_COLOURS[value.kind];
          if (value.ghost) {
            // An outline, not a tinted fill: a translucent block reads as a real piece at
            // small cell sizes, which is worse than no hint at all.
            p5.noFill();
            p5.stroke(colour);
            p5.strokeWeight(1);
            p5.rect(x + 1.5, y + 1.5, cell - 4, cell - 4);
            p5.noStroke();
            continue;
          }
          p5.fill(colour);
          p5.rect(x, y, cell - 1, cell - 1);
        }
      }

      // Idle, paused and finished states are told in the DOM rather than painted here, so
      // a screen reader gets them too. The canvas only dims to show it is not live.
      if (state.status !== "playing") {
        p5.fill(15, 23, 42, 170);
        p5.rect(1, 1, boardWidth(), boardHeight());
      }
    };
  };
}
