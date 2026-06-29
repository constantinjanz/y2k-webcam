import type { PrismFrame } from '../vision/prismEngine';
import { clipPolygon, ensureCanvasSize } from '../utils/canvas';
import { clamp, polygonCenter, type Point } from '../utils/math';
import { drawCrossingEffect } from './crossingEffect';
import type { FilterMode, VisualPreset } from './presets';

type SourceSample = {
  data: Uint8ClampedArray;
  width: number;
  height: number;
};

type FilterOptions = {
  mode: FilterMode;
  alpha: number;
  intensity: number;
  motion: number;
  invert?: boolean;
  rgbBoost?: number;
};

const PANEL_SEQUENCE: FilterMode[] = ['berlin', 'surveillance', 'compressed', 'xerox', 'virus', 'thermal', 'night'];
const mappedCanvases = new Map<string, HTMLCanvasElement>();

export function drawPrismSheet(
  ctx: CanvasRenderingContext2D,
  pixelBuffer: HTMLCanvasElement,
  prism: PrismFrame,
  preset: VisualPreset,
  timeMs: number,
  intensity: number,
) {
  if (!prism.renderActive || prism.decay <= 0 || prism.points.length < 3) return;

  const alpha = clamp(prism.decay, 0, 1);
  const points = prism.points;
  const center = polygonCenter(points);
  const motion = clamp(prism.motion / 48, 0, 1);
  const sample = readSourceSample(pixelBuffer);

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.lineJoin = 'miter';
  ctx.imageSmoothingEnabled = false;

  drawFilteredVideoClip(ctx, pixelBuffer, sample, points, preset, {
    mode: preset.filterMode,
    alpha,
    intensity,
    motion,
  });

  drawVideoPanelFilters(ctx, pixelBuffer, sample, points, center, preset, timeMs, intensity, motion, alpha);
  drawVideoTexture(ctx, points, preset, timeMs, intensity, alpha);
  drawFoldLines(ctx, prism, preset, alpha, intensity);

  if (prism.crossing) {
    drawCrossingEffect(ctx, pixelBuffer, prism, preset, timeMs, intensity);
  }

  drawCleanPrismEdges(ctx, prism, preset, alpha, intensity);
  ctx.restore();
}

function drawVideoPanelFilters(
  ctx: CanvasRenderingContext2D,
  pixelBuffer: HTMLCanvasElement,
  sample: SourceSample | null,
  points: Point[],
  center: Point,
  preset: VisualPreset,
  timeMs: number,
  intensity: number,
  motion: number,
  alpha: number,
) {
  if (points.length < 4) return;

  const panels = points.map((point, index) => [center, point, points[(index + 1) % points.length]]);
  const panelAlpha = clamp(0.22 + points.length * 0.025 + intensity * 0.08, 0.2, 0.48);

  panels.forEach((panel, index) => {
    const mode = getPanelMode(preset.filterMode, index);
    drawFilteredVideoClip(ctx, pixelBuffer, sample, panel, preset, {
      mode,
      alpha: alpha * panelAlpha,
      intensity: intensity * 0.9,
      motion,
      rgbBoost: index % 2 ? 0.4 : 0.12,
    });
  });

  if (motion > 0.2) {
    const tear = Math.sin(timeMs * 0.008) * preset.rgbShift * motion * intensity;
    drawFilteredVideoClip(ctx, pixelBuffer, sample, points, preset, {
      mode: preset.filterMode,
      alpha: alpha * clamp(motion * 0.22, 0, 0.24),
      intensity,
      motion,
      rgbBoost: 0.75,
    });

    ctx.save();
    clipPolygon(ctx, points);
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = alpha * clamp(motion * 0.12, 0, 0.16);
    ctx.imageSmoothingEnabled = false;
    ctx.filter = 'contrast(1.8) saturate(1.7)';
    ctx.drawImage(pixelBuffer, tear, -tear * 0.25, ctx.canvas.width, ctx.canvas.height);
    ctx.restore();
  }
}

