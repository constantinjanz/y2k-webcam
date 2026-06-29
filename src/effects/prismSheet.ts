import type { PrismFrame } from '../vision/prismEngine';
import { clipPolygon } from '../utils/canvas';
import { clamp, polygonCenter, type Point } from '../utils/math';
import { drawCrossingEffect } from './crossingEffect';
import type { VisualPreset } from './presets';

type VideoSample = {
  data: Uint8ClampedArray;
  width: number;
  height: number;
} | null;

type Bounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

type PanelKind = 'xerox' | 'halftone' | 'acid' | 'scanner';

const PANEL_SEQUENCE: PanelKind[] = ['xerox', 'halftone', 'acid', 'scanner'];

export function drawPrismSheet(
  ctx: CanvasRenderingContext2D,
  pixelBuffer: HTMLCanvasElement,
  prism: PrismFrame,
  preset: VisualPreset,
  timeMs: number,
  intensity: number,
) {
  if (!prism.renderActive || prism.decay <= 0 || prism.points.length < 3) return;

  const points = prism.points;
  const alpha = clamp(prism.decay, 0, 1);
  const center = polygonCenter(points);
  const panels = buildTrianglePanels(points, center);
  const videoSample = getVideoSample(pixelBuffer);
  const motion = clamp(prism.motion / 48, 0, 1);

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.lineJoin = 'miter';
  ctx.imageSmoothingEnabled = false;

  drawPaperBase(ctx, points, preset, alpha);
  drawWholeSheetPrint(ctx, pixelBuffer, points, preset, timeMs, intensity, motion, alpha);
  drawPanelTreatments(ctx, pixelBuffer, videoSample, panels, preset, timeMs, intensity, motion, alpha);
  drawPaperGrain(ctx, points, preset, timeMs, intensity, alpha);
  drawSheetScanlines(ctx, points, preset, intensity, alpha);
  drawFoldLines(ctx, prism, preset, alpha, intensity);

  if (prism.crossing) {
    drawCrossingEffect(ctx, pixelBuffer, prism, preset, timeMs, intensity);
  }

  drawSharpFrame(ctx, prism, preset, alpha, intensity);
  ctx.restore();
}

function drawPaperBase(ctx: CanvasRenderingContext2D, points: Point[], preset: VisualPreset, alpha: number) {
  ctx.save();
  clipPolygon(ctx, points);
  ctx.globalAlpha = alpha;
  ctx.fillStyle = preset.paper;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  ctx.globalCompositeOperation = 'multiply';
  ctx.globalAlpha = alpha * 0.12;
  ctx.fillStyle = preset.ink;
  const bounds = getBounds(points);
  const seed = Math.round((bounds.minX + bounds.minY + bounds.maxX) * 0.17);
  for (let index = 0; index < 24; index += 1) {
    const x = bounds.minX + seededNoise(seed, index) * (bounds.maxX - bounds.minX);
    const y = bounds.minY + seededNoise(seed + 19, index) * (bounds.maxY - bounds.minY);
    ctx.fillRect(x, y, 1 + seededNoise(seed + 37, index) * 3, 1);
  }

  ctx.restore();
}

function drawWholeSheetPrint(
  ctx: CanvasRenderingContext2D,
  pixelBuffer: HTMLCanvasElement,
  points: Point[],
  preset: VisualPreset,
  timeMs: number,
  intensity: number,
  motion: number,
  alpha: number,
) {
  const tear = preset.rgbTear * preset.rgbShift * (0.25 + motion * 0.5) * intensity;
  const rowOffset = Math.sin(timeMs * 0.006) * tear * 0.45;

  ctx.save();
  clipPolygon(ctx, points);
  ctx.imageSmoothingEnabled = false;
  ctx.filter = `grayscale(0.45) contrast(${preset.panelContrast + intensity * 0.22}) brightness(1.08) saturate(0.62)`;
  ctx.globalAlpha = alpha * 0.52;
  ctx.globalCompositeOperation = 'multiply';
  ctx.drawImage(pixelBuffer, rowOffset, 0, ctx.canvas.width, ctx.canvas.height);

  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha = alpha * 0.18;
  ctx.fillStyle = preset.xerox;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  ctx.globalCompositeOperation = 'multiply';
  ctx.globalAlpha = alpha * 0.2;
  ctx.fillStyle = preset.ink;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.restore();
}

