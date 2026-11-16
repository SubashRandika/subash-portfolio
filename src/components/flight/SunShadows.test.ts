import { describe, expect, it } from "vitest";
import { SHADOW_BUDGET, createShadowBudget, recordShadowFrame } from "./SunShadows";

function run(frameMs: number, frames: number) {
  const budget = createShadowBudget();
  let droppedAt = -1;
  for (let i = 0; i < frames; i++) {
    if (recordShadowFrame(budget, frameMs) && droppedAt < 0) droppedAt = i;
  }
  return { budget, droppedAt };
}

describe("shadow frame budget", () => {
  it("keeps shadows on a device that holds 60 fps", () => {
    expect(run(16.7, 2_000).budget.dropped).toBe(false);
  });

  it("gives shadows up on a device that cannot keep up, after the warm-up", () => {
    const { budget, droppedAt } = run(33.4, 2_000);
    expect(budget.dropped).toBe(true);
    expect(droppedAt).toBeGreaterThanOrEqual(SHADOW_BUDGET.warmUp);
  });

  it("ignores pauses such as a hidden tab", () => {
    expect(run(400, 2_000).budget.dropped).toBe(false);
  });
});
