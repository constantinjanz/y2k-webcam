export type FilterMode = 'thermal-vision' | 'ai-tracker' | 'rave-tricolor' | 'dead-channel' | 'hypercolor-cctv';
export type PresetId = FilterMode;
export type EffectMode = 'random' | PresetId;

export type VisualPreset = {
  id: PresetId;
  label: string;
  filterMode: FilterMode;
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
    id: 'thermal-vision',
    label: 'Thermal Vision',
    filterMode: 'thermal-vision',
    backgroundTint: 'rgba(6, 4, 18, 0.2)',
    accent: '#6cecff',
    secondary: '#ff4a16',
    pixelScale: 1,
    rgbShift: 3,
    trailAlpha: 0.03,
    noise: 0.18,
    contrast: 1.24,
    scanlines: 0.16,
  },
  {
    id: 'ai-tracker',
    label: 'AI Tracker',
    filterMode: 'ai-tracker',
    backgroundTint: 'rgba(0, 14, 16, 0.2)',
    accent: '#29ffe6',
    secondary: '#8cff55',
    pixelScale: 1,
    rgbShift: 2,
    trailAlpha: 0.02,
    noise: 0.16,
    contrast: 1.32,
    scanlines: 0.28,
  },
  {
    id: 'rave-tricolor',
    label: 'Rave Tricolor',
    filterMode: 'rave-tricolor',
    backgroundTint: 'rgba(18, 0, 34, 0.24)',
    accent: '#ff1bd6',
    secondary: '#175cff',
    pixelScale: 0.2,
    rgbShift: 6,
    trailAlpha: 0.06,
    noise: 0.24,
    contrast: 1.5,
    scanlines: 0.22,
  },
  {
    id: 'dead-channel',
    label: 'Dead Channel',
    filterMode: 'dead-channel',
    backgroundTint: 'rgba(4, 4, 4, 0.3)',
    accent: '#f4f4f4',
    secondary: '#ff2a2a',
    pixelScale: 0.07,
    rgbShift: 10,
    trailAlpha: 0.04,
    noise: 0.78,
    contrast: 1.72,
    scanlines: 0.86,
  },
  {
    id: 'hypercolor-cctv',
    label: 'Hypercolor CCTV',
    filterMode: 'hypercolor-cctv',
    backgroundTint: 'rgba(0, 8, 10, 0.22)',
    accent: '#00f6ff',
    secondary: '#ffea00',
    pixelScale: 0.92,
    rgbShift: 9,
    trailAlpha: 0.06,
    noise: 0.24,
    contrast: 1.42,
    scanlines: 0.34,
  },
];

export function getPreset(id: PresetId) {
  return PRESETS.find((preset) => preset.id === id) ?? PRESETS[0];
}
