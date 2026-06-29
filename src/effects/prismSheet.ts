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
  const motionDamping = 1 - clamp(prism.motion / 42, 0, 0.74);
  const heavyEffects = intensity >= 1.45;
  const crossingEffects = intensity >= 1.2;
  const jitter = (Math.sin(timeMs * 0.005 + prism.distance * 0.012) * shift * 0.12 + prism.tilt * shift * 0.45) * motionDamping;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.shadowColor = preset.accent;
  ctx.shadowBlur = 12 * preset.prismGlow * intensity * alpha;
  ctx.lineJoin = 'round';

  drawSoftEdge(ctx, points, preset, alpha, intensity);
  drawPolygonVideo(ctx, pixelBuffer, points, preset, timeMs, jitter, intensity, alpha);
  if (heavyEffects) {
    drawFanSections(ctx, pixelBuffer, points, preset, timeMs, intensity, alpha);
  }
  drawRgbRims(ctx, pixelBuffer, points, preset, shift, alpha);
  drawInternalFolds(ctx, prism, preset, alpha, intensity);
  drawPrismFrame(ctx, points, preset, alpha, intensity);

  if (preset.dotMatrix && heavyEffects) {
    drawDotMatrix(ctx, points, width, height, preset, alpha);
  }

  if (preset.mirrorShards && heavyEffects) {
    drawMirrorShards(ctx, pixelBuffer, points, preset, timeMs, alpha);
  }

  if (prism.crossing && crossingEffects) {
    drawCrossingEffect(ctx, pixelBuffer, prism, preset, timeMs, intensity);
  }
  ctx.restore();
}

function drawSoftEdge(
  ctx: CanvasRenderingContext2D,
  points: Point[],
  preset: VisualPreset,
  alpha: number,
  intensity: number,
) {
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.strokeStyle = preset.accent;

  for (let index = 0; index < 2; index += 1) {
    ctx.globalAlpha = alpha * (0.12 - index * 0.04);
    ctx.lineWidth = 9 + index * 9 + intensity * 2;
    strokePolygon(ctx, points);
  }

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
  const hue = intensity >= 1.35 ? Math.sin(timeMs * 0.0015) * 16 : 0;
  ctx.filter = `contrast(${1.14 + preset.posterize * 0.28}) saturate(${1.3 + intensity * 0.55}) hue-rotate(${hue}deg)`;
  ctx.drawImage(pixelBuffer, jitter, Math.cos(timeMs * 0.003) * intensity * 1.5, ctx.canvas.width, ctx.canvas.height);
  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha = alpha * 0.12;
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
    const offset = Math.sin(timeMs * 0.004 + index * 1.8) * (3 + intensity * 6);

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

  ctx.globalAlpha = 0.18 * alpha;
  ctx.drawImage(pixelBuffer, -shift * 0.55, shift * 0.12, ctx.canvas.width, ctx.canvas.height);
  ctx.fillStyle = 'rgba(255, 32, 100, 0.18)';
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
  ctx.lineWidth = 1 + intensity * 0.9;
  ctx.setLineDash([9, 8]);

  prism.foldLines.slice(0, 8).forEach(([a, b], index) => {
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
  ctx.lineWidth = 1.5 + intensity * 1.25;
  ctx.strokeStyle = preset.accent;
  strokePolygon(ctx, points);

  ctx.globalCompositeOperation = 'screen';
  ctx.lineWidth = 1;
  ctx.strokeStyle = preset.secondary;
  points.slice(0, 8).forEach((point, index) => {
    const opposite = points[(index + Math.floor(points.length / 2)) % points.length];
    if (!opposite || points.length < 4) return;
    ctx.beginPath();
    ctx.moveTo(point.x, point.y);
    ctx.lineTo(opposite.x, opposite.y);
    ctx.stroke();
  });

  points.forEach((point, index) => {
    ctx.fillStyle = index % 2 === 0 ? preset.accent : preset.secondary;
    ctx.beginPath();
    ctx.arc(point.x, point.y, 4.5 + intensity * 0.6, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.restore();
}

function strokePolygon(ctx: CanvasRenderingContext2D, points: Point[]) {
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  points.slice(1).forEach((point) => ctx.lineTo(point.x, point.y));
  ctx.closePath();
  ctx.stroke();
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
