"use client";

import dynamic from "next/dynamic";
import React from "react";
import { P5CanvasInstance, P5WrapperProps } from "react-p5-wrapper";

// Importing this way removes window is not defined error
const ReactP5Wrapper = dynamic(
  () => import("react-p5-wrapper").then((mod) => mod.ReactP5Wrapper as any),
  {
    ssr: false,
  },
) as unknown as React.NamedExoticComponent<P5WrapperProps>;

const MyProcessingDrawing = () => {
  function sketch(p5: P5CanvasInstance) {
    const baseWidth = 1180;
    const baseHeight = 735;
    const aspectRatio = baseWidth / baseHeight;
    let scaleFactor = 1;

    p5.windowResized = () => {
      p5.setup();
    };

    p5.setup = () => {
      const { canvasWidth, canvasHeight } = updateCanvasDimensions();
      p5.createCanvas(canvasWidth, canvasHeight);
      scaleFactor = baseWidth / canvasWidth;

      //const x = (p5.windowWidth - canvasWidth) / 2;
      //const y = (p5.windowHeight - canvasHeight) / 2;
      //myCanvas.position(x, y);

      p5.pixelDensity(window.devicePixelRatio);
      p5.strokeWeight(1);
    };

    const updateCanvasDimensions = () => {
      if (p5.windowWidth / p5.windowHeight > aspectRatio) {
        return {
          canvasWidth: p5.windowHeight * aspectRatio - 300,
          canvasHeight: p5.windowHeight - 300,
        };
      }

      return {
        canvasWidth: p5.windowWidth - 50,
        canvasHeight: p5.windowWidth / aspectRatio,
      };
    };

    const bubbles: Bubble[] = [];

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

      ellipse() {
        p5.fill(this.r, this.g, this.b, this.lifespan / 2);
        p5.ellipse(
          this.x - 50,
          (this.y -= 2),
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
      bubbles.push(new Bubble(p5.mouseX, p5.mouseY));
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

    p5.draw = () => {
      //p5.background(29, 155, 240);

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

      // Goldfish animations

      // experiment for just a single fish for now
      // move fish away from orange fish
      let fish1X = xPosLeftRight1;
      let fish1Y = (yPos + 100) / scaleFactor;
      const d = p5.dist(fish1X, fish1Y, p5.mouseX, p5.mouseY);
      const threshold = 100;
      if (d < threshold) {
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

      // User controlled goldfish
      drawGoldfishColorsScale(
        p5.mouseX,
        p5.mouseY,
        1,
        p5.color(255, 153, 51),
        p5.color(255, 102, 0),
      );

      // Draw the bubbles
      for (let i = 0; i < bubbles.length; i++) {
        bubbles[i].ellipse();

        if (bubbles[i].lifespan <= 0) {
          bubbles.splice(i, 1);
        }
      }

      // Draw strands of seaweed across the bottom of the canvas

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
  }

  return <ReactP5Wrapper sketch={sketch} />;
};

export default MyProcessingDrawing;
