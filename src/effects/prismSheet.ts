import type { PrismFrame } from '../vision/prismEngine';
import { clipPolygon } from '../utils/canvas';
import { clamp, lerp, type Point } from '../utils/math';
import { drawCrossingEffect } from './crossingEffect';
import type { VisualPreset } from './presets';

export function drawPrismSheet(
  ctx: CanvasRenderingContext2D,
  pixelBuffer: HTMLCanvasElement,
  prism: PrismFrame,
  preset: VisualPreset,
  timeMs: number,
  intensity: number,
) {
  if (!prism.renderActive || prism.decay <= 0 || prism.points.length < 3) return;

  const { width, height } = ctx.canvas;
  const points = prism.points;
  const alpha = clamp(prism.decay, 0, 1);
  const shift = preset.rgbShift * intensity * alpha;
  const jitter = Math.sin(timeMs * 0.007 + prism.distance * 0.012) * shift * 0.45 + prism.tilt * shift;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.shadowColor = preset.accent;
  ctx.shadowBlur = 28 * preset.prismGlow * intensity * alpha;
  ctx.lineJoin = 'round';

  drawPolygonVideo(ctx, pixelBuffer, points, preset, timeMs, jitter, intensity, alpha);
  drawFanSections(ctx, pixelBuffer, points, preset, timeMs, intensity, alpha);
  drawRgbRims(ctx, pixelBuffer, points, preset, shift, alpha);
  drawInternalFolds(ctx, prism, preset, alpha, intensity);
  drawPrismFrame(ctx, points, preset, alpha, intensity);

  if (preset.dotMatrix) {
    drawDotMatrix(ctx, points, width, height, preset, alpha);
  }

  if (preset.mirrorShards) {
    drawMirrorShards(ctx, pixelBuffer, points, preset, timeMs, alpha);
  }

  drawCrossingEffect(ctx, pixelBuffer, prism, preset, timeMs, intensity);
  ctx.restore();
}

function drawPolygonVideo(
  ctx: CanvasRenderingContext2D,
  pixelBuffer: HTMLCanvasElement,
  points: Point[],
  preset: VisualPreset,
  timeMs: number,
  jitter: number,
  intensity: number,
  alpha: number,
) {
  ctx.save();
  clipPolygon(ctx, points);
  ctx.imageSmoothingEnabled = false;
  ctx.filter = `contrast(${1.16 + preset.posterize * 0.36}) saturate(${1.42 + intensity * 0.9}) hue-rotate(${Math.sin(timeMs * 0.0015) * 22}deg)`;
  ctx.drawImage(pixelBuffer, jitter, Math.cos(timeMs * 0.004) * intensity * 4, ctx.canvas.width, ctx.canvas.height);
  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha = alpha * 0.18;
  ctx.fillStyle = preset.accent;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.restore();
}

function drawFanSections(
  ctx: CanvasRenderingContext2D,
  pixelBuffer: HTMLCanvasElement,
  points: Point[],
  preset: VisualPreset,
  timeMs: number,
  intensity: number,
  alpha: number,
) {
  const center = points.reduce(
    (sum, point) => ({ x: sum.x + point.x / points.length, y: sum.y + point.y / points.length, z: 0 }),
    { x: 0, y: 0, z: 0 },
  );

  points.forEach((point, index) => {
    const next = points[(index + 1) % points.length];
    const offset = Math.sin(timeMs * 0.006 + index * 1.8) * (5 + intensity * 10);

    ctx.save();
    clipPolygon(ctx, [center, point, next]);
    ctx.imageSmoothingEnabled = false;
    ctx.globalCompositeOperation = index % 2 === 0 ? 'screen' : 'source-over';
    ctx.globalAlpha = alpha * (index % 2 === 0 ? 0.32 : 0.26);
    ctx.filter = `contrast(${1.28 + preset.posterize * 0.25}) saturate(${1.5 + intensity * 0.55}) hue-rotate(${lerp(-34, 34, index / Math.max(1, points.length - 1))}deg)`;
    ctx.drawImage(pixelBuffer, offset, -offset * 0.35, ctx.canvas.width, ctx.canvas.height);
    ctx.fillStyle = index % 2 === 0 ? `${preset.secondary}33` : `${preset.accent}22`;
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.restore();
  });
}

