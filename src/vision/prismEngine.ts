import { createAnchorTracker, type AnchorFrame } from './anchors';
import { FINGER_NAMES, type FingerAnchor, type FingerName, type HandFingerState } from './fingerState';
import type { TrackedHand } from './handTracker';
import { angleBetween, clamp, distance, expandFromCenter, polygonCenter, type Point } from '../utils/math';

export type SheetState = 'ACTIVE' | 'FADING' | 'INACTIVE';

export type PrismFrame = {
  hands: HandFingerState[];
  anchors: FingerAnchor[];
  rawAnchors: FingerAnchor[];
  points: Point[];
  foldLines: Array<[Point, Point]>;
  crossingPoints: Point[];
  effectActive: boolean;
  renderActive: boolean;
  sheetState: SheetState;
  crossing: boolean;
  decay: number;
  center: Point;
  distance: number;
  tilt: number;
  motion: number;
  fps: number;
  logLines: string[];
};

type PrismOptions = {
  width: number;
  height: number;
  sensitivity: number;
};

type LastSheet = Pick<
  PrismFrame,
  'points' | 'foldLines' | 'crossingPoints' | 'crossing' | 'center' | 'distance' | 'tilt'
> & { motion: number };

const HOLD_MS = 220;
const DECAY_MS = 760;
const SHEET_LERP = 0.3;
const CROSSING_STICKY_MS = 220;

export function createPrismEngine() {
  const anchorTracker = createAnchorTracker();
  let lastActiveAt = 0;
  let lastCrossingAt = 0;
  let lastCrossingPoints: Point[] = [];
  let lastSheet: LastSheet | null = null;
  let lastFrameAt = 0;
  let fps = 0;

  return {
    update(rawHands: TrackedHand[], now: number, options: PrismOptions): PrismFrame {
      const anchorFrame = anchorTracker.update(rawHands, now);
      fps = updateFps(fps, now, lastFrameAt);
      lastFrameAt = now;

      const activation = getActivation(anchorFrame);
      const liveSheet = activation.effectActive ? buildLiveSheet(anchorFrame.anchors, options, lastSheet) : null;

      if (liveSheet) {
        lastActiveAt = now;
        if (liveSheet.crossing) {
          lastCrossingAt = now;
          lastCrossingPoints = liveSheet.crossingPoints;
        } else if (now - lastCrossingAt < CROSSING_STICKY_MS) {
          liveSheet.crossing = true;
          liveSheet.crossingPoints = lastCrossingPoints;
        }
        lastSheet = liveSheet;

        return buildFrame(anchorFrame, liveSheet, {
          effectActive: true,
          renderActive: true,
          sheetState: 'ACTIVE',
          decay: 1,
          fps,
        });
      }

      if (lastSheet && lastActiveAt) {
        const missingFor = now - lastActiveAt;
        const decay = getDecay(missingFor);

        if (decay > 0) {
          return buildFrame(anchorFrame, lastSheet, {
            effectActive: false,
            renderActive: true,
            sheetState: missingFor <= HOLD_MS ? 'ACTIVE' : 'FADING',
            decay,
            fps,
          });
        }
      }

      return buildFrame(anchorFrame, null, {
        effectActive: false,
        renderActive: false,
        sheetState: 'INACTIVE',
        decay: 0,
        fps,
      });
    },
    reset() {
      anchorTracker.reset();
      lastActiveAt = 0;
      lastCrossingAt = 0;
      lastCrossingPoints = [];
      lastSheet = null;
      lastFrameAt = 0;
      fps = 0;
    },
  };
}

function getActivation(frame: AnchorFrame) {
  const anchorsByHand = groupAnchorsByHand(frame.anchors);
  const hasOneHandWithTwoFingers = Array.from(anchorsByHand.values()).some((anchors) => anchors.length >= 2);
  const hasEnoughTotalAnchors = frame.anchors.length >= 3 || (hasOneHandWithTwoFingers && frame.anchors.length >= 2);

  return {
    hasOneHandWithTwoFingers,
    hasEnoughTotalAnchors,
    effectActive: hasOneHandWithTwoFingers && hasEnoughTotalAnchors,
  };
}

