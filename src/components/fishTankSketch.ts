import type { RefObject } from "react";
import type { P5CanvasInstance } from "react-p5-wrapper";

/**
 * What `p5.color()` hands back. Deliberately `unknown` and not a real colour
 * type: p5 1.11.8 ships no type declarations at all — not one `.d.ts` in the
 * package, no `types`/`typings` field, and `@types/p5` is not installed — so
 * under `skipLibCheck` the p5 half of `P5CanvasInstance` degrades to `any` and
 * there is no `Color` to import. `unknown` is as precise as this codebase can
 * honestly be, and it is strictly better than the `any` it replaces: these
 * values are only ever aliased and forwarded to `p5.fill()`, never inspected,
 * indexed or mutated, so nothing needs the real type today.
 *
 * Be aware of *why* `unknown` is accepted at those `fill()` calls: only because
 * `fill` is reached through an `any` receiver. Adding `@types/p5` would make
 * these params start failing there, which is the correct outcome — that is the
 * point at which to change them to `p5.Color`.
 */
type P5Color = unknown;

/**
 * The wrapper element is a parameter rather than something the sketch finds for
 * itself because `measureAvailableWidth` sizes the canvas from its container,
 * and the container is owned by React. Passing the ref keeps that one DOM
 * dependency explicit instead of hiding a `document.querySelector` in here.
 *
 * `prefersReducedMotion` is a parameter for the same reason: reading
 * `matchMedia` in here would tie the sketch to a browser global and make it
 * unrunnable in the test suite, which has no DOM. The caller reads the query
 * and passes the answer in.
 */
