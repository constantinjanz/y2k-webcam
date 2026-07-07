import type { Point } from './math';

export type CoverFit = {
  dx: number;
  dy: number;
  dw: number;
  dh: number;
  sx: number;
  sy: number;
  sw: number;
  sh: number;
};

export type CanvasBuffers = {
  pixel: HTMLCanvasElement;
  scratch: HTMLCanvasElement;
  feedback: HTMLCanvasElement;
};

export type CanvasBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export function createCanvasBuffers(): CanvasBuffers {
  return {
    pixel: document.createElement('canvas'),
    scratch: document.createElement('canvas'),
    feedback: document.createElement('canvas'),
  };
}

export function ensureCanvasSize(canvas: HTMLCanvasElement, width: number, height: number) {
  const nextWidth = Math.max(1, Math.floor(width));
  const nextHeight = Math.max(1, Math.floor(height));

  if (canvas.width !== nextWidth || canvas.height !== nextHeight) {
    canvas.width = nextWidth;
    canvas.height = nextHeight;
    return true;
  }

  return false;
}

export function resizeCanvasToDisplaySize(canvas: HTMLCanvasElement, maxDpr = 1.25) {
  const dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
  const width = Math.max(1, Math.floor(canvas.clientWidth * dpr));
  const height = Math.max(1, Math.floor(canvas.clientHeight * dpr));
  const changed = canvas.width !== width || canvas.height !== height;

  if (changed) {
    canvas.width = width;
    canvas.height = height;
  }

  return { width, height, dpr, changed };
}

export function getVideoCoverFit(
  videoWidth: number,
  videoHeight: number,
  canvasWidth: number,
  canvasHeight: number,
): CoverFit {
  const videoRatio = videoWidth / videoHeight;
  const canvasRatio = canvasWidth / canvasHeight;

  if (videoRatio > canvasRatio) {
    const sw = videoHeight * canvasRatio;
    return {
      sx: (videoWidth - sw) * 0.5,
      sy: 0,
      sw,
      sh: videoHeight,
      dx: 0,
      dy: 0,
      dw: canvasWidth,
      dh: canvasHeight,
    };
  }

  const sh = videoWidth / canvasRatio;
  return {
    sx: 0,
    sy: (videoHeight - sh) * 0.5,
    sw: videoWidth,
    sh,
    dx: 0,
    dy: 0,
    dw: canvasWidth,
    dh: canvasHeight,
  };
}

export function drawMirroredVideo(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  fit: CoverFit,
  alpha = 1,
) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(fit.dw, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(video, fit.sx, fit.sy, fit.sw, fit.sh, fit.dx, fit.dy, fit.dw, fit.dh);
  ctx.restore();
}

export function renderPixelatedVideoBuffer(
  buffer: HTMLCanvasElement,
  video: HTMLVideoElement,
  targetWidth: number,
  targetHeight: number,
  pixelScale: number,
) {
  const width = Math.max(80, Math.floor(targetWidth * pixelScale));
  const height = Math.max(60, Math.floor(targetHeight * pixelScale));
  ensureCanvasSize(buffer, width, height);

  const bufferCtx = buffer.getContext('2d');
  if (!bufferCtx) return;

  const fit = getVideoCoverFit(video.videoWidth, video.videoHeight, width, height);
  bufferCtx.save();
  bufferCtx.imageSmoothingEnabled = false;
  bufferCtx.clearRect(0, 0, width, height);
  drawMirroredVideo(bufferCtx, video, fit);
  bufferCtx.restore();
}

export function clipPolygon(ctx: CanvasRenderingContext2D, points: Point[]) {
  if (!points.length) return;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);

  for (let index = 1; index < points.length; index += 1) {
    ctx.lineTo(points[index].x, points[index].y);
  }

  ctx.closePath();
  ctx.clip();
}

export function getPolygonBounds(
  points: Point[],
  canvasWidth: number,
  canvasHeight: number,
  padding = 0,
): CanvasBounds {
  if (!points.length) {
    return { x: 0, y: 0, width: canvasWidth, height: canvasHeight };
  }

  let minX = canvasWidth;
  let minY = canvasHeight;
  let maxX = 0;
  let maxY = 0;

  points.forEach((point) => {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  });

  const x = Math.max(0, Math.floor(minX - padding));
  const y = Math.max(0, Math.floor(minY - padding));
  const right = Math.min(canvasWidth, Math.ceil(maxX + padding));
  const bottom = Math.min(canvasHeight, Math.ceil(maxY + padding));

  return {
    x,
    y,
    width: Math.max(1, right - x),
    height: Math.max(1, bottom - y),
  };
}

export function drawCanvasRegion(
  ctx: CanvasRenderingContext2D,
  source: HTMLCanvasElement,
  bounds: CanvasBounds,
  offsetX = 0,
  offsetY = 0,
) {
  if (!source.width || !source.height || bounds.width <= 0 || bounds.height <= 0) return;

  const canvasWidth = Math.max(1, ctx.canvas.width);
  const canvasHeight = Math.max(1, ctx.canvas.height);
  const sx = Math.max(0, Math.floor((bounds.x / canvasWidth) * source.width));
  const sy = Math.max(0, Math.floor((bounds.y / canvasHeight) * source.height));
  const sw = Math.max(1, Math.min(source.width - sx, Math.ceil((bounds.width / canvasWidth) * source.width)));
  const sh = Math.max(1, Math.min(source.height - sy, Math.ceil((bounds.height / canvasHeight) * source.height)));

  ctx.drawImage(source, sx, sy, sw, sh, bounds.x + offsetX, bounds.y + offsetY, bounds.width, bounds.height);
}

export function drawGlitchLineNoise(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  intensity: number,
  hue = 176,
) {
  const rows = Math.floor(3 + intensity * 8);

  ctx.save();
  ctx.globalCompositeOperation = 'screen';

  for (let index = 0; index < rows; index += 1) {
    const y = Math.random() * height;
    const lineHeight = 1 + Math.random() * (2 + intensity * 6);
    const alpha = 0.02 + Math.random() * 0.09 * intensity;
    const shift = (Math.random() - 0.5) * width * 0.08 * intensity;

    ctx.fillStyle = `hsla(${hue + Math.random() * 90}, 100%, 58%, ${alpha})`;
    ctx.fillRect(shift, y, width, lineHeight);
  }

  ctx.restore();
}

export function drawTimestamp(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const now = new Date();
  const stamp = now
    .toLocaleString('en-US', {
      year: '2-digit',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    })
    .replace(',', '');

  ctx.save();
  ctx.font = `${Math.max(13, Math.floor(width * 0.013))}px "Courier New", monospace`;
  ctx.fillStyle = 'rgba(236, 255, 252, 0.86)';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.72)';
  ctx.shadowBlur = 8;
  ctx.fillText(`REC CAM_04 ${stamp}`, Math.max(18, width * 0.025), height - Math.max(24, height * 0.045));
  ctx.restore();
}
