import { clipPolygon, drawCanvasRegion, ensureCanvasSize, getPolygonBounds } from '../utils/canvas';
import { clamp, type Point } from '../utils/math';
import type { FilterMode } from './presets';
import type { RenderQuality } from './renderQuality';

export type OverlapEffectId = 'glass-tear' | 'heat-ghost' | 'signal-invert';
export type SurfaceEffectId = FilterMode | OverlapEffectId;

export type SurfaceRenderOptions = {
  alpha: number;
  intensity: number;
  motion: number;
  timeMs: number;
  quality: RenderQuality;
};

type Rgb = {
  r: number;
  g: number;
  b: number;
};

type ColorStop = {
  at: number;
  color: Rgb;
};

type WorkCanvasState = {
  canvas: HTMLCanvasElement;
  frameKey: string;
};

export const OVERLAP_EFFECT_IDS: OverlapEffectId[] = ['glass-tear', 'heat-ghost', 'signal-invert'];

const EFFECT_LABELS: Record<SurfaceEffectId, string> = {
  'thermal-vision': 'Thermal Vision',
  'ai-tracker': 'AI Tracker',
  'rave-tricolor': 'Rave Tricolor',
  'dead-channel': 'Dead Channel',
  'hypercolor-cctv': 'Hypercolor CCTV',
  'glass-tear': 'Glass Tear',
  'heat-ghost': 'Heat Ghost',
  'signal-invert': 'Signal Invert',
};

const THERMAL_STOPS: ColorStop[] = [
  { at: 0, color: hexToRgb('#17001f') },
  { at: 0.18, color: hexToRgb('#3931bf') },
  { at: 0.34, color: hexToRgb('#63e7ff') },
  { at: 0.52, color: hexToRgb('#ff3bd4') },
  { at: 0.7, color: hexToRgb('#ff4a13') },
  { at: 0.86, color: hexToRgb('#ffe600') },
  { at: 1, color: hexToRgb('#fff8d8') },
];

const workCanvases = new Map<string, WorkCanvasState>();

export function getSurfaceEffectLabel(effectId: SurfaceEffectId) {
  return EFFECT_LABELS[effectId];
}

export function drawSurfaceEffectClip(
  ctx: CanvasRenderingContext2D,
  source: HTMLCanvasElement,
  points: Point[],
  effectId: SurfaceEffectId,
  options: SurfaceRenderOptions,
) {
  if (!points.length || !source.width || !source.height || options.alpha <= 0) return;

  const rendered = renderSurfaceEffectCanvas(source, effectId, options);
  const bounds = getPolygonBounds(points, ctx.canvas.width, ctx.canvas.height, 10);

  ctx.save();
  clipPolygon(ctx, points);
  ctx.imageSmoothingEnabled = shouldSmooth(effectId);
  ctx.globalAlpha = options.alpha;
  ctx.globalCompositeOperation = effectId === 'glass-tear' ? 'screen' : 'source-over';
  ctx.filter = 'none';
  drawCanvasRegion(ctx, rendered, bounds);
  drawSurfaceScanlines(ctx, points, effectId, options);
  ctx.restore();
}

export function renderSurfaceEffectCanvas(
  source: HTMLCanvasElement,
  effectId: SurfaceEffectId,
  options: SurfaceRenderOptions,
) {
  if (effectId === 'thermal-vision') {
    return mapVideoToCanvas(source, effectId, 280, true, options, (r, g, b) => {
      const luma = lumaOf(r, g, b);
      const heat = Math.pow(clamp(luma * 1.08, 0, 1), 0.78);
      const color = sampleGradient(THERMAL_STOPS, heat);
      return mixColor(color, { r, g, b }, 0.08);
    });
  }

  if (effectId === 'rave-tricolor') {
    return mapVideoToCanvas(source, effectId, 176, false, options, (r, g, b) => {
      const luma = lumaOf(r, g, b);
      if (luma > 0.68) return hexToRgb('#ffffff');
      if (luma > 0.34) return hexToRgb('#ff1bd6');
      return hexToRgb('#175cff');
    });
  }

  if (effectId === 'dead-channel') {
    const seed = Math.floor(options.timeMs / 80);
    return mapVideoToCanvas(source, effectId, 92, false, options, (r, g, b, x, y) => {
      const noise = seededNoise(seed + x * 3, y * 7);
      const luma = clamp(lumaOf(r, g, b) * 1.25 + (noise - 0.5) * 0.55, 0, 1);
      const value = luma > 0.66 ? 235 : luma > 0.34 ? 96 : 10;
      const redShift = noise > 0.92 ? 90 : 0;
      const blueShift = noise < 0.08 ? 95 : 0;
      return {
        r: clamp(value + redShift, 0, 255),
        g: value,
        b: clamp(value + blueShift, 0, 255),
      };
    });
  }

  if (effectId === 'heat-ghost') {
    const mapped = mapVideoToCanvas(source, effectId, 220, true, options, (r, g, b) => {
      const luma = Math.pow(clamp(lumaOf(r, g, b) * 1.18, 0, 1), 0.68);
      const color = sampleGradient(THERMAL_STOPS, luma);
      return mixColor(color, hexToRgb('#ffefff'), 0.12);
    });
    return drawGhostedCanvas(source, mapped, effectId, options, 'screen');
  }

  if (effectId === 'glass-tear') {
    return drawGlassTearCanvas(source, options);
  }

  if (effectId === 'signal-invert') {
    return drawFilteredCanvas(source, effectId, options, `invert(1) contrast(${1.7 + options.intensity * 0.26}) saturate(1.9) hue-rotate(-38deg)`);
  }

  if (effectId === 'ai-tracker') {
    return drawFilteredCanvas(source, effectId, options, `contrast(${1.18 + options.intensity * 0.12}) saturate(0.46) brightness(0.96) sepia(0.18) hue-rotate(132deg)`);
  }

  return drawFilteredCanvas(
    source,
    effectId,
    options,
    `contrast(${1.34 + options.intensity * 0.16}) saturate(${2.35 + options.intensity * 0.3}) brightness(0.92) hue-rotate(${12 + options.motion * 16}deg)`,
  );
}

