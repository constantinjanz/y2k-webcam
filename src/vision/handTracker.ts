import {
  FilesetResolver,
  HandLandmarker,
  type HandLandmarkerResult,
  type NormalizedLandmark,
} from '@mediapipe/tasks-vision';
import type { CoverFit } from '../utils/canvas';
import type { Point } from '../utils/math';

export const HAND_LANDMARK = {
  WRIST: 0,
  THUMB_CMC: 1,
  THUMB_MCP: 2,
  THUMB_IP: 3,
  THUMB_TIP: 4,
  INDEX_MCP: 5,
  INDEX_PIP: 6,
  INDEX_DIP: 7,
  INDEX_TIP: 8,
  MIDDLE_MCP: 9,
  MIDDLE_PIP: 10,
  MIDDLE_DIP: 11,
  MIDDLE_TIP: 12,
  RING_MCP: 13,
  RING_PIP: 14,
  RING_DIP: 15,
  RING_TIP: 16,
  PINKY_MCP: 17,
  PINKY_PIP: 18,
  PINKY_DIP: 19,
  PINKY_TIP: 20,
} as const;

export type TrackedHand = {
  id: string;
  handedness: string;
  score: number;
  landmarks: Point[];
};

const WASM_ROOT = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm';
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

export async function createHandTracker() {
  const vision = await FilesetResolver.forVisionTasks(WASM_ROOT);

  async function create(delegate: 'GPU' | 'CPU') {
    return HandLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: MODEL_URL,
        delegate,
      },
      runningMode: 'VIDEO',
      numHands: 2,
      minHandDetectionConfidence: 0.45,
      minHandPresenceConfidence: 0.45,
      minTrackingConfidence: 0.45,
    });
  }

  let landmarker: HandLandmarker;

  try {
    landmarker = await create('CPU');
  } catch {
    landmarker = await create('GPU');
  }

  return {
    detect(video: HTMLVideoElement, timeMs: number) {
      return landmarker.detectForVideo(video, timeMs);
    },
    close() {
      landmarker.close();
    },
  };
}

export type HandTracker = Awaited<ReturnType<typeof createHandTracker>>;

export function mapHandResultsToCanvas(
  result: HandLandmarkerResult,
  video: HTMLVideoElement,
  fit: CoverFit,
): TrackedHand[] {
  return result.landmarks.map((landmarks, index) => {
    const handedness = result.handednesses[index]?.[0];
    const label = handedness?.categoryName ?? `Hand ${index + 1}`;
    const score = handedness?.score ?? 0;

    return {
      id: `${label}-${index}`,
      handedness: label,
      score,
      landmarks: landmarks.map((landmark) => mapLandmarkToCanvas(landmark, video, fit)),
    };
  });
}

function mapLandmarkToCanvas(landmark: NormalizedLandmark, video: HTMLVideoElement, fit: CoverFit): Point {
  const videoX = landmark.x * video.videoWidth;
  const videoY = landmark.y * video.videoHeight;
  const croppedX = (videoX - fit.sx) / fit.sw;
  const croppedY = (videoY - fit.sy) / fit.sh;

  return {
    x: fit.dx + fit.dw - croppedX * fit.dw,
    y: fit.dy + croppedY * fit.dh,
    z: landmark.z,
  };
}
