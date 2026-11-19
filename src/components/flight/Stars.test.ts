import { describe, expect, it } from "vitest";
import { buildStarField } from "./Stars";

describe("star field", () => {
  it("is the same on every visit", () => {
    const a = buildStarField(200).getAttribute("position").array;
    const b = buildStarField(200).getAttribute("position").array;
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it("puts stars on the sky and makes most of them faint", () => {
    const field = buildStarField(1100);
    const positions = field.getAttribute("position");
    const brightness = Array.from(field.getAttribute("aBright").array);
    for (let i = 0; i < positions.count; i++) {
      const length = Math.hypot(positions.getX(i), positions.getY(i), positions.getZ(i));
      expect(length).toBeCloseTo(1, 5);
      expect(positions.getY(i)).toBeGreaterThan(-0.05);
    }
    const bright = brightness.filter((value) => value > 0.5).length;
    expect(bright).toBeGreaterThan(0);
    expect(bright / brightness.length).toBeLessThan(0.15);
  });
});
