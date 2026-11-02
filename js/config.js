// Settings schema, defaults and presets.
// Every control in the settings panel is generated from SCHEMA.

export const VERSION = '1.0.0';
export const STORAGE_KEY = 'kinesis.settings.v2';

const palette = [
  { value: '#9fc9a6', label: 'Signal' },
  { value: '#f5b84b', label: 'Amber' },
  { value: '#ff5d73', label: 'Alert' },
  { value: '#8fb3ff', label: 'Ice' },
  { value: '#c6f36b', label: 'Lime' },
  { value: '#f0f0f0', label: 'White' },
];

export const SCHEMA = [
  {
    id: 'presets', label: 'Presets', icon: 'wand-sparkles',
    sections: [
      { id: 'preset-grid', label: 'Visual profiles', type: 'presets' },
    ],
  },
  {
    id: 'tracking', label: 'Tracking', icon: 'cpu',
    sections: [
      {
        id: 'model', label: 'Neural models',
        controls: [
          { key: 'handModel', type: 'segment', label: 'Hand model', reinit: true,
            options: [ { value: 'landmarker', label: 'Landmarker' }, { value: 'gesture', label: 'Gesture ML' } ],
            desc: 'Gesture ML adds a classifier head (slightly slower).' },
          { key: 'delegate', type: 'segment', label: 'Compute', reinit: true,
            options: [ { value: 'GPU', label: 'GPU' }, { value: 'CPU', label: 'CPU' } ] },
          { key: 'numHands', type: 'range', label: 'Max hands', min: 1, max: 4, step: 1, reinit: true },
          { key: 'detectConf', type: 'range', label: 'Detection confidence', min: 0.1, max: 0.95, step: 0.05, reinit: true, fmt: 'pct' },
          { key: 'presenceConf', type: 'range', label: 'Presence confidence', min: 0.1, max: 0.95, step: 0.05, reinit: true, fmt: 'pct' },
          { key: 'trackConf', type: 'range', label: 'Tracking confidence', min: 0.1, max: 0.95, step: 0.05, reinit: true, fmt: 'pct' },
        ],
      },
      {
        id: 'filtering', label: 'Signal filtering',
        controls: [
          { key: 'smoothing', type: 'toggle', label: 'One-Euro smoothing', desc: 'Adaptive low-pass filter: steady when still, responsive when moving.' },
          { key: 'smoothMinCutoff', type: 'range', label: 'Stability', min: 0.1, max: 5, step: 0.1, showIf: 'smoothing', desc: 'Lower = steadier, more lag.' },
          { key: 'smoothBeta', type: 'range', label: 'Responsiveness', min: 0, max: 0.2, step: 0.005, showIf: 'smoothing' },
          { key: 'prediction', type: 'range', label: 'Latency prediction', min: 0, max: 60, step: 5, fmt: 'ms', desc: 'Extrapolates motion forward to hide inference latency.' },
          { key: 'holdFrames', type: 'range', label: 'Dropout hold', min: 0, max: 15, step: 1, fmt: 'fr', desc: 'Keeps a hand alive briefly when tracking blinks.' },
        ],
      },
      {
        id: 'performance', label: 'Performance',
        controls: [
          { key: 'renderScale', type: 'range', label: 'Render resolution', min: 0.5, max: 2, step: 0.25, fmt: 'x' },
          { key: 'resolution', type: 'select', label: 'Camera resolution', reinitCamera: true,
            options: [ { value: '640', label: '640 × 480' }, { value: '1280', label: '1280 × 720' }, { value: '1920', label: '1920 × 1080' } ] },
          { key: 'targetFps', type: 'select', label: 'Inference rate',
            options: [ { value: '0', label: 'Every frame' }, { value: '30', label: '30 Hz' }, { value: '20', label: '20 Hz' }, { value: '15', label: '15 Hz' } ] },
        ],
      },
    ],
  },
  {
    id: 'skeleton', label: 'Skeleton', icon: 'git-branch',
    sections: [
      {
        id: 'bones', label: 'Bones',
        controls: [
          { key: 'showBones', type: 'toggle', label: 'Draw bones' },
          { key: 'boneStyle', type: 'select', label: 'Bone style', showIf: 'showBones',
            options: [ { value: 'solid', label: 'Solid' }, { value: 'neon', label: 'Glow' }, { value: 'dashed', label: 'Tactical dashed' }, { value: 'double', label: 'Twin rail' }, { value: 'tapered', label: 'Tapered' }, { value: 'pulse', label: 'Pulse' } ] },
          { key: 'boneWidth', type: 'range', label: 'Thickness', min: 0.5, max: 12, step: 0.5, fmt: 'px', showIf: 'showBones' },
          { key: 'depthWidth', type: 'toggle', label: 'Depth-scaled thickness', showIf: 'showBones', desc: 'Closer joints render thicker.' },
          { key: 'palmMesh', type: 'toggle', label: 'Palm lattice' },
        ],
      },
      {
        id: 'joints', label: 'Joints',
        controls: [
          { key: 'showJoints', type: 'toggle', label: 'Draw joints' },
          { key: 'jointShape', type: 'select', label: 'Shape', showIf: 'showJoints',
            options: [ { value: 'circle', label: 'Circle' }, { value: 'ring', label: 'Ring' }, { value: 'square', label: 'Square' }, { value: 'diamond', label: 'Diamond' }, { value: 'cross', label: 'Cross' } ] },
          { key: 'jointSize', type: 'range', label: 'Size', min: 1, max: 14, step: 0.5, fmt: 'px', showIf: 'showJoints' },
          { key: 'tipHighlight', type: 'toggle', label: 'Emphasise fingertips', showIf: 'showJoints' },
          { key: 'showIndices', type: 'toggle', label: 'Landmark indices' },
          { key: 'showAngles', type: 'toggle', label: 'Joint angle readouts' },
        ],
      },
      {
        id: 'color', label: 'Colour',
        controls: [
          { key: 'colorMode', type: 'select', label: 'Colour mode',
            options: [ { value: 'accent', label: 'Single accent' }, { value: 'finger', label: 'Per finger' }, { value: 'depth', label: 'Depth heatmap' }, { value: 'rainbow', label: 'Spectrum cycle' }, { value: 'hand', label: 'Per hand' } ] },
          { key: 'accent', type: 'color', label: 'Accent', swatches: palette },
          { key: 'secondary', type: 'color', label: 'Secondary', swatches: palette },
          { key: 'opacity', type: 'range', label: 'Overlay opacity', min: 0.1, max: 1, step: 0.05, fmt: 'pct' },
        ],
      },
    ],
  },
  {
    id: 'effects', label: 'Effects', icon: 'sparkles',
    sections: [
      {
        id: 'tracers', label: 'Tracers',
        controls: [
          { key: 'tracers', type: 'toggle', label: 'Fingertip tracers' },
          { key: 'tracerStyle', type: 'select', label: 'Tracer style', showIf: 'tracers',
            options: [ { value: 'ribbon', label: 'Ribbon' }, { value: 'line', label: 'Hairline' }, { value: 'dots', label: 'Dotted' }, { value: 'comet', label: 'Comet' } ] },
          { key: 'tracerLength', type: 'range', label: 'Trail length', min: 4, max: 90, step: 1, fmt: 'fr', showIf: 'tracers' },
          { key: 'tracerWidth', type: 'range', label: 'Trail width', min: 1, max: 16, step: 0.5, fmt: 'px', showIf: 'tracers' },
          { key: 'tracerTips', type: 'segment', label: 'Tips', showIf: 'tracers',
            options: [ { value: 'index', label: 'Index' }, { value: 'thumbIndex', label: 'Thumb+Index' }, { value: 'all', label: 'All five' } ] },
        ],
      },
      {
        id: 'targeting', label: 'Targeting',
        controls: [
          { key: 'crosshairs', type: 'toggle', label: 'Tip crosshairs' },
          { key: 'crosshairStyle', type: 'select', label: 'Reticle', showIf: 'crosshairs',
            options: [ { value: 'tactical', label: 'Tactical' }, { value: 'lock', label: 'Target lock' }, { value: 'circle', label: 'Ring scope' }, { value: 'bracket', label: 'Brackets' } ] },
          { key: 'crosshairTips', type: 'segment', label: 'Tips', showIf: 'crosshairs',
            options: [ { value: 'index', label: 'Index' }, { value: 'thumbIndex', label: 'Thumb+Index' }, { value: 'all', label: 'All five' } ] },
          { key: 'crosshairSize', type: 'range', label: 'Reticle size', min: 10, max: 60, step: 1, fmt: 'px', showIf: 'crosshairs' },
          { key: 'coords', type: 'toggle', label: 'Coordinate readout', showIf: 'crosshairs' },
          { key: 'bbox', type: 'toggle', label: 'Bounding frame' },
          { key: 'palmHud', type: 'toggle', label: 'Palm orientation ring' },
          { key: 'velocity', type: 'toggle', label: 'Velocity vectors' },
        ],
      },
      {
        id: 'interaction', label: 'Interaction',
        controls: [
          { key: 'pinchLine', type: 'toggle', label: 'Pinch gauge', desc: 'Live thumb–index distance with pinch flash.' },
          { key: 'lightning', type: 'toggle', label: 'Electric arcs', desc: 'Arcs between fingertips while pinching, and between two hands.' },
          { key: 'stringWeb', type: 'toggle', label: 'Two-hand web', desc: 'Strings stretched between matching fingertips of two hands.' },
          { key: 'particles', type: 'toggle', label: 'Spark particles' },
          { key: 'particleRate', type: 'range', label: 'Emission', min: 1, max: 10, step: 1, showIf: 'particles' },
          { key: 'hull', type: 'toggle', label: 'Hand silhouette fill' },
          { key: 'airPaint', type: 'toggle', label: 'Air paint', desc: 'Pinch to draw in the air with your index finger.' },
          { key: 'paintFade', type: 'range', label: 'Ink lifetime', min: 0, max: 30, step: 1, fmt: 's0', showIf: 'airPaint', desc: '0 keeps strokes forever.' },
          { key: 'clearPaint', type: 'button', label: 'Clear canvas', icon: 'eraser', showIf: 'airPaint' },
        ],
      },
    ],
  },
  {
    id: 'model3d', label: '3D Hand', icon: 'box',
    sections: [
      {
        id: 'mesh', label: 'Volumetric hand',
        controls: [
          { key: 'hand3d', type: 'toggle', label: '3D hand overlay', desc: 'A real-time 3D hand rig driven by all 21 landmarks.' },
          { key: 'hand3dStyle', type: 'select', label: 'Model', showIf: 'hand3d',
            options: [
              { value: 'mannequin', label: 'Mannequin' },
              { value: 'chrome', label: 'Liquid chrome' },
              { value: 'hologram', label: 'Hologram' },
              { value: 'robot', label: 'Mech rig' },
              { value: 'xray', label: 'X-ray bones' },
              { value: 'glass', label: 'Frosted glass' },
              { value: 'gold', label: 'Gilded' },
              { value: 'wire', label: 'Wireframe' },
              { value: 'neon', label: 'Neon tube' },
              { value: 'ghost', label: 'Ghost' },
            ] },
          { key: 'hand3dOpacity', type: 'range', label: 'Opacity', min: 0.1, max: 1, step: 0.05, fmt: 'pct', showIf: 'hand3d' },
          { key: 'hand3dThickness', type: 'range', label: 'Finger girth', min: 0.5, max: 1.8, step: 0.05, fmt: 'x', showIf: 'hand3d' },
          { key: 'hand3dDepth', type: 'range', label: 'Depth exaggeration', min: 0, max: 3, step: 0.1, fmt: 'x', showIf: 'hand3d' },
          { key: 'hand3dGlow', type: 'toggle', label: 'Glow shell', showIf: 'hand3d' },
          { key: 'hand3dTint', type: 'color', label: 'Tint', swatches: palette, showIf: 'hand3d' },
        ],
      },
      {
        id: 'light', label: 'Lighting',
        controls: [
          { key: 'lightOrbit', type: 'toggle', label: 'Orbiting key light', showIf: 'hand3d' },
          { key: 'lightIntensity', type: 'range', label: 'Intensity', min: 0.2, max: 3, step: 0.1, fmt: 'x', showIf: 'hand3d' },
          { key: 'hand3dShadow', type: 'toggle', label: 'Drop shadow', showIf: 'hand3d' },
        ],
      },
    ],
  },
  {
    id: 'arm', label: 'Arm', icon: 'bone',
    sections: [
      {
        id: 'armtrack', label: 'Arm tracking',
        controls: [
          { key: 'armTracking', type: 'toggle', label: 'Track arms (pose model)', reinit: true, desc: 'Adds shoulder, elbow and forearm bones joined to the hand.' },
          { key: 'poseModel', type: 'segment', label: 'Pose model', reinit: true, showIf: 'armTracking',
            options: [ { value: 'lite', label: 'Lite' }, { value: 'full', label: 'Full' }, { value: 'heavy', label: 'Heavy' } ] },
          { key: 'poseEvery', type: 'range', label: 'Pose every N frames', min: 1, max: 4, step: 1, showIf: 'armTracking' },
          { key: 'forearmEstimate', type: 'toggle', label: 'Forearm estimation', desc: 'When the pose model cannot see your shoulder, the forearm is inferred from the hand.' },
          { key: 'armStyle', type: 'select', label: 'Arm style',
            options: [ { value: 'bone', label: 'Anatomical bone' }, { value: 'rail', label: 'Twin rail' }, { value: 'line', label: 'Line' } ] },
          { key: 'armWidth', type: 'range', label: 'Arm thickness', min: 1, max: 30, step: 1, fmt: 'px' },
          { key: 'elbowAngle', type: 'toggle', label: 'Elbow angle readout', showIf: 'armTracking' },
          { key: 'shoulders', type: 'toggle', label: 'Shoulder girdle', showIf: 'armTracking' },
          { key: 'arm3d', type: 'toggle', label: '3D arm with hand model' },
        ],
      },
    ],
  },
  {
    id: 'scene', label: 'Scene', icon: 'aperture',
    sections: [
      {
        id: 'feed', label: 'Camera feed',
        controls: [
          { key: 'mirror', type: 'toggle', label: 'Mirror view' },
          { key: 'videoFit', type: 'segment', label: 'Framing',
            options: [ { value: 'cover', label: 'Fill screen' }, { value: 'contain', label: 'Full frame' } ] },
          { key: 'videoFilter', type: 'select', label: 'Feed filter',
            options: [ { value: 'none', label: 'Natural' }, { value: 'mono', label: 'Monochrome' }, { value: 'noir', label: 'Noir' }, { value: 'night', label: 'Night vision' }, { value: 'thermal', label: 'Thermal' }, { value: 'cyan', label: 'Cold tint' }, { value: 'invert', label: 'Negative' }, { value: 'hidden', label: 'Hidden (void)' } ] },
          { key: 'videoDim', type: 'range', label: 'Feed brightness', min: 0, max: 1.2, step: 0.05, fmt: 'pct' },
          { key: 'videoBlur', type: 'range', label: 'Feed blur', min: 0, max: 12, step: 1, fmt: 'px' },
        ],
      },
      {
        id: 'overlay', label: 'Overlays',
        controls: [
          { key: 'grid', type: 'toggle', label: 'Measurement grid' },
          { key: 'scanlines', type: 'toggle', label: 'Scanlines' },
          { key: 'vignette', type: 'toggle', label: 'Vignette' },
          { key: 'frameHud', type: 'toggle', label: 'Viewfinder frame' },
          { key: 'scanSweep', type: 'toggle', label: 'Radar sweep' },
        ],
      },
    ],
  },
  {
    id: 'hud', label: 'HUD', icon: 'gauge',
    sections: [
      {
        id: 'telemetry', label: 'Telemetry',
        controls: [
          { key: 'telemetry', type: 'toggle', label: 'Telemetry panel' },
          { key: 'fpsGraph', type: 'toggle', label: 'Performance graph', showIf: 'telemetry' },
          { key: 'handLabels', type: 'toggle', label: 'Hand ID tags' },
          { key: 'gestures', type: 'toggle', label: 'Gesture recognition' },
          { key: 'gestureToast', type: 'toggle', label: 'Gesture announcements', showIf: 'gestures' },
          { key: 'swapHands', type: 'toggle', label: 'Swap handedness labels' },
        ],
      },
      {
        id: 'tactical', label: 'Tactical',
        controls: [
          { key: 'boresight', type: 'toggle', label: 'Boresight reticle', desc: 'Fixed mil-dot reticle at screen centre.' },
          { key: 'headingTape', type: 'toggle', label: 'Bearing tape', desc: 'Compass tape tracking the primary contact.' },
          { key: 'rangeFinder', type: 'toggle', label: 'Rangefinder', desc: 'Estimated camera distance per hand.' },
          { key: 'targetLock', type: 'toggle', label: 'Target designator', desc: 'Acquire, lock and lead line to each hand.' },
          { key: 'radar', type: 'toggle', label: 'Contact radar', desc: 'Plan view of tracked contacts.' },
          { key: 'tacColor', type: 'color', label: 'Tactical colour', swatches: palette },
        ],
      },
      {
        id: 'iface', label: 'Interface',
        controls: [
          { key: 'uiAccent', type: 'color', label: 'Interface accent', swatches: palette },
          { key: 'reduceMotion', type: 'toggle', label: 'Reduce UI motion' },
          { key: 'keepAwake', type: 'toggle', label: 'Keep screen awake' },
        ],
      },
    ],
  },
  {
    id: 'system', label: 'System', icon: 'save',
    sections: [
      { id: 'sys', label: 'Configuration', type: 'system' },
    ],
  },
];

