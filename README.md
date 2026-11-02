# Kinesis

Real-time hand and arm tracking in the browser. Point your iPad (or any device) camera at your hands and Kinesis draws a live skeleton, a 3D hand model and a wide set of HUD effects over them.

Live: https://ardy03851-bit.github.io/kinesis/

## Features
- MediaPipe Hand Landmarker / Gesture Recognizer (21 landmarks per hand, up to 4 hands), optional Pose Landmarker for full arms, with GPU and CPU fallback
- One Euro smoothing with motion prediction, stable hand IDs, pinch detection in millimetres, gesture recognition
- 2D skeleton styles: solid, neon, dashed, double, tapered, pulse; joint shapes, colour modes (accent, rainbow, depth, velocity, per-finger)
- Effects: tracers (ribbon, comet, dots), tip crosshairs, bounding frames, palm HUD, velocity vectors, lightning arcs, two-hand string web, particles, ripples, convex hull, air painting
- 3D hand rig (three.js) in 10 materials: mannequin, hologram, robot, x-ray, glass, wireframe, neon, ghost, chrome, gold, with optional 3D forearm
- Tactical layer: boresight reticle, bearing tape, rangefinder, target designator with lock-on and AZ/EL readout, contact radar
- Scene: video filters (thermal, noir, invert, cyan, mono), dim, grid, scanlines, vignette, frame HUD
- 9 presets (including Recon), searchable settings panel, export / import / share-link of settings
- Photo capture and video recording, fullscreen, wake lock, offline cache, installable PWA

## Using on iPad
Open the site in Safari, tap Start and allow camera access. Use Share > Add to Home Screen for a full-screen app.

Keyboard: S settings, H hide UI, P pause, R record, C capture, F fullscreen, M mirror, 3 toggle 3D, Esc close.

## Development
Static site, no build step: `python3 -m http.server` in this folder.

Credits: Google MediaPipe Tasks Vision, three.js, Lucide icons, Geist font.
