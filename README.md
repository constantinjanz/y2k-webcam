# tracer_2k

A browser-based creative camera app styled like dark Windows 98 webcam tracer software.

Open the app, grant camera access, and extend fingers to pin a live video sheet to your hands. The core interaction is one focused instrument: extended fingertips become anchor points for a dynamic glitch prism.

## Features

- Live mirrored webcam canvas.
- MediaPipe Tasks Vision hand tracking with up to two hands.
- Extended-finger anchor detection for thumb, index, middle, ring, and pinky.
- One prism sheet generated from active fingertip anchors.
- Triangle, quadrilateral, and multi-point polygon sheet rendering.
- Crossing/twist distortion when anchor lines fold through each other.
- Five sheet style families: Xerox Rave, Club Flyer, Webcam 2001, Dirty Scanner, and Acid Broadcast.
- Technical tracking stream with real hand, finger, anchor, sheet, FPS, and crossing state.
- Optional debug hand landmarks and fingertip labels.
- Canvas recording/export through `canvas.captureStream()` and `MediaRecorder`.

## Privacy

This app is client-only. Camera frames stay in the browser.

There is no backend, no uploads, no analytics, and no server-side processing. MediaPipe model/WASM assets may load from public CDN/model URLs, but the webcam frames are processed locally in the browser.

## Local Development

```bash
npm install
npm run dev
```

On this Windows setup, PowerShell may block `npm.ps1`; use this equivalent command if needed:

```bash
npm.cmd run dev
```

Camera access requires a secure context, which includes `localhost` and `127.0.0.1`.

Useful checks:

```bash
npm.cmd run typecheck
npm.cmd run build
```

## Interaction Rules

- Fist: no prism sheet.
- One hand with one extended finger: no effect.
- One hand with at least two extended fingers: small prism sheet.
- Two hands with one finger each: no effect.
- Two fingers on one hand plus one finger on the other hand: triangle prism.
- Thumb and index on both hands: classic finger-frame quad.
- More extended fingers: larger, more complex polygon sheet.
- Twisted or crossing anchors: stronger crossing/fold distortion.

There is no pinch mode and no swipe mode. Thumb-index distance is never used as an effect trigger.

## Vercel Deployment

Import this GitHub repository into Vercel.

Recommended settings:

- Framework preset: Vite
- Build command: `npm run build`
- Output directory: `dist`
- Install command: `npm install`

The project includes `vercel.json` with these build settings. No environment variables are required.

## Browser Notes

The live camera experience needs `getUserMedia`. Recording needs `MediaRecorder` plus canvas capture stream support. Recent Chromium browsers are the safest target for recording; unsupported browsers show a recording warning while the live effects can still run.
