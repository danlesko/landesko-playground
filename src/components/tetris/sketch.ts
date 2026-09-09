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
 * Extra rows' worth of height left for everything that is not the board.
 *
 * In cells rather than pixels so it scales with the board, instead of a magic 300px that is
 * generous on a phone and mean on a desktop. Five keeps a 20-row board at about four fifths
 * of the viewport height, which leaves the heading and the score visible without scrolling
 * on a laptop.
 */
const VERTICAL_GUTTER_CELLS = 5;

export function createTetrisSketch(
  wrapperRef: RefObject<HTMLDivElement | null>,
  controller: Controller,
) {
  return function sketch(p5: P5CanvasInstance) {
    let cell = 24;

    /**
     * Sizes the CELL, not the canvas, and takes the smaller of what width and height allow.
     *
     * A Tetris board is 1:2, so a width-led rule -- which is what the fish tank uses, and
     * correctly, for a landscape scene -- produces a board twice as tall as the column is
     * wide and pushes the score off the screen on any laptop. Height has to participate.
     *
     * `innerHeight` rather than a `vh` unit for the same reason `dvh` exists: on mobile the
     * visible viewport shrinks when browser chrome appears, and `innerHeight` already
     * reports the live value.
     */
    const measureCell = () => {
      // The ref must be on a BLOCK-level element whose width does not come from the canvas.
      // Measured the hard way: with it on the focusable `inline-block` wrapper, that
      // element's width was derived from the canvas inside it, so the canvas was sized from
      // itself and settled at the 8px floor -- an 82x162 board on a 1280x900 viewport. Same
      // circularity as sizing an image from a box the image is sizing.
      const available = wrapperRef.current?.clientWidth ?? 0;
      // Less the two pixels of border the canvas adds below, or a 280px box produces a
      // 282px canvas and the board overhangs its container by exactly the frame.
      const fromWidth = available > 0 ? (available - 2) / COLS : Infinity;
      const fromHeight =
        p5.windowHeight / (VISIBLE_ROWS + VERTICAL_GUTTER_CELLS);
      // Floored so cell boundaries land on whole pixels and the grid does not shimmer. The
      // lower bound keeps the board usable on a short landscape phone instead of letting it
      // collapse; the page scrolls rather than the board disappearing.
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