export const DEFAULTS = {
  handModel: 'landmarker', delegate: 'GPU', numHands: 2,
  detectConf: 0.6, presenceConf: 0.6, trackConf: 0.55,
  smoothing: true, smoothMinCutoff: 1.4, smoothBeta: 0.04, prediction: 15, holdFrames: 4,
  renderScale: 1, resolution: '1280', targetFps: '0',

  showBones: true, boneStyle: 'neon', boneWidth: 3, depthWidth: true, palmMesh: true,
  showJoints: true, jointShape: 'ring', jointSize: 4.5, tipHighlight: true, showIndices: false, showAngles: false,
  colorMode: 'accent', accent: '#9fc9a6', secondary: '#d4a24c', opacity: 1,

  tracers: true, tracerStyle: 'ribbon', tracerLength: 28, tracerWidth: 4, tracerTips: 'index',
  crosshairs: true, crosshairStyle: 'tactical', crosshairTips: 'index', crosshairSize: 26, coords: true,
  bbox: true, palmHud: false, velocity: false,
  pinchLine: true, lightning: false, stringWeb: false, particles: false, particleRate: 4, hull: false,
  airPaint: false, paintFade: 0,

  hand3d: false, hand3dStyle: 'mannequin', hand3dOpacity: 0.92, hand3dThickness: 1, hand3dDepth: 1,
  hand3dGlow: false, hand3dTint: '#9fc9a6', lightOrbit: true, lightIntensity: 1.2, hand3dShadow: true,

  armTracking: true, poseModel: 'lite', poseEvery: 1, armStyle: 'bone', armWidth: 8, elbowAngle: true, shoulders: false, arm3d: true, forearmEstimate: true,

  mirror: true, videoFit: 'cover', videoFilter: 'none', videoDim: 0.85, videoBlur: 0,
  grid: false, scanlines: false, vignette: true, frameHud: true, scanSweep: false,

  telemetry: true, fpsGraph: true, handLabels: true, gestures: true, gestureToast: true, swapHands: false,
  boresight: true, headingTape: true, rangeFinder: true, targetLock: true, radar: true, tacColor: '#9fc9a6',
  uiAccent: '#9fc9a6', reduceMotion: false, keepAwake: true,
};

