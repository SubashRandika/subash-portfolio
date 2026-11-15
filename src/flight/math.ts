/** Small, allocation-free maths helpers shared by the flight modules. */

export const DEG = Math.PI / 180;

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** 0 at `edge0`, 1 at `edge1`, with zero slope at both ends. */
export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Like smoothstep but with zero acceleration at the ends as well. */
export function smootherstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * t * (t * (t * 6 - 15) + 10);
}

/**
 * Frame-rate independent exponential smoothing toward a target.
 * `lambda` is the response rate: higher settles faster.
 */
export function damp(current: number, target: number, lambda: number, dt: number): number {
  return lerp(current, target, 1 - Math.exp(-lambda * dt));
}

export type Keyframe = readonly [position: number, value: number];

/**
 * Builds a smooth curve through keyframes using monotone cubic interpolation
 * (Fritsch–Carlson). It passes through every key and never overshoots, so an
 * altitude profile cannot dip below a key or bounce after levelling off.
 */
export function createTrack(keys: readonly Keyframe[]): (position: number) => number {
  const n = keys.length;
  if (n === 0) throw new Error("A track needs at least one keyframe.");
  if (n === 1) {
    const only = keys[0]![1];
    return () => only;
  }

  const xs = keys.map((k) => k[0]);
  const ys = keys.map((k) => k[1]);
  for (let i = 1; i < n; i++) {
    if (xs[i]! <= xs[i - 1]!) throw new Error("Track keyframes must be in increasing order.");
  }

  const slopes: number[] = [];
  for (let i = 0; i < n - 1; i++) slopes.push((ys[i + 1]! - ys[i]!) / (xs[i + 1]! - xs[i]!));

  const tangents = new Array<number>(n).fill(0);
  tangents[0] = slopes[0]!;
  tangents[n - 1] = slopes[n - 2]!;
  for (let i = 1; i < n - 1; i++) {
    const before = slopes[i - 1]!;
    const after = slopes[i]!;
    tangents[i] = before * after <= 0 ? 0 : (before + after) / 2;
  }
  for (let i = 0; i < n - 1; i++) {
    const slope = slopes[i]!;
    if (slope === 0) {
      tangents[i] = 0;
      tangents[i + 1] = 0;
      continue;
    }
    const a = tangents[i]! / slope;
    const b = tangents[i + 1]! / slope;
    const magnitude = a * a + b * b;
    if (magnitude > 9) {
      const scale = 3 / Math.sqrt(magnitude);
      tangents[i] = scale * a * slope;
      tangents[i + 1] = scale * b * slope;
    }
  }

  return (position: number) => {
    if (position <= xs[0]!) return ys[0]!;
    if (position >= xs[n - 1]!) return ys[n - 1]!;
    let i = 0;
    while (position > xs[i + 1]!) i++;
    const width = xs[i + 1]! - xs[i]!;
    const t = (position - xs[i]!) / width;
    const t2 = t * t;
    const t3 = t2 * t;
    return (
      (2 * t3 - 3 * t2 + 1) * ys[i]! +
      (t3 - 2 * t2 + t) * width * tangents[i]! +
      (-2 * t3 + 3 * t2) * ys[i + 1]! +
      (t3 - t2) * width * tangents[i + 1]!
    );
  };
}
