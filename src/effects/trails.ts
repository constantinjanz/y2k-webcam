import { ensureCanvasSize } from '../utils/canvas';
import { clamp } from '../utils/math';
import type { VisualPreset } from './presets';

export function drawFeedbackTrails(
  ctx: CanvasRenderingContext2D,
  feedback: HTMLCanvasElement,
  preset: VisualPreset,
  intensity: number,
) {
  if (!feedback.width || !feedback.height) return;

  const alpha = clamp(preset.trailAlpha * intensity, 0, 0.35);
  if (alpha <= 0.01) return;

  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha = alpha;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(feedback, -preset.rgbShift * 0.3, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.globalAlpha = alpha * 0.72;
  ctx.drawImage(feedback, preset.rgbShift * 0.45, preset.rgbShift * 0.16, ctx.canvas.width, ctx.canvas.height);
  ctx.restore();
}

export function captureFeedback(feedback: HTMLCanvasElement, source: HTMLCanvasElement) {
  ensureCanvasSize(feedback, source.width, source.height);
  const feedbackCtx = feedback.getContext('2d');
  if (!feedbackCtx) return;

  feedbackCtx.save();
  feedbackCtx.globalAlpha = 0.86;
  feedbackCtx.drawImage(source, 0, 0);
  feedbackCtx.restore();
}
