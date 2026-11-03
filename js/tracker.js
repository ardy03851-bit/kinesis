// MediaPipe Tasks Vision wrapper.
// Modes: hands (landmarker/gesture + optional pose), body (pose skeleton),
// objects (COCO detector), face (478-pt mesh + blendshapes + head matrix).
const TV_VERSION = '1.1.1';
const TV_BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TV_VERSION}`;

const MODELS = {
  landmarker: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task',
  gesture: 'https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/latest/gesture_recognizer.task',
  pose: {
    lite: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task',
    full: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/latest/pose_landmarker_full.task',
    heavy: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/latest/pose_landmarker_heavy.task',
  },
  face: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task',
  objects: {
    int8: 'https://storage.googleapis.com/mediapipe-tasks/object_detector/efficientdet_lite0_uint8.tflite',
    fp16: 'https://storage.googleapis.com/mediapipe-tasks/object_detector/efficientdet_lite0_fp16.tflite',
    fp32: 'https://storage.googleapis.com/mediapipe-tasks/object_detector/efficientdet_lite0_fp32.tflite',
  },
};

let visionModule = null;
let fileset = null;

async function loadVision(log) {
  if (!visionModule) {
    log?.('Loading vision runtime', 'tasks-vision ' + TV_VERSION);
    visionModule = await import(`${TV_BASE}/vision_bundle.mjs`);
  }
  if (!fileset) {
    log?.('Initialising WebAssembly', 'SIMD fileset');
    fileset = await visionModule.FilesetResolver.forVisionTasks(`${TV_BASE}/wasm`);
  }
  return visionModule;
}

export class Tracker {
  constructor() {
    this.hand = null; this.pose = null; this.objects = null; this.face = null;
    this.cfg = null; this.kind = null;
    this.lastTs = -1; this.frame = 0; this.lastPose = null; this.activeDelegate = null;
  }

  // True when a runner is loaded for the active mode (hands / body / objects / face).
  get ready() { return !!(this.hand || this.pose || this.objects || this.face); }

  async init(cfg, log) {
    const V = await loadVision(log);
    this.close();
    this.cfg = { ...cfg };
    this.kind = cfg.trackingMode || 'hands';
    const makeOpts = (model, delegate) => ({
      baseOptions: { modelAssetPath: model, delegate },
      runningMode: 'VIDEO',
    });
    const tryCreate = async (Cls, extra, model, label, delegateOverride = null, timeoutMs = 4000) => {
      const useDelegate = delegateOverride || cfg.delegate;
      const withTimeout = (p, ms) => Promise.race([
        p,
        new Promise((_, rej) => setTimeout(() => rej(new Error(`timed out after ${ms}ms`)), ms)),
      ]);
      try {
        log?.(`Loading ${label}`, `${useDelegate} delegate`);
        const o = await withTimeout(Cls.createFromOptions(fileset, { ...makeOpts(model, useDelegate), ...extra }), timeoutMs);
        this.activeDelegate = useDelegate;
        return o;
      } catch (e) {
        if (useDelegate === 'GPU') {
          console.warn('GPU delegate failed or hung, falling back to CPU', e);
          log?.(`Retrying ${label}`, 'CPU fallback');
          try {
            const o = await withTimeout(Cls.createFromOptions(fileset, { ...makeOpts(model, 'CPU'), ...extra }), timeoutMs * 2);
            this.activeDelegate = 'CPU';
            return o;
          } catch (e2) {
            console.warn('CPU fallback also failed for ' + label, e2);
            throw e2;
          }
        }
        throw e;
      }
    };

    if (this.kind === 'objects') {
      // EfficientDet's GPU delegate hangs on several browsers (notably Safari/WKWebView)
      // — run the detector on CPU, which is fast for this model family.
      this.objects = await tryCreate(V.ObjectDetector, {
        scoreThreshold: cfg.objScore, maxResults: cfg.objMax,
      }, MODELS.objects[cfg.objModel] || MODELS.objects.int8, 'object detector (COCO-80)', 'CPU');
    } else if (this.kind === 'face') {
      this.face = await tryCreate(V.FaceLandmarker, {
        numFaces: cfg.faceMax,
        minFaceDetectionConfidence: cfg.faceDetectConf,
        outputFaceBlendshapes: true,
        outputFacialTransformationMatrixes: true,
      }, MODELS.face, 'face landmarker (478 pts)');
    } else {
      // hands or body
      if (this.kind === 'hands') {
        const handOpts = {
          numHands: cfg.numHands,
          minHandDetectionConfidence: cfg.detectConf,
          minHandPresenceConfidence: cfg.presenceConf,
          minTrackingConfidence: cfg.trackConf,
        };
        if (cfg.handModel === 'gesture') {
          this.hand = await tryCreate(V.GestureRecognizer, handOpts, MODELS.gesture, 'gesture recognizer');
        } else {
          this.hand = await tryCreate(V.HandLandmarker, handOpts, MODELS.landmarker, 'hand landmarker');
        }
      }
      if (this.kind === 'body' || cfg.armTracking) {
        this.pose = await tryCreate(V.PoseLandmarker, {
          numPoses: 1,
          minPoseDetectionConfidence: cfg.bodyPoseConf,
          minPosePresenceConfidence: cfg.bodyPoseConf,
          minTrackingConfidence: this.kind === 'body' ? cfg.bodyTrackConf : 0.5,
        }, MODELS.pose[cfg.poseModel] || MODELS.pose.lite, `pose model (${cfg.poseModel})`);
      }
    }
    this.lastTs = -1;
    return this;
  }

  close() {
    try { this.hand?.close(); } catch {}
    try { this.pose?.close(); } catch {}
    try { this.objects?.close(); } catch {}
    try { this.face?.close(); } catch {}
    this.hand = null; this.pose = null; this.objects = null; this.face = null; this.lastPose = null;
  }

  // Returns { hands, pose, objects, faces, ms } depending on the active mode.
  detect(video, ts, poseEvery = 1) {
    if (ts <= this.lastTs) ts = this.lastTs + 1;
    this.lastTs = ts;
    const t0 = performance.now();

    if (this.kind === 'objects' && this.objects) {
      const res = this.objects.detectForVideo(video, ts);
      const ms = performance.now() - t0;
      return { objects: res.detections || [], ms };
    }

    if (this.kind === 'face' && this.face) {
      const res = this.face.detectForVideo(video, ts);
      const ms = performance.now() - t0;
      const faces = (res.faceLandmarks || []).map((lm, i) => ({
        landmarks: lm,
        blend: res.faceBlendshapes?.[i]?.categories || null,
        matrix: res.facialTransformationMatrixes?.[i] || null,
      }));
      return { faces, ms };
    }

    if (!this.hand && !this.pose) return null;

    let hr = null;
    if (this.hand) {
      hr = this.kind === 'gesture' ? this.hand.recognizeForVideo(video, ts) : this.hand.detectForVideo(video, ts);
    }
    const handMs = performance.now() - t0;

    let poseMs = 0;
    if (this.pose) {
      this.frame++;
      if (this.frame % Math.max(1, poseEvery) === 0 || !this.lastPose) {
        const t1 = performance.now();
        const pr = this.pose.detectForVideo(video, ts);
        poseMs = performance.now() - t1;
        this.lastPose = pr.landmarks?.[0] || null;
      }
    }

    const hands = [];
    if (hr) {
      const n = hr.landmarks?.length || 0;
      const handed = hr.handedness || hr.handednesses || [];
      for (let i = 0; i < n; i++) {
        const h = handed[i]?.[0];
        hands.push({
          landmarks: hr.landmarks[i],
          world: hr.worldLandmarks?.[i],
          // Raw camera frames are not mirrored, MediaPipe assumes they are — invert.
          handedness: h ? (h.categoryName === 'Left' ? 'Right' : 'Left') : 'Unknown',
          score: h?.score ?? 0,
          mlGesture: hr.gestures?.[i]?.[0] ? { name: hr.gestures[i][0].categoryName, score: hr.gestures[i][0].score } : null,
        });
      }
    }
    return { hands, pose: this.pose ? this.lastPose : null, handMs, poseMs, ms: handMs + poseMs };
  }
}
