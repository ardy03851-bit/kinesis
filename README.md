# Kinesis

A real-time optical tracking instrument that runs entirely in the browser. Point a camera at the scene and Kinesis tracks hands, full bodies, faces and objects — drawing live skeletons, 3D rigs and a tactical instrumentation layer over the feed. Nothing ever leaves the device.

Live: https://ardy03851-bit.github.io/kinesis/

## Tracking modes

What Kinesis tracks is switchable at any time (Tracking › What to track, or keys 1/2/9/4). Switching the target reloads the neural pipeline and presents a dedicated settings surface for that mode.

- **Hands** — 21-landmark hand mesh, up to 6 hands, gestures, pinch in millimetres, optional pose-model arms
- **Body** — 33-point full-body skeleton with posture analysis: torso lean (with configurable warning threshold), shoulder tilt, elbow/knee flexion, velocity vectors, wrist tracers
- **Objects** — COCO-80 object detection (EfficientDet-Lite0) with track IDs, confidence gauges, motion trails, velocity vectors, rangefinder, contact radar, class census, lock-on designators and a comma-separated class whitelist filter
- **Face** — 478-point face mesh, iris tracking with gaze vector readout (bearing/elevation in degrees), 52 blendshape coefficients with live telemetry bars, head attitude (yaw/pitch/roll) with artificial-horizon gauge, blink counter with hysteresis

## Features

### Tracking and analysis
- Models: MediaPipe Hand Landmarker / Gesture Recognizer, Pose Landmarker (lite/full/heavy), Object Detector, Face Landmarker — with GPU/CPU fallback
- One Euro smoothing with motion prediction, stable track IDs, configurable dropout hold (up to 30 frames)
- Frame rate targeting (10 / 24 / 30 / 60+ Hz), resolutions up to 2560×1440, adaptive quality that scales render resolution to hold frame rate
- 2D skeleton styles: solid, neon, dashed, double, tapered, pulse; joint shapes; colour modes (accent, per-finger, depth, per-hand, left/right, velocity, confidence)
- Tracers (line / comet / dots), tip crosshairs, bounding frames, palm HUD, velocity vectors

### Tactical layer
- Boresight reticle in three styles (mil-dot, cross, ring) with adjustable size
- Bearing tape, rangefinder, target designator with lock-on and AZ/EL readout
- Contact radar with configurable size, range rings and sweep; rule-of-thirds and centre-cross grid styles; scanlines, vignette, dim, frame HUD

### Data
- CSV telemetry stream at configurable sample rate (per mode: hands / body / objects / face), toggled with the L key
- One-click export of the current frame as structured JSON
- Photo capture with optional timestamp watermark, video recording with adjustable bitrate

### Gesture commands
- Pinch-and-hold (1 s) captures a still
- Thumbs-up-and-hold (1 s) toggles recording

### 3D and face
- 3D hand rig (three.js) in 19 materials: mannequin, hologram, robot, x-ray, glass, wireframe, neon, ghost, chrome, gold, carbon fibre, obsidian, titanium, graphite, aerogel, jade, plasma, void, wood — with optional 3D forearm
- Face: gaze readout, blink tally, expression telemetry; objects: dashed trajectory prediction with lead ghost box

### Interface
- Searchable settings panel with export / import / share-link of settings
- Soft-machine UI: capsule controls, rounded glass panels and rounded on-canvas HUD chips and panels — no hard squares
- Installable PWA with a proper home-screen icon set (SVG + 192/512 PNG + maskable, full-bleed apple-touch-icon)
- Fullscreen, wake lock, offline cache

## Using on iPad
Open the site in Safari, tap Initialise and allow camera access. Use Share > Add to Home Screen for a full-screen app.

Keyboard: S settings, H hide UI, P capture, R record, L data log, F fullscreen, M mirror, Space pause, 3 toggle 3D, 1 hands, 2 body, 9 objects, 4 face, Esc close.

## Development
Static site, no build step: `python3 -m http.server` in this folder.

Credits: Google MediaPipe Tasks Vision, three.js, Lucide icons, Geist font.
