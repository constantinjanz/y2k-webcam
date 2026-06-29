import { HAND_LANDMARK, type TrackedHand } from './handTracker';
import { clamp, distance, polygonCenter, type Point } from '../utils/math';

export type FingerName = 'thumb' | 'index' | 'middle' | 'ring' | 'pinky';
export type HandAnchorId = 'left' | 'right' | 'single';

export type FingerAnchor = {
  handId: HandAnchorId;
  finger: FingerName;
  x: number;
  y: number;
  z: number;
  confidence: number;
};

export type HandFingerState = {
  handId: HandAnchorId;
  handedness: 'Left' | 'Right';
  extended: Record<FingerName, boolean>;
  anchors: FingerAnchor[];
};

export type FingerMeasurement = {
  finger: FingerName;
  tip: Point;
  pip: Point;
  rawExtended: boolean;
  confidence: number;
};

export const FINGER_NAMES: FingerName[] = ['thumb', 'index', 'middle', 'ring', 'pinky'];

const FINGER_LANDMARKS: Record<FingerName, { tip: number; pip: number; mcp: number }> = {
  thumb: {
    tip: HAND_LANDMARK.THUMB_TIP,
    pip: HAND_LANDMARK.THUMB_IP,
    mcp: HAND_LANDMARK.THUMB_MCP,
  },
  index: {
    tip: HAND_LANDMARK.INDEX_TIP,
    pip: HAND_LANDMARK.INDEX_PIP,
    mcp: HAND_LANDMARK.INDEX_MCP,
  },
  middle: {
    tip: HAND_LANDMARK.MIDDLE_TIP,
    pip: HAND_LANDMARK.MIDDLE_PIP,
    mcp: HAND_LANDMARK.MIDDLE_MCP,
  },
  ring: {
    tip: HAND_LANDMARK.RING_TIP,
    pip: HAND_LANDMARK.RING_PIP,
    mcp: HAND_LANDMARK.RING_MCP,
  },
  pinky: {
    tip: HAND_LANDMARK.PINKY_TIP,
    pip: HAND_LANDMARK.PINKY_PIP,
    mcp: HAND_LANDMARK.PINKY_MCP,
  },
};

export function measureHandFingers(hand: TrackedHand): FingerMeasurement[] {
  const palm = getPalmCenter(hand);
  const wrist = hand.landmarks[HAND_LANDMARK.WRIST];
  const middleMcp = hand.landmarks[HAND_LANDMARK.MIDDLE_MCP];
  const indexMcp = hand.landmarks[HAND_LANDMARK.INDEX_MCP];
  const pinkyMcp = hand.landmarks[HAND_LANDMARK.PINKY_MCP];
  const palmWidth = Math.max(24, distance(indexMcp, pinkyMcp));
  const palmLength = Math.max(24, distance(wrist, middleMcp));
  const palmScale = Math.max(36, palmLength + palmWidth * 0.45);

  return FINGER_NAMES.map((finger) => {
    if (finger === 'thumb') {
      return measureThumb(hand, palm, palmScale);
    }

    return measureLongFinger(hand, finger, palm, wrist);
  });
}

export function getPalmCenter(hand: TrackedHand): Point {
  return polygonCenter([
    hand.landmarks[HAND_LANDMARK.WRIST],
    hand.landmarks[HAND_LANDMARK.THUMB_CMC],
    hand.landmarks[HAND_LANDMARK.INDEX_MCP],
    hand.landmarks[HAND_LANDMARK.MIDDLE_MCP],
    hand.landmarks[HAND_LANDMARK.RING_MCP],
    hand.landmarks[HAND_LANDMARK.PINKY_MCP],
  ]);
}

export function normalizeHandedness(label: string): 'Left' | 'Right' {
  return label === 'Right' ? 'Right' : 'Left';
}

function measureLongFinger(
  hand: TrackedHand,
  finger: Exclude<FingerName, 'thumb'>,
  palm: Point,
  wrist: Point,
): FingerMeasurement {
  const landmarks = FINGER_LANDMARKS[finger];
  const tip = hand.landmarks[landmarks.tip];
  const pip = hand.landmarks[landmarks.pip];
  const mcp = hand.landmarks[landmarks.mcp];
  const palmTipRatio = distance(tip, palm) / Math.max(1, distance(pip, palm));
  const wristTipRatio = distance(tip, wrist) / Math.max(1, distance(pip, wrist));
  const jointOpenRatio = distance(tip, mcp) / Math.max(1, distance(pip, mcp));
  const direction = dot(normalize(subtract(tip, pip)), normalize(subtract(pip, mcp)));
  const score =
    (palmTipRatio - 1.12) * 2.2 +
    (wristTipRatio - 1.06) * 1.5 +
    (jointOpenRatio - 1.1) * 1.35 +
    (direction + 0.05) * 0.7;
  const rawExtended = score > 0.28;

  return {
    finger,
    tip,
    pip,
    rawExtended,
    confidence: clamp(0.35 + score * 0.42, 0, 1),
  };
}

function measureThumb(hand: TrackedHand, palm: Point, palmScale: number): FingerMeasurement {
  const tip = hand.landmarks[HAND_LANDMARK.THUMB_TIP];
  const ip = hand.landmarks[HAND_LANDMARK.THUMB_IP];
  const mcp = hand.landmarks[HAND_LANDMARK.THUMB_MCP];
  const cmc = hand.landmarks[HAND_LANDMARK.THUMB_CMC];
  const palmTipRatio = distance(tip, palm) / Math.max(1, distance(ip, palm));
  const thumbOpenRatio = distance(tip, mcp) / Math.max(1, distance(ip, mcp));
  const awayFromPalm = distance(tip, palm) / palmScale;
  const direction = dot(normalize(subtract(tip, ip)), normalize(subtract(ip, cmc)));
  const score =
    (palmTipRatio - 1.04) * 1.8 +
    (thumbOpenRatio - 1.08) * 1.5 +
    (awayFromPalm - 0.48) * 1.25 +
    (direction + 0.15) * 0.42;

  return {
    finger: 'thumb',
    tip,
    pip: ip,
    rawExtended: score > 0.2,
    confidence: clamp(0.32 + score * 0.48, 0, 1),
  };
}

function subtract(a: Point, b: Point): Point {
  return { x: a.x - b.x, y: a.y - b.y, z: (a.z ?? 0) - (b.z ?? 0) };
}

function normalize(point: Point): Point {
  const length = Math.hypot(point.x, point.y, point.z ?? 0) || 1;
  return {
    x: point.x / length,
    y: point.y / length,
    z: (point.z ?? 0) / length,
  };
}

function dot(a: Point, b: Point) {
  return a.x * b.x + a.y * b.y + (a.z ?? 0) * (b.z ?? 0);
}
