# Kinesis

A real-time optical tracking instrument that runs entirely in the browser. Point a camera at the scene and Kinesis tracks hands, full bodies, faces and objects — drawing live skeletons, 3D rigs and a tactical instrumentation layer over the feed. Nothing ever leaves the device.

Live: https://ardy03851-bit.github.io/kinesis/

## Tracking modes

What Kinesis tracks is switchable at any time (Tracking › What to track, or keys 1/2/9/4). Switching the target reloads the neural pipeline and presents a dedicated settings surface for that mode.

- **Hands** — 21-landmark hand mesh, up to 4 hands, gestures, pinch in millimetres, optional pose-model arms
- **Body** — 33-point full-body skeleton with posture analysis: torso lean, shoulder tilt, elbow/knee flexion, velocity vectors, wrist tracers
- **Objects** — COCO-80 object detection (EfficientDet-Lite0) with track IDs, confidence gauges, motion trails, velocity vectors, rangefinder, contact radar, class census and lock-on designators
- **Face** — 478-point face mesh, iris tracking, 52 blendshape coefficients with live telemetry bars, head attitude (yaw/pitch/roll) with artificial-horizon gauge

## Features
- Models: MediaPipe Hand Landmarker / Gesture Recognizer, Pose Landmarker (lite/full/heavy), Object Detector, Face Landmarker — with GPU/CPU fallback
- One Euro smoothing with motion prediction, stable track IDs, dropout hold
- 2D skeleton styles: solid, neon, dashed, double, tapered, pulse; joint shapes; colour modes (accent, per-finger, depth, spectrum, per-hand, left/right)
- Hand effects: tracers, tip crosshairs, bounding frames, palm HUD, velocity vectors, arcs, string web, particles, air painting
- 3D hand rig (three.js) in 18 materials: mannequin, hologram, robot, x-ray, glass, wireframe, neon, ghost, chrome, gold, carbon fibre, obsidian, titanium, graphite, aerogel, jade, plasma, void — with optional 3D forearm
- Twin fan mesh: two counter-rotating turbine meshes per palm (twin / vortex / pulse styles, motion-synced speed, mesh rings)
- Face: expression-driven aura halo; objects: dashed trajectory prediction with lead ghost box
- Tactical layer: boresight reticle, bearing tape, rangefinder, target designator with lock-on and AZ/EL readout, contact radar
- Scene: video filters (thermal, noir, invert, cyan, mono, night), dim, grid, scanlines, vignette, frame HUD
- 10 presets, searchable settings panel, export / import / share-link of settings
- Soft-machine UI: capsule controls, rounded glass panels and rounded on-canvas HUD chips and panels — no hard squares
- Installable PWA with a proper home-screen icon set (SVG + 192/512 PNG + maskable, full-bleed apple-touch-icon)
- Photo capture and video recording, fullscreen, wake lock, offline cache, installable PWA

## Using on iPad
Open the site in Safari, tap Initialise and allow camera access. Use Share > Add to Home Screen for a full-screen app.

Keyboard: S settings, H hide UI, P pause, R record, C capture, F fullscreen, M mirror, 3 toggle 3D, 1 hands, 2 body, 9 objects, 4 face, Esc close.

## Development
Static site, no build step: `python3 -m http.server` in this folder.

Credits: Google MediaPipe Tasks Vision, three.js, Lucide icons, Geist font.
