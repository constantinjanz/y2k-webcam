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
  const radius = Math.max(38, Math.min(ctx.canvas.width, ctx.canvas.height) * 0.08 * intensity);

  ctx.save();
  clipPolygon(ctx, prism.points);
  ctx.globalCompositeOperation = 'screen';

  prism.foldLines.forEach(([a, b], index) => {
    ctx.globalAlpha = prism.decay * (0.28 + (index % 2) * 0.12);
    ctx.strokeStyle = index % 2 === 0 ? '#ffffff' : preset.secondary;
    ctx.lineWidth = 2 + intensity * 3;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  });

  targets.forEach((point, index) => {
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
  for (let y = point.y - radius; y < point.y + radius; y += 5) {
    ctx.fillRect(point.x - radius * 1.3, y, radius * 2.6, 1.2);
  }

  ctx.fillStyle = preset.accent;
  ctx.globalAlpha = decay * 0.22;
  for (let index = 0; index < 14; index += 1) {
    const x = point.x - radius + Math.random() * radius * 2;
    const y = point.y - radius + Math.random() * radius * 2;
    ctx.fillRect(x, y, 2 + Math.random() * 10, 1 + Math.random() * 7);
  }

  ctx.restore();
}
