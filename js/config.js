// Settings schema and defaults.
// Every control in the settings panel is generated from SCHEMA.
// Tabs, sections and controls may declare `modes` — they only appear while
// that tracking mode is active, so switching what Kinesis tracks changes
// the entire settings surface.

export const VERSION = '5.0.0';
export const STORAGE_KEY = 'kinesis.settings.v3';

const palette = [
  { value: '#9fc9a6', label: 'Signal' },
  { value: '#f5b84b', label: 'Amber' },
  { value: '#ff5d73', label: 'Alert' },
  { value: '#8fb3ff', label: 'Ice' },
  { value: '#c6f36b', label: 'Lime' },
  { value: '#f0f0f0', label: 'White' },
];

export const TRACKING_MODES = [
  { value: 'hands', label: 'Hands' },
  { value: 'body', label: 'Body' },
  { value: 'objects', label: 'Objects' },
  { value: 'face', label: 'Face' },
];

export const SCHEMA = [
  {
    id: 'tracking', label: 'Tracking', icon: 'cpu',
    sections: [
      {
        id: 'mode', label: 'Tracking mode',
        controls: [
          { key: 'trackingMode', type: 'segment', label: 'What to track', reinit: true,
            options: TRACKING_MODES,
            desc: 'Switching the tracking target reloads the neural pipeline and presents a dedicated set of settings.' },
          { type: 'separator', label: 'Neural models' },
        ],
      },
      {
        id: 'model-hands', label: 'Hand models', modes: ['hands'],
        controls: [
          { key: 'handModel', type: 'segment', label: 'Hand model', reinit: true,
            options: [ { value: 'landmarker', label: 'Landmarker' }, { value: 'gesture', label: 'Gesture ML' } ],
            desc: 'Gesture ML adds a classifier head (slightly slower).' },
          { key: 'delegate', type: 'segment', label: 'Compute', reinit: true,
            options: [ { value: 'GPU', label: 'GPU' }, { value: 'CPU', label: 'CPU' } ] },
          { key: 'numHands', type: 'range', label: 'Max hands', min: 1, max: 6, step: 1, reinit: true },
          { key: 'detectConf', type: 'range', label: 'Detection confidence', min: 0.1, max: 0.95, step: 0.05, reinit: true, fmt: 'pct' },
          { key: 'presenceConf', type: 'range', label: 'Presence confidence', min: 0.1, max: 0.95, step: 0.05, reinit: true, fmt: 'pct' },
          { key: 'trackConf', type: 'range', label: 'Tracking confidence', min: 0.1, max: 0.95, step: 0.05, reinit: true, fmt: 'pct' },
        ],
      },
      {
        id: 'model-body', label: 'Body model', modes: ['body'],
        controls: [
          { key: 'poseModel', type: 'select', label: 'Pose model', reinit: true,
            options: [ { value: 'lite', label: 'Lite' }, { value: 'full', label: 'Full' }, { value: 'heavy', label: 'Heavy' } ],
            desc: '33-landmark full-body skeleton. Heavier models trade latency for accuracy.' },
          { key: 'delegate', type: 'segment', label: 'Compute', reinit: true,
            options: [ { value: 'GPU', label: 'GPU' }, { value: 'CPU', label: 'CPU' } ] },
          { key: 'bodyPoseConf', type: 'range', label: 'Detection confidence', min: 0.1, max: 0.95, step: 0.05, reinit: true, fmt: 'pct' },
          { key: 'bodyTrackConf', type: 'range', label: 'Tracking confidence', min: 0.1, max: 0.95, step: 0.05, reinit: true, fmt: 'pct' },
        ],
      },
      {
        id: 'model-objects', label: 'Object models', modes: ['objects'],
        controls: [
          { key: 'objModel', type: 'select', label: 'Detector model', reinit: true,
            options: [
              { value: 'fp16', label: 'EfficientDet-Lite0 · fp16' },
              { value: 'int8', label: 'EfficientDet-Lite0 · int8' },
              { value: 'fp32', label: 'EfficientDet-Lite0 · fp32' },
              { value: 'lite2int8', label: 'EfficientDet-Lite2 · int8' },
              { value: 'lite2fp16', label: 'EfficientDet-Lite2 · fp16' },
              { value: 'lite2fp32', label: 'EfficientDet-Lite2 · fp32' },
              { value: 'ssdInt8', label: 'MobileNet SSD · int8' },
              { value: 'ssdFp32', label: 'MobileNet SSD · fp32' },
            ],
            desc: 'COCO-80 class detector. int8 is fastest, fp32 most accurate; Lite2 trades speed for accuracy; MobileNet SSD is the lightest.' },
          { key: 'delegate', type: 'segment', label: 'Compute', reinit: true,
            options: [ { value: 'GPU', label: 'GPU' }, { value: 'CPU', label: 'CPU' } ] },
          { key: 'objScore', type: 'range', label: 'Score threshold', min: 0.1, max: 0.9, step: 0.05, fmt: 'pct', reinit: true },
          { key: 'objMax', type: 'range', label: 'Max results', min: 1, max: 25, step: 1, reinit: true },
          { key: 'objClassFilter', type: 'text', label: 'Class filter',
            desc: 'Comma-separated whitelist of COCO classes to track (e.g. person, cell phone). Leave blank to track everything.' },
        ],
      },
      {
        id: 'model-face', label: 'Face model', modes: ['face'],
        controls: [
          { key: 'faceModel', type: 'select', label: 'Face model', reinit: true,
            options: [
              { value: 'landmarker', label: 'FaceLandmarker · 478 pts' },
            ],
            desc: 'Face mesh with 478 landmarks, 52 blendshapes and head-pose matrix.' },
          { key: 'delegate', type: 'segment', label: 'Compute', reinit: true,
            options: [ { value: 'GPU', label: 'GPU' }, { value: 'CPU', label: 'CPU' } ] },
          { key: 'faceMax', type: 'range', label: 'Max faces', min: 1, max: 4, step: 1, reinit: true },
          { key: 'faceDetectConf', type: 'range', label: 'Detection confidence', min: 0.1, max: 0.95, step: 0.05, reinit: true, fmt: 'pct' },
        ],
      },
      {
        id: 'filtering', label: 'Signal filtering',
        controls: [
          { key: 'smoothing', type: 'toggle', label: 'One-Euro smoothing', desc: 'Adaptive low-pass filter: steady when still, responsive when moving.' },
          { key: 'smoothMinCutoff', type: 'range', label: 'Stability', min: 0.1, max: 5, step: 0.1, showIf: 'smoothing', desc: 'Lower = steadier, more lag.' },
          { key: 'smoothBeta', type: 'range', label: 'Responsiveness', min: 0, max: 0.2, step: 0.005, showIf: 'smoothing' },
          { key: 'prediction', type: 'range', label: 'Latency prediction', min: 0, max: 60, step: 5, fmt: 'ms', desc: 'Extrapolates motion forward to hide inference latency.' },
          { key: 'holdFrames', type: 'range', label: 'Dropout hold', min: 0, max: 30, step: 1, fmt: 'fr', desc: 'Keeps a track alive briefly when detection blinks.' },
        ],
      },
      {
        id: 'performance', label: 'Performance',
        controls: [
          { key: 'adaptiveQuality', type: 'toggle', label: 'Adaptive quality', desc: 'Automatically reduces render resolution when the frame rate drops, and restores it when headroom returns.' },
          { key: 'renderScale', type: 'range', label: 'Render resolution', min: 0.5, max: 2, step: 0.25, fmt: 'x' },
          { key: 'resolution', type: 'select', label: 'Camera resolution', reinitCamera: true,
            options: [ { value: '640', label: '640 × 480' }, { value: '1280', label: '1280 × 720' }, { value: '1920', label: '1920 × 1080' }, { value: '2560', label: '2560 × 1440' } ] },
          { key: 'targetFps', type: 'select', label: 'Inference rate',
            options: [ { value: '0', label: 'Every frame' }, { value: '60', label: '60 Hz' }, { value: '30', label: '30 Hz' }, { value: '24', label: '24 Hz' }, { value: '15', label: '15 Hz' }, { value: '10', label: '10 Hz' } ] },
        ],
      },
    ],
  },
  {
    id: 'skeleton', label: 'Skeleton', icon: 'git-branch', modes: ['hands'],
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
            options: [ { value: 'accent', label: 'Single accent' }, { value: 'finger', label: 'Per finger' }, { value: 'depth', label: 'Depth heatmap' }, { value: 'velocity', label: 'Velocity map' }, { value: 'confidence', label: 'Confidence map' }, { value: 'hand', label: 'Per hand' } ],
            desc: 'Velocity tints each landmark by its motion; confidence tints by detection score.' },
          { key: 'accent', type: 'color', label: 'Accent', swatches: palette },
          { key: 'secondary', type: 'color', label: 'Secondary', swatches: palette },
          { key: 'opacity', type: 'range', label: 'Overlay opacity', min: 0.1, max: 1, step: 0.05, fmt: 'pct' },
        ],
      },
    ],
  },
  {
    id: 'body', label: 'Body', icon: 'person-standing', modes: ['body'],
    sections: [
      {
        id: 'body-bones', label: 'Skeleton',
        controls: [
          { key: 'bodyBones', type: 'toggle', label: 'Draw skeleton' },
          { key: 'bodyBoneStyle', type: 'select', label: 'Bone style', showIf: 'bodyBones',
            options: [ { value: 'solid', label: 'Solid' }, { value: 'neon', label: 'Glow' }, { value: 'dashed', label: 'Tactical dashed' }, { value: 'double', label: 'Twin rail' } ] },
          { key: 'bodyBoneWidth', type: 'range', label: 'Thickness', min: 0.5, max: 14, step: 0.5, fmt: 'px', showIf: 'bodyBones' },
          { key: 'bodyDepthWidth', type: 'toggle', label: 'Depth-scaled thickness', showIf: 'bodyBones' },
          { key: 'bodyJoints', type: 'toggle', label: 'Draw joints' },
          { key: 'bodyJointShape', type: 'select', label: 'Joint shape', showIf: 'bodyJoints',
            options: [ { value: 'circle', label: 'Circle' }, { value: 'ring', label: 'Ring' }, { value: 'square', label: 'Square' }, { value: 'diamond', label: 'Diamond' }, { value: 'cross', label: 'Cross' } ] },
          { key: 'bodyJointSize', type: 'range', label: 'Joint size', min: 1, max: 16, step: 0.5, fmt: 'px', showIf: 'bodyJoints' },
        ],
      },
      {
        id: 'body-color', label: 'Colour',
        controls: [
          { key: 'bodyColorMode', type: 'select', label: 'Colour mode',
            options: [ { value: 'side', label: 'Left / right' }, { value: 'accent', label: 'Single accent' }, { value: 'depth', label: 'Depth heatmap' } ] },
          { key: 'accent', type: 'color', label: 'Left accent', swatches: palette },
          { key: 'secondary', type: 'color', label: 'Right accent', swatches: palette },
          { key: 'opacity', type: 'range', label: 'Overlay opacity', min: 0.1, max: 1, step: 0.05, fmt: 'pct' },
        ],
      },
      {
        id: 'body-analysis', label: 'Analysis',
        controls: [
          { key: 'bodyAngles', type: 'toggle', label: 'Joint angle readouts', desc: 'Live flexion angles at elbows and knees.' },
          { key: 'bodyLean', type: 'toggle', label: 'Torso lean vector', desc: 'Plumb line from mid-hip to mid-shoulder with deviation in degrees.' },
          { key: 'bodyLeanWarn', type: 'toggle', label: 'Lean threshold warning', showIf: 'bodyLean', desc: 'Flags the lean readout in the alert colour when it exceeds the threshold.' },
          { key: 'bodyLeanThreshold', type: 'range', label: 'Lean threshold', min: 5, max: 40, step: 1, fmt: '°', showIf: 'bodyLeanWarn' },
          { key: 'bodyTilt', type: 'toggle', label: 'Shoulder level', desc: 'Horizontal datum across the shoulders with tilt readout.' },
          { key: 'bodyVelocity', type: 'toggle', label: 'Velocity vectors', desc: 'Motion vectors on wrists and ankles.' },
          { key: 'bodyTrail', type: 'toggle', label: 'Wrist tracers' },
          { key: 'bodyTrailLength', type: 'range', label: 'Tracer length', min: 4, max: 90, step: 1, fmt: 'fr', showIf: 'bodyTrail' },
          { key: 'bodyBBox', type: 'toggle', label: 'Bounding frame' },
          { key: 'bodyPosture', type: 'toggle', label: 'Posture panel', desc: 'Consolidated lean, tilt and knee readouts.' },
        ],
      },
    ],
  },
  {
    id: 'objects', label: 'Objects', icon: 'scan-search', modes: ['objects'],
    sections: [
      {
        id: 'obj-boxes', label: 'Detections',
        controls: [
          { key: 'objBoxes', type: 'toggle', label: 'Bounding frames' },
          { key: 'objBoxStyle', type: 'select', label: 'Frame style', showIf: 'objBoxes',
            options: [ { value: 'bracket', label: 'Corner brackets' }, { value: 'full', label: 'Full frame' }, { value: 'dashed', label: 'Dashed' } ] },
          { key: 'objFill', type: 'toggle', label: 'Silhouette fill', showIf: 'objBoxes' },
          { key: 'objLabels', type: 'toggle', label: 'Class labels' },
          { key: 'objConfidence', type: 'toggle', label: 'Confidence gauges', showIf: 'objLabels' },
          { key: 'objIds', type: 'toggle', label: 'Track identifiers' },
          { key: 'objScan', type: 'toggle', label: 'Scan sweep', desc: 'Analytical scan line sweeping each detection.' },
        ],
      },
      {
        id: 'obj-motion', label: 'Motion',
        controls: [
          { key: 'objTrails', type: 'toggle', label: 'Motion trails' },
          { key: 'objTrailLength', type: 'range', label: 'Trail length', min: 4, max: 90, step: 1, fmt: 'fr', showIf: 'objTrails' },
          { key: 'objVelocity', type: 'toggle', label: 'Velocity vectors' },
          { key: 'objPredict', type: 'toggle', label: 'Trajectory prediction', desc: 'Dashed projected path from each contact’s velocity.' },
          { key: 'objPredictMs', type: 'range', label: 'Lead time', min: 300, max: 2000, step: 100, fmt: 'ms', showIf: 'objPredict' },
          { key: 'objLock', type: 'toggle', label: 'Target designators', desc: 'Acquire-and-lock brackets with lead line on each contact.' },
        ],
      },
      {
        id: 'obj-tactical', label: 'Tactical',
        controls: [
          { key: 'objRadar', type: 'toggle', label: 'Contact radar', desc: 'Plan-view radar plotting every detection by bearing and range.' },
          { key: 'radarSize', type: 'range', label: 'Radar radius', min: 40, max: 140, step: 4, fmt: 'px', showIf: 'objRadar' },
          { key: 'radarRings', type: 'toggle', label: 'Radar range rings', showIf: 'objRadar' },
          { key: 'radarSweep', type: 'toggle', label: 'Radar sweep', showIf: 'objRadar' },
          { key: 'objRange', type: 'toggle', label: 'Rangefinder', desc: 'Estimated camera distance per contact.' },
          { key: 'objHistogram', type: 'toggle', label: 'Class census', desc: 'Live tally of detected classes.' },
          { key: 'tacColor', type: 'color', label: 'Tactical colour', swatches: palette },
        ],
      },
    ],
  },
  {
    id: 'face', label: 'Face', icon: 'scan-face', modes: ['face'],
    sections: [
      {
        id: 'face-mesh', label: 'Mesh',
        controls: [
          { key: 'faceMesh', type: 'toggle', label: 'Face mesh', desc: '478-landmark wireframe locked to the face.' },
          { key: 'faceMeshStyle', type: 'select', label: 'Mesh style', showIf: 'faceMesh',
            options: [ { value: 'neon', label: 'Neon' }, { value: 'solid', label: 'Solid' }, { value: 'thin', label: 'Hairline' } ] },
          { key: 'faceContour', type: 'toggle', label: 'Contour emphasis', showIf: 'faceMesh', desc: 'Heavier stroke on the face oval.' },
          { key: 'facePoints', type: 'toggle', label: 'Landmark cloud' },
          { key: 'facePointSize', type: 'range', label: 'Point size', min: 0.5, max: 4, step: 0.25, fmt: 'px', showIf: 'facePoints' },
          { key: 'faceIris', type: 'toggle', label: 'Iris tracking', desc: 'Rings and crosshairs on both irises.' },
          { key: 'faceGaze', type: 'toggle', label: 'Gaze readout', desc: 'Live gaze bearing and elevation from iris offset.' },
        ],
      },
      {
        id: 'face-analysis', label: 'Analysis',
        controls: [
          { key: 'faceHead', type: 'toggle', label: 'Head orientation', desc: 'Yaw, pitch and roll from the transformation matrix.' },
          { key: 'faceGizmo', type: 'toggle', label: 'Attitude indicator', showIf: 'faceHead', desc: 'Artificial-horizon gauge for head attitude.' },
          { key: 'faceBlend', type: 'toggle', label: 'Blendshape telemetry', desc: 'Live bars for the strongest expression coefficients.' },
          { key: 'faceBlendCount', type: 'range', label: 'Bars shown', min: 3, max: 12, step: 1, showIf: 'faceBlend' },
          { key: 'faceExpr', type: 'toggle', label: 'Expression readout', desc: 'Names the dominant expression coefficient.' },
          { key: 'faceBlinks', type: 'toggle', label: 'Blink counter', desc: 'Session blink tally from eyelid blendshapes, shown in the telemetry panel.' },
          { key: 'faceBBox', type: 'toggle', label: 'Bounding frame' },
        ],
      },
    ],
  },
  {
    id: 'effects', label: 'Effects', icon: 'spline', modes: ['hands'],
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
          { key: 'pointRay', type: 'toggle', label: 'Designator ray', desc: 'Laser ray projected along the index finger, with range readout.' },
          { key: 'velocity', type: 'toggle', label: 'Velocity vectors' },
        ],
      },
      {
        id: 'interaction', label: 'Interaction',
        controls: [
          { key: 'pinchLine', type: 'toggle', label: 'Pinch gauge', desc: 'Live thumb–index distance with pinch flash.' },
          { key: 'spanGauge', type: 'toggle', label: 'Span caliper', desc: 'Projected distance between the index fingertips of both hands, in millimetres.' },
          { key: 'hull', type: 'toggle', label: 'Hand silhouette fill' },
        ],
      },
    ],
  },
  {
    id: 'model3d', label: '3D Hand', icon: 'box', modes: ['hands'],
    sections: [
      {
        id: 'mesh', label: 'Volumetric hand',
        controls: [
          { key: 'hand3d', type: 'toggle', label: '3D hand overlay', desc: 'A real-time 3D hand rig driven by all 21 landmarks.' },
          { key: 'hand3dStyle', type: 'select', label: 'Model', showIf: 'hand3d',
            options: [
              { value: 'mannequin', label: 'Mannequin' },
              { value: 'skin', label: 'Skin' },
              { value: 'chrome', label: 'Liquid chrome' },
              { value: 'hologram', label: 'Hologram' },
              { value: 'robot', label: 'Mech rig' },
              { value: 'xray', label: 'X-ray bones' },
              { value: 'glass', label: 'Frosted glass' },
              { value: 'gold', label: 'Gilded' },
              { value: 'wire', label: 'Wireframe' },
              { value: 'neon', label: 'Neon tube' },
              { value: 'ghost', label: 'Ghost' },
              { value: 'carbon', label: 'Carbon fibre' },
              { value: 'obsidian', label: 'Obsidian' },
              { value: 'titanium', label: 'Titanium' },
              { value: 'graphite', label: 'Graphite' },
              { value: 'aerogel', label: 'Aerogel' },
              { value: 'jade', label: 'Jade' },
              { value: 'plasma', label: 'Plasma' },
              { value: 'void', label: 'Void' },
              { value: 'wood', label: 'Wood' },
            ] },
          { type: 'separator', label: 'Rig parameters' },
          { key: 'hand3dOpacity', type: 'range', label: 'Opacity', min: 0.1, max: 1, step: 0.05, fmt: 'pct', showIf: 'hand3d' },
          { key: 'hand3dThickness', type: 'range', label: 'Finger girth', min: 0.5, max: 1.8, step: 0.05, fmt: 'x', showIf: 'hand3d' },
          { key: 'hand3dDepth', type: 'range', label: 'Depth exaggeration', min: 0, max: 3, step: 0.1, fmt: 'x', showIf: 'hand3d' },
          { key: 'hand3dGlow', type: 'toggle', label: 'Glow shell', showIf: 'hand3d' },
          { key: 'hand3dTint', type: 'color', label: 'Tint', swatches: palette, showIf: 'hand3d' },
          { key: 'hand3dOrbit', type: 'toggle', label: 'Orbit view', showIf: 'hand3d',
            desc: 'Drag the view to orbit the hand, scroll or pinch to zoom.' },
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
    id: 'arm', label: 'Arm', icon: 'bone', modes: ['hands'],
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
          { key: 'loadFile', type: 'button', label: 'Load video footage', icon: 'upload',
            desc: 'Analyse a video file from this device instead of the live camera.' },
          { key: 'mirror', type: 'toggle', label: 'Mirror view' },
          { key: 'videoFit', type: 'segment', label: 'Framing',
            options: [ { value: 'cover', label: 'Fill screen' }, { value: 'contain', label: 'Full frame' } ] },
          { key: 'videoDim', type: 'range', label: 'Feed brightness', min: 0, max: 1.2, step: 0.05, fmt: 'pct' },
          { key: 'videoBlur', type: 'range', label: 'Feed blur', min: 0, max: 12, step: 1, fmt: 'px' },
        ],
      },
      {
        id: 'overlay', label: 'Overlays',
        controls: [
          { key: 'grid', type: 'toggle', label: 'Measurement grid' },
          { key: 'gridStyle', type: 'select', label: 'Grid style', showIf: 'grid',
            options: [ { value: 'lines', label: 'Fine grid' }, { value: 'thirds', label: 'Rule of thirds' }, { value: 'cross', label: 'Centre cross' } ] },
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
          { key: 'handLabels', type: 'toggle', label: 'Contact tags' },
          { key: 'gestures', type: 'toggle', label: 'Gesture recognition' },
          { key: 'gestureToast', type: 'toggle', label: 'Gesture announcements', showIf: 'gestures' },
          { key: 'swapHands', type: 'toggle', label: 'Swap handedness labels' },
        ],
      },
      {
        id: 'tactical', label: 'Tactical',
        controls: [
          { key: 'boresight', type: 'toggle', label: 'Boresight reticle', desc: 'Fixed reticle at screen centre.' },
          { key: 'boresightStyle', type: 'select', label: 'Reticle style', showIf: 'boresight',
            options: [ { value: 'mil', label: 'Mil-dot' }, { value: 'cross', label: 'Cross' }, { value: 'ring', label: 'Ring' } ] },
          { key: 'boresightSize', type: 'range', label: 'Reticle span', min: 24, max: 120, step: 4, fmt: 'px', showIf: 'boresight' },
          { key: 'headingTape', type: 'toggle', label: 'Bearing tape', desc: 'Compass tape tracking the primary contact.' },
          { key: 'rangeFinder', type: 'toggle', label: 'Rangefinder', desc: 'Estimated camera distance per contact.' },
          { key: 'targetLock', type: 'toggle', label: 'Target designator', desc: 'Acquire, lock and lead line to each contact.' },
          { key: 'radar', type: 'toggle', label: 'Contact radar', desc: 'Plan view of tracked contacts.' },
          { key: 'radarSize', type: 'range', label: 'Radar radius', min: 40, max: 140, step: 4, fmt: 'px', showIf: 'radar' },
          { key: 'radarRings', type: 'toggle', label: 'Radar range rings', showIf: 'radar' },
          { key: 'radarSweep', type: 'toggle', label: 'Radar sweep', showIf: 'radar' },
          { key: 'tacColor', type: 'color', label: 'Tactical colour', swatches: palette },
        ],
      },
      {
        id: 'commands', label: 'Gesture commands',
        controls: [
          { key: 'gestureCommands', type: 'toggle', label: 'Hands-free commands', desc: 'Hold a pinch for one second to capture a still. Hold a thumbs-up for one second to start or stop recording.' },
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
    id: 'data', label: 'Data', icon: 'download',
    sections: [
      {
        id: 'frame-export', label: 'Frame export',
        controls: [
          { key: 'exportFrame', type: 'button', label: 'Export current frame (JSON)', icon: 'download',
            desc: 'Writes every tracked landmark, detection and statistic of the current frame to a JSON file.' },
        ],
      },
      {
        id: 'stream', label: 'Telemetry stream',
        controls: [
          { key: 'dataLog', type: 'toggle', label: 'Record landmark stream (CSV)',
            desc: 'Logs tracked landmarks to a CSV file at a fixed rate. Turn off to stop and download.' },
          { key: 'dataLogHz', type: 'select', label: 'Stream rate', showIf: 'dataLog',
            options: [ { value: '60', label: '60 Hz' }, { value: '30', label: '30 Hz' }, { value: '15', label: '15 Hz' }, { value: '5', label: '5 Hz' } ] },
        ],
      },
      {
        id: 'motion', label: 'Motion capture',
        controls: [
          { key: 'motionCapture', type: 'toggle', label: 'Motion capture timeline', modes: ['hands'],
            desc: 'Continuously buffers the last few seconds of hand motion. A timeline bar appears at the bottom of the screen — scrub it to review any captured moment, press play to replay, and export the buffer as JSON.' },
          { key: 'motionWindow', type: 'range', label: 'Buffer length', min: 2, max: 30, step: 1, fmt: 's0', modes: ['hands'], showIf: 'motionCapture' },
          { key: 'motionExport', type: 'button', label: 'Export motion buffer (JSON)', icon: 'download', modes: ['hands'] },
        ],
      },
      {
        id: 'capture', label: 'Capture settings',
        controls: [
          { key: 'shotWatermark', type: 'toggle', label: 'Watermark captures', desc: 'Stamps stills and recordings with the Kinesis mark and timestamp.' },
          { key: 'recBitrate', type: 'select', label: 'Recording bitrate',
            options: [ { value: '8', label: '8 Mbps' }, { value: '16', label: '16 Mbps' }, { value: '25', label: '25 Mbps' } ] },
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
  trackingMode: 'hands',

  handModel: 'landmarker', delegate: 'GPU', numHands: 2,
  detectConf: 0.6, presenceConf: 0.6, trackConf: 0.55,
  smoothing: true, smoothMinCutoff: 1.4, smoothBeta: 0.04, prediction: 15, holdFrames: 4,
  renderScale: 1, resolution: '1280', targetFps: '0', adaptiveQuality: true,

  bodyPoseConf: 0.5, bodyTrackConf: 0.5,
  bodyBones: true, bodyBoneStyle: 'neon', bodyBoneWidth: 3.5, bodyDepthWidth: true,
  bodyJoints: true, bodyJointShape: 'ring', bodyJointSize: 4.5,
  bodyColorMode: 'side',
  bodyAngles: true, bodyLean: true, bodyLeanWarn: false, bodyLeanThreshold: 15,
  bodyTilt: true, bodyVelocity: false,
  bodyTrail: false, bodyTrailLength: 26, bodyBBox: true, bodyPosture: true,

  objModel: 'int8', objScore: 0.5, objMax: 12, objClassFilter: '',
  objBoxes: true, objBoxStyle: 'bracket', objFill: false, objLabels: true, objConfidence: true,
  objIds: true, objScan: true, objTrails: true, objTrailLength: 24, objVelocity: true,
  objLock: true, objRadar: true, objRange: true, objHistogram: true, objPredict: false, objPredictMs: 900,

  faceModel: 'landmarker', faceMax: 2, faceDetectConf: 0.5,
  faceMesh: true, faceMeshStyle: 'neon', faceContour: true, facePoints: false, facePointSize: 1.25,
  faceIris: true, faceGaze: false, faceHead: true, faceGizmo: true, faceBlend: true, faceBlendCount: 6,
  faceExpr: true, faceBlinks: true, faceBBox: true,

  showBones: true, boneStyle: 'neon', boneWidth: 3, depthWidth: true, palmMesh: true,
  showJoints: true, jointShape: 'ring', jointSize: 4.5, tipHighlight: true, showIndices: false, showAngles: false,
  colorMode: 'accent', accent: '#9fc9a6', secondary: '#d4a24c', opacity: 1,

  tracers: true, tracerStyle: 'ribbon', tracerLength: 28, tracerWidth: 4, tracerTips: 'index',
  crosshairs: true, crosshairStyle: 'tactical', crosshairTips: 'index', crosshairSize: 26, coords: true,
  bbox: true, palmHud: false, pointRay: false, velocity: false,
  pinchLine: true, spanGauge: false, hull: false,

  hand3d: false, hand3dStyle: 'mannequin', hand3dOpacity: 0.92, hand3dThickness: 1, hand3dDepth: 1,
  hand3dGlow: false, hand3dTint: '#9fc9a6', hand3dOrbit: false, lightOrbit: true, lightIntensity: 1.2, hand3dShadow: true,

  armTracking: true, poseModel: 'lite', poseEvery: 1, armStyle: 'bone', armWidth: 8, elbowAngle: true, shoulders: false, arm3d: true, forearmEstimate: true,

  mirror: true, videoFit: 'cover', videoDim: 0.85, videoBlur: 0,
  grid: false, gridStyle: 'lines', scanlines: false, vignette: true, frameHud: true, scanSweep: false,

  telemetry: true, fpsGraph: true, handLabels: true, gestures: true, gestureToast: true, swapHands: false,
  boresight: true, boresightStyle: 'mil', boresightSize: 70,
  headingTape: true, rangeFinder: true, targetLock: true, radar: true,
  radarSize: 64, radarRings: true, radarSweep: true, tacColor: '#9fc9a6',
  gestureCommands: false, uiAccent: '#9fc9a6', reduceMotion: false, keepAwake: true,

  dataLog: false, dataLogHz: '30', shotWatermark: true, recBitrate: '8',
  motionCapture: false, motionWindow: 8,
};
