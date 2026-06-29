import type { PrismFrame } from '../vision/prismEngine';
import { clipPolygon, ensureCanvasSize } from '../utils/canvas';
import { clamp, type Point } from '../utils/math';
import { drawCrossingEffect } from './crossingEffect';
import type { FilterMode, VisualPreset } from './presets';

type RenderOptions = {
  alpha: number;
  intensity: number;
  motion: number;
  timeMs: number;
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

const workCanvases = new Map<string, HTMLCanvasElement>();

const THERMAL_STOPS: ColorStop[] = [
  { at: 0, color: hexToRgb('#17001f') },
  { at: 0.18, color: hexToRgb('#3931bf') },
  { at: 0.34, color: hexToRgb('#63e7ff') },
  { at: 0.52, color: hexToRgb('#ff3bd4') },
  { at: 0.7, color: hexToRgb('#ff4a13') },
  { at: 0.86, color: hexToRgb('#ffe600') },
  { at: 1, color: hexToRgb('#fff8d8') },
];

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
  const motion = clamp(prism.motion / 48, 0, 1);

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.lineJoin = 'miter';
  ctx.imageSmoothingEnabled = false;

  drawPrismVideoFilter(ctx, pixelBuffer, prism, preset, {
    alpha,
    intensity,
    motion,
    timeMs,
  });

  drawFoldLines(ctx, prism, preset, alpha, intensity);

  if (prism.crossing) {
    drawCrossingEffect(ctx, pixelBuffer, prism, preset, timeMs, intensity);
  }

  drawCleanPrismEdges(ctx, prism, preset, alpha, intensity);
  ctx.restore();
}

function drawPrismVideoFilter(
  ctx: CanvasRenderingContext2D,
  pixelBuffer: HTMLCanvasElement,
  prism: PrismFrame,
  preset: VisualPreset,
  options: RenderOptions,
) {
  if (!pixelBuffer.width || !pixelBuffer.height) return;

  if (preset.filterMode === 'thermal-vision') {
    drawThermalVision(ctx, pixelBuffer, prism.points, preset, options);
    return;
  }

  if (preset.filterMode === 'ai-tracker') {
    drawAiTracker(ctx, pixelBuffer, prism, preset, options);
    return;
  }

  if (preset.filterMode === 'rave-tricolor') {
    drawRaveTricolor(ctx, pixelBuffer, prism.points, preset, options);
    return;
  }

  if (preset.filterMode === 'dead-channel') {
    drawDeadChannel(ctx, pixelBuffer, prism.points, preset, options);
    return;
  }

  drawHypercolorCctv(ctx, pixelBuffer, prism.points, preset, options);
}

function drawThermalVision(
  ctx: CanvasRenderingContext2D,
  pixelBuffer: HTMLCanvasElement,
  points: Point[],
  preset: VisualPreset,
  options: RenderOptions,
) {
  const mapped = mapVideoToCanvas(pixelBuffer, 'thermal-vision', 280, true, (r, g, b) => {
    const luma = lumaOf(r, g, b);
    const heat = Math.pow(clamp(luma * 1.08, 0, 1), 0.78);
    const color = sampleGradient(THERMAL_STOPS, heat);
    return mixColor(color, { r, g, b }, 0.08);
  });

  drawCanvasClip(ctx, mapped, points, options.alpha, true, `contrast(${1.05 + options.intensity * 0.08}) saturate(1.2)`);
  drawScanlines(ctx, points, preset.scanlines * 0.45, options.alpha, '#091027');
}