export function createFishTankSketch(
  wrapperRef: RefObject<HTMLDivElement | null>,
  prefersReducedMotion = false,
) {
  return function sketch(p5: P5CanvasInstance) {
    const baseWidth = 1180;
    const baseHeight = 735;
    const aspectRatio = baseWidth / baseHeight;
    let scaleFactor = 1;

    // Typed as non-empty so grassColors[0] is a usable fallback colour rather
    // than `string | undefined`. Still a mutable array, which p5.random needs.
    const grassColors: [string, ...string[]] = [
      "#228B22",
      "#32CD32",
      "#7CFC00",
      "#ADFF2F",
    ];
    const bladeColors: string[] = [];
    const bladeHeights: number[] = [];

    p5.windowResized = () => {
      p5.setup();

      // setup() creates a fresh, blank canvas. With the draw loop stopped
      // nothing would ever repaint it, so the still frame has to be reissued by
      // hand or a resize leaves an empty tank.
      if (prefersReducedMotion) {
        p5.redraw();
      }
    };

    p5.setup = () => {
      const { canvasWidth, canvasHeight } = updateCanvasDimensions();
      p5.createCanvas(canvasWidth, canvasHeight);
      scaleFactor = baseWidth / canvasWidth;

      // windowResized re-runs setup, so the blade arrays have to be reset here.
      // Without this they gain a whole canvas worth of entries every time the
      // window changes size, and are never released for as long as the page is
      // open.
      bladeColors.length = 0;
      bladeHeights.length = 0;

      p5.pixelDensity(window.devicePixelRatio);
      p5.strokeWeight(1);

      const bladeWidth = 5;
      const spacing = 3;
      for (let x = 0; x < p5.width; x += bladeWidth + spacing) {
        // Randomly pick one of the colors for the grass and store it
        bladeColors.push(p5.random(grassColors));

        const randomHeight =
          scaleFactor < 2.5 ? p5.random(200, 400) : p5.random(120, 200); // Example range: 30 to 70 pixels
        bladeHeights.push(randomHeight);
      }

      // p5 draws one frame after setup even when looping is off, so this yields
      // a still of the tank rather than nothing. The fish start off-canvas and
      // only swim into shot after a few hundred frames, so that one frame has to
      // be given positions where they are actually visible.
      if (prefersReducedMotion) {
        restFishInView(p5.width);
        p5.noLoop();
      }
    };

    // p5.windowWidth is the whole viewport, but from `lg` up the canvas only
    // has the viewport minus the 250px sidebar and <main>'s 32px of padding.
    // Sizing from the viewport made the canvas overrun <main>, and because
    // <main> is a flexbox child whose min-width defaults to auto it widened to
    // fit rather than clip, pushing the page 232px past the viewport. So
    // measure the box the canvas is actually in, and measure it with the canvas
    // itself out of layout: otherwise an already-oversized canvas widens the
    // very box being measured, and keeps its own bad size when the window
    // narrows.
    //
    // The local is `wrapper`, not the obvious alternative: Tailwind scans this
    // file for class names and that word is a utility, so naming it that emits
    // a dead rule into the stylesheet (see #50).
    const measureAvailableWidth = () => {
      const wrapper = wrapperRef.current;
      if (!wrapper) {
        return p5.windowWidth;
      }

      const canvas = wrapper.querySelector("canvas");
      if (!canvas) {
        return wrapper.clientWidth;
      }

      const previousDisplay = canvas.style.display;
      canvas.style.display = "none";
      const availableWidth = wrapper.clientWidth;
      canvas.style.display = previousDisplay;

      return availableWidth;
    };

    // The height-led branch's width goes negative under a 187px window height,
    // which crashes the tab. Zero is measurably no safer: `scaleFactor` below
    // divides by the width, so a zero floor hands `Infinity` to every draw call
    // and the tab still dies at 800x186. Floored on both branches for symmetry.
    // Nothing moves at 320px wide and 375px tall or above: 375px tall hits
    // minCanvasHeight exactly.
    //
    // minCanvasWidth must stay below the narrowest width
    // `measureAvailableWidth` can report, because the Math.max below can now
    // exceed it. That used to be impossible by construction — the Math.min made
    // "never wider than the container" true arithmetically — and #57 exists
    // because a canvas wider than <main> widens <main> rather than clipping.
    // Two different thresholds, neither of them 120px of viewport: the floor
    // starts applying below a 170px viewport width, because `windowWidth - 50`
    // is what drops under 120 first, and it starts exceeding the container below
    // 152px, because the wrapper's padding costs 32px. So 120 is reachable, and
    // between 170 and 152 it is reached without overflowing anything. Raising it
    // to a "comfortable" 320 does reintroduce #57 — measured at 16px of page
    // overflow on a 320px-wide viewport — so there is an e2e guard at that
    // width. The 1280x1024 overflow guard cannot see it: available width there
    // is 998 and so is the canvas.
    //
    // These stop the crash; they do not make the result look right, and it would
    // be wrong to read them as a "smallest usable tank". Fish Y centres and sizes
    // scale from the width alone, so wherever only the height floor bites — window
    // heights from roughly 262 to 375 — the canvas gets wider while staying 75px
    // tall and the lower fish sit below it. Seaweed blades stay 120-200px on a
    // 75px canvas for the same reason. That band used to be a crash (height goes
    // non-positive under 300), so this is strictly better, but it is degraded
    // rather than good.
    const minCanvasWidth = 120;
    const minCanvasHeight = 75;

    const updateCanvasDimensions = () => {
      if (p5.windowWidth / p5.windowHeight > aspectRatio) {
        return {
          canvasWidth: Math.max(
            minCanvasWidth,
            p5.windowHeight * aspectRatio - 300,
          ),
          canvasHeight: Math.max(minCanvasHeight, p5.windowHeight - 300),
        };
      }

      return {
        canvasWidth: Math.max(
          minCanvasWidth,
          Math.min(p5.windowWidth - 50, measureAvailableWidth()),
        ),
        canvasHeight: Math.max(minCanvasHeight, p5.windowWidth / aspectRatio),
      };
    };

    // The two seaweed passes in draw() walk the canvas with a much wider stride
    // (48px) than setup() used when filling these arrays (8px), and they read at
    // a +3 / +4 offset. The offsets are deliberate: they de-correlate the front
    // and back rows so the two passes look like two layers of seaweed instead of
    // one doubled row. They are also unchecked, so on a narrow canvas the offset
    // walks off the end of the array and p5 gets `undefined`. Wrapping the index
    // keeps the "sample a neighbouring blade" intent while making every read
    // in-bounds for any array length.
    // An empty array makes `i % 0` NaN, which reads as undefined and hits the
    // fallback, so no separate length guard is needed.
    const bladeColorAt = (i: number) =>
      bladeColors[i % bladeColors.length] ?? grassColors[0];
    const bladeHeightAt = (i: number) =>
      bladeHeights[i % bladeHeights.length] ?? 0;

    const bubbles: Bubble[] = [];

    // Bubble motion/fade rates, per second rather than per frame.
    const BUBBLE_FADE_PER_SECOND = 255;
    const BUBBLE_RISE_PER_SECOND = 120; // matches the previous 2px per frame at 60fps
    const MAX_FRAME_MS = 100;

    class Bubble {
      x: number;
      y: number;
      size: number;
      r: number;
      g: number;
      b: number;
      lifespan: number;

      constructor(x: number, y: number) {
        this.x = x;
        this.y = y;
        this.size = 20;

        this.r = p5.random(100, 150); // Lower range for red
        this.g = p5.random(150, 200); // Moderate range for green
        this.b = p5.random(200, 255);

        this.lifespan = p5.width;
      }

      // Advance the bubble one frame. lifespan doubles as the fill alpha and as
      // the reap counter, and it used to never change - so bubbles never died and
      // the array grew for as long as the page stayed open. Both the fade and the
      // rise are expressed per second and scaled by deltaTime so a bubble lives
      // the same wall-clock time and covers the same distance at 30, 60 or 144Hz.
      // deltaTime is clamped so a long background-tab stall cannot wipe out every
      // bubble in a single frame.
      update() {
        const elapsedSeconds = Math.min(p5.deltaTime, MAX_FRAME_MS) / 1000;
        this.lifespan -= BUBBLE_FADE_PER_SECOND * elapsedSeconds;
        this.y -= BUBBLE_RISE_PER_SECOND * elapsedSeconds;
      }

      ellipse() {
        p5.fill(this.r, this.g, this.b, this.lifespan / 2);
        p5.ellipse(
          this.x - 50,
          this.y,
          this.size / scaleFactor,
          this.size / scaleFactor,
        );
      }
    }

    /**
     * Which way a fish faces, and so which way it swims: `1` is left-to-right,
     * `-1` right-to-left. It multiplies every non-zero x *literal* inside
     * `drawGoldfish` — not the translate, not a width, not a y — which makes it a
     * reflection of the fish about its own origin and nothing else.
     *
     * Two parts have no signed literal to multiply and are still correct. The
     * body ellipse is centred on the origin, so it reflects onto itself. The
     * mouth arc's angular span of 0..PI is symmetric about the vertical axis, so
     * only its centre needs mirroring, which it gets.
     */
    type Direction = 1 | -1;

    // Was two functions whose bodies differed only in the sign of every x
    // literal, so a change to the fish had to be made twice and could be made
    // inconsistently. The literals below are the left-to-right ones.
    function drawGoldfish(
      x: number,
      y: number,
      scale: number,
      bodyColor: P5Color,
      finColor: P5Color,
      direction: Direction,
    ) {
      p5.push(); // Save the current transformation state
      p5.translate(x, y); // Move origin to the goldfish's position
      p5.scale(scale / scaleFactor); // Apply the scaling

      p5.stroke("black");

      // Draw the tail
      p5.fill(finColor);
      p5.beginShape();
      p5.vertex(-30 * direction, 0);
      p5.vertex(-80 * direction, -30);
      p5.vertex(-80 * direction, 30);
      p5.endShape(p5.CLOSE);

      // Draw the body
      p5.fill(bodyColor);
      p5.ellipse(0, 0, 100, 60);

      // Draw the fins
      p5.fill(finColor);
      p5.triangle(0, 0, -50 * direction, 30, 10 * direction, 20);

      // Draw the eye
      p5.fill(255);
      p5.ellipse(30 * direction, -10, 20, 20);
      p5.fill(0);
      p5.ellipse(30 * direction, -10, 10, 10);

      p5.noFill();
      p5.stroke(0);
      p5.arc(39 * direction, 10, 15, 10, 0, p5.PI); // Small arc for the mouth

      p5.pop(); // Restore the transformation state
    }

    p5.mouseClicked = () => {
      // A bubble only exists as a thing that rises and fades, and the only way
      // to show it would be to restart the loop or to redraw - which re-runs the
      // whole frame and would move the fish too. So under reduced motion a click
      // does nothing at all, rather than something half-animated.
      if (prefersReducedMotion) {
        return;
      }

      bubbles.push(
        new Bubble(
          scaleFactor < 2.5 ? p5.mouseX - 10 : p5.mouseX + 30,
          p5.mouseY,
        ),
      );
    };

    const yPos = 200;

    /**
     * The edge a fish's `x` leaves by, and the one it comes back in at. Both are
     * a margin *outside* the canvas, expressed so that neither depends on which
     * way the fish is going: a left-to-right fish exits past the right-hand
     * edge and re-enters left of zero, and the mirror holds going the other way.
     * That is the whole reason the eight wrap-around `if`s could collapse into
     * one — as written out per variable, the two directions did not look like
     * the same rule.
     *
     * Both are in terms of `x`, and so of the fish's own origin, which for a fish
     * with a `drawnOffset` is not where it appears.
     */
    const farEdge = (direction: Direction, width: number, margin: number) =>
      direction === 1 ? width + margin : -margin;
    const nearEdge = (direction: Direction, width: number, margin: number) =>
      direction === 1 ? -margin : width + margin;

    type FishSpec = {
      direction: Direction;
      /** Unsigned px per frame; `direction` supplies the sign. */
      speed: number;
      /** Added to `yPos`, before the `scaleFactor` divide. */
      yOffset: number;
      scale: number;
      /**
       * Added to `x` at the moment of drawing. Four fish have a non-zero one,
       * and it is kept separate rather than folded into `x` because the three
       * margins below are compared against `x` and not against the drawn
       * position: folding it in would move the wrap points. So a fish with an
       * offset is drawn that far from where its own margins say it is — the
       * cyan one starts at an `x` of -200 and is drawn at -600.
       */
      drawnOffset: number;
      /** Where this fish parks under reduced motion, as a share of the width. */
      restFraction: number;
      /** How far outside the canvas its `x` begins, on the side it enters from. */
      startMargin: number;
      /** How far past the far edge its `x` gets before wrapping. */
      exitMargin: number;
      /** How far outside the canvas its `x` is put back after wrapping. */
      entryMargin: number;
      body: readonly [number, number, number];
      fin: readonly [number, number, number];
      /** Only the leading fish gets out of the cursor's way. */
      dodgesCursor?: true;
    };

    /** A fish, plus the one thing about it that changes: where it is. */
    type Fish = FishSpec & { x: number };

    // Draw order, which is also z-order: earlier fish are behind later ones.
    const SPECS: FishSpec[] = [
      {
        direction: 1,
        speed: 3,
        yOffset: 100,
        scale: 0.4,
        drawnOffset: 0,
        restFraction: 0.12,
        startMargin: 200,
        exitMargin: 200,
        entryMargin: 400,
        body: [128, 0, 128],
        fin: [186, 85, 211],
        dodgesCursor: true,
      },
      {
        direction: 1,
        speed: 4,
        yOffset: 0,
        scale: 1,
        drawnOffset: 0,
        restFraction: 0.34,
        startMargin: 300,
        exitMargin: 300,
        entryMargin: 500,
        body: [34, 139, 34],
        fin: [50, 205, 50],
      },
      {
        direction: 1,
        speed: 4,
        yOffset: 140,
        scale: 0.4,
        drawnOffset: -400,
        restFraction: 0.56,
        startMargin: 200,
        exitMargin: 500,
        entryMargin: 400,
        body: [0, 255, 255],
        fin: [69, 170, 44],
      },
      {
        direction: 1,
        speed: 4.5,
        yOffset: 160,
        scale: 1,
        drawnOffset: -200,
        restFraction: 0.78,
        startMargin: 300,
        exitMargin: 300,
        entryMargin: 500,
        body: [255, 0, 0],
        fin: [205, 50, 50],
      },
      {
        direction: -1,
        speed: 3,
        yOffset: 300,
        scale: 1.3,
        drawnOffset: 0,
        restFraction: 0.22,
        startMargin: 200,
        exitMargin: 700,
        entryMargin: 200,
        body: [0, 128, 128],
        fin: [54, 117, 136],
      },
      {
        direction: -1,
        speed: 2.5,
        yOffset: -110,
        scale: 0.8,
        drawnOffset: 0,
        restFraction: 0.46,
        startMargin: 300,
        exitMargin: 800,
        entryMargin: 300,
        body: [255, 102, 102],
        fin: [255, 153, 153],
      },
      {
        direction: -1,
        speed: 4,
        yOffset: 320,
        scale: 1.3,
        drawnOffset: 400,
        restFraction: 0.68,
        startMargin: 400,
        exitMargin: 600,
        entryMargin: 200,
        body: [255, 128, 128],
        fin: [201, 138, 119],
      },
      {
        direction: -1,
        speed: 1.5,
        yOffset: 90,
        scale: 0.8,
        drawnOffset: 500,
        restFraction: 0.88,
        startMargin: 500,
        exitMargin: 600,
        entryMargin: 300,
        body: [0, 153, 153],
        fin: [0, 102, 102],
      },
    ];

    // The canvas does not exist yet, so a starting position cannot come from
    // p5.width. This is the same measurement setup() is about to make.
    const { canvasWidth } = updateCanvasDimensions();

    const school: Fish[] = SPECS.map((spec) => ({
      ...spec,
      x: nearEdge(spec.direction, canvasWidth, spec.startMargin),
    }));

    // Each fish is drawn at its position plus `drawnOffset`, so a layout has to
    // be written in drawn coordinates and have that offset backed out. The
    // fractions spread the eight fish across the tank.
    const restFishInView = (width: number) => {
      for (const fish of school) {
        fish.x = width * fish.restFraction - fish.drawnOffset;
      }
    };

    p5.draw = () => {
      const startColor = p5.color(173, 216, 230); // Light blue
      const endColor = p5.color(0, 180, 180); // Teal

      // Create the gradient
      for (let y = 0; y < p5.height; y++) {
        const inter = p5.map(y, 0, p5.height, 0, 1);
        const currentColor = p5.lerpColor(startColor, endColor, inter);
        p5.stroke(currentColor);
        p5.line(0, y, p5.width, y);
      }

      p5.stroke(1);

      const bladeWidth = 8;
      const spacing = 20; // Space between blades

      // Loop to draw each blade of grass using the pre-calculated colors
      for (
        let i = 0, x = 21;
        x < p5.width;
        x += bladeWidth + spacing * 2, i++
      ) {
        p5.fill(bladeColorAt(i + 3));

        // Calculate the y position for the bottom of the canvas
        const y = p5.height;

        // Draw the quad for the blade of grass
        p5.quad(
          x,
          y, // Bottom left
          x + bladeWidth,
          y, // Bottom right
          x + bladeWidth,
          y - bladeHeightAt(i) - 4, // Top right
          x + 2,
          y - bladeHeightAt(i), // Top left
        );
      }

      // Goldfish animations
      const cursorDodgeRadius = 100;

      for (const fish of school) {
        let x = fish.x + fish.drawnOffset;
        let y = (yPos + fish.yOffset) / scaleFactor;

        // On a narrow canvas the resting position is within the radius of the
        // untouched (0, 0) cursor, so without the flag the still frame would
        // show this one fish shoved aside by a cursor that is not there.
        if (
          fish.dodgesCursor &&
          !prefersReducedMotion &&
          p5.dist(x, y, p5.mouseX, p5.mouseY) < cursorDodgeRadius
        ) {
          // Calculate the direction away from the cursor
          const angle = p5.atan2(y - p5.mouseY, x - p5.mouseX);
          x += p5.cos(angle) * 50; // Move away on the x-axis
          y += p5.sin(angle) * 50; // Move away on the y-axis
        }

        drawGoldfish(
          x,
          y,
          fish.scale,
          p5.color(...fish.body),
          p5.color(...fish.fin),
          fish.direction,
        );
      }

      // The single point where the fish advance, so honouring reduced motion is
      // one guard rather than eight. The wrap-around resets belong inside it too:
      // under reduced motion they would fire against a resting position and
      // teleport a fish off-canvas.
      //
      // p5.width, not the `canvasWidth` measured at startup: that one is never
      // refreshed, so after a resize the thresholds were comparing against a
      // width the canvas no longer had. Narrowing the window left the left-to-
      // right fish swimming a long way past the right-hand edge before wrapping;
      // widening it wrapped them while still on screen.
      if (!prefersReducedMotion) {
        for (const fish of school) {
          fish.x += fish.speed * fish.direction;
          // Signed comparison, so one line covers both directions: a fish is
          // past its far edge when the gap has the same sign as its heading.
          if (
            (fish.x - farEdge(fish.direction, p5.width, fish.exitMargin)) *
              fish.direction >
            0
          ) {
            fish.x = nearEdge(fish.direction, p5.width, fish.entryMargin);
          }
        }
      }

      // User controlled goldfish, and the ninth fish: it is not in `school`
      // because it has no position of its own to advance, and it is drawn after
      // the loop so it stays in front of the other eight. A still frame cannot
      // track a cursor, and the cursor is at (0, 0) until it first moves, which
      // would clip this fish into the top-left corner - so park it in the tank
      // instead.
      drawGoldfish(
        prefersReducedMotion ? p5.width * 0.42 : p5.mouseX,
        prefersReducedMotion ? p5.height * 0.62 : p5.mouseY,
        1,
        p5.color(255, 153, 51),
        p5.color(255, 102, 0),
        -1,
      );

      // Advance every bubble, then compact the survivors forward in place. This
      // keeps oldest-first order without the index/splice interaction that made
      // the old backwards loop easy to get wrong. An expired bubble has an alpha
      // of <= 0, so nothing perceptible is lost by dropping it before it is drawn.
      for (const bubble of bubbles) {
        bubble.update();
      }

      let alive = 0;
      for (const bubble of bubbles) {
        if (bubble.lifespan > 0) {
          bubbles[alive++] = bubble;
        }
      }
      bubbles.length = alive;

      // Draw them in a separate forward pass so overlapping translucent bubbles
      // still composite oldest-first, the way they did before.
      for (const bubble of bubbles) {
        bubble.ellipse();
      }

      // Draw strands of seaweed across the bottom of the canvas
      // Define the width and height of each blade of grass

      // Loop to draw each blade of grass using the pre-calculated colors
      for (let i = 0, x = 0; x < p5.width; x += bladeWidth + spacing * 2, i++) {
        p5.fill(bladeColorAt(i));

        // Calculate the y position for the bottom of the canvas
        const y = p5.height;

        // Draw the quad for the blade of grass
        p5.quad(
          x,
          y, // Bottom left
          x + bladeWidth,
          y, // Bottom right
          x + bladeWidth,
          y - bladeHeightAt(i + 4) - 4, // Top right
          x + 2,
          y - bladeHeightAt(i + 4), // Top left
        );
      }

      p5.fill(194, 178, 128); // Sand color fill
      p5.beginShape();
      p5.vertex(0, p5.height); // Bottom-left corner remains unchanged
      for (let x = 0; x <= p5.width + 100; x += 10 / scaleFactor) {
        const y =
          p5.height -
          50 +
          (scaleFactor < 2 ? 10 * scaleFactor : 2 * scaleFactor) *
            p5.sin(
              (p5.TWO_PI * x) /
                (scaleFactor < 2 ? 100 * scaleFactor : 20 * scaleFactor),
            ); // Scale the sine wave part
        p5.vertex(x, y);
      }
      p5.vertex(p5.width, p5.height); // Bottom-right corner remains unchanged
      p5.endShape(p5.CLOSE);

      p5.stroke(2);
    };
  };
}
