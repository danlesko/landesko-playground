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
const RECORDED = [
  "translate",
  "ellipse",
  "noLoop",
  "redraw",
  "vertex",
  "triangle",
  "arc",
] as const;

/**
 * Which way each fish faces, in draw order: `1` is left-to-right. The last is
 * the cursor-following fish, which is drawn after the other eight.
 */
const FACING = [1, 1, 1, 1, -1, -1, -1, -1, -1] as const;

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

type Stub = ReturnType<typeof mount>;

function runFrames(stub: Stub, frames: number) {
  for (let i = 0; i < frames; i++) {
    stub.p5.draw();
  }
  return stub.takeCalls("translate");
}

/**
 * The furthest right each fish was drawn, keyed by its slot in the draw order.
 * Per fish rather than overall so that fixing the wrap in one direction and not
 * the other still shows up.
 */
function maxDrawnX(calls: number[][]) {
  const perFish: number[] = [];
  calls.forEach((args, index) => {
    const slot = index % 9;
    perFish[slot] = Math.max(perFish[slot] ?? -Infinity, args[0] ?? 0);
  });
  return perFish;
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

    // Per-frame travel in draw order, signed, and the cursor-following fish last
    // - it has no speed of its own and the cursor has not moved. Every one of
    // them, not just the leading fish: the four right-to-left fish are the ones a
    // direction mix-up leaves motionless, and they are invisible to a check that
    // only reads the head of the school.
    const travel = [3, 4, 4, 4.5, -3, -2.5, -4, -1.5, 0];

    expect(secondFrame).toHaveLength(travel.length);
    travel.forEach((step, slot) => {
      expect(secondFrame[slot]?.[0]).toBeCloseTo(
        (firstFrame[slot]?.[0] ?? 0) + step,
      );
    });
  });

  // The two goldfish-drawing functions used to be one per direction, differing
  // only in the sign of every x. Merging them put that sign in a parameter, so
  // there are two things to hold: that each fish is still passed the direction it
  // had, and that the one function is still a strict mirror of itself. A fish
  // whose tail alone forgot to mirror is not a fish.
  //
  // Every recorded coordinate here is in the fish's own space, because the stub
  // does not apply p5's transformations - so the signs below are the fish's own
  // and are unaffected by where in the tank it is.
  it("faces every part of every fish the way it swims", () => {
    const stub = mount(true);

    // The fish are drawn before the sand and before any bubble, which are the
    // only other sources of these calls, so each fish's parts are its slot's.
    const vertices = stub.takeCalls("vertex");
    const ellipses = stub.takeCalls("ellipse");
    const triangles = stub.takeCalls("triangle");
    const arcs = stub.takeCalls("arc");
    expect(vertices.length).toBeGreaterThan(FACING.length * 3);
    expect(ellipses.length).toBeGreaterThanOrEqual(FACING.length * 3);
    expect(triangles).toHaveLength(FACING.length);
    expect(arcs).toHaveLength(FACING.length);

    FACING.forEach((direction, slot) => {
      // The tail trails behind, so it is on the far side from the heading.
      for (const [x] of vertices.slice(slot * 3, slot * 3 + 3)) {
        expect(Math.sign(x ?? 0)).toBe(-direction);
      }

      // Body, then eye, then pupil. The body is centred, so only the eye is
      // asked about - it is on the leading side, as is the mouth.
      expect(Math.sign(ellipses[slot * 3 + 1]?.[0] ?? 0)).toBe(direction);
      expect(Math.sign(arcs[slot]?.[0] ?? 0)).toBe(direction);

      // The pelvic fin reaches back, its leading corner forward.
      const fin = triangles[slot] ?? [];
      expect(Math.sign(fin[2] ?? 0)).toBe(-direction);
      expect(Math.sign(fin[4] ?? 0)).toBe(direction);
    });
  });

  // Only the leading fish dodges. The obvious way to get that wrong while
  // keeping every existing assertion green is to apply the dodge to all of them.
  it("moves only the leading fish out of the cursor's way", () => {
    const away = -10_000;
    const frames = 300;

    // Two runs from the same start are identical frame for frame, so the last
    // frame can be compared directly: the cursor is parked far away for every
    // frame but the last, and only then moved onto a fish.
    const lastFrameWithCursorOn = (target?: number[]) => {
      const stub = mount(false);
      stub.p5.mouseX = away;
      stub.p5.mouseY = away;
      runFrames(stub, frames - 1);
      stub.p5.mouseX = target?.[0] ?? away;
      stub.p5.mouseY = target?.[1] ?? away;
      return runFrames(stub, 1);
    };

    const undisturbed = lastFrameWithCursorOn();
    expect(undisturbed).toHaveLength(9);

    // Sitting the cursor exactly on the leading fish shoves it 50px along the
    // x-axis: dist is 0, so the escape angle is 0.
    const onLead = lastFrameWithCursorOn(undisturbed[0]);
    expect(onLead[0]?.[0]).toBeCloseTo((undisturbed[0]?.[0] ?? 0) + 50);

    // Every other fish ignores it. The ninth is excluded because it *is* the
    // cursor: it is drawn wherever the cursor is.
    const onSecond = lastFrameWithCursorOn(undisturbed[1]);
    expect(onSecond.slice(0, 8)).toEqual(undisturbed.slice(0, 8));
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

  // The wrap-around thresholds used to read a width measured once at startup and
  // never refreshed. So after the window narrowed, the left-to-right fish kept
  // swimming most of a screen past the right-hand edge before turning over, and
  // the right-to-left ones reappeared that far out on the other side.
  //
  // Stated as: a tank that was resized behaves like one that was always the new
  // size. That needs no bound to be derived by hand, and the defect it guards
  // against is 700px, three orders of magnitude outside the tolerance below.
  it("wraps against the current canvas width, not the startup width", () => {
    // Long enough for the slowest fish - 1.5px per frame over some 1700px - to
    // wrap at least once, so that neither run is still showing anything that
    // depends on where it started.
    const warmup = 2000;
    const sample = 1500;

    const always = mount(false, 700);
    runFrames(always, warmup);
    const control = maxDrawnX(runFrames(always, sample));

    const resized = mount(false, 1400);
    runFrames(resized, warmup);
    resized.p5.windowWidth = 700;
    resized.p5.windowResized?.(undefined as never);
    runFrames(resized, warmup);
    const after = maxDrawnX(runFrames(resized, sample));

    expect(resized.width).toBe(always.width);
    expect(after).toHaveLength(9);
    after.forEach((max, slot) => {
      // Not equality: the exact maximum depends on where in its cycle a fish is
      // when sampling starts, and the fastest covers 4.5px per frame.
      expect(Math.abs(max - (control[slot] ?? 0))).toBeLessThan(5);
    });
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
