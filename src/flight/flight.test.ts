import { describe, expect, it } from "vitest";
import { gearPose } from "./aircraft";
import { clamp, createTrack, damp, DEG, smoothstep } from "./math";
import {
  LIFTOFF,
  ROLL_END,
  ROLL_START,
  ROUTE_LENGTH,
  createFlightPose,
  flightPose,
  routeAltitude,
  routeDistance,
  routeLateral,
  routeSpeed,
} from "./path";
import {
  SHOT_KEYS,
  cameraHeading,
  cameraModeAt,
  cameraPose,
  createCameraPose,
  createShot,
  shotAt,
  shotNameAt,
} from "./shots";
import { CHAPTER_NUMBERS, CHAPTER_RANGES } from "./timeline";
import { OPENING_EXIT, chapterBeats, milestoneArrival, segmentArrival } from "./waypoints";
import {
  commitFlightProgress,
  flightStore,
  resetFlightStore,
  setFlightTarget,
  subscribeSegment,
} from "./store";

const STEPS = 2000;
const samples = Array.from({ length: STEPS + 1 }, (_, i) => i / STEPS);

describe("math", () => {
  it("clamps and smoothsteps", () => {
    expect(clamp(5, 0, 1)).toBe(1);
    expect(clamp(-5, 0, 1)).toBe(0);
    expect(smoothstep(0, 1, 0.5)).toBe(0.5);
    expect(smoothstep(2, 4, 1)).toBe(0);
    expect(smoothstep(2, 4, 9)).toBe(1);
  });

  it("damps toward a target independent of frame rate", () => {
    const oneStep = damp(0, 1, 4, 1 / 30);
    const twoSteps = damp(damp(0, 1, 4, 1 / 60), 1, 4, 1 / 60);
    expect(oneStep).toBeCloseTo(twoSteps, 10);
    expect(damp(0, 1, 4, 100)).toBeCloseTo(1, 6);
  });

  it("builds tracks that hit every key and never overshoot", () => {
    const track = createTrack([
      [0, 0],
      [1, 10],
      [2, 10],
      [3, 4],
    ]);
    expect(track(0)).toBe(0);
    expect(track(1)).toBeCloseTo(10, 10);
    expect(track(2)).toBeCloseTo(10, 10);
    expect(track(3)).toBe(4);
    for (let x = 0; x <= 3; x += 0.01) {
      expect(track(x)).toBeGreaterThanOrEqual(-1e-9);
      expect(track(x)).toBeLessThanOrEqual(10 + 1e-9);
    }
    // Flat between equal keys: no bounce after levelling off.
    expect(track(1.5)).toBeCloseTo(10, 10);
    expect(() => createTrack([[1, 0], [1, 2]])).toThrow(/increasing/);
  });
});

describe("route distance", () => {
  it("holds on the runway, then only ever moves forward", () => {
    expect(routeDistance(0)).toBe(0);
    expect(routeDistance(ROLL_START)).toBe(0);
    let previous = 0;
    for (const p of samples) {
      const d = routeDistance(p);
      expect(d).toBeGreaterThanOrEqual(previous);
      previous = d;
    }
    expect(ROUTE_LENGTH).toBeGreaterThan(40_000);
  });

  it("accelerates smoothly with no jump in distance or speed", () => {
    const before = routeDistance(ROLL_END - 1e-7);
    const after = routeDistance(ROLL_END + 1e-7);
    expect(after - before).toBeLessThan(0.05);
    expect(routeSpeed(ROLL_START)).toBe(0);
    expect(routeSpeed(ROLL_END)).toBe(1);
    // Numerical derivative agrees with the stated speed profile.
    const p = (ROLL_START + ROLL_END) / 2;
    const h = 1e-5;
    const derivative = (routeDistance(p + h) - routeDistance(p - h)) / (2 * h);
    expect(derivative / 52_000).toBeCloseTo(routeSpeed(p), 3);
  });

  it("keeps the route straight over the runway", () => {
    for (let d = 0; d <= 3_500; d += 100) expect(routeLateral(d)).toBe(0);
  });
});