// Presets only override visual keys; tracking settings are preserved.
export const PRESETS = [
  {
    id: 'tactical', name: 'Tactical', icon: 'crosshair', desc: 'Clean surgical overlay with reticles and telemetry.',
    swatch: ['#4f6b55', '#0b0f10'],
    values: { boneStyle: 'neon', colorMode: 'accent', accent: '#9fc9a6', jointShape: 'ring', tracers: true, tracerStyle: 'ribbon', crosshairs: true, crosshairStyle: 'tactical', bbox: true, palmHud: false, lightning: false, particles: false, hull: false, hand3d: false, videoFilter: 'none', videoDim: 0.85, grid: false, scanlines: false, frameHud: true, scanSweep: false, stringWeb: false },
  },
  {
    id: 'hologram', name: 'Hologram', icon: 'scan', desc: 'Volumetric hologram hand over a cold, dim feed.',
    swatch: ['#4a5d7a', '#05070d'],
    values: { boneStyle: 'pulse', colorMode: 'accent', accent: '#8fb3ff', jointShape: 'circle', tracers: true, tracerStyle: 'comet', crosshairs: false, bbox: false, palmHud: true, hand3d: true, hand3dStyle: 'hologram', hand3dTint: '#8fb3ff', hand3dGlow: true, videoFilter: 'cyan', videoDim: 0.55, scanlines: true, grid: true, scanSweep: false, lightning: false, particles: false, hull: false },
  },
  {
    id: 'cyber', name: 'Engage', icon: 'zap', desc: 'Arc discharge between contacts with lock-on targeting.',
    swatch: ['#8a3b33', '#14100f'],
    values: { boneStyle: 'neon', colorMode: 'accent', accent: '#c9d4dc', jointShape: 'diamond', tracers: true, tracerStyle: 'ribbon', tracerTips: 'all', crosshairs: true, crosshairStyle: 'lock', lightning: true, particles: true, stringWeb: true, hand3d: false, videoFilter: 'noir', videoDim: 0.5, scanlines: true, frameHud: true, bbox: true, hull: false },
  },
  {
    id: 'xray', name: 'X-Ray', icon: 'bone', desc: 'Radiograph look with anatomical bones in 3D.',
    swatch: ['#5b6370', '#0a0d14'],
    values: { boneStyle: 'tapered', colorMode: 'accent', accent: '#dfe9ff', jointShape: 'circle', tracers: false, crosshairs: false, bbox: false, hand3d: true, hand3dStyle: 'xray', hand3dTint: '#9cc2ff', hand3dGlow: true, videoFilter: 'invert', videoDim: 0.35, scanlines: false, grid: false, armStyle: 'bone', lightning: false, particles: false, hull: true },
  },
  {
    id: 'thermal', name: 'Thermal', icon: 'flame', desc: 'Infrared feed with depth heatmap skeleton.',
    swatch: ['#7a5a2a', '#120e0a'],
    values: { boneStyle: 'solid', colorMode: 'depth', jointShape: 'square', tracers: true, tracerStyle: 'dots', crosshairs: true, crosshairStyle: 'circle', bbox: true, hand3d: false, videoFilter: 'thermal', videoDim: 0.9, scanlines: false, grid: true, lightning: false, particles: false, hull: false },
  },
  {
    id: 'chrome', name: 'Chrome', icon: 'gem', desc: 'Liquid-metal 3D hand with orbiting studio light.',
    swatch: ['#6a737b', '#1a1d20'],
    values: { boneStyle: 'solid', boneWidth: 2, colorMode: 'accent', accent: '#f0f0f0', jointShape: 'circle', tracers: false, crosshairs: false, bbox: false, hand3d: true, hand3dStyle: 'chrome', hand3dOpacity: 1, hand3dGlow: false, lightOrbit: true, videoFilter: 'none', videoDim: 0.8, scanlines: false, grid: false, lightning: false, particles: false, hull: false, palmMesh: false },
  },
  {
    id: 'mech', name: 'Mech', icon: 'bot', desc: 'Robotic exoskeleton rig with amber servos.',
    swatch: ['#6b5a3a', '#1c1f22'],
    values: { boneStyle: 'double', colorMode: 'accent', accent: '#f5b84b', jointShape: 'square', tracers: false, crosshairs: true, crosshairStyle: 'bracket', bbox: true, hand3d: true, hand3dStyle: 'robot', hand3dTint: '#f5b84b', hand3dOpacity: 1, videoFilter: 'mono', videoDim: 0.7, grid: true, scanlines: false, lightning: false, particles: false, hull: false },
  },
  {
    id: 'recon', name: 'Recon', icon: 'radar', desc: 'Night-vision feed, designators, rangefinder and radar.',
    swatch: ['#3e5a36', '#070a06'],
    values: { boneStyle: 'dashed', colorMode: 'accent', accent: '#b6f0a8', jointShape: 'square', tracers: false, crosshairs: true, crosshairStyle: 'bracket', bbox: false, palmHud: false, lightning: false, particles: false, hull: false, hand3d: false, videoFilter: 'night', videoDim: 0.75, scanlines: true, grid: false, frameHud: true, boresight: true, headingTape: true, rangeFinder: true, targetLock: true, radar: true, tacColor: '#b6f0a8' },
  },
  {
    id: 'minimal', name: 'Minimal', icon: 'circle-dot', desc: 'Just the skeleton. Nothing else.',
    swatch: ['#f0f0f0', '#2a2d30'],
    values: { boneStyle: 'solid', boneWidth: 2, colorMode: 'accent', accent: '#f0f0f0', jointShape: 'circle', jointSize: 3, tracers: false, crosshairs: false, bbox: false, palmHud: false, velocity: false, pinchLine: false, lightning: false, particles: false, hull: false, hand3d: false, videoFilter: 'none', videoDim: 1, grid: false, scanlines: false, vignette: false, frameHud: false, scanSweep: false, stringWeb: false, palmMesh: false, boresight: false, headingTape: false, rangeFinder: false, targetLock: false, radar: false },
  },
];
