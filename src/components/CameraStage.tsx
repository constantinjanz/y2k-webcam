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
  preset: 'Berlin Rave',
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
    presetId: 'berlin-rave',
    debug: true,
    sensitivity: 1,
    intensity: 1,
  });

  const [isStarted, setIsStarted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState('BOOT WAIT: camera module idle');
  const [error, setError] = useState('');
  const [presetId, setPresetId] = useState<PresetId>('berlin-rave');
  const [debug, setDebug] = useState(true);
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
      setStatus('REQUESTING CAMERA DEVICE...');

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
        setStatus('LOADING HAND_LANDMARKER MODULE...');
        trackerRef.current = await createHandTracker();
        modelReadyRef.current = true;
      }

      prismEngineRef.current.reset();
      lastDetectedHandsRef.current = [];
      lastVideoTimeRef.current = -1;
      feedbackFrameRef.current = 0;
      setIsStarted(true);
      setStatus('TRACE ONLINE: extend fingers to pin the video sheet');

      if (rafRef.current === null) {
        rafRef.current = requestAnimationFrame(renderFrame);
      }
    } catch (cameraError) {
      console.error(cameraError);
      setError('Camera or hand model could not start. Check permission and network access for the MediaPipe model.');
      setStatus('BOOT FAILED: camera module idle');
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
    setStatus('TRACE STOPPED: local camera stream closed');
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

  const activeError = error || recorder.error;
  const warningMessage = getTrackingWarning(isStarted, hudSnapshot);

  return (
    <section className="camera-shell" aria-label="tracer_2k live camera app">
      <video ref={videoRef} className="camera-video" aria-hidden="true" />
      <div className="desktop-noise" aria-hidden="true" />

      <div className="desktop-label">
        <span className="desktop-icon" aria-hidden="true" />
        <div>
          <b>tracer_2k</b>
          <span>local vision desktop</span>
        </div>
      </div>

      <div className="os-window main-camera-window" aria-label="tracer_2k camera window">
        <div className="os-titlebar">
          <span>tracer_2k.exe</span>
          <div className="os-titlebar-buttons" aria-hidden="true">
            <span>_</span>
            <span>□</span>
            <span>×</span>
          </div>
        </div>
        <div className="os-menubar" aria-hidden="true">
          <span>FILE</span>
          <span>VIEW</span>
          <span>TRACKING</span>
          <span>EFFECTS</span>
          <span>SYSTEM</span>
        </div>
        <div className="camera-viewport">
          <canvas ref={canvasRef} className="camera-canvas" />
          <div className="scanline-overlay" aria-hidden="true" />
        </div>
        <div className="os-statusbar">
          <span>anchors: {padCount(hudSnapshot.anchors)}</span>
          <span>hands: {padCount(hudSnapshot.hands)}</span>
          <span>sheet: {hudSnapshot.sheetState}</span>
          <span>fps: {Math.round(hudSnapshot.fps)}</span>
          <span className="status-grip" aria-hidden="true" />
        </div>
      </div>

      <TechnicalHud
        snapshot={hudSnapshot}
        cameraActive={isStarted}
        modelReady={Boolean(trackerRef.current)}
        isRecording={recorder.isRecording}
      />

      <div className="os-window system-message-window">
        <div className="os-titlebar">
          <span>System Message</span>
          <div className="os-titlebar-buttons" aria-hidden="true">
            <span>×</span>
          </div>
        </div>
        <div className="os-dialog-body compact-dialog">
          <span className="os-icon-info" aria-hidden="true">i</span>
          <div>
            <p>tracer_2k camera module {isStarted ? 'loaded' : 'standing by'}</p>
            <button className="os-button mini-button" type="button" disabled>
              OK
            </button>
          </div>
        </div>
      </div>

      {warningMessage && (
        <div className="os-window warning-window" role="status" aria-live="polite">
          <div className="os-titlebar warning-titlebar">
            <span>Warning</span>
            <div className="os-titlebar-buttons" aria-hidden="true">
              <span>×</span>
            </div>
          </div>
          <div className="os-dialog-body compact-dialog">
            <span className="os-icon-warning" aria-hidden="true" />
            <p>{warningMessage}</p>
          </div>
        </div>
      )}

      {activeError && (
        <div className="os-window error-window" role="alert">
          <div className="os-titlebar error-titlebar">
            <span>tracer_2k error</span>
            <div className="os-titlebar-buttons" aria-hidden="true">
              <span>×</span>
            </div>
          </div>
          <div className="os-dialog-body">
            <span className="os-icon-error" aria-hidden="true">×</span>
            <p>{activeError}</p>
          </div>
        </div>
      )}

      <div className="os-window progress-window">
        <div className="os-titlebar">
          <span>{recorder.isRecording ? 'Recording [REC]' : 'Rendering [72%]'}</span>
          <div className="os-titlebar-buttons" aria-hidden="true">
            <span>_</span>
            <span>×</span>
          </div>
        </div>
        <div className="progress-body">
          <div className={recorder.isRecording ? 'os-progress recording' : 'os-progress'} aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
          </div>
          <p>{recorder.isRecording ? 'canvas capture stream writing to buffer' : status}</p>
        </div>
      </div>

      {!isStarted && (
        <div className="os-window start-panel" role="dialog" aria-modal="true" aria-label="tracer_2k setup">
          <div className="os-titlebar">
            <span>tracer_2k setup</span>
            <div className="os-titlebar-buttons" aria-hidden="true">
              <span>×</span>
            </div>
          </div>
          <div className="setup-body">
            <span className="os-icon-info large-icon" aria-hidden="true">i</span>
            <div className="setup-copy">
              <h1>tracer_2k</h1>
              <p>tracer_2k requires camera access.</p>
              <p>Initialize hand tracking module?</p>
              <div className="privacy-grid" aria-label="Privacy status">
                <span>LOCAL MODE: ON</span>
                <span>UPLOADS: DISABLED</span>
                <span>BACKEND: NONE</span>
              </div>
              <div className="button-row setup-buttons">
                <button className="os-button primary-button" type="button" onClick={startCamera} disabled={isLoading}>
                  {isLoading ? 'Booting...' : 'Boot tracer_2k'}
                </button>
                <button className="os-button secondary-button" type="button" onClick={() => setStatus('SETUP CANCELLED: camera module idle')}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isStarted && (
        <>
          <div className="os-window control-deck effect-palette-window" aria-label="Effect palette">
            <div className="os-titlebar">
              <span>Effect Palette</span>
              <div className="os-titlebar-buttons" aria-hidden="true">
                <span>_</span>
                <span>×</span>
              </div>
            </div>
            <div className="control-body">
              <label className="control-field">
                <span>FILTER MODE</span>
                <select value={presetId} onChange={(event) => setPresetId(event.target.value as PresetId)}>
                  {PRESETS.map((presetOption) => (
                    <option key={presetOption.id} value={presetOption.id}>
                      {presetOption.label}
                    </option>
                  ))}
                </select>
              </label>
              <p className="control-status">STATUS: VIDEO FILTER</p>

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
            </div>
          </div>

          <div className="os-window transport-window" aria-label="Transport controls">
            <div className="os-titlebar">
              <span>Transport</span>
              <div className="os-titlebar-buttons" aria-hidden="true">
                <span>×</span>
              </div>
            </div>
            <div className="transport-body">
              <button className="os-button secondary-button" type="button" onClick={stopCamera}>
                Stop Camera
              </button>
              <button
                className="os-button record-button"
                type="button"
                onClick={recorder.isRecording ? recorder.stopRecording : recorder.startRecording}
                disabled={!recorder.isSupported}
              >
                {recorder.isRecording ? 'Stop Recording' : 'Record'}
              </button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

function getBackgroundFilter(presetId: PresetId, intensity: number) {
  if (presetId === 'hacker-surveillance') return `contrast(${1.2 + intensity * 0.16}) saturate(0.72) brightness(0.9)`;
  if (presetId === 'night-vision') return `contrast(${1.2 + intensity * 0.16}) saturate(0.72) brightness(0.9)`;
  if (presetId === 'dirty-photocopy') return `contrast(${1.32 + intensity * 0.18}) saturate(0.44) brightness(0.9)`;
  if (presetId === 'webcam-2001') return `contrast(${1.22 + intensity * 0.14}) saturate(0.7) brightness(0.94)`;
  if (presetId === 'old-virus') return `contrast(${1.36 + intensity * 0.18}) saturate(1.2) brightness(0.88)`;
  if (presetId === 'thermal-rave') return `contrast(1.22) saturate(${1.05 + intensity * 0.26}) brightness(0.9)`;
  return `contrast(${1.18 + intensity * 0.14}) saturate(0.88) brightness(0.9)`;
}

function shouldDrawFeedbackTrails(preset: VisualPreset, intensity: number) {
  return intensity >= 1.35 && preset.trailAlpha >= 0.12;
}

function padCount(value: number) {
  return String(value).padStart(2, '0');
}

function getTrackingWarning(isStarted: boolean, snapshot: TechnicalHudSnapshot) {
  if (!isStarted || snapshot.sheetState === 'ACTIVE') return '';
  if (snapshot.hands === 0) return 'No hands detected';
  if (snapshot.anchors < 3) return 'No anchors detected';
  return 'Tracking unstable';
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
