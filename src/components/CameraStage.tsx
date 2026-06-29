import { useCallback, useEffect, useRef, useState } from 'react';
import { PRESETS, getPreset, type PresetId, type VisualPreset } from '../effects/presets';
import { drawPrismSheet } from '../effects/prismSheet';
import { captureFeedback, drawFeedbackTrails } from '../effects/trails';
import { useCanvasRecorder } from '../recording/useCanvasRecorder';
import {
  createCanvasBuffers,
  drawGlitchLineNoise,
  drawMirroredVideo,
  drawTimestamp,
  getVideoCoverFit,
  renderPixelatedVideoBuffer,
  resizeCanvasToDisplaySize,
  type CanvasBuffers,
} from '../utils/canvas';
import { clamp } from '../utils/math';
import { TechnicalHud, type TechnicalHudSnapshot } from './TechnicalHud';
import { FINGER_NAMES, type FingerAnchor } from '../vision/fingerState';
import { createHandTracker, HAND_LANDMARK, mapHandResultsToCanvas, type HandTracker, type TrackedHand } from '../vision/handTracker';
import { createPrismEngine, type PrismFrame } from '../vision/prismEngine';

type CameraSettings = {
  presetId: PresetId;
  debug: boolean;
  sensitivity: number;
  intensity: number;
};

const HAND_CONNECTIONS = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [0, 5],
  [5, 6],
  [6, 7],
  [7, 8],
  [5, 9],
  [9, 10],
  [10, 11],
  [11, 12],
  [9, 13],
  [13, 14],
  [14, 15],
  [15, 16],
  [13, 17],
  [0, 17],
  [17, 18],
  [18, 19],
  [19, 20],
] as const;

const EMPTY_HUD: TechnicalHudSnapshot = {
  hands: 0,
  anchors: 0,
  sheetState: 'INACTIVE',
  crossing: false,
  fps: 0,
  preset: 'Xerox Rave',
  leftFingers: [],
  rightFingers: [],
  singleFingers: [],
  logs: ['> camera bus idle', '> awaiting landmark packet', '> mode extended_finger_prism'],
};