describe("flight pose", () => {
  it("starts parked on the runway, wings level, gear down", () => {
    const pose = flightPose(0, createFlightPose());
    expect(pose).toMatchObject({ x: 0, y: 0, z: -0, pitch: 0, roll: 0, gear: 1, airborne: false });
    expect(pose.yaw).toBeCloseTo(Math.PI, 10);
  });

  it("is a pure function of progress, so the flight is exactly reversible", () => {
    const forward = samples.map((p) => ({ ...flightPose(p, createFlightPose()) }));
    const scratch = createFlightPose();
    // Visit the same progress values in reverse, reusing one pose object.
    for (let i = samples.length - 1; i >= 0; i--) {
      expect({ ...flightPose(samples[i]!, scratch) }).toEqual(forward[i]);
    }
  });

  it("stays on the ground until liftoff and never goes below it", () => {
    for (const p of samples) {
      const altitude = routeAltitude(p);
      expect(altitude).toBeGreaterThanOrEqual(0);
      if (p <= LIFTOFF) expect(altitude).toBe(0);
    }
    expect(flightPose(LIFTOFF + 0.03, createFlightPose()).airborne).toBe(true);
  });

  it("rotates the nose up before the wheels leave the runway", () => {
    const pose = flightPose(LIFTOFF - 0.001, createFlightPose());
    expect(pose.y).toBe(0);
    expect(pose.pitch).toBeGreaterThan(5 * DEG);
    expect(pose.roll).toBe(0);
  });

  it("keeps attitude within believable limits", () => {
    const pose = createFlightPose();
    for (const p of samples) {
      flightPose(p, pose);
      expect(Math.abs(pose.roll)).toBeLessThanOrEqual(32 * DEG + 1e-9);
      expect(pose.pitch).toBeLessThan(24 * DEG);
      expect(pose.pitch).toBeGreaterThan(-14 * DEG);
    }
  });

  it("moves continuously, with no jumps in position or attitude", () => {
    const a = createFlightPose();
    const b = createFlightPose();
    for (let i = 1; i < samples.length; i++) {
      flightPose(samples[i - 1]!, a);
      flightPose(samples[i]!, b);
      const step = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
      expect(step).toBeLessThan(45); // 1/2000 of the route is 26 m at cruise
      expect(Math.abs(b.yaw - a.yaw)).toBeLessThan(2 * DEG);
      expect(Math.abs(b.pitch - a.pitch)).toBeLessThan(1.2 * DEG);
      expect(Math.abs(b.roll - a.roll)).toBeLessThan(1.5 * DEG);
    }
  });

  it("retracts the gear after takeoff and turns the landing lights off", () => {
    expect(flightPose(0.06, createFlightPose()).gear).toBe(1);
    const climbing = flightPose(0.14, createFlightPose());
    expect(climbing.gear).toBe(0);
    expect(climbing.landingLights).toBe(0);
  });

  it("banks into turns in the direction of the turn", () => {
    const pose = createFlightPose();
    let checked = 0;
    for (const p of samples) {
      if (p < 0.2) continue;
      flightPose(p, pose);
      if (Math.abs(pose.roll) < 8 * DEG) continue;
      // Curving toward +X (right of travel) must lower the right wing.
      const ahead = routeLateral(pose.distance + 200);
      const behind = routeLateral(pose.distance - 200);
      const curvingRight = ahead + behind - 2 * pose.x > 0;
      expect(pose.roll > 0).toBe(curvingRight);
      checked++;
    }
    expect(checked).toBeGreaterThan(50);
  });
});

describe("landing gear", () => {
  it("is straight when down and folded and hidden when stowed", () => {
    expect(gearPose(1)).toEqual({
      noseRotationX: -0,
      mainLeftRotationZ: -0,
      mainRightRotationZ: 0,
      visible: true,
    });
    const stowed = gearPose(0);
    expect(stowed.visible).toBe(false);
    expect(stowed.noseRotationX).toBeLessThan(-1.5);
    expect(stowed.mainLeftRotationZ).toBeCloseTo(-stowed.mainRightRotationZ, 10);
  });
});

