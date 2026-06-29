import type { TrackedHand } from './handTracker';
import {
  FINGER_NAMES,
  getPalmCenter,
  measureHandFingers,
  normalizeHandedness,
  type FingerAnchor,
  type FingerName,
  type HandAnchorId,
  type HandFingerState,
} from './fingerState';
import { lerp, type Point } from '../utils/math';

export type AnchorFrame = {
  hands: HandFingerState[];
  anchors: FingerAnchor[];
  rawAnchors: FingerAnchor[];
};

type FingerLatch = {
  active: boolean;
  activeFrames: number;
  inactiveFrames: number;
  point: Point | null;
  confidence: number;
  lastSeenAt: number;
};

const ACTIVE_FRAMES = 2;
const INACTIVE_FRAMES = 4;
const POSITION_LERP = 0.36;

export function createAnchorTracker() {
  const latches = new Map<string, FingerLatch>();

  return {
    update(rawHands: TrackedHand[], now: number): AnchorFrame {
      const assignments = assignVisualHands(rawHands);
      const observedKeys = new Set<string>();
      const hands: HandFingerState[] = [];
      const anchors: FingerAnchor[] = [];
      const rawAnchors: FingerAnchor[] = [];

      assignments.forEach(({ hand, handId }) => {
        const measurements = measureHandFingers(hand);
        const extended = createEmptyExtendedMap();
        const handAnchors: FingerAnchor[] = [];

        measurements.forEach((measurement) => {
          const key = getLatchKey(handId, measurement.finger);
          const latch = updateLatch(
            latches.get(key),
            measurement.rawExtended,
            measurement.tip,
            measurement.confidence,
            now,
          );
          latches.set(key, latch);
          observedKeys.add(key);

          if (measurement.rawExtended) {
            rawAnchors.push(toAnchor(handId, measurement.finger, measurement.tip, measurement.confidence));
          }

          if (latch.active && latch.point) {
            const anchor = toAnchor(handId, measurement.finger, latch.point, latch.confidence);
            extended[measurement.finger] = true;
            handAnchors.push(anchor);
            anchors.push(anchor);
          }
        });

        hands.push({
          handId,
          handedness: normalizeHandedness(hand.handedness),
          extended,
          anchors: handAnchors,
        });
      });

      latches.forEach((latch, key) => {
        if (observedKeys.has(key)) return;
        latch.inactiveFrames += 1;
        latch.activeFrames = 0;

        if (latch.inactiveFrames >= INACTIVE_FRAMES || now - latch.lastSeenAt > 450) {
          latch.active = false;
        }

        if (now - latch.lastSeenAt > 1800) {
          latches.delete(key);
        }
      });

      return { hands, anchors, rawAnchors };
    },
    reset() {
      latches.clear();
    },
  };
}

function assignVisualHands(rawHands: TrackedHand[]): Array<{ hand: TrackedHand; handId: HandAnchorId; center: Point }> {
  const withCenters = rawHands
    .slice(0, 2)
    .map((hand) => ({ hand, center: getPalmCenter(hand) }))
    .sort((a, b) => a.center.x - b.center.x);

  if (withCenters.length === 1) {
    return [{ ...withCenters[0], handId: 'single' }];
  }

  return withCenters.map((entry, index) => ({
    ...entry,
    handId: index === 0 ? 'left' : 'right',
  }));
}

function updateLatch(
  latch: FingerLatch | undefined,
  rawExtended: boolean,
  point: Point,
  confidence: number,
  now: number,
): FingerLatch {
  const next = latch ?? {
    active: false,
    activeFrames: 0,
    inactiveFrames: 0,
    point: null,
    confidence: 0,
    lastSeenAt: now,
  };

  if (rawExtended) {
    next.activeFrames += 1;
    next.inactiveFrames = 0;
    next.active = next.active || next.activeFrames >= ACTIVE_FRAMES;
  } else {
    next.inactiveFrames += 1;
    next.activeFrames = 0;

    if (next.inactiveFrames >= INACTIVE_FRAMES) {
      next.active = false;
    }
  }

  next.point = next.point ? lerpPoint(next.point, point, POSITION_LERP) : point;
  next.confidence = lerp(next.confidence || confidence, confidence, 0.28);
  next.lastSeenAt = now;

  return next;
}

function toAnchor(handId: HandAnchorId, finger: FingerName, point: Point, confidence: number): FingerAnchor {
  return {
    handId,
    finger,
    x: point.x,
    y: point.y,
    z: point.z ?? 0,
    confidence,
  };
}

function createEmptyExtendedMap(): Record<FingerName, boolean> {
  return FINGER_NAMES.reduce(
    (extended, finger) => {
      extended[finger] = false;
      return extended;
    },
    {} as Record<FingerName, boolean>,
  );
}

function getLatchKey(handId: HandAnchorId, finger: FingerName) {
  return `${handId}:${finger}`;
}

function lerpPoint(a: Point, b: Point, amount: number): Point {
  return {
    x: lerp(a.x, b.x, amount),
    y: lerp(a.y, b.y, amount),
    z: lerp(a.z ?? 0, b.z ?? 0, amount),
  };
}
