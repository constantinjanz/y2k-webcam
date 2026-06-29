export type FilterMode = 'thermal' | 'night' | 'xerox' | 'compressed' | 'surveillance';
export type PresetId = 'thermal-rave' | 'night-vision' | 'xerox-flyer' | 'webcam-2001' | 'surveillance-heat';

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
  {
    id: 'xerox-flyer',
    label: 'Xerox Flyer',
    filterMode: 'xerox',
    palette: ['#050505', '#2b2b2b', '#e8e2d0', '#ffffff', '#ff2626'],
    backgroundTint: 'rgba(12, 10, 8, 0.3)',
    accent: '#f4ead4',
    secondary: '#ff2626',
    pixelScale: 0.12,
    rgbShift: 5,
    trailAlpha: 0.05,
    noise: 0.7,
    contrast: 1.58,
    scanlines: 0.46,
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
    id: 'surveillance-heat',
    label: 'Surveillance Heat',
    filterMode: 'surveillance',
    palette: ['#000306', '#003953', '#00a6a6', '#c5ff00', '#ff3d00', '#ffffff'],
    backgroundTint: 'rgba(0, 9, 12, 0.28)',
    accent: '#8bbcff',
    secondary: '#c5ff00',
    pixelScale: 0.14,
    rgbShift: 9,
    trailAlpha: 0.08,
    noise: 0.56,
    contrast: 1.4,
    scanlines: 0.68,
  },
];

export function getPreset(id: PresetId) {
  return PRESETS.find((preset) => preset.id === id) ?? PRESETS[0];
}