describe("camera", () => {
  it("opens low behind the aircraft and reaches a side view after liftoff", () => {
    const pose = flightPose(0, createFlightPose());
    const camera = cameraPose(0, pose, createCameraPose());
    expect(camera.pz).toBeGreaterThan(20); // behind an aircraft facing -Z
    expect(camera.px).toBeLessThan(-10); // off to its left
    expect(camera.py).toBeLessThan(7); // low
    expect(shotNameAt(0)).toBe("parked at dawn");
    expect(cameraModeAt(0)).toBe("establishing");
    expect(cameraModeAt(0.05)).toBe("rear chase");
    expect(cameraModeAt(0.095)).toBe("side tracking");

    const side = shotAt(0.09, createShot());
    expect(side.azimuth).toBeCloseTo(82, 5);
  });

  it("reaches each shot key exactly", () => {
    const shot = createShot();
    for (const key of SHOT_KEYS) {
      shotAt(key.at, shot);
      expect(shot.azimuth).toBeCloseTo(key.azimuth, 6);
      expect(shot.distance).toBeCloseTo(key.distance, 6);
      expect(shot.fov).toBeCloseTo(key.fov, 6);
    }
  });

  it("never dips below the ground and never jumps", () => {
    const pose = createFlightPose();
    const a = createCameraPose();
    const b = createCameraPose();
    for (let i = 1; i < samples.length; i++) {
      cameraPose(samples[i - 1]!, flightPose(samples[i - 1]!, pose), a);
      cameraPose(samples[i]!, flightPose(samples[i]!, pose), b);
      expect(b.py).toBeGreaterThanOrEqual(1.1 - 1e-9);
      const step = Math.hypot(b.px - a.px, b.py - a.py, b.pz - a.pz);
      expect(step).toBeLessThan(60);
      expect(Math.hypot(b.ux, b.uy, b.uz)).toBeCloseTo(1, 6);
    }
  });

  it("uses all six camera modes, in order of progress", () => {
    const modes = new Set(SHOT_KEYS.map((key) => key.mode));
    expect([...modes].sort()).toEqual(
      ["close-up", "establishing", "high aerial", "rear chase", "side tracking", "top-down"].sort(),
    );
    for (let i = 1; i < SHOT_KEYS.length; i++) {
      expect(SHOT_KEYS[i]!.at).toBeGreaterThan(SHOT_KEYS[i - 1]!.at);
    }
    // The mapping chapter is seen from directly overhead; the flight ends wide.
    expect(cameraModeAt(0.58)).toBe("top-down");
    expect(cameraModeAt(0.99)).toBe("establishing");
  });

  it("looks down the direction of travel in the top-down view", () => {
    const pose = flightPose(0.585, createFlightPose());
    const camera = cameraPose(0.585, pose, createCameraPose());
    // Almost directly above the aircraft…
    expect(camera.py - pose.y).toBeGreaterThan(150);
    expect(Math.hypot(camera.px - pose.x, camera.pz - pose.z)).toBeLessThan(40);
    // …with "up" on screen pointing along the route, so the aircraft flies
    // up the frame as on a map.
    const heading = cameraHeading(pose.distance);
    const along = camera.ux * Math.sin(heading) + camera.uz * Math.cos(heading);
    expect(along).toBeGreaterThan(0.99);
    expect(Math.abs(camera.uy)).toBeLessThan(0.1);
  });

  it("is reversible like the flight itself", () => {
    const pose = createFlightPose();
    const first = { ...cameraPose(0.31, flightPose(0.31, pose), createCameraPose()) };
    cameraPose(0.9, flightPose(0.9, pose), createCameraPose());
    const again = { ...cameraPose(0.31, flightPose(0.31, pose), createCameraPose()) };
    expect(again).toEqual(first);
  });
});

describe("flight store", () => {
  it("clamps input and reports chapter changes once", () => {
    resetFlightStore();
    const seen: number[] = [];
    const unsubscribe = subscribeSegment((segment) => seen.push(segment));

    setFlightTarget(4);
    expect(flightStore.target).toBe(1);

    commitFlightProgress(0.01);
    commitFlightProgress(0.02);
    expect(seen).toEqual([]);
    commitFlightProgress(0.1);
    commitFlightProgress(0.15);
    commitFlightProgress(0.7);
    expect(seen).toEqual([1, 5]);

    unsubscribe();
    commitFlightProgress(0.9);
    expect(seen).toEqual([1, 5]);
    resetFlightStore();
  });
});

describe("waypoints", () => {
  it("keeps every beat inside its chapter and in order", () => {
    for (const chapter of CHAPTER_NUMBERS) {
      const [start, end] = CHAPTER_RANGES[chapter];
      const beats = chapterBeats(chapter, 5);
      const sequence = [
        beats.introIn[0],
        beats.introIn[1],
        ...beats.milestones,
        beats.exit[0],
        beats.exit[1],
        ...(beats.closingIn ?? []),
      ];
      expect(sequence[0]).toBeGreaterThan(start);
      expect(sequence[sequence.length - 1]).toBeLessThan(end);
      for (let i = 1; i < sequence.length; i++) {
        expect(sequence[i]).toBeGreaterThan(sequence[i - 1]!);
      }
    }
  });

  it("gives only the final chapter a closing message", () => {
    expect(chapterBeats(3, 4).closingIn).toBeNull();
    expect(chapterBeats(6, 3).closingIn).not.toBeNull();
  });

  it("lands navigation where the destination is on screen", () => {
    expect(segmentArrival(0)).toBe(0);
    for (const chapter of CHAPTER_NUMBERS) {
      const beats = chapterBeats(chapter, 4);
      const arrival = segmentArrival(chapter);
      expect(arrival).toBeGreaterThan(beats.introIn[1]);
      expect(arrival).toBeLessThan(beats.milestones[0]!);
      expect(milestoneArrival(chapter, 2, 4)).toBeGreaterThan(beats.milestones[2]!);
      expect(milestoneArrival(chapter, 2, 4)).toBeLessThan(beats.milestones[3]!);
    }
    expect(() => milestoneArrival(1, 9, 4)).toThrow(/no milestone/);
  });

  it("clears the opening text before the first chapter begins", () => {
    expect(OPENING_EXIT[0]).toBeGreaterThan(0);
    expect(OPENING_EXIT[1]).toBeLessThan(CHAPTER_RANGES[1][0]);
  });
});
