// Hand topology, filtering and gesture analysis.

export const FINGERS = {
  thumb: [1, 2, 3, 4],
  index: [5, 6, 7, 8],
  middle: [9, 10, 11, 12],
  ring: [13, 14, 15, 16],
  pinky: [17, 18, 19, 20],
};
export const FINGER_NAMES = ['thumb', 'index', 'middle', 'ring', 'pinky'];
export const TIPS = [4, 8, 12, 16, 20];

export const HAND_BONES = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [0, 17], [17, 18], [18, 19], [19, 20],
];

// Which finger a landmark belongs to (0 = palm/wrist)
export const LANDMARK_FINGER = (() => {
  const a = new Array(21).fill(-1);
  FINGER_NAMES.forEach((n, fi) => FINGERS[n].forEach((i) => (a[i] = fi)));
  a[0] = -1;
  return a;
})();

export const PALM_TRIS = [
  [0, 1, 5], [0, 5, 9], [0, 9, 13], [0, 13, 17], [1, 2, 5],
];

export const tipsFor = (mode) =>
  mode === 'all' ? TIPS : mode === 'thumbIndex' ? [4, 8] : [8];

// MediaPipe Pose (33 landmarks) — full body skeleton connections.
export const POSE_BONES = [
  [0, 1], [1, 2], [2, 3], [3, 7], [0, 4], [4, 5], [5, 6], [6, 8],
  [9, 10], [11, 12], [11, 13], [13, 15], [15, 17], [15, 19], [15, 21], [17, 19],
  [12, 14], [14, 16], [16, 18], [16, 20], [16, 22], [18, 20],
  [11, 23], [12, 24], [23, 24],
  [23, 25], [25, 27], [27, 29], [27, 31], [29, 31],
  [24, 26], [26, 28], [28, 30], [28, 32], [30, 32],
];

// MediaPipe FaceMesh (478 landmarks) — contour rings for the wireframe.
export const FACE_RINGS = {
  oval: [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109],
  browL: [70, 63, 105, 66, 107, 55, 65, 52, 53, 46],
  browR: [300, 293, 334, 296, 336, 285, 295, 282, 283, 276],
  eyeL: [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246],
  eyeR: [263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466],
  lipsOuter: [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0, 37, 39, 40, 185],
  lipsInner: [78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308, 415, 310, 311, 312, 13, 82, 81, 80, 191],
  irisL: [468, 469, 470, 471, 472],
  irisR: [473, 474, 475, 476, 477],
};

// ---------- One-Euro filter ----------
class LowPass {
  constructor() { this.y = null; }
  filter(x, a) { this.y = this.y === null ? x : a * x + (1 - a) * this.y; return this.y; }
}
const alpha = (cutoff, dt) => { const tau = 1 / (2 * Math.PI * cutoff); return 1 / (1 + tau / dt); };

export class OneEuro {
  constructor() { this.x = new LowPass(); this.dx = new LowPass(); this.last = null; this.vel = 0; }
  reset() { this.x = new LowPass(); this.dx = new LowPass(); this.last = null; this.vel = 0; }
  filter(value, t, minCutoff, beta, dCutoff = 1.0) {
    if (this.last === null) { this.last = t; this.vel = 0; return this.x.filter(value, 1); }
    const dt = Math.max(1e-3, (t - this.last) / 1000);
    this.last = t;
    const prev = this.x.y;
    const d = (value - prev) / dt;
    const ed = this.dx.filter(d, alpha(dCutoff, dt));
    this.vel = ed;
    const cutoff = minCutoff + beta * Math.abs(ed);
    return this.x.filter(value, alpha(cutoff, dt));
  }
}

// Filters a full 21-point hand (x,y,z per point)
export class HandFilter {
  constructor(n = 21) { this.f = Array.from({ length: n * 3 }, () => new OneEuro()); this.n = n; }
  reset() { this.f.forEach((f) => f.reset()); }
  apply(points, t, opts) {
    const out = new Array(points.length);
    const pred = (opts.prediction || 0) / 1000;
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      const fx = this.f[i * 3], fy = this.f[i * 3 + 1], fz = this.f[i * 3 + 2];
      let x, y, z;
      if (opts.smoothing) {
        // Scale-aware cutoff: normalized coords move ~1 unit across frame, so beta is amplified.
        x = fx.filter(p.x, t, opts.minCutoff, opts.beta * 40);
        y = fy.filter(p.y, t, opts.minCutoff, opts.beta * 40);
        z = fz.filter(p.z, t, opts.minCutoff, opts.beta * 40);
      } else {
        x = fx.filter(p.x, t, 1e4, 0); y = fy.filter(p.y, t, 1e4, 0); z = fz.filter(p.z, t, 1e4, 0);
      }
      if (pred) { x += clamp(fx.vel, -3, 3) * pred; y += clamp(fy.vel, -3, 3) * pred; }
      out[i] = { x, y, z, vx: fx.vel, vy: fy.vel };
    }
    return out;
  }
}

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const dist2 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const dist3 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, (a.z || 0) - (b.z || 0));

