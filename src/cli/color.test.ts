import { describe, it, expect } from "vitest";
import { palette, shouldUseColor } from "./color.js";

describe("shouldUseColor", () => {
  it("is off when output is piped or redirected", () => {
    expect(shouldUseColor({}, undefined)).toBe(false);
    expect(shouldUseColor({}, false)).toBe(false);
  });

  it("is on for a terminal", () => {
    expect(shouldUseColor({}, true)).toBe(true);
  });

  it("lets NO_COLOR and FORCE_COLOR override the terminal check", () => {
    expect(shouldUseColor({ NO_COLOR: "1" }, true)).toBe(false);
    expect(shouldUseColor({ FORCE_COLOR: "0" }, true)).toBe(false);
    expect(shouldUseColor({ FORCE_COLOR: "1" }, undefined)).toBe(true);
  });
});

describe("palette", () => {
  it("wraps text in ANSI codes only when enabled", () => {
    expect(palette(true).red("x")).toBe("\x1b[31mx\x1b[0m");
    expect(palette(false).red("x")).toBe("x");
  });
});