function drawRgbRims(
  ctx: CanvasRenderingContext2D,
  pixelBuffer: HTMLCanvasElement,
  points: Point[],
  preset: VisualPreset,
  shift: number,
  alpha: number,
) {
  ctx.save();
  clipPolygon(ctx, points);
  ctx.imageSmoothingEnabled = false;
  ctx.globalCompositeOperation = 'screen';
  ctx.filter = 'saturate(2.2) contrast(1.25)';

  ctx.globalAlpha = 0.22 * alpha;
  ctx.drawImage(pixelBuffer, -shift, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.fillStyle = 'rgba(255, 32, 100, 0.18)';
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  ctx.globalAlpha = 0.2 * alpha;
  ctx.drawImage(pixelBuffer, shift * 0.64, shift * 0.3, ctx.canvas.width, ctx.canvas.height);
  ctx.fillStyle = `${preset.accent}33`;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.restore();
}

function drawInternalFolds(
  ctx: CanvasRenderingContext2D,
  prism: PrismFrame,
  preset: VisualPreset,
  alpha: number,
  intensity: number,
) {
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.lineWidth = 1 + intensity * 1.6;
  ctx.setLineDash([8, 7]);

  prism.foldLines.forEach(([a, b], index) => {
    ctx.globalAlpha = alpha * (0.22 + (index % 3) * 0.08);
    ctx.strokeStyle = index % 2 === 0 ? preset.secondary : preset.accent;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  });

  ctx.restore();
}

function drawPrismFrame(
  ctx: CanvasRenderingContext2D,
  points: Point[],
  preset: VisualPreset,
  alpha: number,
  intensity: number,
) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.lineWidth = 2 + intensity * 2;
  ctx.strokeStyle = preset.accent;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  points.slice(1).forEach((point) => ctx.lineTo(point.x, point.y));
  ctx.closePath();
  ctx.stroke();

  ctx.globalCompositeOperation = 'screen';
  ctx.lineWidth = 1;
  ctx.strokeStyle = preset.secondary;
  points.forEach((point, index) => {
    const opposite = points[(index + Math.floor(points.length / 2)) % points.length];
    if (!opposite || points.length < 4) return;
    ctx.beginPath();
    ctx.moveTo(point.x, point.y);
    ctx.lineTo(opposite.x, opposite.y);
    ctx.stroke();
  });

  points.forEach((point, index) => {
    ctx.fillStyle = index % 2 === 0 ? preset.accent : preset.secondary;
    ctx.fillRect(point.x - 5, point.y - 5, 10, 10);
  });

  ctx.restore();
}

function drawDotMatrix(
  ctx: CanvasRenderingContext2D,
  points: Point[],
  width: number,
  height: number,
  preset: VisualPreset,
  alpha: number,
) {
  ctx.save();
  clipPolygon(ctx, points);
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = 'rgba(0, 0, 0, 0.36)';

  const gap = Math.max(9, Math.floor(Math.min(width, height) * 0.015));
  for (let y = 0; y < height; y += gap) {
    for (let x = (Math.floor(y / gap) % 2) * gap * 0.5; x < width; x += gap) {
      ctx.beginPath();
      ctx.arc(x, y, gap * 0.28, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.globalCompositeOperation = 'screen';
  ctx.fillStyle = `${preset.secondary}44`;
  ctx.globalAlpha = alpha * 0.28;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}

function drawMirrorShards(
  ctx: CanvasRenderingContext2D,
  pixelBuffer: HTMLCanvasElement,
  points: Point[],
  preset: VisualPreset,
  timeMs: number,
  alpha: number,
) {
  const center = {
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
  };

  ctx.save();
  clipPolygon(ctx, points);
  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha = alpha * 0.24;

  for (let index = 0; index < 4; index += 1) {
    const rotation = lerp(-0.45, 0.45, index / 3) + Math.sin(timeMs * 0.001 + index) * 0.05;
    ctx.save();
    ctx.translate(center.x, center.y);
    ctx.rotate(rotation);
    ctx.scale(index % 2 === 0 ? -1 : 1, 1);
    ctx.translate(-center.x, -center.y);
    ctx.drawImage(pixelBuffer, 0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.restore();
  }

  ctx.fillStyle = `${preset.accent}22`;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.restore();
}
