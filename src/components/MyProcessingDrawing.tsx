"use client";

import dynamic from "next/dynamic";
import React from "react";
import { P5CanvasInstance, P5WrapperProps } from "react-p5-wrapper";

// Importing this way removes window is not defined error
const ReactP5Wrapper = dynamic(
  () =>
    import("react-p5-wrapper")
      // eslint-disable-next-line  @typescript-eslint/no-explicit-any
      .then((mod) => mod.ReactP5Wrapper as any),
  {
    ssr: false,
  },
) as unknown as React.NamedExoticComponent<P5WrapperProps>;

const MyProcessingDrawing = () => {
  function sketch(p5: P5CanvasInstance) {
    p5.setup = () => {
      p5.createCanvas(800, 600);
    };

    const circles: Circle[] = [];

    class Circle {
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
        this.size = 50;

        this.r = p5.random(200);
        this.g = p5.random(0);
        this.b = p5.random(255);

        this.lifespan = p5.width;
      }

      ellipse() {
        p5.noStroke();
        p5.fill(this.r, this.g, this.b, this.lifespan / 2);
        p5.ellipse(this.x, (this.y -= 2), this.size, this.size);
      }
    }

    p5.mousePressed = () => {
      circles.push(new Circle(p5.mouseX, p5.mouseY));
    };

    p5.draw = () => {
      p5.background(29, 155, 240);
      // this was the sample code provided
      // p5.normalMaterial();
      // p5.push();
      // p5.rotateZ(p5.frameCount * 0.01);
      // p5.rotateX(p5.frameCount * 0.01);
      // p5.rotateY(p5.frameCount * 0.01);
      // p5.plane(100);
      // p5.pop();
      for (let i = 0; i < circles.length; i++) {
        circles[i].ellipse();

        if (circles[i].lifespan <= 0) {
          circles.splice(i, 1);
        }
      }
    };
  }

  return <ReactP5Wrapper sketch={sketch} />;
};

export default MyProcessingDrawing;
