export type FilterMode = 'berlin' | 'surveillance' | 'compressed' | 'xerox' | 'virus' | 'thermal' | 'night';
export type PresetId =
  | 'berlin-rave'
  | 'hacker-surveillance'
  | 'webcam-2001'
  | 'dirty-photocopy'
  | 'old-virus'
  | 'thermal-rave'
  | 'night-vision';

export type VisualPreset = {
  id: PresetId;
  label: string;
  filterMode: FilterMode;
  palette: string[];
  backgroundTint: string;
  accent: string;
  secondary: string;
  pixelScale: number;
  rgbShift: number;
  trailAlpha: number;
  noise: number;
  contrast: number;
  scanlines: number;
  timestamp?: boolean;
};

export const PRESETS: VisualPreset[] = [
  {
    id: 'berlin-rave',
    label: 'Berlin Rave',
    filterMode: 'berlin',
    palette: ['#02020a', '#10107a', '#004cff', '#00f0ff', '#f0ff00', '#ff3d00', '#ffffff'],
    backgroundTint: 'rgba(4, 4, 14, 0.24)',
    accent: '#00f0ff',
    secondary: '#ffea00',
    pixelScale: 0.13,
    rgbShift: 11,
    trailAlpha: 0.1,
    noise: 0.44,
    contrast: 1.34,
    scanlines: 0.48,
  },
  {
    id: 'hacker-surveillance',
    label: 'Hacker Surveillance',
    filterMode: 'surveillance',
    palette: ['#000300', '#00280f', '#006b2a', '#19ff6a', '#d9ff4a'],
    backgroundTint: 'rgba(0, 14, 5, 0.3)',
    accent: '#38ff9c',
    secondary: '#d9ff4a',
    pixelScale: 0.12,
    rgbShift: 4,
    trailAlpha: 0.05,
    noise: 0.46,
    contrast: 1.32,
    scanlines: 0.86,
  },
  {
    id: 'webcam-2001',
    label: 'Webcam 2001',
    filterMode: 'compressed',
    palette: ['#050816', '#20415f', '#4fa7d8', '#d7fff1', '#ff4a3d'],
    backgroundTint: 'rgba(0, 12, 18, 0.26)',
    accent: '#6fd8ff',
    secondary: '#ff4a3d',
    pixelScale: 0.09,
    rgbShift: 6,
    trailAlpha: 0.05,
    noise: 0.5,
    contrast: 1.18,
    scanlines: 0.4,
    timestamp: true,
  },
  {
    id: 'dirty-photocopy',
    label: 'Dirty Photocopy',
    filterMode: 'xerox',
    palette: ['#050505', '#282828', '#9a968b', '#f2ead6', '#ffffff', '#1f6dff'],
    backgroundTint: 'rgba(12, 10, 8, 0.3)',
    accent: '#f4ead4',
    secondary: '#1f6dff',
    pixelScale: 0.11,
    rgbShift: 4,
    trailAlpha: 0.04,
    noise: 0.62,
    contrast: 1.58,
    scanlines: 0.48,
  },
  {
    id: 'old-virus',
    label: 'Old Virus',
    filterMode: 'virus',
    palette: ['#000000', '#0012a8', '#ff1010', '#ffdf00', '#ffffff'],
    backgroundTint: 'rgba(18, 0, 0, 0.28)',
    accent: '#ff2a1f',
    secondary: '#ffdf00',
    pixelScale: 0.1,
    rgbShift: 12,
    trailAlpha: 0.08,
    noise: 0.56,
    contrast: 1.5,
    scanlines: 0.64,
  },
  {
    id: 'thermal-rave',
    label: 'Thermal Rave',
    filterMode: 'thermal',
    palette: ['#020214', '#15147a', '#6f18bd', '#e21d26', '#ff7a00', '#ffe600', '#ffffff'],
    backgroundTint: 'rgba(8, 4, 16, 0.24)',
    accent: '#00e7ff',
    secondary: '#ff3d00',
    pixelScale: 0.15,
    rgbShift: 12,
    trailAlpha: 0.1,
    noise: 0.48,
    contrast: 1.32,
    scanlines: 0.52,
  },
  {
    id: 'night-vision',
    label: 'Night Vision',
    filterMode: 'night',
    palette: ['#000700', '#003414', '#008c32', '#6fff3e', '#e5ff8e'],
    backgroundTint: 'rgba(0, 16, 5, 0.28)',
    accent: '#38ff9c',
    secondary: '#d9ff5e',
    pixelScale: 0.13,
    rgbShift: 4,
    trailAlpha: 0.06,
    noise: 0.54,
    contrast: 1.26,
    scanlines: 0.9,
  },
];

export function getPreset(id: PresetId) {
  return PRESETS.find((preset) => preset.id === id) ?? PRESETS[0];
}
