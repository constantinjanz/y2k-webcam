import type { PrismFrame } from '../vision/prismEngine';
import { clipPolygon, drawCanvasRegion, getPolygonBounds } from '../utils/canvas';
import type { VisualPreset } from './presets';
import type { RenderQuality } from './renderQuality';

export function drawCrossingEffect(
  ctx: CanvasRenderingContext2D,
  pixelBuffer: HTMLCanvasElement,
  prism: PrismFrame,
  preset: VisualPreset,
  timeMs: number,
  intensity: number,
  quality: RenderQuality,
) {
  if (!prism.crossing || prism.decay <= 0 || prism.points.length < 3) return;

  const tear = preset.rgbShift * (1.05 + intensity * 0.42);
  const jitter = Math.sin(timeMs * 0.006) * tear * 0.35;
  const isDeadChannel = preset.filterMode === 'dead-channel';
  const bounds = getPolygonBounds(prism.points, ctx.canvas.width, ctx.canvas.height, tear + 12);

  ctx.save();
  clipPolygon(ctx, prism.points);

  ctx.imageSmoothingEnabled = !isDeadChannel;
  ctx.globalAlpha = prism.decay * getCrossingAlpha(preset.filterMode);
  ctx.globalCompositeOperation = 'source-over';
  ctx.filter = getCrossingFilter(preset, intensity);
  drawCanvasRegion(ctx, pixelBuffer, bounds, -tear + jitter, tear * 0.18);

  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha = prism.decay * getGhostAlpha(preset.filterMode) * quality.ghostAlphaMultiplier;
  ctx.filter = getCrossingGhostFilter(preset, intensity);
  drawCanvasRegion(ctx, pixelBuffer, bounds, tear * 0.72, -tear * 0.22);

  const step = Math.max(5, Math.floor((8 - preset.scanlines * 2) * quality.scanlineStepMultiplier));
  ctx.globalCompositeOperation = 'multiply';
  ctx.globalAlpha = prism.decay * (0.1 + preset.scanlines * 0.1) * quality.scanlineAmountMultiplier;
  ctx.fillStyle = '#000';

  for (let y = bounds.y; y <= bounds.y + bounds.height; y += step) {
    ctx.fillRect(bounds.x, y, bounds.width, 1);
  }

  if (isDeadChannel) {
    drawDeadSignalFailure(ctx, prism.decay, timeMs, intensity, quality, bounds);
  }

  if (preset.filterMode === 'ai-tracker') {
    drawTraceConflict(ctx, prism, preset);
  }

  ctx.restore();
}

function getCrossingFilter(preset: VisualPreset, intensity: number) {
  if (preset.filterMode === 'thermal-vision') return `contrast(${1.55 + intensity * 0.28}) saturate(2.1) sepia(0.28) hue-rotate(-28deg) brightness(1.12)`;
  if (preset.filterMode === 'ai-tracker') return `invert(1) contrast(${1.55 + intensity * 0.24}) saturate(0.7) hue-rotate(148deg)`;
  if (preset.filterMode === 'rave-tricolor') return `invert(1) contrast(${1.9 + intensity * 0.3}) saturate(2.2) hue-rotate(34deg)`;
  if (preset.filterMode === 'dead-channel') return `invert(1) grayscale(1) contrast(${2.2 + intensity * 0.44}) brightness(0.9)`;
  return `invert(1) contrast(${1.84 + intensity * 0.32}) saturate(2.8) hue-rotate(-54deg)`;
}

function getCrossingGhostFilter(preset: VisualPreset, intensity: number) {
  if (preset.filterMode === 'dead-channel') return `grayscale(1) contrast(${2 + intensity * 0.4})`;
  if (preset.filterMode === 'ai-tracker') return `contrast(${1.65 + intensity * 0.22}) saturate(0.9)`;
  if (preset.filterMode === 'rave-tricolor') return `contrast(${2 + intensity * 0.22}) saturate(2.4)`;
  return `contrast(${1.8 + intensity * 0.22}) saturate(2)`;
}

function getCrossingAlpha(mode: VisualPreset['filterMode']) {
  if (mode === 'dead-channel') return 0.78;
  if (mode === 'ai-tracker') return 0.44;
  if (mode === 'hypercolor-cctv') return 0.52;
  return 0.62;
}

function getGhostAlpha(mode: VisualPreset['filterMode']) {
  if (mode === 'dead-channel') return 0.28;
  if (mode === 'ai-tracker') return 0.22;
  if (mode === 'hypercolor-cctv') return 0.3;
  return 0.18;
}

function drawDeadSignalFailure(
  ctx: CanvasRenderingContext2D,
  decay: number,
  timeMs: number,
  intensity: number,
  quality: RenderQuality,
  bounds: { x: number; y: number; width: number; height: number },
) {
  const seed = Math.floor(timeMs / 70);
  const rows = Math.floor((4 + intensity * 5) * quality.effectDetailMultiplier);

  ctx.globalCompositeOperation = 'source-over';
  for (let index = 0; index < rows; index += 1) {
    const y = bounds.y + seededNoise(seed, index) * bounds.height;
    const height = 2 + seededNoise(seed + 41, index) * 12;
    ctx.globalAlpha = decay * (0.08 + seededNoise(seed + 17, index) * 0.13);
    ctx.fillStyle = index % 2 ? '#fff' : '#050505';
    ctx.fillRect(bounds.x, y, bounds.width, height);
  }
}

function drawTraceConflict(ctx: CanvasRenderingContext2D, prism: { center: { x: number; y: number }; decay: number }, preset: VisualPreset) {
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = prism.decay * 0.86;
  ctx.font = '10px "Courier New", monospace';
  ctx.fillStyle = preset.secondary;
  ctx.fillText('TRACE_CONFLICT', prism.center.x - 44, prism.center.y + 18);
}

function seededNoise(seed: number, index: number) {
  const value = Math.sin(seed * 12.9898 + index * 78.233) * 43758.5453;
  return value - Math.floor(value);
}