function drawPanelTreatments(
  ctx: CanvasRenderingContext2D,
  pixelBuffer: HTMLCanvasElement,
  sample: VideoSample,
  panels: Point[][],
  preset: VisualPreset,
  timeMs: number,
  intensity: number,
  motion: number,
  alpha: number,
) {
  panels.forEach((panel, index) => {
    const kind = PANEL_SEQUENCE[index % PANEL_SEQUENCE.length];
    if (kind === 'xerox') drawXeroxPanel(ctx, pixelBuffer, panel, preset, timeMs, intensity, alpha);
    if (kind === 'halftone') drawHalftonePanel(ctx, sample, panel, preset, timeMs, intensity, alpha);
    if (kind === 'acid') drawAcidPanel(ctx, pixelBuffer, panel, preset, timeMs, intensity, motion, alpha);
    if (kind === 'scanner') drawScannerPanel(ctx, pixelBuffer, panel, preset, timeMs, intensity, alpha);
  });
}

function drawXeroxPanel(
  ctx: CanvasRenderingContext2D,
  pixelBuffer: HTMLCanvasElement,
  panel: Point[],
  preset: VisualPreset,
  timeMs: number,
  intensity: number,
  alpha: number,
) {
  ctx.save();
  clipPolygon(ctx, panel);
  ctx.imageSmoothingEnabled = false;
  ctx.globalAlpha = alpha * 0.5;
  ctx.filter = `grayscale(0.85) contrast(${1.55 + preset.panelContrast * 0.25}) brightness(1.18)`;
  ctx.globalCompositeOperation = 'multiply';
  ctx.drawImage(pixelBuffer, -preset.rgbShift * 0.15, 0, ctx.canvas.width, ctx.canvas.height);

  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha = alpha * 0.46;
  ctx.fillStyle = preset.xerox;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  drawPanelScratches(ctx, panel, preset.ink, timeMs, 8 + intensity * 6, alpha * 0.36);
  ctx.restore();
}