export function drawFilteredVideoClip(
  ctx: CanvasRenderingContext2D,
  pixelBuffer: HTMLCanvasElement,
  sample: SourceSample | null,
  points: Point[],
  preset: VisualPreset,
  options: FilterOptions,
) {
  if (!points.length || !pixelBuffer.width || !pixelBuffer.height) return;

  const mapped = getMappedVideoCanvas(pixelBuffer, sample, preset, options.mode, options.invert ?? false);
  const rgbShift = preset.rgbShift * (options.rgbBoost ?? 0.25) * options.intensity * (0.6 + options.motion * 0.8);

  ctx.save();
  clipPolygon(ctx, points);
  ctx.imageSmoothingEnabled = false;
  ctx.globalAlpha = options.alpha;
  ctx.globalCompositeOperation = 'source-over';
  ctx.filter = getCanvasFilter(options.mode, preset, options.intensity, options.invert ?? false);
  ctx.drawImage(mapped, 0, 0, ctx.canvas.width, ctx.canvas.height);

  if (rgbShift > 1) {
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = options.alpha * 0.18;
    ctx.filter = 'contrast(1.45) saturate(1.6)';
    ctx.drawImage(mapped, -rgbShift, rgbShift * 0.18, ctx.canvas.width, ctx.canvas.height);
    ctx.globalAlpha = options.alpha * 0.1;
    ctx.drawImage(mapped, rgbShift * 0.72, -rgbShift * 0.12, ctx.canvas.width, ctx.canvas.height);
  }

  ctx.restore();
}

function drawVideoTexture(
  ctx: CanvasRenderingContext2D,
  points: Point[],
  preset: VisualPreset,
  timeMs: number,
  intensity: number,
  alpha: number,
) {
  drawScanlines(ctx, points, preset.scanlines, alpha);
  drawCompressionBands(ctx, points, preset, timeMs, intensity, alpha);
}

function drawScanlines(ctx: CanvasRenderingContext2D, points: Point[], amount: number, alpha: number) {
  if (amount <= 0) return;

  const step = Math.floor(clamp(7 - amount * 2, 4, 7));
  ctx.save();
  clipPolygon(ctx, points);
  ctx.globalCompositeOperation = 'multiply';
  ctx.globalAlpha = alpha * amount * 0.14;
  ctx.fillStyle = '#000';

  for (let y = 0; y < ctx.canvas.height; y += step) {
    ctx.fillRect(0, y, ctx.canvas.width, 1);
  }

  ctx.restore();
}

function drawCompressionBands(
  ctx: CanvasRenderingContext2D,
  points: Point[],
  preset: VisualPreset,
  timeMs: number,
  intensity: number,
  alpha: number,
) {
  if (preset.noise <= 0) return;

  const rows = Math.floor(clamp(2 + preset.noise * 5 + intensity, 2, 8));
  const seed = Math.floor(timeMs / 130);

  ctx.save();
  clipPolygon(ctx, points);
  ctx.globalCompositeOperation = 'screen';

  for (let index = 0; index < rows; index += 1) {
    const y = seededNoise(seed, index) * ctx.canvas.height;
    const height = 1 + seededNoise(seed + 17, index) * 3;
    ctx.globalAlpha = alpha * preset.noise * (0.025 + seededNoise(seed + 31, index) * 0.055);
    ctx.fillStyle = index % 2 ? preset.accent : preset.secondary;
    ctx.fillRect(0, y, ctx.canvas.width, height);
  }

  ctx.restore();
}

function drawFoldLines(ctx: CanvasRenderingContext2D, prism: PrismFrame, preset: VisualPreset, alpha: number, intensity: number) {
  ctx.save();
  ctx.setLineDash([9, 6]);
  ctx.lineWidth = 1 + intensity * 0.28;
  ctx.globalCompositeOperation = 'source-over';

  prism.foldLines.slice(0, 9).forEach(([a, b], index) => {
    ctx.globalAlpha = alpha * (index % 2 ? 0.42 : 0.24);
    ctx.strokeStyle = index % 2 ? preset.accent : '#ffffff';
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  });

  ctx.restore();
}

