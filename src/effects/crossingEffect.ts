import type { PrismFrame } from '../vision/prismEngine';
import { clipPolygon } from '../utils/canvas';
import type { Point } from '../utils/math';
import type { VisualPreset } from './presets';

export function drawCrossingEffect(
  ctx: CanvasRenderingContext2D,
  pixelBuffer: HTMLCanvasElement,
  prism: PrismFrame,
  preset: VisualPreset,
  timeMs: number,
  intensity: number,
) {
  if (!prism.crossing || prism.decay <= 0 || prism.points.length < 3) return;

  const targets = (prism.crossingPoints.length ? prism.crossingPoints : [prism.center]).slice(0, 2);
  const baseRadius = Math.max(44, Math.min(ctx.canvas.width, ctx.canvas.height) * (0.075 + intensity * 0.012));

  ctx.save();
  clipPolygon(ctx, prism.points);

  prism.foldLines.slice(0, 7).forEach(([a, b], index) => {
    ctx.globalAlpha = prism.decay * (index % 2 ? 0.64 : 0.42);
    ctx.strokeStyle = index % 2 ? preset.paper : preset.ink;
    ctx.lineWidth = index % 2 ? 3 : 1.2;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  });

  targets.forEach((point, index) => {
    drawCrossNode(ctx, pixelBuffer, point, baseRadius * (index === 0 ? 1.12 : 0.82), preset, timeMs, intensity, prism.decay);
  });

  ctx.restore();
}

function drawCrossNode(
  ctx: CanvasRenderingContext2D,
  pixelBuffer: HTMLCanvasElement,
  point: Point,
  radius: number,
  preset: VisualPreset,
  timeMs: number,
  intensity: number,
  decay: number,
) {
  const wobble = Math.sin(timeMs * 0.01 + point.x * 0.018) * radius * 0.16;
  const tear = preset.rgbTear * preset.rgbShift * (1 + intensity * 0.45);

  ctx.save();
  drawDiamondPath(ctx, point, radius, wobble);
  ctx.clip();

  ctx.imageSmoothingEnabled = false;
  ctx.globalAlpha = decay * 0.9;
  ctx.filter = `invert(1) grayscale(0.2) contrast(${2.1 + intensity * 0.48}) saturate(1.6)`;
  ctx.globalCompositeOperation = 'source-over';
  ctx.drawImage(pixelBuffer, -tear, tear * 0.24, ctx.canvas.width, ctx.canvas.height);

  ctx.globalCompositeOperation = 'multiply';
  ctx.globalAlpha = decay * 0.5;
  ctx.fillStyle = preset.halftone;
  ctx.fillRect(point.x - radius * 1.4, point.y - radius * 1.4, radius * 2.8, radius * 2.8);

  drawCrossHalftone(ctx, point, radius, preset, timeMs, decay);
  drawScanTears(ctx, point, radius, preset, timeMs, decay);
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = decay;
  ctx.lineWidth = 2;
  ctx.strokeStyle = preset.ink;
  drawDiamondPath(ctx, point, radius, wobble);
  ctx.stroke();

  ctx.lineWidth = 1;
  ctx.strokeStyle = preset.paper;
  drawDiamondPath(ctx, { x: point.x + 2, y: point.y - 2, z: point.z }, radius * 0.92, wobble * 0.5);
  ctx.stroke();

  ctx.strokeStyle = preset.halftone;
  ctx.lineWidth = 1.5;
  const tick = radius * 0.36;
  ctx.beginPath();
  ctx.moveTo(point.x - tick, point.y);
  ctx.lineTo(point.x + tick, point.y);
  ctx.moveTo(point.x, point.y - tick);
  ctx.lineTo(point.x, point.y + tick);
  ctx.stroke();
  ctx.restore();
}

function drawCrossHalftone(
  ctx: CanvasRenderingContext2D,
  point: Point,
  radius: number,
  preset: VisualPreset,
  timeMs: number,
  decay: number,
) {
  const gap = Math.max(8, Math.floor(radius * 0.16));
  const seed = Math.floor(timeMs / 180) + Math.round(point.x * 0.21 + point.y * 0.17);

  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = preset.paper;

  for (let y = point.y - radius; y <= point.y + radius; y += gap) {
    const rowShift = Math.floor(y / gap) % 2 ? gap * 0.5 : 0;
    for (let x = point.x - radius + rowShift; x <= point.x + radius; x += gap) {
      const dx = x - point.x;
      const dy = y - point.y;
      if (Math.hypot(dx, dy) > radius * 1.1) continue;
      const noise = seededNoise(seed + Math.floor(x), Math.floor(y));
      const size = gap * (0.18 + noise * 0.38);
      ctx.globalAlpha = decay * (0.35 + noise * 0.42);
      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawScanTears(
  ctx: CanvasRenderingContext2D,
  point: Point,
  radius: number,
  preset: VisualPreset,
  timeMs: number,
  decay: number,
) {
  const seed = Math.floor(timeMs / 120) + Math.round(point.x);

  ctx.globalCompositeOperation = 'screen';
  ctx.fillStyle = withAlpha(preset.xerox, 0.8);

  for (let index = 0; index < 10; index += 1) {
    const y = point.y - radius + seededNoise(seed, index) * radius * 2;
    const width = radius * (0.8 + seededNoise(seed + 29, index) * 1.6);
    const x = point.x - width * 0.5 + (seededNoise(seed + 53, index) - 0.5) * radius * 0.7;
    ctx.globalAlpha = decay * (0.22 + seededNoise(seed + 79, index) * 0.42);
    ctx.fillRect(x, y, width, 1 + seededNoise(seed + 101, index) * 4);
  }
}

function drawDiamondPath(ctx: CanvasRenderingContext2D, point: Point, radius: number, wobble: number) {
  ctx.beginPath();
  ctx.moveTo(point.x, point.y - radius);
  ctx.lineTo(point.x + radius + wobble, point.y);
  ctx.lineTo(point.x, point.y + radius);
  ctx.lineTo(point.x - radius + wobble * 0.4, point.y);
  ctx.closePath();
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
