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

  const targets = prism.crossingPoints.length ? prism.crossingPoints : [prism.center];
  const radius = Math.max(32, Math.min(ctx.canvas.width, ctx.canvas.height) * 0.055 * intensity);

  ctx.save();
  clipPolygon(ctx, prism.points);
  ctx.globalCompositeOperation = 'screen';

  prism.foldLines.slice(0, 6).forEach(([a, b], index) => {
    ctx.globalAlpha = prism.decay * (0.28 + (index % 2) * 0.12);
    ctx.strokeStyle = index % 2 === 0 ? '#ffffff' : preset.secondary;
    ctx.lineWidth = 1.5 + intensity * 1.5;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  });

  targets.slice(0, 2).forEach((point, index) => {
    drawCrossNode(ctx, pixelBuffer, point, radius * (index === 0 ? 1.2 : 0.9), preset, timeMs, intensity, prism.decay);
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
  const wobble = Math.sin(timeMs * 0.012 + point.x * 0.02) * radius * 0.18;

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(point.x, point.y - radius);
  ctx.lineTo(point.x + radius + wobble, point.y);
  ctx.lineTo(point.x, point.y + radius);
  ctx.lineTo(point.x - radius + wobble, point.y);
  ctx.closePath();
  ctx.clip();

  ctx.imageSmoothingEnabled = false;
  ctx.globalAlpha = decay * 0.86;
  ctx.filter = `invert(1) contrast(${1.8 + intensity * 0.7}) saturate(${1.7 + intensity})`;
  ctx.drawImage(pixelBuffer, -preset.rgbShift * intensity, preset.rgbShift * 0.4, ctx.canvas.width, ctx.canvas.height);

  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha = decay * 0.36;
  ctx.fillStyle = '#ffffff';
  for (let y = point.y - radius; y < point.y + radius; y += 8) {
    ctx.fillRect(point.x - radius * 1.3, y, radius * 2.6, 1);
  }

  ctx.fillStyle = preset.accent;
  ctx.globalAlpha = decay * 0.22;
  const seed = Math.floor(timeMs / 140) + Math.round(point.x * 0.3 + point.y * 0.7);
  for (let index = 0; index < 6; index += 1) {
    const x = point.x - radius + seededNoise(seed, index) * radius * 2;
    const y = point.y - radius + seededNoise(seed + 31, index) * radius * 2;
    ctx.fillRect(x, y, 2 + seededNoise(seed + 61, index) * 10, 1 + seededNoise(seed + 97, index) * 7);
  }

  ctx.restore();
}

function seededNoise(seed: number, index: number) {
  const value = Math.sin(seed * 12.9898 + index * 78.233) * 43758.5453;
  return value - Math.floor(value);
}