export function CameraStage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const trackerRef = useRef<HandTracker | null>(null);
  const rafRef = useRef<number | null>(null);
  const buffersRef = useRef<CanvasBuffers | null>(null);
  const prismEngineRef = useRef(createPrismEngine());
  const lastVideoTimeRef = useRef(-1);
  const lastDetectedHandsRef = useRef<TrackedHand[]>([]);
  const lastHudUpdateRef = useRef(0);
  const lastHudSnapshotRef = useRef<TechnicalHudSnapshot>(EMPTY_HUD);
  const feedbackFrameRef = useRef(0);
  const startedRef = useRef(false);
  const modelReadyRef = useRef(false);
  const settingsRef = useRef<CameraSettings>({
    presetId: 'xerox-rave',
    debug: false,
    sensitivity: 1,
    intensity: 1,
  });

  const [isStarted, setIsStarted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState('Camera idle. Frames stay in this browser.');
  const [error, setError] = useState('');
  const [presetId, setPresetId] = useState<PresetId>('xerox-rave');
  const [debug, setDebug] = useState(false);
  const [sensitivity, setSensitivity] = useState(1);
  const [intensity, setIntensity] = useState(1);
  const [hudSnapshot, setHudSnapshot] = useState<TechnicalHudSnapshot>(EMPTY_HUD);
  const recorder = useCanvasRecorder(canvasRef);

  settingsRef.current = {
    presetId,
    debug,
    sensitivity,
    intensity,
  };
  startedRef.current = isStarted;
  modelReadyRef.current = Boolean(trackerRef.current);

  const renderFrame = useCallback((now: number) => {
    const canvas = canvasRef.current;
    const video = videoRef.current;

    if (!canvas) {
      rafRef.current = requestAnimationFrame(renderFrame);
      return;
    }

    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) {
      rafRef.current = requestAnimationFrame(renderFrame);
      return;
    }

    const { width, height } = resizeCanvasToDisplaySize(canvas);
    const settings = settingsRef.current;
    const preset = getPreset(settings.presetId);

    ctx.save();
    ctx.fillStyle = '#030306';
    ctx.fillRect(0, 0, width, height);

    if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !video.videoWidth || !video.videoHeight) {
      drawStandby(ctx, width, height);
      ctx.restore();
      rafRef.current = requestAnimationFrame(renderFrame);
      return;
    }

    if (!buffersRef.current) {
      buffersRef.current = createCanvasBuffers();
    }

    const buffers = buffersRef.current;
    const fit = getVideoCoverFit(video.videoWidth, video.videoHeight, width, height);
    renderPixelatedVideoBuffer(buffers.pixel, video, width, height, preset.pixelScale);

    ctx.save();
    ctx.filter = getBackgroundFilter(settings.presetId, settings.intensity);
    drawMirroredVideo(ctx, video, fit);
    ctx.restore();

    ctx.fillStyle = preset.backgroundTint;
    ctx.fillRect(0, 0, width, height);
    const drawTrails = shouldDrawFeedbackTrails(preset, settings.intensity);
    if (drawTrails) {
      drawFeedbackTrails(ctx, buffers.feedback, preset, settings.intensity);
    }

    let detectedHands = lastDetectedHandsRef.current;
    const tracker = trackerRef.current;
    if (tracker && video.currentTime !== lastVideoTimeRef.current) {
      lastVideoTimeRef.current = video.currentTime;
      try {
        detectedHands = mapHandResultsToCanvas(tracker.detect(video, now), video, fit);
        lastDetectedHandsRef.current = detectedHands;
      } catch (trackingError) {
        console.warn('Hand tracking frame failed', trackingError);
      }
    }

    const prismFrame = prismEngineRef.current.update(detectedHands, now, {
      sensitivity: settings.sensitivity,
      width,
      height,
    });

    drawPrismSheet(ctx, buffers.pixel, prismFrame, preset, now, settings.intensity);
    if (settings.intensity > 1.25 && Math.floor(now / 90) % 2 === 0) {
      drawGlitchLineNoise(ctx, width, height, preset.noise * settings.intensity * 0.35, now * 0.02);
    }
    if (settings.debug) {
      drawAnchorLabels(ctx, prismFrame.anchors, preset, width);
    }

    if (preset.timestamp) {
      drawTimestamp(ctx, width, height);
    }

    if (settings.debug) {
      drawDebugLandmarks(ctx, detectedHands, prismFrame, preset.accent);
    }

    drawCornerHud(ctx, width, height, prismFrame, preset.label);
    if (drawTrails) {
      feedbackFrameRef.current += 1;
      if (feedbackFrameRef.current % 4 === 0) {
        captureFeedback(buffers.feedback, canvas);
      }
    }
    ctx.restore();

    if (now - lastHudUpdateRef.current > 500) {
      lastHudUpdateRef.current = now;
      const nextSnapshot = toHudSnapshot(prismFrame, preset);
      if (!areHudSnapshotsEqual(lastHudSnapshotRef.current, nextSnapshot)) {
        lastHudSnapshotRef.current = nextSnapshot;
        setHudSnapshot(nextSnapshot);
      }
    }

    rafRef.current = requestAnimationFrame(renderFrame);
  }, []);

  const startCamera = useCallback(async () => {
    if (isLoading || isStarted) return;

    if (!navigator.mediaDevices?.getUserMedia) {
      setError('This browser does not expose camera access.');
      return;
    }

    const video = videoRef.current;
    if (!video) return;

    setIsLoading(true);
    setError('');
    setStatus('Requesting camera permission...');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { ideal: 30, max: 30 },
          facingMode: 'user',
        },
      });

      streamRef.current = stream;
      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;
      await video.play();

      if (!trackerRef.current) {
        setStatus('Loading hand model...');
        trackerRef.current = await createHandTracker();
        modelReadyRef.current = true;
      }

      prismEngineRef.current.reset();
      lastDetectedHandsRef.current = [];
      lastVideoTimeRef.current = -1;
      feedbackFrameRef.current = 0;
      setIsStarted(true);
      setStatus('Live. Extend fingers to pin a glitch sheet to your hands.');

      if (rafRef.current === null) {
        rafRef.current = requestAnimationFrame(renderFrame);
      }
    } catch (cameraError) {
      console.error(cameraError);
      setError('Camera or hand model could not start. Check permission and network access for the MediaPipe model.');
      setStatus('Camera idle. Frames stay in this browser.');
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, isStarted, renderFrame]);

  const stopCamera = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    if (recorder.isRecording) {
      recorder.stopRecording();
    }

    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;

    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.srcObject = null;
    }

    prismEngineRef.current.reset();
    lastDetectedHandsRef.current = [];
    lastHudSnapshotRef.current = EMPTY_HUD;
    setHudSnapshot(EMPTY_HUD);
    setIsStarted(false);
    setStatus('Camera stopped. No frames are uploaded or stored.');
  }, [recorder]);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(renderFrame);

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }

      streamRef.current?.getTracks().forEach((track) => track.stop());
      trackerRef.current?.close();
      trackerRef.current = null;
    };
  }, [renderFrame]);

  return (
    <section className="camera-shell" aria-label="Glitch Hands live camera app">
      <video ref={videoRef} className="camera-video" aria-hidden="true" />
      <canvas ref={canvasRef} className="camera-canvas" />

      <div className="scanline-overlay" aria-hidden="true" />
      <TechnicalHud
        snapshot={hudSnapshot}
        cameraActive={isStarted}
        modelReady={Boolean(trackerRef.current)}
        isRecording={recorder.isRecording}
      />

      {!isStarted && (
        <div className="start-panel">
          <p className="eyebrow">computer vision / prism mesh</p>
          <h1>Glitch Hands</h1>
          <p className="tagline">Extend fingers to anchor a live Y2K glitch sheet.</p>
          <button className="primary-button" type="button" onClick={startCamera} disabled={isLoading}>
            {isLoading ? 'Starting...' : 'Start Camera'}
          </button>
          <p className="privacy-copy">Camera stays local in your browser. No uploads. No backend.</p>
          {error && <p className="error-copy">{error}</p>}
        </div>
      )}

      <div className="top-chrome">
        <div>
          <p className="app-kicker">PrismCam / Finger Anchor Mesh</p>
          <p className="status-line">{status}</p>
        </div>
        <div className="meter" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
          <span />
        </div>
      </div>

      {isStarted && (
        <div className="control-deck" aria-label="Camera controls">
          <label className="control-field">
            <span>Preset</span>
            <select value={presetId} onChange={(event) => setPresetId(event.target.value as PresetId)}>
              {PRESETS.map((presetOption) => (
                <option key={presetOption.id} value={presetOption.id}>
                  {presetOption.label}
                </option>
              ))}
            </select>
          </label>

          <label className="control-field slider-field">
            <span>Sensitivity</span>
            <input
              type="range"
              min="0.55"
              max="1.65"
              step="0.05"
              value={sensitivity}
              onChange={(event) => setSensitivity(Number(event.target.value))}
            />
          </label>

          <label className="control-field slider-field">
            <span>Intensity</span>
            <input
              type="range"
              min="0.4"
              max="1.8"
              step="0.05"
              value={intensity}
              onChange={(event) => setIntensity(Number(event.target.value))}
            />
          </label>

          <label className="toggle-field">
            <input type="checkbox" checked={debug} onChange={(event) => setDebug(event.target.checked)} />
            <span>Debug landmarks</span>
          </label>

          <div className="button-row">
            <button className="secondary-button" type="button" onClick={stopCamera}>
              Stop Camera
            </button>
            <button
              className="record-button"
              type="button"
              onClick={recorder.isRecording ? recorder.stopRecording : recorder.startRecording}
              disabled={!recorder.isSupported}
            >
              {recorder.isRecording ? 'Stop Recording' : 'Record'}
            </button>
          </div>

          {(recorder.error || error) && <p className="error-copy compact">{recorder.error || error}</p>}
        </div>
      )}
    </section>
  );
}

