import { afterEach, describe, expect, it, vi } from "vitest";
import type { P5CanvasInstance } from "react-p5-wrapper";

import { createFishTankSketch } from "@/components/fishTankSketch";

/**
 * The sketch only ever talks to the outside world through the p5 instance it is
 * handed, so a recording stub is enough to test it with no DOM at all. Only the
 * calls the assertions read are recorded; everything else is an inert function,
 * which is why an unknown property resolves to a no-op rather than throwing.
 *
 * The maths functions are real implementations, not constants: `dist` decides
 * whether a fish dodges the cursor, so stubbing it to 0 would silently take that
 * branch on every frame.
 */
const RECORDED = ["translate", "ellipse", "noLoop", "redraw"] as const;

function createStubP5(windowWidth: number, windowHeight: number) {
  const calls = new Map<string, number[][]>();

  const state: Record<string, unknown> = {
    windowWidth,
    windowHeight,
    width: 0,
    height: 0,
    deltaTime: 16,
    mouseX: 0,
    mouseY: 0,
    PI: Math.PI,
    TWO_PI: Math.PI * 2,
    CLOSE: "close",
    createCanvas: (w: number, h: number) => {
      state.width = w;
      state.height = h;
    },
    random: (a: unknown, b?: number) => {
      if (Array.isArray(a)) {
        return a[0];
      }
      return b === undefined ? (a as number) / 2 : ((a as number) + b) / 2;
    },
    dist: (x1: number, y1: number, x2: number, y2: number) =>
      Math.hypot(x2 - x1, y2 - y1),
    atan2: Math.atan2,
    cos: Math.cos,
    sin: Math.sin,
    map: (v: number, a: number, b: number, c: number, d: number) =>
      c + ((v - a) / (b - a)) * (d - c),
    color: (...args: unknown[]) => ({ args }),
    lerpColor: (from: unknown) => from,
    noLoop: () => {},
    redraw: () => {
      (state.draw as () => void)();
    },
  };

  const stub = new Proxy(state, {
    get(target, property) {
      const key = String(property);
      const existing = target[key];

      if (existing !== undefined && typeof existing !== "function") {
        return existing;
      }

      // Note the ordering: an unimplemented drawing call still has to be
      // recorded, so the recorder wraps the absence of an implementation too.
      return (...args: unknown[]) => {
        if ((RECORDED as readonly string[]).includes(key)) {
          const record = calls.get(key) ?? [];
          record.push(args.filter((arg) => typeof arg === "number"));
          calls.set(key, record);
        }
        return (existing as ((...a: unknown[]) => unknown) | undefined)?.(
          ...args,
        );
      };
    },
    set(target, property, value) {
      target[String(property)] = value;
      return true;
    },
  }) as unknown as P5CanvasInstance;

  return {
    p5: stub,
    countOf: (name: (typeof RECORDED)[number]) =>
      (calls.get(name) ?? []).length,
    takeCalls: (name: (typeof RECORDED)[number]) => {
      const record = calls.get(name) ?? [];
      calls.set(name, []);
      return record;
    },
    get width() {
      return state.width as number;
    },
    get height() {
      return state.height as number;
    },
  };
}

function mount(prefersReducedMotion: boolean, windowWidth = 1400) {
  // The sketch reads window.devicePixelRatio directly in setup.
  vi.stubGlobal("window", { devicePixelRatio: 2 });

  const stub = createStubP5(windowWidth, 900);
  createFishTankSketch({ current: null }, prefersReducedMotion)(stub.p5);
  stub.p5.setup();

  // p5 itself draws exactly one frame after setup even when looping is off.
  stub.p5.draw();

  return stub;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createFishTankSketch", () => {
  it("keeps the fish swimming when reduced motion is not preferred", () => {
    const stub = mount(false);

    expect(stub.countOf("noLoop")).toBe(0);

    const firstFrame = stub.takeCalls("translate");
    stub.p5.draw();
    const secondFrame = stub.takeCalls("translate");

    // The leading fish advances 3px per frame; that it moves at all is the point.
    expect(secondFrame[0]?.[0]).toBeCloseTo((firstFrame[0]?.[0] ?? 0) + 3);
  });

  it("stops the draw loop when reduced motion is preferred", () => {
    const stub = mount(true);

    expect(stub.countOf("noLoop")).toBe(1);
  });

  it("holds every fish still across repeated frames under reduced motion", () => {
    const stub = mount(true);

    const firstFrame = stub.takeCalls("translate");
    stub.p5.draw();
    const secondFrame = stub.takeCalls("translate");

    // Two empty arrays are equal, and an earlier version of this stub recorded
    // nothing at all - so the count is asserted before the comparison.
    expect(firstFrame).toHaveLength(9);
    expect(secondFrame).toEqual(firstFrame);
  });

  // noLoop() on its own would render an empty tank: the fish start hundreds of
  // pixels off-canvas and only swim into shot after a few hundred frames, so the
  // one frame p5 draws would show water, seaweed and sand but no fish.
  it("places all nine fish inside the canvas in the static frame", () => {
    const stub = mount(true);
    const fish = stub.takeCalls("translate");

    expect(fish).toHaveLength(9);
    for (const [x, y] of fish) {
      expect(x).toBeGreaterThan(0);
      expect(x).toBeLessThan(stub.width);
      expect(y).toBeGreaterThan(0);
      expect(y).toBeLessThan(stub.height);
    }
  });

  it("adds a bubble on click only when motion is allowed", () => {
    const moving = mount(false);
    const beforeMoving = moving.takeCalls("ellipse").length;
    moving.p5.mouseClicked?.(undefined as never);
    moving.p5.draw();
    expect(moving.takeCalls("ellipse").length).toBe(beforeMoving + 1);

    const still = mount(true);
    const beforeStill = still.takeCalls("ellipse").length;
    still.p5.mouseClicked?.(undefined as never);
    still.p5.draw();
    expect(still.takeCalls("ellipse").length).toBe(beforeStill);
  });

  // windowResized re-runs setup, and setup creates a fresh blank canvas. With
  // the loop stopped, nothing else would ever paint it.
  it("repaints the static frame after a resize, and only then", () => {
    const still = mount(true);
    still.p5.windowResized?.(undefined as never);
    expect(still.countOf("redraw")).toBe(1);

    const moving = mount(false);
    moving.p5.windowResized?.(undefined as never);
    expect(moving.countOf("redraw")).toBe(0);
  });

  it("re-lays out the resting fish for the new width after a resize", () => {
    const stub = mount(true);
    const wide = stub.width;
    stub.takeCalls("translate");

    stub.p5.windowWidth = 700;
    stub.p5.windowResized?.(undefined as never);
    const fish = stub.takeCalls("translate");

    expect(stub.width).toBeLessThan(wide);
    expect(fish).toHaveLength(9);
    for (const [x] of fish) {
      expect(x).toBeGreaterThan(0);
      expect(x).toBeLessThan(stub.width);
    }
  });

  // The resting position of the leading fish sits within the 100px dodge radius
  // of the untouched (0, 0) cursor once the canvas is phone-width, so without a
  // guard the still frame shows that one fish shoved aside by a cursor that is
  // not there.
  it("ignores the phantom cursor on a narrow canvas", () => {
    const stub = mount(true, 380);
    const [leadFish] = stub.takeCalls("translate");

    expect(leadFish?.[0]).toBeCloseTo(stub.width * 0.12);
  });
});