function drawCleanPrismEdges(ctx: CanvasRenderingContext2D, prism: PrismFrame, preset: VisualPreset, alpha: number, intensity: number) {
  ctx.save();
  ctx.setLineDash([]);
  ctx.globalAlpha = alpha;
  ctx.globalCompositeOperation = 'source-over';

  ctx.lineWidth = 2;
  ctx.strokeStyle = '#f7f7f7';
  strokePolygon(ctx, prism.points);

  ctx.lineWidth = 1;
  ctx.strokeStyle = preset.accent;
  ctx.save();
  ctx.translate(2, -2);
  strokePolygon(ctx, prism.points);
  ctx.restore();

  ctx.strokeStyle = preset.secondary;
  ctx.save();
  ctx.translate(-2, 2);
  strokePolygon(ctx, prism.points);
  ctx.restore();

  prism.anchors.forEach((anchor, index) => {
    const size = 4.5 + intensity * 0.65;
    ctx.fillStyle = index % 2 ? preset.secondary : preset.accent;
    ctx.strokeStyle = '#050505';
    ctx.lineWidth = 1;
    ctx.fillRect(anchor.x - size * 0.5, anchor.y - size * 0.5, size, size);
    ctx.strokeRect(anchor.x - size * 0.5, anchor.y - size * 0.5, size, size);
  });

  ctx.restore();
}

function getPanelMode(defaultMode: FilterMode, index: number): FilterMode {
  const start = PANEL_SEQUENCE.indexOf(defaultMode);
  const offset = start >= 0 ? start : 0;
  return PANEL_SEQUENCE[(offset + index + 1) % PANEL_SEQUENCE.length];
}

function readSourceSample(pixelBuffer: HTMLCanvasElement): SourceSample | null {
  const sourceCtx = pixelBuffer.getContext('2d', { willReadFrequently: true });
  if (!sourceCtx || !pixelBuffer.width || !pixelBuffer.height) return null;

  try {
    const image = sourceCtx.getImageData(0, 0, pixelBuffer.width, pixelBuffer.height);
    return {
      data: image.data,
      width: image.width,
      height: image.height,
    };
  } catch {
    return null;
  }
}

function getMappedVideoCanvas(
  pixelBuffer: HTMLCanvasElement,
  sample: SourceSample | null,
  preset: VisualPreset,
  mode: FilterMode,
  invert: boolean,
) {
  const key = `${preset.id}:${mode}:${invert ? 'invert' : 'normal'}`;
  const canvas = getReusableCanvas(key, pixelBuffer.width, pixelBuffer.height);
  const targetCtx = canvas.getContext('2d');
  if (!targetCtx) return pixelBuffer;

  if (!sample) {
    targetCtx.save();
    targetCtx.clearRect(0, 0, canvas.width, canvas.height);
    targetCtx.filter = getCanvasFilter(mode, preset, 1, invert);
    targetCtx.drawImage(pixelBuffer, 0, 0);
    targetCtx.restore();
    return canvas;
  }

  const output = targetCtx.createImageData(sample.width, sample.height);
  const palette = getPaletteForMode(preset, mode);
  const levels = palette.length - 1;

  for (let index = 0; index < sample.data.length; index += 4) {
    const r = sample.data[index] ?? 0;
    const g = sample.data[index + 1] ?? 0;
    const b = sample.data[index + 2] ?? 0;
    let brightness = (r * 0.299 + g * 0.587 + b * 0.114) / 255;
    brightness = applyModeCurve(brightness, mode, preset.contrast);
    if (invert) brightness = 1 - brightness;

    const band = clamp(Math.floor(brightness * (levels + 0.999)), 0, levels);
    const color = hexToRgb(palette[band]);
    const sourceWeight = mode === 'compressed' ? 0.24 : mode === 'xerox' ? 0.1 : 0.16;

    output.data[index] = clamp(color.r * (1 - sourceWeight) + r * sourceWeight, 0, 255);
    output.data[index + 1] = clamp(color.g * (1 - sourceWeight) + g * sourceWeight, 0, 255);
    output.data[index + 2] = clamp(color.b * (1 - sourceWeight) + b * sourceWeight, 0, 255);
    output.data[index + 3] = 255;
  }

  targetCtx.putImageData(output, 0, 0);
  return canvas;
}