function getBackgroundFilter(presetId: PresetId, intensity: number) {
  if (presetId === 'club-flyer') return `contrast(${1.18 + intensity * 0.16}) saturate(0.84) brightness(0.9)`;
  if (presetId === 'webcam-2001') return `contrast(${1.22 + intensity * 0.14}) saturate(0.7) brightness(0.94)`;
  if (presetId === 'dirty-scanner') return `contrast(${1.34 + intensity * 0.18}) saturate(0.38) brightness(0.88)`;
  if (presetId === 'acid-broadcast') return `contrast(1.18) saturate(${1.2 + intensity * 0.32}) brightness(0.92)`;
  return `contrast(${1.2 + intensity * 0.15}) saturate(0.78) brightness(0.9)`;
}

function shouldDrawFeedbackTrails(preset: VisualPreset, intensity: number) {
  return intensity >= 1.35 && preset.trailAlpha >= 0.12;
}

function drawStandby(ctx: CanvasRenderingContext2D, width: number, height: number) {
  ctx.save();
  ctx.fillStyle = '#030306';
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = 'rgba(54, 245, 199, 0.18)';
  ctx.lineWidth = 1;

  const step = Math.max(28, Math.floor(width * 0.045));
  for (let x = 0; x < width; x += step) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }

  for (let y = 0; y < height; y += step) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  ctx.restore();
}

