import { describe, expect, it } from "vitest";

import { parseBlogPageParam } from "@/lib/blogPage";

describe("parseBlogPageParam", () => {
  it("defaults to page 1 when the parameter is absent", () => {
    expect(parseBlogPageParam(undefined)).toBe(1);
  });

  it("reads a positive integer", () => {
    expect(parseBlogPageParam("1")).toBe(1);
    expect(parseBlogPageParam("2")).toBe(2);
    expect(parseBlogPageParam("47")).toBe(47);
  });

  // Every one of these is accepted by `Number()`, which is why the parser matches
  // the shape first instead of converting and then validating.
  it.each([
    ["0", "zero is not a page"],
    ["-1", "negative"],
    ["1.5", "fractional"],
    [" 2 ", "padded, which Number() would accept as 2"],
    ["0x2", "hex, which Number() would accept as 2"],
    ["1e3", "exponent, which Number() would accept as 1000"],
    ["", "empty, which Number() would accept as 0"],
    ["01", "leading zero, so two URLs would name one page"],
    ["abc", "not a number at all"],
    ["9007199254740993", "past the safe integer range"],
  ])("falls back to page 1 for %o (%s)", (raw) => {
    expect(parseBlogPageParam(raw)).toBe(1);
  });

  // Next supplies an array for a repeated parameter. Ambiguous, so it takes the
  // same route as malformed rather than silently picking one.
  it("falls back to page 1 for a repeated parameter", () => {
    expect(parseBlogPageParam(["2", "3"])).toBe(1);
  });
});