function buildLiveSheet(anchors: FingerAnchor[], options: PrismOptions, previousSheet: LastSheet | null): LastSheet {
  const sortedPoints = orderSheetPoints(anchors);
  const expandedPoints = expandFromCenter(sortedPoints, 1.04 + clamp(options.sensitivity - 1, -0.45, 0.65) * 0.04);
  const motion = getPointMotion(previousSheet?.points, expandedPoints);
  const points = smoothSheetPoints(previousSheet?.points, expandedPoints, SHEET_LERP);
  const center = polygonCenter(points);
  const foldLines = buildFoldLines(anchors, points);
  const crossingPoints = findCrossingPoints(points, foldLines);
  const zValues = anchors.map((anchor) => anchor.z);
  const tilt = clamp((Math.max(...zValues, 0) - Math.min(...zValues, 0)) * 9, -1, 1);
  const maxDistance = points.reduce((largest, point) => Math.max(largest, distance(center, point)), 0);

  return {
    points,
    foldLines,
    crossingPoints,
    crossing: crossingPoints.length > 0 || isTwisted(anchors),
    center,
    distance: maxDistance,
    tilt,
    motion,
  };
}

function buildFrame(
  anchorFrame: AnchorFrame,
  sheet: LastSheet | null,
  state: Pick<PrismFrame, 'effectActive' | 'renderActive' | 'sheetState' | 'decay' | 'fps'>,
): PrismFrame {
  const points = sheet?.points ?? [];
  const crossing = Boolean(sheet?.crossing);

  return {
    hands: anchorFrame.hands,
    anchors: anchorFrame.anchors,
    rawAnchors: anchorFrame.rawAnchors,
    points,
    foldLines: sheet?.foldLines ?? [],
    crossingPoints: sheet?.crossingPoints ?? [],
    crossing,
    center: sheet?.center ?? { x: 0, y: 0, z: 0 },
    distance: sheet?.distance ?? 0,
    tilt: sheet?.tilt ?? 0,
    motion: sheet?.motion ?? 0,
    logLines: makeLogLines(anchorFrame, state.sheetState, crossing),
    ...state,
  };
}

function orderSheetPoints(anchors: FingerAnchor[]): Point[] {
  if (anchors.length === 2) {
    return buildTwoAnchorSheet(anchors);
  }

  const stablePoints = orderAnchorsStably(anchors).map(anchorToPoint);
  if (stablePoints.length >= 3 && Math.abs(getPolygonArea(stablePoints)) > 120) {
    return stablePoints;
  }

  const points = anchors.map(anchorToPoint);
  const center = polygonCenter(points);

  return points
    .map((point) => ({ point, angle: angleBetween(center, point) }))
    .sort((a, b) => a.angle - b.angle)
    .map(({ point }) => point);
}

function orderAnchorsStably(anchors: FingerAnchor[]) {
  const left = sortAnchorsByFinger(anchors.filter((anchor) => anchor.handId === 'left'));
  const right = sortAnchorsByFinger(anchors.filter((anchor) => anchor.handId === 'right'));
  const single = sortAnchorsByFinger(anchors.filter((anchor) => anchor.handId === 'single'));

  if (single.length) {
    return single;
  }

  if (left.length || right.length) {
    return [...left, ...right.reverse()];
  }

  return sortAnchorsByFinger(anchors);
}