function drawDebugLandmarks(
  ctx: CanvasRenderingContext2D,
  trackedHands: TrackedHand[],
  frame: PrismFrame,
  accent: string,
) {
  ctx.save();
  ctx.lineWidth = 2;
  ctx.font = '12px "Courier New", monospace';

  trackedHands.forEach((hand) => {
    ctx.strokeStyle = 'rgba(54, 245, 199, 0.72)';
    HAND_CONNECTIONS.forEach(([from, to]) => {
      const a = hand.landmarks[from];
      const b = hand.landmarks[to];
      if (!a || !b) return;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    });

    hand.landmarks.forEach((point, index) => {
      const isFingerTip =
        index === HAND_LANDMARK.THUMB_TIP ||
        index === HAND_LANDMARK.INDEX_TIP ||
        index === HAND_LANDMARK.MIDDLE_TIP ||
        index === HAND_LANDMARK.RING_TIP ||
        index === HAND_LANDMARK.PINKY_TIP;
      ctx.fillStyle = isFingerTip ? '#ffe84a' : accent;
      ctx.beginPath();
      ctx.arc(point.x, point.y, isFingerTip ? 4 : 2.5, 0, Math.PI * 2);
      ctx.fill();
    });
  });

  frame.foldLines.forEach(([a, b]) => {
    ctx.strokeStyle = frame.crossing ? 'rgba(255, 255, 255, 0.8)' : 'rgba(255, 232, 74, 0.42)';
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  });

  ctx.restore();
}

function drawAnchorLabels(
  ctx: CanvasRenderingContext2D,
  anchors: FingerAnchor[],
  preset: VisualPreset,
  width: number,
) {
  if (!anchors.length) return;

  ctx.save();
  ctx.font = `${clamp(width * 0.011, 10, 14)}px "Courier New", monospace`;
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.82)';
  ctx.shadowBlur = 8;

  anchors.forEach((anchor) => {
    const label = `${anchor.handId.charAt(0).toUpperCase()}_${anchor.finger.toUpperCase()}`;
    const x = anchor.x + 10;
    const y = anchor.y - 12;

    ctx.fillStyle = 'rgba(3, 3, 6, 0.76)';
    ctx.fillRect(x - 4, y - 9, label.length * 7.2 + 8, 18);
    ctx.strokeStyle = preset.accent;
    ctx.strokeRect(x - 4, y - 9, label.length * 7.2 + 8, 18);
    ctx.fillStyle = anchor.handId === 'right' ? preset.secondary : preset.accent;
    ctx.fillText(label, x, y);
  });

  ctx.restore();
}

function drawCornerHud(ctx: CanvasRenderingContext2D, width: number, height: number, frame: PrismFrame, presetLabel: string) {
  const pad = clamp(width * 0.022, 16, 34);
  const text = `${presetLabel} / anchors:${frame.anchors.length} / sheet:${frame.sheetState} / cross:${frame.crossing ? 'yes' : 'no'}`;

  ctx.save();
  ctx.font = `${clamp(width * 0.012, 12, 16)}px "Courier New", monospace`;
  ctx.fillStyle = 'rgba(236, 255, 252, 0.78)';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.72)';
  ctx.shadowBlur = 8;
  ctx.fillText(text, pad, pad + 6);
  ctx.strokeStyle = 'rgba(54, 245, 199, 0.45)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pad, height - pad * 1.2);
  ctx.lineTo(pad, height - pad);
  ctx.lineTo(pad * 1.8, height - pad);
  ctx.moveTo(width - pad * 1.8, pad);
  ctx.lineTo(width - pad, pad);
  ctx.lineTo(width - pad, pad * 1.8);
  ctx.stroke();
  ctx.restore();
}

function toHudSnapshot(frame: PrismFrame, preset: VisualPreset): TechnicalHudSnapshot {
  return {
    hands: frame.hands.length,
    anchors: frame.anchors.length,
    sheetState: frame.sheetState,
    crossing: frame.crossing,
    fps: frame.fps,
    preset: preset.label,
    leftFingers: getFingersForHand(frame, 'left'),
    rightFingers: getFingersForHand(frame, 'right'),
    singleFingers: getFingersForHand(frame, 'single'),
    logs: frame.logLines,
  };
}

function areHudSnapshotsEqual(a: TechnicalHudSnapshot, b: TechnicalHudSnapshot) {
  return (
    a.hands === b.hands &&
    a.anchors === b.anchors &&
    a.sheetState === b.sheetState &&
    a.crossing === b.crossing &&
    Math.abs(a.fps - b.fps) < 2 &&
    a.preset === b.preset &&
    a.leftFingers.join('|') === b.leftFingers.join('|') &&
    a.rightFingers.join('|') === b.rightFingers.join('|') &&
    a.singleFingers.join('|') === b.singleFingers.join('|') &&
    a.logs.join('|') === b.logs.join('|')
  );
}

function getFingersForHand(frame: PrismFrame, handId: FingerAnchor['handId']) {
  const hand = frame.hands.find((candidate) => candidate.handId === handId);
  if (!hand) return [];
  return FINGER_NAMES.filter((finger) => hand.extended[finger]).map((finger) => finger.toUpperCase());
}