// Angle at joint b formed by a-b-c, in degrees (3D)
export function jointAngle(a, b, c) {
  const v1 = [a.x - b.x, a.y - b.y, (a.z || 0) - (b.z || 0)];
  const v2 = [c.x - b.x, c.y - b.y, (c.z || 0) - (b.z || 0)];
  const d = v1[0] * v2[0] + v1[1] * v2[1] + v1[2] * v2[2];
  const m = Math.hypot(...v1) * Math.hypot(...v2) || 1;
  return (Math.acos(clamp(d / m, -1, 1)) * 180) / Math.PI;
}

// Convex hull (monotone chain) on 2D points [{x,y}]
export function convexHull(pts) {
  const p = pts.slice().sort((a, b) => a.x - b.x || a.y - b.y);
  if (p.length < 3) return p;
  const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower = [];
  for (const pt of p) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], pt) <= 0) lower.pop(); lower.push(pt); }
  const upper = [];
  for (let i = p.length - 1; i >= 0; i--) { const pt = p[i]; while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], pt) <= 0) upper.pop(); upper.push(pt); }
  upper.pop(); lower.pop();
  return lower.concat(upper);
}

// ---------- Gesture analysis (uses world landmarks when available, metric space) ----------
function extended(w, f) {
  const [mcp, pip, , tip] = FINGERS[f];
  const wrist = w[0];
  // Tip farther from wrist than PIP, and finger reasonably straight
  const straight = jointAngle(w[mcp], w[pip], w[tip]) > 140;
  return dist3(w[tip], wrist) > dist3(w[pip], wrist) * 1.12 && straight;
}
function thumbOut(w) {
  // Thumb tip far from index MCP relative to palm width
  const palm = dist3(w[5], w[17]) || 1;
  return dist3(w[4], w[9]) / palm > 0.95 && jointAngle(w[2], w[3], w[4]) > 140;
}

export function analyseHand(lm, world) {
  const w = world && world.length === 21 ? world : lm;
  const palm = dist3(w[0], w[9]) || 1;
  const pinchDist = dist3(w[4], w[8]) / palm; // normalized
  const ext = {
    thumb: thumbOut(w), index: extended(w, 'index'), middle: extended(w, 'middle'),
    ring: extended(w, 'ring'), pinky: extended(w, 'pinky'),
  };
  const count = Object.values(ext).filter(Boolean).length;
  const pinching = pinchDist < 0.32;
  let g = 'Unknown';
  const { thumb, index, middle, ring, pinky } = ext;
  if (pinching && middle && ring && pinky) g = 'OK';
  else if (pinching && !middle && !ring) g = 'Pinch';
  else if (count === 5) g = 'Open palm';
  else if (!index && !middle && !ring && !pinky && thumb) {
    g = lm[4].y < lm[2].y - 0.02 ? 'Thumbs up' : lm[4].y > lm[2].y + 0.02 ? 'Thumbs down' : 'Thumb';
  }
  else if (!thumb && !index && !middle && !ring && !pinky) g = 'Fist';
  else if (index && !middle && !ring && !pinky) g = thumb ? 'L-shape' : 'Point';
  else if (index && middle && !ring && !pinky) g = 'Peace';
  else if (index && !middle && !ring && pinky) g = thumb ? 'Love' : 'Rock';
  else if (thumb && !index && !middle && !ring && pinky) g = 'Call me';
  else if (index && middle && ring && !pinky) g = 'Three';
  else if (index && middle && ring && pinky && !thumb) g = 'Four';
  return { gesture: g, pinchDist, pinching, extended: ext, count };
}

const ML_NAMES = {
  Closed_Fist: 'Fist', Open_Palm: 'Open palm', Pointing_Up: 'Point', Thumb_Down: 'Thumbs down',
  Thumb_Up: 'Thumbs up', Victory: 'Peace', ILoveYou: 'Love', None: 'Unknown',
};
export const mlGestureName = (n) => ML_NAMES[n] || n;

// Majority-vote smoother for gesture labels
export class GestureStabiliser {
  constructor(n = 7) { this.n = n; this.buf = []; this.current = 'Unknown'; }
  push(label) {
    this.buf.push(label); if (this.buf.length > this.n) this.buf.shift();
    const counts = {}; let best = this.current, bc = 0;
    for (const l of this.buf) { counts[l] = (counts[l] || 0) + 1; if (counts[l] > bc) { bc = counts[l]; best = l; } }
    if (bc >= Math.ceil(this.n * 0.6)) this.current = best;
    return this.current;
  }
}
