// MediaPipe Tasks Vision wrapper: hands (landmarker or gesture recognizer) + optional pose.
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
    this.hand = null; this.pose = null; this.cfg = null; this.kind = null;
    this.lastTs = -1; this.frame = 0; this.lastPose = null; this.activeDelegate = null;
  }

  async init(cfg, log) {
    const V = await loadVision(log);
    this.close();
    this.cfg = { ...cfg };
    const makeOpts = (model, delegate) => ({
      baseOptions: { modelAssetPath: model, delegate },
      runningMode: 'VIDEO',
    });
    const tryCreate = async (Cls, extra, model, label) => {
      try {
        log?.(`Loading ${label}`, `${cfg.delegate} delegate`);
        const o = await Cls.createFromOptions(fileset, { ...makeOpts(model, cfg.delegate), ...extra });
        this.activeDelegate = cfg.delegate;
        return o;
      } catch (e) {
        if (cfg.delegate === 'GPU') {
          console.warn('GPU delegate failed, falling back to CPU', e);
          log?.(`Retrying ${label}`, 'CPU fallback');
          this.activeDelegate = 'CPU';
          return Cls.createFromOptions(fileset, { ...makeOpts(model, 'CPU'), ...extra });
        }
        throw e;
      }
    };

    const handOpts = {
      numHands: cfg.numHands,
      minHandDetectionConfidence: cfg.detectConf,
      minHandPresenceConfidence: cfg.presenceConf,
      minTrackingConfidence: cfg.trackConf,
    };
    this.kind = cfg.handModel;
    if (cfg.handModel === 'gesture') {
      this.hand = await tryCreate(V.GestureRecognizer, handOpts, MODELS.gesture, 'gesture recognizer');
    } else {
      this.hand = await tryCreate(V.HandLandmarker, handOpts, MODELS.landmarker, 'hand landmarker');
    }
    if (cfg.armTracking) {
      this.pose = await tryCreate(V.PoseLandmarker, {
        numPoses: 1, minPoseDetectionConfidence: 0.5, minPosePresenceConfidence: 0.5, minTrackingConfidence: 0.5,
      }, MODELS.pose[cfg.poseModel] || MODELS.pose.lite, `pose model (${cfg.poseModel})`);
    }
    this.lastTs = -1;
    return this;
  }

  close() {
    try { this.hand?.close(); } catch {}
    try { this.pose?.close(); } catch {}
    this.hand = null; this.pose = null; this.lastPose = null;
  }

  // Returns { hands: [{landmarks, world, handedness, score, mlGesture}], pose, ms }
  detect(video, ts, poseEvery = 1) {
    if (!this.hand) return null;
    if (ts <= this.lastTs) ts = this.lastTs + 1;
    this.lastTs = ts;
    const t0 = performance.now();
    let hr;
    if (this.kind === 'gesture') hr = this.hand.recognizeForVideo(video, ts);
    else hr = this.hand.detectForVideo(video, ts);
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
    return { hands, pose: this.pose ? this.lastPose : null, handMs, poseMs, ms: handMs + poseMs };
  }
}
