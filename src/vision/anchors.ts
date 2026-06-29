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
import { clamp, distance, lerp, type Point } from '../utils/math';

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
  score: number;
  lastUpdateAt: number;
  lastSeenAt: number;
};

const ACTIVE_FRAMES = 3;
const INACTIVE_FRAMES = 6;
const LOST_ANCHOR_HOLD_MS = 250;
const LATCH_DELETE_MS = 1800;
const SLOW_LERP = 0.14;
const FAST_LERP = 0.58;
const LONG_FINGER_ENTER_SCORE = 0.62;
const LONG_FINGER_EXIT_SCORE = 0.34;
const THUMB_ENTER_SCORE = 0.58;
const THUMB_EXIT_SCORE = 0.26;
const MIN_ACTIVE_CONFIDENCE = 0.55;
const MIN_STAY_CONFIDENCE = 0.34;
const LOW_CONFIDENCE = 0.25;
const HARD_CURL_SCORE = -0.08;

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
            measurement.finger,
            measurement.rawExtended,
            measurement.score,
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

        if (latch.inactiveFrames >= INACTIVE_FRAMES || now - latch.lastSeenAt > LOST_ANCHOR_HOLD_MS) {
          latch.active = false;
        }

        if (latch.active && latch.point && now - latch.lastSeenAt <= LOST_ANCHOR_HOLD_MS) {
          const { handId, finger } = parseLatchKey(key);
          const fadedConfidence = latch.confidence * (1 - (now - latch.lastSeenAt) / LOST_ANCHOR_HOLD_MS);
          anchors.push(toAnchor(handId, finger, latch.point, fadedConfidence));
        }

        if (now - latch.lastSeenAt > LATCH_DELETE_MS) {
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
  finger: FingerName,
  rawExtended: boolean,
  rawScore: number,
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
    score: rawScore,
    lastUpdateAt: now,
    lastSeenAt: now,
  };
  const dt = Math.max(16, now - next.lastUpdateAt) / 1000;
  const movement = next.point ? distance(next.point, point) : 0;
  const velocity = movement / dt;
  const positionLerp = lerp(SLOW_LERP, FAST_LERP, clamp((velocity - 80) / 980, 0, 1));
  const scoreLerp = next.active ? 0.18 : 0.28;
  const enterScore = finger === 'thumb' ? THUMB_ENTER_SCORE : LONG_FINGER_ENTER_SCORE;
  const exitScore = finger === 'thumb' ? THUMB_EXIT_SCORE : LONG_FINGER_EXIT_SCORE;
  const smoothedScore = lerp(next.score, rawScore, scoreLerp);
  const canEnter = rawExtended && confidence >= MIN_ACTIVE_CONFIDENCE && smoothedScore > enterScore;
  const canStay = rawExtended && confidence >= MIN_STAY_CONFIDENCE && smoothedScore > exitScore;
  const wantsActive = next.active ? canStay : canEnter;
  const clearlyInactive = !rawExtended && (confidence < LOW_CONFIDENCE || rawScore < HARD_CURL_SCORE);

  if (wantsActive) {
    next.activeFrames += 1;
    next.inactiveFrames = 0;
    next.active = next.active || next.activeFrames >= ACTIVE_FRAMES;
  } else {
    next.inactiveFrames += clearlyInactive ? 2 : 1;
    next.activeFrames = 0;

    if (next.inactiveFrames >= INACTIVE_FRAMES) {
      next.active = false;
    }
  }

  next.point = next.point ? lerpPoint(next.point, point, positionLerp) : point;
  next.confidence = lerp(next.confidence || confidence, confidence, 0.28);
  next.score = smoothedScore;
  next.lastUpdateAt = now;
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

function parseLatchKey(key: string): { handId: HandAnchorId; finger: FingerName } {
  const [handId, finger] = key.split(':') as [HandAnchorId, FingerName];
  return { handId, finger };
}

function lerpPoint(a: Point, b: Point, amount: number): Point {
  return {
    x: lerp(a.x, b.x, amount),
    y: lerp(a.y, b.y, amount),
    z: lerp(a.z ?? 0, b.z ?? 0, amount),
  };
}