function drawFilteredCanvas(
  source: HTMLCanvasElement,
  effectId: SurfaceEffectId,
  options: SurfaceRenderOptions,
  filter: string,
) {
  const { canvas, state } = prepareWorkCanvas(source, `filter:${effectId}`, options);
  const refreshKey = getRefreshKey(canvas, options);
  if (state.frameKey === refreshKey) return canvas;

  const targetCtx = canvas.getContext('2d');
  if (!targetCtx) return source;

  targetCtx.save();
  targetCtx.clearRect(0, 0, canvas.width, canvas.height);
  targetCtx.imageSmoothingEnabled = shouldSmooth(effectId);
  targetCtx.filter = filter;
  targetCtx.drawImage(source, 0, 0, canvas.width, canvas.height);
  targetCtx.restore();
  state.frameKey = refreshKey;
  return canvas;
}

function drawGlassTearCanvas(source: HTMLCanvasElement, options: SurfaceRenderOptions) {
  const { canvas, state } = prepareWorkCanvas(source, 'overlap:glass-tear', options);
  const refreshKey = getRefreshKey(canvas, options);
  if (state.frameKey === refreshKey) return canvas;

  const targetCtx = canvas.getContext('2d');
  if (!targetCtx) return source;

  const seed = Math.floor(options.timeMs / 68);
  const strips = Math.floor((7 + options.intensity * 5) * options.quality.effectDetailMultiplier);
  targetCtx.save();
  targetCtx.clearRect(0, 0, canvas.width, canvas.height);
  targetCtx.imageSmoothingEnabled = true;
  targetCtx.filter = `contrast(${1.25 + options.intensity * 0.18}) saturate(1.75) hue-rotate(18deg)`;
  targetCtx.drawImage(source, 0, 0, canvas.width, canvas.height);
  targetCtx.globalCompositeOperation = 'screen';
  targetCtx.filter = `contrast(${1.55 + options.intensity * 0.22}) saturate(2.2)`;

  for (let index = 0; index < strips; index += 1) {
    const y = Math.floor(seededNoise(seed + 17, index) * canvas.height);
    const height = Math.max(2, Math.floor(2 + seededNoise(seed + 31, index) * 12));
    const shift = (seededNoise(seed + 47, index) - 0.5) * canvas.width * 0.13 * options.intensity;
    const sourceY = Math.floor((y / canvas.height) * source.height);
    const sourceHeight = Math.max(1, Math.floor((height / canvas.height) * source.height));
    targetCtx.globalAlpha = 0.2 + seededNoise(seed + 61, index) * 0.24;
    targetCtx.drawImage(source, 0, sourceY, source.width, sourceHeight, shift, y, canvas.width, height);
  }

  targetCtx.restore();
  state.frameKey = refreshKey;
  return canvas;
}

function drawGhostedCanvas(
  source: HTMLCanvasElement,
  base: HTMLCanvasElement,
  effectId: SurfaceEffectId,
  options: SurfaceRenderOptions,
  composite: GlobalCompositeOperation,
) {
  const { canvas, state } = prepareWorkCanvas(base, `ghost:${effectId}`, options);
  const refreshKey = getRefreshKey(canvas, options);
  if (state.frameKey === refreshKey) return canvas;

  const targetCtx = canvas.getContext('2d');
  if (!targetCtx) return base;

  const shift = clamp(8 + options.intensity * 10 + options.motion * 12, 6, 28);
  targetCtx.save();
  targetCtx.clearRect(0, 0, canvas.width, canvas.height);
  targetCtx.imageSmoothingEnabled = true;
  targetCtx.drawImage(base, 0, 0, canvas.width, canvas.height);
  targetCtx.globalCompositeOperation = composite;
  targetCtx.globalAlpha = 0.28;
  targetCtx.filter = 'contrast(1.5) saturate(1.5)';
  targetCtx.drawImage(source, -shift, shift * 0.14, canvas.width, canvas.height);
  targetCtx.globalAlpha = 0.18;
  targetCtx.drawImage(source, shift * 0.58, -shift * 0.08, canvas.width, canvas.height);
  targetCtx.restore();
  state.frameKey = refreshKey;
  return canvas;
}

