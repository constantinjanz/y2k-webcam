export type PresetId = 'prism-rave' | 'webcam-2004' | 'rgb-ghost' | 'dot-matrix' | 'acid-mirror';

export type VisualPreset = {
  id: PresetId;
  label: string;
  backgroundTint: string;
  accent: string;
  secondary: string;
  pixelScale: number;
  rgbShift: number;
  posterize: number;
  trailAlpha: number;
  noise: number;
  prismGlow: number;
  dotMatrix?: boolean;
  mirrorShards?: boolean;
  timestamp?: boolean;
};

export const PRESETS: VisualPreset[] = [
  {
    id: 'prism-rave',
    label: 'Prism Rave',
    backgroundTint: 'rgba(0, 18, 24, 0.24)',
    accent: '#36f5c7',
    secondary: '#ffe84a',
    pixelScale: 0.19,
    rgbShift: 14,
    posterize: 0.78,
    trailAlpha: 0.12,
    noise: 0.68,
    prismGlow: 1,
  },
  {
    id: 'webcam-2004',
    label: 'Webcam 2004',
    backgroundTint: 'rgba(10, 10, 10, 0.42)',
    accent: '#f5f5f5',
    secondary: '#72d7ff',
    pixelScale: 0.11,
    rgbShift: 5,
    posterize: 0.44,
    trailAlpha: 0.05,
    noise: 0.92,
    prismGlow: 0.4,
    timestamp: true,
  },
  {
    id: 'rgb-ghost',
    label: 'RGB Ghost',
    backgroundTint: 'rgba(0, 0, 12, 0.18)',
    accent: '#ff2a6d',
    secondary: '#05d9e8',
    pixelScale: 0.23,
    rgbShift: 24,
    posterize: 0.56,
    trailAlpha: 0.24,
    noise: 0.54,
    prismGlow: 0.8,
  },
  {
    id: 'dot-matrix',
    label: 'Dot Matrix',
    backgroundTint: 'rgba(4, 8, 4, 0.32)',
    accent: '#d5ff3f',
    secondary: '#ff4fd8',
    pixelScale: 0.17,
    rgbShift: 9,
    posterize: 0.86,
    trailAlpha: 0.08,
    noise: 0.42,
    prismGlow: 0.65,
    dotMatrix: true,
  },
  {
    id: 'acid-mirror',
    label: 'Acid Mirror',
    backgroundTint: 'rgba(18, 0, 20, 0.25)',
    accent: '#fffb00',
    secondary: '#00ff85',
    pixelScale: 0.21,
    rgbShift: 17,
    posterize: 0.74,
    trailAlpha: 0.16,
    noise: 0.63,
    prismGlow: 1.1,
    mirrorShards: true,
  },
];

export function getPreset(id: PresetId) {
  return PRESETS.find((preset) => preset.id === id) ?? PRESETS[0];
}
