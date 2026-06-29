import type { PrismFrame } from '../vision/prismEngine';
import { clipPolygon } from '../utils/canvas';
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

  const tear = preset.rgbShift * (1.05 + intensity * 0.42);
  const jitter = Math.sin(timeMs * 0.006) * tear * 0.35;

  ctx.save();
  clipPolygon(ctx, prism.points);

  ctx.imageSmoothingEnabled = false;
  ctx.globalAlpha = prism.decay * 0.62;
  ctx.globalCompositeOperation = 'source-over';
  ctx.filter = getCrossingFilter(preset, intensity);
  ctx.drawImage(pixelBuffer, -tear + jitter, tear * 0.18, ctx.canvas.width, ctx.canvas.height);

  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha = prism.decay * 0.18;
  ctx.filter = 'contrast(1.8) saturate(1.8)';
  ctx.drawImage(pixelBuffer, tear * 0.72, -tear * 0.22, ctx.canvas.width, ctx.canvas.height);

  const step = Math.max(5, Math.floor(8 - preset.scanlines * 2));
  ctx.globalCompositeOperation = 'multiply';
  ctx.globalAlpha = prism.decay * (0.1 + preset.scanlines * 0.1);
  ctx.fillStyle = '#000';

  for (let y = 0; y <= ctx.canvas.height; y += step) {
    ctx.fillRect(0, y, ctx.canvas.width, 1);
  }

  ctx.restore();
}

function getCrossingFilter(preset: VisualPreset, intensity: number) {
  if (preset.filterMode === 'berlin') return `invert(1) contrast(${1.82 + intensity * 0.34}) saturate(2.1) hue-rotate(18deg)`;
  if (preset.filterMode === 'night') return `invert(1) contrast(${1.7 + intensity * 0.35}) saturate(1.55) hue-rotate(85deg)`;
  if (preset.filterMode === 'xerox') return `invert(1) grayscale(1) contrast(${2.1 + intensity * 0.4}) brightness(1.1)`;
  if (preset.filterMode === 'compressed') return `invert(1) contrast(${1.55 + intensity * 0.28}) saturate(2)`;
  if (preset.filterMode === 'virus') return `invert(1) contrast(${2.1 + intensity * 0.42}) saturate(2.4) hue-rotate(-18deg)`;
  if (preset.filterMode === 'surveillance') return `invert(1) contrast(${1.85 + intensity * 0.34}) saturate(1.8) hue-rotate(-35deg)`;
  return `invert(1) contrast(${1.9 + intensity * 0.36}) saturate(2.2) hue-rotate(22deg)`;
}