function getReusableCanvas(key: string, width: number, height: number) {
  const canvas = mappedCanvases.get(key) ?? document.createElement('canvas');
  ensureCanvasSize(canvas, width, height);
  mappedCanvases.set(key, canvas);
  return canvas;
}

function getPaletteForMode(preset: VisualPreset, mode: FilterMode) {
  if (mode === preset.filterMode) return preset.palette;
  if (mode === 'berlin') return ['#02020a', '#10107a', '#004cff', '#00f0ff', '#f0ff00', '#ff3d00', '#ffffff'];
  if (mode === 'night') return ['#000400', '#003414', '#008c32', '#65ff3e', '#eaff85'];
  if (mode === 'xerox') return ['#050505', '#282828', '#d9d2c0', '#ffffff', preset.secondary];
  if (mode === 'compressed') return ['#050816', '#1d2b54', '#4078a8', '#d6fff3', preset.secondary];
  if (mode === 'virus') return ['#000000', '#0012a8', '#ff1010', '#ffdf00', '#ffffff'];
  if (mode === 'surveillance') return ['#000306', '#003953', '#00a6a6', '#c5ff00', '#ff3d00', '#ffffff'];
  return ['#020214', '#15147a', '#6f18bd', '#e21d26', '#ff7a00', '#ffe600', '#ffffff'];
}

function applyModeCurve(value: number, mode: FilterMode, contrast: number) {
  const centered = (value - 0.5) * contrast + 0.5;
  const curved = clamp(centered, 0, 1);
  if (mode === 'night') return Math.pow(curved, 0.72);
  if (mode === 'xerox') return curved > 0.56 ? 1 : curved > 0.36 ? 0.55 : 0;
  if (mode === 'compressed') return Math.floor(curved * 5) / 5;
  if (mode === 'virus') return curved > 0.72 ? 1 : curved > 0.5 ? 0.68 : curved > 0.24 ? 0.34 : 0;
  if (mode === 'surveillance') return Math.pow(curved, 0.86);
  if (mode === 'berlin') return Math.pow(curved, 0.74);
  return Math.pow(curved, 0.78);
}

function getCanvasFilter(mode: FilterMode, preset: VisualPreset, intensity: number, invert: boolean) {
  const invertFilter = invert ? ' invert(1)' : '';
  if (mode === 'night') return `contrast(${1.12 + intensity * 0.14}) saturate(1.2) brightness(0.92)${invertFilter}`;
  if (mode === 'xerox') return `contrast(${1.38 + intensity * 0.2}) saturate(0.72) brightness(1.02)${invertFilter}`;
  if (mode === 'compressed') return `contrast(${1.08 + intensity * 0.12}) saturate(1.28) brightness(0.98)${invertFilter}`;
  if (mode === 'virus') return `contrast(${1.48 + intensity * 0.2}) saturate(1.85) brightness(0.9)${invertFilter}`;
  if (mode === 'surveillance') return `contrast(${1.28 + intensity * 0.2}) saturate(1.45) brightness(0.94)${invertFilter}`;
  if (mode === 'berlin') return `contrast(${1.22 + preset.contrast * 0.13 + intensity * 0.16}) saturate(1.6) brightness(0.95)${invertFilter}`;
  return `contrast(${1.22 + preset.contrast * 0.12 + intensity * 0.16}) saturate(1.45) brightness(0.96)${invertFilter}`;
}

function strokePolygon(ctx: CanvasRenderingContext2D, points: Point[]) {
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  points.slice(1).forEach((point) => ctx.lineTo(point.x, point.y));
  ctx.closePath();
  ctx.stroke();
}

function hexToRgb(hex: string) {
  const normalized = hex.replace('#', '');
  const fallback = { r: 255, g: 255, b: 255 };
  if (normalized.length !== 6) return fallback;
  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  };
}

function seededNoise(seed: number, index: number) {
  const value = Math.sin(seed * 12.9898 + index * 78.233) * 43758.5453;
  return value - Math.floor(value);
}
