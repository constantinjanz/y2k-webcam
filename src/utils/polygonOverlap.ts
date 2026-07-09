import polygonClipping, { type MultiPolygon, type Polygon } from 'polygon-clipping';
import type { Point } from './math';

type PolygonClippingRuntime = {
  intersection: (geom: Polygon | MultiPolygon, ...geoms: Array<Polygon | MultiPolygon>) => MultiPolygon;
  union: (geom: Polygon | MultiPolygon, ...geoms: Array<Polygon | MultiPolygon>) => MultiPolygon;
};

const clipper = polygonClipping as unknown as PolygonClippingRuntime;
const MIN_OVERLAP_AREA = 24;
const MAX_EXACT_OVERLAP_POINTS = 6;

export function findPolygonOverlapRegions(points: Point[]): Point[][] {
  if (points.length < 4) return [];
  if (points.length > MAX_EXACT_OVERLAP_POINTS) return [];

  try {
    return findPolygonOverlapRegionsUnsafe(points);
  } catch {
    return [];
  }
}

function findPolygonOverlapRegionsUnsafe(points: Point[]): Point[][] {
  const triangles = triangulateFan(points);
  if (triangles.length < 2) return [];

  const overlaps: Polygon[] = [];

  for (let a = 0; a < triangles.length; a += 1) {
    for (let b = a + 1; b < triangles.length; b += 1) {
      if (Math.abs(a - b) <= 1) continue;

      const intersection = clipper.intersection(toPolygon(triangles[a]), toPolygon(triangles[b]));
      multiPolygonToRegions(intersection).forEach((region) => {
        if (Math.abs(polygonArea(region)) >= MIN_OVERLAP_AREA) {
          overlaps.push(toPolygon(region));
        }
      });
    }
  }

  if (!overlaps.length) return [];

  const merged = overlaps.length === 1 ? [overlaps[0]] : clipper.union(overlaps[0], ...overlaps.slice(1));
  return multiPolygonToRegions(merged)
    .filter((region) => Math.abs(polygonArea(region)) >= MIN_OVERLAP_AREA)
    .slice(0, 6);
}

function triangulateFan(points: Point[]): Point[][] {
  const origin = points[0];
  const triangles: Point[][] = [];

  for (let index = 1; index < points.length - 1; index += 1) {
    triangles.push([origin, points[index], points[index + 1]]);
  }

  return triangles.filter((triangle) => Math.abs(polygonArea(triangle)) >= MIN_OVERLAP_AREA);
}

function toPolygon(points: Point[]): Polygon {
  return [points.map((point) => [point.x, point.y])];
}

function multiPolygonToRegions(multiPolygon: MultiPolygon | null | undefined): Point[][] {
  if (!multiPolygon) return [];

  return multiPolygon
    .map((polygon) => polygon[0] ?? [])
    .map((ring) => normalizeRing(ring.map(([x, y]) => ({ x, y, z: 0 }))))
    .filter((ring) => ring.length >= 3);
}

function normalizeRing(points: Point[]): Point[] {
  if (points.length < 2) return points;
  const normalized = [...points];
  const first = normalized[0];
  const last = normalized[normalized.length - 1];

  if (Math.abs(first.x - last.x) < 0.001 && Math.abs(first.y - last.y) < 0.001) {
    normalized.pop();
  }

  return normalized;
}

function polygonArea(points: Point[]) {
  let area = 0;

  for (let index = 0; index < points.length; index += 1) {
    const next = points[(index + 1) % points.length];
    area += points[index].x * next.y - next.x * points[index].y;
  }

  return area * 0.5;
}
