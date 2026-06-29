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
  const baseRadius = Math.max(44, Math.min(ctx.canvas.width, ctx.canvas.height) * (0.07 + intensity * 0.012));

  ctx.save();
  clipPolygon(ctx, prism.points);

  targets.forEach((point, index) => {
    drawCrossingVideoFilter(
      ctx,
      pixelBuffer,
      point,
      baseRadius * (index === 0 ? 1.1 : 0.82),
      preset,
      timeMs,
      intensity,
      prism.decay,
    );
  });

  ctx.restore();
}

function drawCrossingVideoFilter(
  ctx: CanvasRenderingContext2D,
  pixelBuffer: HTMLCanvasElement,
  point: Point,
  radius: number,
  preset: VisualPreset,
  timeMs: number,
  intensity: number,
  decay: number,
) {
  const wobble = Math.sin(timeMs * 0.006 + point.x * 0.011) * radius * 0.08;
  const tear = preset.rgbShift * (1.15 + intensity * 0.45);

  ctx.save();
  drawDiamondPath(ctx, point, radius, wobble);
  ctx.clip();

  ctx.imageSmoothingEnabled = false;
  ctx.globalAlpha = decay * 0.92;
  ctx.globalCompositeOperation = 'source-over';
  ctx.filter = getCrossingFilter(preset, intensity);
  ctx.drawImage(pixelBuffer, -tear, tear * 0.2, ctx.canvas.width, ctx.canvas.height);

  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha = decay * 0.28;
  ctx.filter = 'contrast(1.8) saturate(1.8)';
  ctx.drawImage(pixelBuffer, tear * 0.72, -tear * 0.22, ctx.canvas.width, ctx.canvas.height);

  drawCrossingScanlines(ctx, point, radius, preset, decay);
  ctx.restore();

  drawCrossingBorder(ctx, point, radius, wobble, preset, decay);
}

function drawCrossingScanlines(
  ctx: CanvasRenderingContext2D,
  point: Point,
  radius: number,
  preset: VisualPreset,
  decay: number,
) {
  const step = Math.max(5, Math.floor(8 - preset.scanlines * 2));
  ctx.globalCompositeOperation = 'multiply';
  ctx.globalAlpha = decay * (0.12 + preset.scanlines * 0.12);
  ctx.fillStyle = '#000';

  for (let y = point.y - radius; y <= point.y + radius; y += step) {
    ctx.fillRect(point.x - radius * 1.35, y, radius * 2.7, 1);
  }
}

function drawCrossingBorder(
  ctx: CanvasRenderingContext2D,
  point: Point,
  radius: number,
  wobble: number,
  preset: VisualPreset,
  decay: number,
) {
  ctx.save();
  ctx.globalAlpha = decay;
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#ffffff';
  drawDiamondPath(ctx, point, radius, wobble);
  ctx.stroke();

  ctx.lineWidth = 1;
  ctx.strokeStyle = preset.accent;
  drawDiamondPath(ctx, { x: point.x + 2, y: point.y - 2, z: point.z }, radius * 0.94, wobble * 0.4);
  ctx.stroke();

  ctx.strokeStyle = preset.secondary;
  drawDiamondPath(ctx, { x: point.x - 2, y: point.y + 2, z: point.z }, radius * 0.88, wobble * 0.25);
  ctx.stroke();
  ctx.restore();
}

function drawDiamondPath(ctx: CanvasRenderingContext2D, point: Point, radius: number, wobble: number) {
  ctx.beginPath();
  ctx.moveTo(point.x, point.y - radius);
  ctx.lineTo(point.x + radius + wobble, point.y);
  ctx.lineTo(point.x, point.y + radius);
  ctx.lineTo(point.x - radius + wobble * 0.35, point.y);
  ctx.closePath();
}

function getCrossingFilter(preset: VisualPreset, intensity: number) {
  if (preset.filterMode === 'night') return `invert(1) contrast(${1.7 + intensity * 0.35}) saturate(1.55) hue-rotate(85deg)`;
  if (preset.filterMode === 'xerox') return `invert(1) grayscale(1) contrast(${2.1 + intensity * 0.4}) brightness(1.1)`;
  if (preset.filterMode === 'compressed') return `invert(1) contrast(${1.55 + intensity * 0.28}) saturate(2)`;
  if (preset.filterMode === 'surveillance') return `invert(1) contrast(${1.85 + intensity * 0.34}) saturate(1.8) hue-rotate(-35deg)`;
  return `invert(1) contrast(${1.9 + intensity * 0.36}) saturate(2.2) hue-rotate(22deg)`;
}