function drawAiTracker(
  ctx: CanvasRenderingContext2D,
  pixelBuffer: HTMLCanvasElement,
  prism: PrismFrame,
  preset: VisualPreset,
  options: RenderOptions,
) {
  drawCanvasClip(
    ctx,
    pixelBuffer,
    prism.points,
    options.alpha,
    true,
    `contrast(${1.18 + options.intensity * 0.12}) saturate(0.46) brightness(0.96) sepia(0.18) hue-rotate(132deg)`,
  );

  ctx.save();
  clipPolygon(ctx, prism.points);
  ctx.imageSmoothingEnabled = true;
  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha = options.alpha * 0.16;
  ctx.filter = 'contrast(1.8) saturate(0.4) brightness(1.18)';
  ctx.drawImage(pixelBuffer, -2, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.globalAlpha = options.alpha * 0.11;
  ctx.drawImage(pixelBuffer, 2, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.restore();

  drawScanlines(ctx, prism.points, preset.scanlines, options.alpha, '#00f6ff');
  drawAiTrackerLabels(ctx, prism, preset, options);
}

function drawRaveTricolor(
  ctx: CanvasRenderingContext2D,
  pixelBuffer: HTMLCanvasElement,
  points: Point[],
  preset: VisualPreset,
  options: RenderOptions,
) {
  const mapped = mapVideoToCanvas(pixelBuffer, 'rave-tricolor', 176, false, (r, g, b) => {
    const luma = lumaOf(r, g, b);
    if (luma > 0.68) return hexToRgb('#ffffff');
    if (luma > 0.34) return hexToRgb('#ff1bd6');
    return hexToRgb('#175cff');
  });

  drawCanvasClip(ctx, mapped, points, options.alpha, false, `contrast(${1.08 + options.intensity * 0.12}) saturate(1.05)`);
  drawRgbGhost(ctx, mapped, points, preset.rgbShift * 0.35 * options.intensity, options.alpha * 0.2, false);
  drawScanlines(ctx, points, preset.scanlines * 0.55, options.alpha, '#175cff');
}

function drawDeadChannel(
  ctx: CanvasRenderingContext2D,
  pixelBuffer: HTMLCanvasElement,
  points: Point[],
  preset: VisualPreset,
  options: RenderOptions,
) {
  const seed = Math.floor(options.timeMs / 80);
  const mapped = mapVideoToCanvas(pixelBuffer, `dead-channel:${seed}`, 92, false, (r, g, b, x, y) => {
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

  drawCanvasClip(ctx, mapped, points, options.alpha, false, `contrast(${1.35 + options.intensity * 0.22}) grayscale(0.65)`);
  drawRgbGhost(ctx, mapped, points, preset.rgbShift * options.intensity, options.alpha * 0.22, false);
  drawDeadChannelTears(ctx, points, preset, options);
}

function drawHypercolorCctv(
  ctx: CanvasRenderingContext2D,
  pixelBuffer: HTMLCanvasElement,
  points: Point[],
  preset: VisualPreset,
  options: RenderOptions,
) {
  drawCanvasClip(
    ctx,
    pixelBuffer,
    points,
    options.alpha,
    true,
    `contrast(${1.34 + options.intensity * 0.16}) saturate(${2.35 + options.intensity * 0.3}) brightness(0.92) hue-rotate(${12 + options.motion * 16}deg)`,
  );

  drawRgbGhost(ctx, pixelBuffer, points, preset.rgbShift * 0.55 * options.intensity, options.alpha * 0.2, true);
  drawScanlines(ctx, points, preset.scanlines * 0.75, options.alpha, '#001d22');
}

function drawCanvasClip(
  ctx: CanvasRenderingContext2D,
  source: HTMLCanvasElement,
  points: Point[],
  alpha: number,
  smoothing: boolean,
  filter = 'none',
) {
  ctx.save();
  clipPolygon(ctx, points);
  ctx.imageSmoothingEnabled = smoothing;
  ctx.globalAlpha = alpha;
  ctx.globalCompositeOperation = 'source-over';
  ctx.filter = filter;
  ctx.drawImage(source, 0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.restore();
}

function drawRgbGhost(
  ctx: CanvasRenderingContext2D,
  source: HTMLCanvasElement,
  points: Point[],
  shift: number,
  alpha: number,
  smoothing: boolean,
) {
  if (shift < 1 || alpha <= 0) return;

  ctx.save();
  clipPolygon(ctx, points);
  ctx.imageSmoothingEnabled = smoothing;
  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha = alpha;
  ctx.filter = 'contrast(1.35) saturate(1.45)';
  ctx.drawImage(source, -shift, shift * 0.12, ctx.canvas.width, ctx.canvas.height);
  ctx.globalAlpha = alpha * 0.72;
  ctx.drawImage(source, shift * 0.72, -shift * 0.1, ctx.canvas.width, ctx.canvas.height);
  ctx.restore();
}

function drawScanlines(ctx: CanvasRenderingContext2D, points: Point[], amount: number, alpha: number, color: string) {
  if (amount <= 0) return;

  const step = Math.floor(clamp(9 - amount * 4, 4, 9));
  ctx.save();
  clipPolygon(ctx, points);
  ctx.globalCompositeOperation = 'multiply';
  ctx.globalAlpha = alpha * amount * 0.16;
  ctx.fillStyle = color;

  for (let y = 0; y < ctx.canvas.height; y += step) {
    ctx.fillRect(0, y, ctx.canvas.width, 1);
  }

  ctx.restore();
}

function drawDeadChannelTears(
  ctx: CanvasRenderingContext2D,
  points: Point[],
  preset: VisualPreset,
  options: RenderOptions,
) {
  const seed = Math.floor(options.timeMs / 90);
  const rows = Math.floor(clamp(3 + preset.noise * 7 + options.intensity, 4, 10));

  ctx.save();
  clipPolygon(ctx, points);
  ctx.globalCompositeOperation = 'screen';

  for (let index = 0; index < rows; index += 1) {
    const y = seededNoise(seed + 11, index) * ctx.canvas.height;
    const height = 2 + seededNoise(seed + 23, index) * 9;
    const alpha = options.alpha * (0.06 + seededNoise(seed + 31, index) * 0.1);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = index % 3 === 0 ? '#ffffff' : index % 3 === 1 ? '#ff2a2a' : '#245cff';
    ctx.fillRect(0, y, ctx.canvas.width, height);
  }

  ctx.globalCompositeOperation = 'multiply';
  ctx.globalAlpha = options.alpha * 0.22;
  ctx.fillStyle = '#000';
  for (let y = 0; y < ctx.canvas.height; y += 5) {
    ctx.fillRect(0, y, ctx.canvas.width, 1);
  }

  ctx.restore();
}

function drawAiTrackerLabels(
  ctx: CanvasRenderingContext2D,
  prism: PrismFrame,
  preset: VisualPreset,
  options: RenderOptions,
) {
  const labels = [
    `ANCHOR_TRACE ${String(prism.anchors.length).padStart(2, '0')}`,
    prism.crossing ? 'TRACE_CONFLICT' : 'TRACKING ACTIVE',
    `MOTION_SCAN ${String(Math.round(prism.motion)).padStart(3, '0')}`,
  ];

  ctx.save();
  clipPolygon(ctx, prism.points);
  ctx.font = '10px "Courier New", monospace';
  ctx.textBaseline = 'top';
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = options.alpha * 0.78;

  labels.slice(0, prism.crossing ? 3 : 2).forEach((label, index) => {
    const x = clamp(prism.center.x - 48, 8, ctx.canvas.width - 116);
    const y = clamp(prism.center.y - 22 + index * 13, 8, ctx.canvas.height - 16);
    ctx.fillStyle = index === 1 && prism.crossing ? 'rgba(255, 42, 31, 0.9)' : 'rgba(41, 255, 230, 0.86)';
    ctx.fillText(label, x, y);
  });

  ctx.restore();
}

function drawFoldLines(ctx: CanvasRenderingContext2D, prism: PrismFrame, preset: VisualPreset, alpha: number, intensity: number) {
  ctx.save();
  ctx.setLineDash([9, 6]);
  ctx.lineWidth = 1 + intensity * 0.28;
  ctx.globalCompositeOperation = 'source-over';

  prism.foldLines.slice(0, 9).forEach(([a, b], index) => {
    ctx.globalAlpha = alpha * (index % 2 ? 0.34 : 0.2);
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

function mapVideoToCanvas(
  source: HTMLCanvasElement,
  key: string,
  maxWidth: number,
  smoothing: boolean,
  mapper: (r: number, g: number, b: number, x: number, y: number) => Rgb,
) {
  const width = Math.max(1, Math.min(source.width, Math.floor(maxWidth)));
  const height = Math.max(1, Math.floor(source.height * (width / source.width)));
  const canvas = getWorkCanvas(`map:${key}`, width, height);
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
  return canvas;
}

function getWorkCanvas(key: string, width: number, height: number) {
  const canvas = workCanvases.get(key) ?? document.createElement('canvas');
  ensureCanvasSize(canvas, width, height);
  workCanvases.set(key, canvas);
  return canvas;
}

function strokePolygon(ctx: CanvasRenderingContext2D, points: Point[]) {
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  points.slice(1).forEach((point) => ctx.lineTo(point.x, point.y));
  ctx.closePath();
  ctx.stroke();
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
