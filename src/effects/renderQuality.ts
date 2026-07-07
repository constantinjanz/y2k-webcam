export type RenderQualityLevel = 'full' | 'boost';

export type RenderQuality = {
  level: RenderQualityLevel;
  pixelScaleMultiplier: number;
  mappedMaxWidthMultiplier: number;
  mappedRefreshMs: number;
  scanlineAmountMultiplier: number;
  scanlineStepMultiplier: number;
  ghostAlphaMultiplier: number;
  ghostPasses: number;
  effectDetailMultiplier: number;
  maxFoldLines: number;
  maxAnchorMarkers: number;
  simplifyDebug: boolean;
  glitchNoiseMultiplier: number;
  feedbackCaptureEvery: number;
};

export const FULL_RENDER_QUALITY: RenderQuality = {
  level: 'full',
  pixelScaleMultiplier: 1,
  mappedMaxWidthMultiplier: 1,
  mappedRefreshMs: 34,
  scanlineAmountMultiplier: 1,
  scanlineStepMultiplier: 1,
  ghostAlphaMultiplier: 1,
  ghostPasses: 2,
  effectDetailMultiplier: 1,
  maxFoldLines: 9,
  maxAnchorMarkers: 10,
  simplifyDebug: false,
  glitchNoiseMultiplier: 1,
  feedbackCaptureEvery: 4,
};

export const BOOST_RENDER_QUALITY: RenderQuality = {
  level: 'boost',
  pixelScaleMultiplier: 0.68,
  mappedMaxWidthMultiplier: 0.68,
  mappedRefreshMs: 96,
  scanlineAmountMultiplier: 0.68,
  scanlineStepMultiplier: 1.7,
  ghostAlphaMultiplier: 0.58,
  ghostPasses: 1,
  effectDetailMultiplier: 0.55,
  maxFoldLines: 5,
  maxAnchorMarkers: 6,
  simplifyDebug: true,
  glitchNoiseMultiplier: 0.45,
  feedbackCaptureEvery: 8,
};
