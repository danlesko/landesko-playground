import type { RefObject } from "react";
import type { P5CanvasInstance } from "react-p5-wrapper";

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
    // 120 is unreachable today (it needs a viewport under 120px). Raising it to
    // a "comfortable" 320 does reintroduce #57 — measured at 16px of page
    // overflow on a 320px-wide viewport — so there is an e2e guard at that
    // width. The 1280x1024 overflow guard cannot see it: available width there
    // is 998 and so is the canvas.
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

    function drawGoldfishColorsScale(
      x: number,
      y: number,
      scale: number,
      bColor: any,
      fColor: any,
    ) {
      // Set the colors for the goldfish
      const bodyColor = bColor;
      const finColor = fColor;

      p5.push(); // Save the current transformation state
      p5.translate(x, y); // Move origin to the goldfish's position
      p5.scale(scale / scaleFactor); // Apply the scaling

      p5.stroke("black");

      // Draw the tail
      p5.fill(finColor);
      p5.beginShape();
      p5.vertex(30, 0); // Flipped horizontally
      p5.vertex(80, -30); // Flipped horizontally
      p5.vertex(80, 30); // Flipped horizontally
      p5.endShape(p5.CLOSE);

      // Draw the body
      p5.fill(bodyColor);
      p5.ellipse(0, 0, 100, 60);

      // Draw the fins
      p5.fill(finColor);
      p5.triangle(0, 0, 50, 30, -10, 20); // Flipped horizontally

      // Draw the eye
      p5.fill(255);
      p5.ellipse(-30, -10, 20, 20); // Flipped horizontally
      p5.fill(0);
      p5.ellipse(-30, -10, 10, 10); // Flipped horizontally

      p5.noFill();
      p5.stroke(0);
      p5.arc(-39, 10, 15, 10, 0, p5.PI); // Small arc for the mouth

      p5.pop(); // Restore the transformation state
    }

    function drawGoldfishFlippedColorsScale(
      x: number,
      y: number,
      scale: number,
      bColor: any,
      fColor: any,
    ) {
      // Random colors for the goldfish
      const bodyColor = bColor;
      const finColor = fColor;

      p5.push(); // Save the current transformation state
      p5.translate(x, y); // Move origin to the goldfish's position
      p5.scale(scale / scaleFactor); // Apply the scaling

      p5.stroke("black");

      // Draw the tail
      p5.fill(finColor);
      p5.beginShape();
      p5.vertex(-30, 0);
      p5.vertex(-80, -30);
      p5.vertex(-80, 30);
      p5.endShape(p5.CLOSE);

      // Draw the body
      p5.fill(bodyColor);
      p5.ellipse(0, 0, 100, 60);

      // Draw the fins
      p5.fill(finColor);
      p5.triangle(0, 0, -50, 30, 10, 20);

      // Draw the eye
      p5.fill(255);
      p5.ellipse(30, -10, 20, 20);
      p5.fill(0);
      p5.ellipse(30, -10, 10, 10);

      p5.noFill();
      p5.stroke(0);
      p5.arc(39, 10, 15, 10, 0, p5.PI);

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

    let xPosLeftRight1 = -200;
    let xPosLeftRight2 = -300;
    let xPosLeftRight3 = -200;
    let xPosLeftRight4 = -300;
    const { canvasWidth } = updateCanvasDimensions();
    let xPosRightLeft1 = canvasWidth + 200;
    let xPosRightLeft2 = canvasWidth + 300;
    let xPosRightLeft3 = canvasWidth + 400;
    let xPosRightLeft4 = canvasWidth + 500;
    const yPos = 200;

    // Each fish is drawn at its position variable plus a constant offset (see
    // the drawGoldfish* calls in draw), so a layout has to be written in drawn
    // coordinates and have that offset backed out. `drawnOffset` is the number
    // draw() adds; the fractions spread the eight fish across the tank.
    const restFishInView = (width: number) => {
      const restAt = (fraction: number, drawnOffset = 0) =>
        width * fraction - drawnOffset;

      xPosLeftRight1 = restAt(0.12);
      xPosLeftRight2 = restAt(0.34);
      xPosLeftRight3 = restAt(0.56, -400);
      xPosLeftRight4 = restAt(0.78, -200);
      xPosRightLeft1 = restAt(0.22);
      xPosRightLeft2 = restAt(0.46);
      xPosRightLeft3 = restAt(0.68, 400);
      xPosRightLeft4 = restAt(0.88, 500);
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

      // experiment for just a single fish for now
      // move fish away from orange fish
      let fish1X = xPosLeftRight1;
      let fish1Y = (yPos + 100) / scaleFactor;
      const d = p5.dist(fish1X, fish1Y, p5.mouseX, p5.mouseY);
      const threshold = 100;
      // On a narrow canvas the resting position is within the threshold of the
      // untouched (0, 0) cursor, so without the flag the still frame would show
      // this one fish shoved aside by a cursor that is not there.
      if (!prefersReducedMotion && d < threshold) {
        // Calculate the direction away from the cursor
        const angle = p5.atan2(fish1Y - p5.mouseY, fish1X - p5.mouseX);
        fish1X += p5.cos(angle) * 50; // Move away on the x-axis
        fish1Y += p5.sin(angle) * 50; // Move away on the y-axis
      }
      // left right purple fish small
      drawGoldfishFlippedColorsScale(
        fish1X,
        fish1Y,
        0.4,
        p5.color(128, 0, 128),
        p5.color(186, 85, 211),
      );
      // left right green fish medium
      drawGoldfishFlippedColorsScale(
        xPosLeftRight2,
        yPos / scaleFactor,
        1,
        p5.color(34, 139, 34),
        p5.color(50, 205, 50),
      );
      // left right cyan fish small
      drawGoldfishFlippedColorsScale(
        xPosLeftRight3 - 400,
        (yPos + 140) / scaleFactor,
        0.4,
        p5.color(0, 255, 255),
        p5.color(69, 170, 44),
      );
      // left right red fish medium
      drawGoldfishFlippedColorsScale(
        xPosLeftRight4 - 200,
        (yPos + 160) / scaleFactor,
        1,
        p5.color(255, 0, 0),
        p5.color(205, 50, 50),
      );
      // right left teal fish large
      drawGoldfishColorsScale(
        xPosRightLeft1,
        (yPos + 300) / scaleFactor,
        1.3,
        p5.color(0, 128, 128), // Teal 1
        p5.color(54, 117, 136),
      );
      // right left light red fish small
      drawGoldfishColorsScale(
        xPosRightLeft2,
        (yPos - 110) / scaleFactor,
        0.8,
        p5.color(255, 102, 102), // Light Red 1
        p5.color(255, 153, 153), // Light Red 2,
      );
      // right left light red fish large
      drawGoldfishColorsScale(
        xPosRightLeft3 + 400,
        (yPos + 320) / scaleFactor, // Updated y-position
        1.3,
        p5.color(255, 128, 128), // Complementary of p5.color(0, 128, 128) (teal)
        p5.color(201, 138, 119), // Approximate complementary of p5.color(54, 117, 136)
      );
      // right left dark cyan fish medium
      drawGoldfishColorsScale(
        xPosRightLeft4 + 500,
        (yPos + 90) / scaleFactor, // Updated y-position
        0.8,
        p5.color(0, 153, 153), // Complementary of p5.color(255, 102, 102) (light red)
        p5.color(0, 102, 102), // Complementary of p5.color(255, 153, 153) (light red)
      );
      // The single point where the fish advance, so honouring reduced motion is
      // one guard rather than eight. The wrap-around resets belong inside it too:
      // they read the canvas width captured at startup, so after a resize they
      // can fire against a resting position and teleport a fish off-canvas.
      if (!prefersReducedMotion) {
        xPosLeftRight1 += 3;
        xPosLeftRight2 += 4;
        xPosLeftRight3 += 4;
        xPosLeftRight4 += 4.5;
        xPosRightLeft1 -= 3;
        xPosRightLeft2 -= 2.5;
        xPosRightLeft3 -= 4;
        xPosRightLeft4 -= 1.5;
        if (xPosLeftRight1 > canvasWidth + 200) {
          xPosLeftRight1 = -400;
        }
        if (xPosLeftRight2 > canvasWidth + 300) {
          xPosLeftRight2 = -500;
        }
        if (xPosLeftRight3 > canvasWidth + 500) {
          xPosLeftRight3 = -400;
        }
        if (xPosLeftRight4 > canvasWidth + 300) {
          xPosLeftRight4 = -500;
        }
        if (xPosRightLeft1 < -700) {
          xPosRightLeft1 = canvasWidth + 200;
        }
        if (xPosRightLeft2 < -800) {
          xPosRightLeft2 = canvasWidth + 300;
        }
        if (xPosRightLeft3 < -600) {
          xPosRightLeft3 = canvasWidth + 200;
        }
        if (xPosRightLeft4 < -600) {
          xPosRightLeft4 = canvasWidth + 300;
        }
      }

      // User controlled goldfish. A still frame cannot track a cursor, and the
      // cursor is at (0, 0) until it first moves, which would clip this fish into
      // the top-left corner - so park it in the tank instead.
      drawGoldfishColorsScale(
        prefersReducedMotion ? p5.width * 0.42 : p5.mouseX,
        prefersReducedMotion ? p5.height * 0.62 : p5.mouseY,
        1,
        p5.color(255, 153, 51),
        p5.color(255, 102, 0),
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
