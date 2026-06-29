export type PresetId = 'xerox-rave' | 'club-flyer' | 'webcam-2001' | 'dirty-scanner' | 'acid-broadcast';

export type VisualPreset = {
  id: PresetId;
  label: string;
  backgroundTint: string;
  accent: string;
  secondary: string;
  pixelScale: number;
  rgbShift: number;
  trailAlpha: number;
  noise: number;
  paper: string;
  ink: string;
  halftone: string;
  xerox: string;
  acid: string;
  grain: number;
  scanlines: number;
  rgbTear: number;
  panelContrast: number;
  timestamp?: boolean;
};

export const PRESETS: VisualPreset[] = [
  {
    id: 'xerox-rave',
    label: 'Xerox Rave',
    backgroundTint: 'rgba(6, 8, 7, 0.24)',
    accent: '#00e7ff',
    secondary: '#ff2a2a',
    pixelScale: 0.16,
    rgbShift: 9,
    trailAlpha: 0.1,
    noise: 0.5,
    paper: '#f3efd8',
    ink: '#050505',
    halftone: '#e11522',
    xerox: '#0f67ff',
    acid: '#c9ff1a',
    grain: 0.8,
    scanlines: 0.6,
    rgbTear: 0.75,
    panelContrast: 1.4,
  },
  {
    id: 'club-flyer',
    label: 'Club Flyer',
    backgroundTint: 'rgba(14, 8, 4, 0.28)',
    accent: '#ffe600',
    secondary: '#f21616',
    pixelScale: 0.14,
    rgbShift: 7,
    trailAlpha: 0.08,
    noise: 0.62,
    paper: '#fff2c6',
    ink: '#050403',
    halftone: '#ef1717',
    xerox: '#1636f5',
    acid: '#ffe600',
    grain: 0.9,
    scanlines: 0.48,
    rgbTear: 0.55,
    panelContrast: 1.55,
  },
  {
    id: 'webcam-2001',
    label: 'Webcam 2001',
    backgroundTint: 'rgba(0, 12, 10, 0.28)',
    accent: '#69ffd4',
    secondary: '#d8fff5',
    pixelScale: 0.11,
    rgbShift: 5,
    trailAlpha: 0.06,
    noise: 0.72,
    paper: '#dff8ef',
    ink: '#071614',
    halftone: '#ff4040',
    xerox: '#00a7d8',
    acid: '#99ff55',
    grain: 0.72,
    scanlines: 0.85,
    rgbTear: 0.42,
    panelContrast: 1.25,
    timestamp: true,
  },
  {
    id: 'dirty-scanner',
    label: 'Dirty Scanner',
    backgroundTint: 'rgba(12, 10, 8, 0.32)',
    accent: '#f4ead4',
    secondary: '#c91818',
    pixelScale: 0.13,
    rgbShift: 4,
    trailAlpha: 0.04,
    noise: 0.82,
    paper: '#ede1c6',
    ink: '#060504',
    halftone: '#b71313',
    xerox: '#4a5f7f',
    acid: '#d6d6c8',
    grain: 1,
    scanlines: 0.7,
    rgbTear: 0.28,
    panelContrast: 1.65,
  },
  {
    id: 'acid-broadcast',
    label: 'Acid Broadcast',
    backgroundTint: 'rgba(0, 12, 4, 0.24)',
    accent: '#d7ff00',
    secondary: '#008cff',
    pixelScale: 0.15,
    rgbShift: 11,
    trailAlpha: 0.11,
    noise: 0.58,
    paper: '#efffd8',
    ink: '#071107',
    halftone: '#ff2626',
    xerox: '#008cff',
    acid: '#b6ff00',
    grain: 0.76,
    scanlines: 0.9,
    rgbTear: 0.85,
    panelContrast: 1.48,
  },
];

export function getPreset(id: PresetId) {
  return PRESETS.find((preset) => preset.id === id) ?? PRESETS[0];
}
