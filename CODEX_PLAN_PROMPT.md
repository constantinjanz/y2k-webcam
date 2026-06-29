# Codex Plan Mode Prompt

Build this repository into a browser-based creative camera app called `y2k-webcam`.

## Core idea

Create a live webcam app where the user's hands control real-time Y2K glitch, rave, webcam-art, and prism visual effects. The app should feel like a gesture-controlled visual instrument, not a normal beauty filter.

The main wow moment is: my hands control magic visuals.

## Target stack

Use React, TypeScript, Vite, browser camera APIs, canvas rendering, and MediaPipe hand tracking.

Add `@mediapipe/tasks-vision` when implementing hand tracking.

The app should be deployable on Vercel as a client-only app. No backend is needed.

## Main MVP

1. Open webcam after user permission.
2. Render mirrored live webcam feed to a full-screen canvas.
3. Track up to two hands in real time.
4. Add debug hand landmarks toggle.
5. Build the hero effect: a two-hand prism portal stretched between the user's hands.
6. Add one-hand pinch lens effect.
7. Add swipe-triggered RGB smear / glitch burst.
8. Add preset selector.
9. Add recording of the rendered canvas via `canvas.captureStream()` and `MediaRecorder`.
10. Keep everything local in the browser.

## Aesthetic

Y2K glitch webcam art, rave visuals, pixelated roughness, RGB split, halftone, posterized color, crunchy low-res webcam texture, experimental net-art.

Avoid clean corporate AR or beauty-filter aesthetics.

## Gesture behavior

### Two-hand prism portal

When two hands are visible, create a warped video surface between the hands. Use fingertips and thumbs as anchor points. The surface should copy the live webcam feed, distort it, recolor it, pixelate it, and make it feel like a digital prism sheet held between the hands.

The effect should react to:

- hand distance = size/stretch
- hand angle = rotation
- hand tilt/depth = prism variation/intensity
- hand speed = glitch/trail intensity

### Pinch lens

When thumb tip and index fingertip are close, show a circular or oval glitch lens around the pinch point. The lens should magnify, pixelate, and color-shift the camera feed.

### Swipe

When a hand moves fast, trigger a short RGB smear or ghost trail. Optionally use swipe to cycle presets, but avoid accidental switching.

## Presets

Implement at least five presets:

1. Prism Rave: default blue/green/yellow/red posterized prism.
2. Webcam 2004: low-res pixel blocks, crunched contrast, fake compression.
3. RGB Ghost: strong color channel split and motion trails.
4. Dot Matrix: halftone/dotted graphic poster look.
5. Acid Mirror: mirrored fragments, liquid distortion, saturated rave colors.

## Performance rules

Do not store per-frame tracking data in React state. Use refs and `requestAnimationFrame`.

React state is only for UI settings like selected preset, debug mode, camera status, recording status, and sliders.

Keep camera resolution reasonable, for example 640x480 or 960x540.

Use smoothing/lerp for landmarks, but keep latency low.

Prioritize instant interaction over perfect visual math.

## Suggested file structure

- `src/App.tsx`
- `src/main.tsx`
- `src/styles.css`
- `src/components/CameraStage.tsx`
- `src/vision/handTracker.ts`
- `src/vision/gestureDetection.ts`
- `src/effects/prismSheet.ts`
- `src/effects/pinchLens.ts`
- `src/effects/trails.ts`
- `src/effects/presets.ts`
- `src/recording/useCanvasRecorder.ts`
- `src/utils/math.ts`
- `src/utils/canvas.ts`

## Current repo state

The repo currently contains a small Vite/Vercel placeholder. Replace the placeholder with the real app.

Before coding, inspect the repository and produce a plan. Then implement in small steps.

## Acceptance criteria

- `npm install` works.
- `npm run dev` works.
- `npm run build` works.
- Camera opens after permission.
- Mirrored webcam feed appears.
- Two hands create the prism portal.
- Pinch creates a one-hand lens.
- Swipe creates a visible glitch/trail burst.
- Presets visibly change the effect.
- Debug landmarks can be toggled.
- Recording downloads a video of the rendered canvas.
- No backend required.
- Deploys cleanly on Vercel.