function mapVideoToCanvas(
  source: HTMLCanvasElement,
  key: string,
  maxWidth: number,
  smoothing: boolean,
  options: SurfaceRenderOptions,
  mapper: (r: number, g: number, b: number, x: number, y: number) => Rgb,
) {
  const scaledMaxWidth = Math.max(64, Math.floor(maxWidth * options.quality.mappedMaxWidthMultiplier));
  const width = Math.max(1, Math.min(source.width, scaledMaxWidth));
  const height = Math.max(1, Math.floor(source.height * (width / source.width)));
  const state = getWorkCanvas(`map:${key}`, width, height);
  const canvas = state.canvas;
  const refreshKey = getRefreshKey(canvas, options);
  if (state.frameKey === refreshKey) return canvas;

  const targetCtx = canvas.getContext('2d', { willReadFrequently: true });
  if (!targetCtx) return source;

  targetCtx.save();
  targetCtx.imageSmoothingEnabled = smoothing;
  targetCtx.clearRect(0, 0, width, height);
  targetCtx.drawImage(source, 0, 0, width, height);
  targetCtx.restore();

  const image = targetCtx.getImageData(0, 0, width, height);
  for (let index = 0; index < image.data.length; index += 4) {
    const pixel = index / 4;
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    const mapped = mapper(image.data[index] ?? 0, image.data[index + 1] ?? 0, image.data[index + 2] ?? 0, x, y);
    image.data[index] = mapped.r;
    image.data[index + 1] = mapped.g;
    image.data[index + 2] = mapped.b;
    image.data[index + 3] = 255;
  }

  targetCtx.putImageData(image, 0, 0);
  state.frameKey = refreshKey;
  return canvas;
}

function drawSurfaceScanlines(
  ctx: CanvasRenderingContext2D,
  points: Point[],
  effectId: SurfaceEffectId,
  options: SurfaceRenderOptions,
) {
  const amount = effectId === 'dead-channel' ? 0.5 : effectId === 'signal-invert' ? 0.36 : effectId === 'glass-tear' ? 0.22 : 0.14;
  const bounds = getPolygonBounds(points, ctx.canvas.width, ctx.canvas.height, 0);
  const step = Math.floor(clamp(7 - amount * 4, 4, 11) * options.quality.scanlineStepMultiplier);

  ctx.globalCompositeOperation = 'multiply';
  ctx.globalAlpha = options.alpha * amount * options.quality.scanlineAmountMultiplier;
  ctx.fillStyle = effectId === 'signal-invert' ? '#12001f' : '#000';

  for (let y = bounds.y; y < bounds.y + bounds.height; y += step) {
    ctx.fillRect(bounds.x, y, bounds.width, 1);
  }
}

function prepareWorkCanvas(source: HTMLCanvasElement, key: string, options: SurfaceRenderOptions) {
  const width = Math.max(1, Math.min(source.width, Math.floor(360 * options.quality.mappedMaxWidthMultiplier)));
  const height = Math.max(1, Math.floor(source.height * (width / source.width)));
  const state = getWorkCanvas(key, width, height);
  return { canvas: state.canvas, state };
}

function getWorkCanvas(key: string, width: number, height: number) {
  const state = workCanvases.get(key) ?? { canvas: document.createElement('canvas'), frameKey: '' };
  if (ensureCanvasSize(state.canvas, width, height)) {
    state.frameKey = '';
  }
  workCanvases.set(key, state);
  return state;
}

function getRefreshKey(canvas: HTMLCanvasElement, options: SurfaceRenderOptions) {
  return `${canvas.width}x${canvas.height}:${Math.floor(options.timeMs / options.quality.mappedRefreshMs)}`;
}

function shouldSmooth(effectId: SurfaceEffectId) {
  return effectId !== 'rave-tricolor' && effectId !== 'dead-channel';
}

function lumaOf(r: number, g: number, b: number) {
  return (r * 0.299 + g * 0.587 + b * 0.114) / 255;
}

function sampleGradient(stops: ColorStop[], value: number) {
  const t = clamp(value, 0, 1);

  for (let index = 0; index < stops.length - 1; index += 1) {
    const current = stops[index];
    const next = stops[index + 1];
    if (t >= current.at && t <= next.at) {
      const local = (t - current.at) / Math.max(0.0001, next.at - current.at);
      return mixColor(current.color, next.color, local);
    }
  }

  return stops[stops.length - 1].color;
}

function mixColor(a: Rgb, b: Rgb, amount: number): Rgb {
  const t = clamp(amount, 0, 1);
  return {
    r: clamp(a.r + (b.r - a.r) * t, 0, 255),
    g: clamp(a.g + (b.g - a.g) * t, 0, 255),
    b: clamp(a.b + (b.b - a.b) * t, 0, 255),
  };
}

function hexToRgb(hex: string): Rgb {
  const normalized = hex.replace('#', '');
  if (normalized.length !== 6) return { r: 255, g: 255, b: 255 };
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
