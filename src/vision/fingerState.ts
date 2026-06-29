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
  score: number;
};

export const FINGER_NAMES: FingerName[] = ['thumb', 'index', 'middle', 'ring', 'pinky'];

const FINGER_LANDMARKS: Record<FingerName, { tip: number; pip: number; dip: number; mcp: number }> = {
  thumb: {
    tip: HAND_LANDMARK.THUMB_TIP,
    pip: HAND_LANDMARK.THUMB_IP,
    dip: HAND_LANDMARK.THUMB_IP,
    mcp: HAND_LANDMARK.THUMB_MCP,
  },
  index: {
    tip: HAND_LANDMARK.INDEX_TIP,
    pip: HAND_LANDMARK.INDEX_PIP,
    dip: HAND_LANDMARK.INDEX_DIP,
    mcp: HAND_LANDMARK.INDEX_MCP,
  },
  middle: {
    tip: HAND_LANDMARK.MIDDLE_TIP,
    pip: HAND_LANDMARK.MIDDLE_PIP,
    dip: HAND_LANDMARK.MIDDLE_DIP,
    mcp: HAND_LANDMARK.MIDDLE_MCP,
  },
  ring: {
    tip: HAND_LANDMARK.RING_TIP,
    pip: HAND_LANDMARK.RING_PIP,
    dip: HAND_LANDMARK.RING_DIP,
    mcp: HAND_LANDMARK.RING_MCP,
  },
  pinky: {
    tip: HAND_LANDMARK.PINKY_TIP,
    pip: HAND_LANDMARK.PINKY_PIP,
    dip: HAND_LANDMARK.PINKY_DIP,
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
  const dip = hand.landmarks[landmarks.dip];
  const mcp = hand.landmarks[landmarks.mcp];
  const tipPalm = distance(tip, palm);
  const pipPalm = distance(pip, palm);
  const mcpPalm = distance(mcp, palm);
  const tipWrist = distance(tip, wrist);
  const pipWrist = distance(pip, wrist);
  const tipMcp = distance(tip, mcp);
  const pipMcp = distance(pip, mcp);
  const mcpPip = distance(pip, mcp);

  // Rotation-tolerant extension: a real extended finger is long, straight,
  // and moves the tip clearly away from the palm. Curled fingers fail at
  // least one of these even when the hand is tilted.
  const palmTipRatio = tipPalm / Math.max(1, pipPalm);
  const palmMcpRatio = tipPalm / Math.max(1, mcpPalm);
  const wristTipRatio = tipWrist / Math.max(1, pipWrist);
  const jointOpenRatio = tipMcp / Math.max(1, pipMcp);
  const palmClearance = (tipPalm - pipPalm) / Math.max(1, mcpPip);
  const baseStraightness = dot(normalize(subtract(pip, mcp)), normalize(subtract(dip, pip)));
  const tipStraightness = dot(normalize(subtract(dip, pip)), normalize(subtract(tip, dip)));
  const straightness = Math.min(baseStraightness, tipStraightness);
  const fingerPenalty = finger === 'ring' ? 0.1 : finger === 'pinky' ? 0.06 : finger === 'middle' ? 0.04 : 0;
  const score =
    (palmTipRatio - 1.2) * 1.55 +
    (palmMcpRatio - 1.42) * 0.75 +
    (wristTipRatio - 1.1) * 1.05 +
    (jointOpenRatio - 1.42) * 1.25 +
    (palmClearance - 0.46) * 1.15 +
    (straightness - 0.62) * 1.35 -
    fingerPenalty;
  const rawExtended =
    score > 0.62 &&
    palmTipRatio > 1.16 &&
    jointOpenRatio > 1.3 &&
    palmClearance > 0.36 &&
    straightness > 0.56;

  return {
    finger,
    tip,
    pip,
    rawExtended,
    confidence: clamp(0.2 + score * 0.55, 0, 1),
    score,
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
    rawExtended: score > 0.42 && awayFromPalm > 0.52 && thumbOpenRatio > 1.12,
    confidence: clamp(0.22 + score * 0.52, 0, 1),
    score,
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
