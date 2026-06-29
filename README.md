# y2k-webcam

A browser-based creative camera app for real-time Y2K glitch, rave, webcam-art, and prism hand-tracking effects.

## Concept

Open the app, grant camera access, and use your hands to control live visual effects. The main effect is a two-hand prism portal: a warped live-video surface stretched between the hands.

This should feel like a gesture-controlled visual instrument, not a normal beauty filter.

## Vercel setup

Import this GitHub repository into Vercel.

Recommended settings:

- Framework preset: Vite
- Build command: `npm run build`
- Output directory: `dist`
- Install command: `npm install`

The project includes `vercel.json` with these build settings.

## Privacy direction

The app should stay client-side. Camera frames should remain local in the browser. No uploads, no backend processing, and no analytics by default.

## Codex

Use `CODEX_PLAN_PROMPT.md` as the master prompt for Codex Plan Mode.