function drawHalftonePanel(
  ctx: CanvasRenderingContext2D,
  sample: VideoSample,
  panel: Point[],
  preset: VisualPreset,
  timeMs: number,
  intensity: number,
  alpha: number,
) {
  const bounds = getBounds(panel);
  const gap = Math.floor(clamp(Math.min(ctx.canvas.width, ctx.canvas.height) * 0.018, 10, 16));
  const seed = Math.floor(timeMs / 220);

  ctx.save();
  clipPolygon(ctx, panel);
  ctx.globalAlpha = alpha;
  ctx.fillStyle = withAlpha(preset.paper, 0.5);
  ctx.fillRect(bounds.minX, bounds.minY, bounds.maxX - bounds.minX, bounds.maxY - bounds.minY);
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = preset.halftone;

  for (let y = bounds.minY; y <= bounds.maxY; y += gap) {
    const rowShift = Math.floor(y / gap) % 2 ? gap * 0.5 : 0;
    for (let x = bounds.minX + rowShift; x <= bounds.maxX; x += gap) {
      const brightness = sampleBrightness(sample, x, y, ctx.canvas.width, ctx.canvas.height);
      const wobble = seededNoise(seed + Math.floor(x * 0.05), Math.floor(y * 0.05));
      const radius = clamp((1 - brightness) * gap * (0.58 + intensity * 0.12) + wobble * 1.3, 1.2, gap * 0.52);
      if (radius < 1.6) continue;
      ctx.globalAlpha = alpha * clamp(0.22 + (1 - brightness) * 0.68, 0.18, 0.84);
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.restore();
}

function drawAcidPanel(
  ctx: CanvasRenderingContext2D,
  pixelBuffer: HTMLCanvasElement,
  panel: Point[],
  preset: VisualPreset,
  timeMs: number,
  intensity: number,
  motion: number,
  alpha: number,
) {
  const tear = preset.rgbTear * preset.rgbShift * (0.35 + motion * 0.65) * intensity;

  ctx.save();
  clipPolygon(ctx, panel);
  ctx.imageSmoothingEnabled = false;
  ctx.filter = `contrast(${1.5 + intensity * 0.28}) saturate(1.35) brightness(1.05)`;
  ctx.globalAlpha = alpha * 0.48;
  ctx.globalCompositeOperation = 'multiply';
  ctx.drawImage(pixelBuffer, tear, Math.sin(timeMs * 0.005) * 2, ctx.canvas.width, ctx.canvas.height);

  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha = alpha * 0.5;
  ctx.fillStyle = preset.acid;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  ctx.globalCompositeOperation = 'multiply';
  ctx.globalAlpha = alpha * 0.34;
  ctx.fillStyle = preset.halftone;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.restore();
}

function drawScannerPanel(
  ctx: CanvasRenderingContext2D,
  pixelBuffer: HTMLCanvasElement,
  panel: Point[],
  preset: VisualPreset,
  timeMs: number,
  intensity: number,
  alpha: number,
) {
  ctx.save();
  clipPolygon(ctx, panel);
  ctx.imageSmoothingEnabled = false;
  ctx.filter = `grayscale(1) contrast(${1.8 + intensity * 0.28}) brightness(1.12)`;
  ctx.globalAlpha = alpha * 0.5;
  ctx.globalCompositeOperation = 'multiply';
  ctx.drawImage(pixelBuffer, 0, 0, ctx.canvas.width, ctx.canvas.height);

  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = alpha * 0.2;
  ctx.fillStyle = preset.ink;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  drawDropouts(ctx, panel, preset.paper, timeMs, 7 + intensity * 5, alpha * 0.72);
  ctx.restore();
}

function drawPaperGrain(
  ctx: CanvasRenderingContext2D,
  points: Point[],
  preset: VisualPreset,
  timeMs: number,
  intensity: number,
  alpha: number,
) {
  const bounds = getBounds(points);
  const count = Math.floor(clamp(18 + preset.grain * 22 + intensity * 8, 16, 54));
  const seed = Math.floor(timeMs / 180) + Math.round(bounds.minX * 0.13 + bounds.minY * 0.31);

  ctx.save();
  clipPolygon(ctx, points);
  ctx.globalCompositeOperation = 'multiply';

  for (let index = 0; index < count; index += 1) {
    const x = bounds.minX + seededNoise(seed, index) * Math.max(1, bounds.maxX - bounds.minX);
    const y = bounds.minY + seededNoise(seed + 41, index) * Math.max(1, bounds.maxY - bounds.minY);
    const width = 1 + seededNoise(seed + 83, index) * 9;
    const height = seededNoise(seed + 127, index) > 0.72 ? 2 : 1;
    ctx.globalAlpha = alpha * preset.grain * (0.08 + seededNoise(seed + 167, index) * 0.22);
    ctx.fillStyle = seededNoise(seed + 211, index) > 0.7 ? preset.halftone : preset.ink;
    ctx.fillRect(x, y, width, height);
  }

  ctx.restore();
}

function drawSheetScanlines(
  ctx: CanvasRenderingContext2D,
  points: Point[],
  preset: VisualPreset,
  intensity: number,
  alpha: number,
) {
  if (preset.scanlines <= 0) return;

  const step = Math.floor(clamp(8 - intensity, 5, 8));
  ctx.save();
  clipPolygon(ctx, points);
  ctx.globalCompositeOperation = 'multiply';
  ctx.globalAlpha = alpha * preset.scanlines * 0.1;
  ctx.fillStyle = preset.ink;

  for (let y = 0; y < ctx.canvas.height; y += step) {
    ctx.fillRect(0, y, ctx.canvas.width, 1);
  }

  ctx.restore();
}

function drawFoldLines(ctx: CanvasRenderingContext2D, prism: PrismFrame, preset: VisualPreset, alpha: number, intensity: number) {
  ctx.save();
  ctx.lineWidth = 1 + intensity * 0.35;
  ctx.setLineDash([7, 5]);

  prism.foldLines.slice(0, 9).forEach(([a, b], index) => {
    ctx.globalAlpha = alpha * (index % 2 ? 0.52 : 0.34);
    ctx.strokeStyle = index % 2 ? preset.ink : preset.halftone;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  });

  ctx.restore();
}

function drawSharpFrame(ctx: CanvasRenderingContext2D, prism: PrismFrame, preset: VisualPreset, alpha: number, intensity: number) {
  ctx.save();
  ctx.setLineDash([]);
  ctx.globalAlpha = alpha;
  ctx.lineWidth = 2;
  ctx.strokeStyle = preset.ink;
  strokePolygon(ctx, prism.points);

  ctx.globalAlpha = alpha * 0.85;
  ctx.lineWidth = 1;
  ctx.strokeStyle = preset.paper;
  ctx.save();
  ctx.translate(2, -2);
  strokePolygon(ctx, prism.points);
  ctx.restore();

  ctx.globalCompositeOperation = 'source-over';
  prism.anchors.forEach((anchor, index) => {
    const size = 5 + intensity * 0.8;
    ctx.fillStyle = index % 2 ? preset.halftone : preset.accent;
    ctx.strokeStyle = preset.ink;
    ctx.lineWidth = 1.4;
    ctx.fillRect(anchor.x - size * 0.5, anchor.y - size * 0.5, size, size);
    ctx.strokeRect(anchor.x - size * 0.5, anchor.y - size * 0.5, size, size);
  });

  ctx.restore();
}

function buildTrianglePanels(points: Point[], center: Point) {
  return points.map((point, index) => [center, point, points[(index + 1) % points.length]]);
}

function getVideoSample(pixelBuffer: HTMLCanvasElement): VideoSample {
  const context = pixelBuffer.getContext('2d');
  if (!context || !pixelBuffer.width || !pixelBuffer.height) return null;

  try {
    const image = context.getImageData(0, 0, pixelBuffer.width, pixelBuffer.height);
    return {
      data: image.data,
      width: image.width,
      height: image.height,
    };
  } catch {
    return null;
  }
}

function sampleBrightness(sample: VideoSample, x: number, y: number, canvasWidth: number, canvasHeight: number) {
  if (!sample) {
    return 0.45 + seededNoise(Math.floor(x * 0.13), Math.floor(y * 0.17)) * 0.34;
  }

  const sx = clamp(Math.floor((x / Math.max(1, canvasWidth)) * sample.width), 0, sample.width - 1);
  const sy = clamp(Math.floor((y / Math.max(1, canvasHeight)) * sample.height), 0, sample.height - 1);
  const index = (sy * sample.width + sx) * 4;
  const r = sample.data[index] ?? 0;
  const g = sample.data[index + 1] ?? 0;
  const b = sample.data[index + 2] ?? 0;
  return (r * 0.299 + g * 0.587 + b * 0.114) / 255;
}

function drawPanelScratches(
  ctx: CanvasRenderingContext2D,
  panel: Point[],
  color: string,
  timeMs: number,
  count: number,
  alpha: number,
) {
  const bounds = getBounds(panel);
  const seed = Math.floor(timeMs / 240) + Math.round(bounds.maxY);

  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;

  for (let index = 0; index < count; index += 1) {
    const y = bounds.minY + seededNoise(seed, index) * Math.max(1, bounds.maxY - bounds.minY);
    const x = bounds.minX + seededNoise(seed + 23, index) * Math.max(1, bounds.maxX - bounds.minX) * 0.55;
    const length = 18 + seededNoise(seed + 53, index) * 86;
    ctx.globalAlpha = alpha * (0.35 + seededNoise(seed + 79, index) * 0.65);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + length, y + seededNoise(seed + 101, index) * 2 - 1);
    ctx.stroke();
  }

  ctx.restore();
}

function drawDropouts(
  ctx: CanvasRenderingContext2D,
  panel: Point[],
  color: string,
  timeMs: number,
  count: number,
  alpha: number,
) {
  const bounds = getBounds(panel);
  const seed = Math.floor(timeMs / 260) + Math.round(bounds.minX);

  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.fillStyle = color;

  for (let index = 0; index < count; index += 1) {
    const x = bounds.minX + seededNoise(seed, index) * Math.max(1, bounds.maxX - bounds.minX);
    const y = bounds.minY + seededNoise(seed + 29, index) * Math.max(1, bounds.maxY - bounds.minY);
    const width = 6 + seededNoise(seed + 59, index) * 34;
    ctx.globalAlpha = alpha * (0.25 + seededNoise(seed + 89, index) * 0.5);
    ctx.fillRect(x, y, width, 1 + seededNoise(seed + 113, index) * 3);
  }

  ctx.restore();
}

function getBounds(points: Point[]): Bounds {
  return points.reduce(
    (bounds, point) => ({
      minX: Math.min(bounds.minX, point.x),
      minY: Math.min(bounds.minY, point.y),
      maxX: Math.max(bounds.maxX, point.x),
      maxY: Math.max(bounds.maxY, point.y),
    }),
    {
      minX: Number.POSITIVE_INFINITY,
      minY: Number.POSITIVE_INFINITY,
      maxX: Number.NEGATIVE_INFINITY,
      maxY: Number.NEGATIVE_INFINITY,
    },
  );
}

function strokePolygon(ctx: CanvasRenderingContext2D, points: Point[]) {
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  points.slice(1).forEach((point) => ctx.lineTo(point.x, point.y));
  ctx.closePath();
  ctx.stroke();
}

function withAlpha(hex: string, alpha: number) {
  const normalized = hex.replace('#', '');
  if (normalized.length !== 6) return hex;
  const r = Number.parseInt(normalized.slice(0, 2), 16);
  const g = Number.parseInt(normalized.slice(2, 4), 16);
  const b = Number.parseInt(normalized.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function seededNoise(seed: number, index: number) {
  const value = Math.sin(seed * 12.9898 + index * 78.233) * 43758.5453;
  return value - Math.floor(value);
}
