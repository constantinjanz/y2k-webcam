export type Point = {
  x: number;
  y: number;
  z?: number;
};

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

export function lerpPoint(a: Point, b: Point, t: number): Point {
  return {
    x: lerp(a.x, b.x, t),
    y: lerp(a.y, b.y, t),
    z: lerp(a.z ?? 0, b.z ?? 0, t),
  };
}

export function distance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function midpoint(a: Point, b: Point): Point {
  return {
    x: (a.x + b.x) * 0.5,
    y: (a.y + b.y) * 0.5,
    z: ((a.z ?? 0) + (b.z ?? 0)) * 0.5,
  };
}

export function angleBetween(a: Point, b: Point) {
  return Math.atan2(b.y - a.y, b.x - a.x);
}

export function polygonCenter(points: Point[]): Point {
  if (!points.length) {
    return { x: 0, y: 0, z: 0 };
  }

  const total = points.reduce<{ x: number; y: number; z: number }>(
    (sum, point) => ({
      x: sum.x + point.x,
      y: sum.y + point.y,
      z: sum.z + (point.z ?? 0),
    }),
    { x: 0, y: 0, z: 0 },
  );

  return {
    x: total.x / points.length,
    y: total.y / points.length,
    z: total.z / points.length,
  };
}

export function expandFromCenter(points: Point[], amount: number) {
  const center = polygonCenter(points);
  return points.map((point) => ({
    x: center.x + (point.x - center.x) * amount,
    y: center.y + (point.y - center.y) * amount,
    z: point.z,
  }));
}

export function randomRange(min: number, max: number) {
  return min + Math.random() * (max - min);
}