function buildTwoAnchorSheet(anchors: FingerAnchor[]): Point[] {
  const a = anchorToPoint(anchors[0]);
  const b = anchorToPoint(anchors[1]);
  const length = Math.max(1, distance(a, b));
  let normal = {
    x: -(b.y - a.y) / length,
    y: (b.x - a.x) / length,
    z: 0,
  };

  if (normal.y < 0) {
    normal = { x: -normal.x, y: -normal.y, z: 0 };
  }

  const offset = clamp(length * 0.58, 42, 150);

  return [
    a,
    b,
    { x: b.x + normal.x * offset, y: b.y + normal.y * offset, z: b.z },
    { x: a.x + normal.x * offset, y: a.y + normal.y * offset, z: a.z },
  ];
}

function buildFoldLines(anchors: FingerAnchor[], points: Point[]): Array<[Point, Point]> {
  const foldLines: Array<[Point, Point]> = [];

  for (let index = 0; index < points.length; index += 1) {
    const next = (index + 2) % points.length;
    if (points.length > 3 && index < next) {
      foldLines.push([points[index], points[next]]);
    }
  }

  const left = anchors.filter((anchor) => anchor.handId === 'left');
  const right = anchors.filter((anchor) => anchor.handId === 'right');

  if (left.length && right.length) {
    const leftByFinger = sortAnchorsByFinger(left);
    const rightByFinger = sortAnchorsByFinger(right);
    const matchedFingers = FINGER_NAMES.filter(
      (finger) => leftByFinger.some((anchor) => anchor.finger === finger) && rightByFinger.some((anchor) => anchor.finger === finger),
    );

    matchedFingers.forEach((finger) => {
      const a = leftByFinger.find((anchor) => anchor.finger === finger);
      const b = rightByFinger.find((anchor) => anchor.finger === finger);
      if (a && b) {
        foldLines.push([anchorToPoint(a), anchorToPoint(b)]);
      }
    });

    const maxPairs = Math.min(leftByFinger.length, rightByFinger.length);
    for (let index = 0; index < maxPairs; index += 1) {
      foldLines.push([anchorToPoint(leftByFinger[index]), anchorToPoint(rightByFinger[index])]);
    }
  }

  return dedupeLines(foldLines);
}

function findCrossingPoints(points: Point[], foldLines: Array<[Point, Point]>): Point[] {
  const crossings: Point[] = [];
  const polygonEdges = points.map<[Point, Point]>((point, index) => [point, points[(index + 1) % points.length]]);
  const segments = [...polygonEdges, ...foldLines];

  for (let a = 0; a < segments.length; a += 1) {
    for (let b = a + 1; b < segments.length; b += 1) {
      if (shareEndpoint(segments[a], segments[b])) continue;
      const crossing = getSegmentIntersection(segments[a][0], segments[a][1], segments[b][0], segments[b][1]);
      if (crossing) {
        crossings.push(crossing);
      }
    }
  }

  return crossings.slice(0, 8);
}

function isTwisted(anchors: FingerAnchor[]) {
  const left = sortAnchorsByFinger(anchors.filter((anchor) => anchor.handId === 'left'));
  const right = sortAnchorsByFinger(anchors.filter((anchor) => anchor.handId === 'right'));
  if (left.length < 2 || right.length < 2) return false;

  const leftSlope = Math.sign(left[left.length - 1].y - left[0].y);
  const rightSlope = Math.sign(right[right.length - 1].y - right[0].y);
  return Boolean(leftSlope && rightSlope && leftSlope !== rightSlope);
}

function getSegmentIntersection(a: Point, b: Point, c: Point, d: Point): Point | null {
  const denominator = (a.x - b.x) * (c.y - d.y) - (a.y - b.y) * (c.x - d.x);
  if (Math.abs(denominator) < 0.001) return null;

  const t = ((a.x - c.x) * (c.y - d.y) - (a.y - c.y) * (c.x - d.x)) / denominator;
  const u = -((a.x - b.x) * (a.y - c.y) - (a.y - b.y) * (a.x - c.x)) / denominator;

  if (t <= 0.02 || t >= 0.98 || u <= 0.02 || u >= 0.98) return null;

  return {
    x: a.x + t * (b.x - a.x),
    y: a.y + t * (b.y - a.y),
    z: 0,
  };
}

function shareEndpoint(a: [Point, Point], b: [Point, Point]) {
  return a.some((pointA) => b.some((pointB) => distance(pointA, pointB) < 2));
}

function sortAnchorsByFinger(anchors: FingerAnchor[]) {
  return [...anchors].sort((a, b) => FINGER_NAMES.indexOf(a.finger) - FINGER_NAMES.indexOf(b.finger));
}

function groupAnchorsByHand(anchors: FingerAnchor[]) {
  return anchors.reduce((groups, anchor) => {
    const group = groups.get(anchor.handId) ?? [];
    group.push(anchor);
    groups.set(anchor.handId, group);
    return groups;
  }, new Map<FingerAnchor['handId'], FingerAnchor[]>());
}

function smoothSheetPoints(previous: Point[] | undefined, next: Point[], amount: number) {
  if (!previous || previous.length !== next.length) {
    return next;
  }

  return next.map((point, index) => ({
    x: previous[index].x + (point.x - previous[index].x) * amount,
    y: previous[index].y + (point.y - previous[index].y) * amount,
    z: (previous[index].z ?? 0) + ((point.z ?? 0) - (previous[index].z ?? 0)) * amount,
  }));
}

function getPointMotion(previous: Point[] | undefined, next: Point[]) {
  if (!previous || previous.length !== next.length) {
    return 0;
  }

  const total = next.reduce((sum, point, index) => sum + distance(point, previous[index]), 0);
  return total / next.length;
}

function getPolygonArea(points: Point[]) {
  let area = 0;

  for (let index = 0; index < points.length; index += 1) {
    const next = points[(index + 1) % points.length];
    area += points[index].x * next.y - next.x * points[index].y;
  }

  return area * 0.5;
}

function dedupeLines(lines: Array<[Point, Point]>): Array<[Point, Point]> {
  const seen = new Set<string>();

  return lines.filter(([a, b]) => {
    const key = `${Math.round(a.x)}:${Math.round(a.y)}>${Math.round(b.x)}:${Math.round(b.y)}`;
    const reverseKey = `${Math.round(b.x)}:${Math.round(b.y)}>${Math.round(a.x)}:${Math.round(a.y)}`;
    if (seen.has(key) || seen.has(reverseKey)) return false;
    seen.add(key);
    return true;
  });
}

function anchorToPoint(anchor: FingerAnchor): Point {
  return {
    x: anchor.x,
    y: anchor.y,
    z: anchor.z,
  };
}

function getDecay(missingFor: number) {
  if (missingFor <= HOLD_MS) return 1;
  return clamp(1 - (missingFor - HOLD_MS) / DECAY_MS, 0, 1);
}

function updateFps(currentFps: number, now: number, lastFrameAt: number) {
  if (!lastFrameAt) return currentFps;
  const instant = 1000 / Math.max(1, now - lastFrameAt);
  return currentFps ? currentFps * 0.88 + instant * 0.12 : instant;
}

function makeLogLines(frame: AnchorFrame, sheetState: SheetState, crossing: boolean) {
  const anchors = frame.anchors.length;
  const hands = frame.hands.length;
  const activeFingers = frame.hands
    .map((hand) => {
      const fingers = FINGER_NAMES.filter((finger) => hand.extended[finger]).join(' ');
      return `${hand.handId.toUpperCase()}:${fingers || 'none'}`;
    })
    .join(' | ');

  return [
    '> landmark packet received',
    `> hands=${hands} anchors=${anchors}`,
    `> active fingers ${activeFingers || 'none'}`,
    `> sheet ${sheetState.toLowerCase()}`,
    crossing ? '> crossing distortion detected' : '> crossing monitor clear',
    '> prism shader: extended_finger_rgb',
  ];
}
