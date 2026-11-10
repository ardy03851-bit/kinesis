// Kinesis — app controller.
import { DEFAULTS, STORAGE_KEY, SCHEMA } from './config.js';
import { hydrateIcons, icon } from './icons.js';
import { Tracker } from './tracker.js';
import { HandFilter, OneEuro, GestureStabiliser, analyseHand, mlGestureName, dist3, clamp, jointAngle } from './geometry.js';
import { Overlay2D } from './overlay2d.js';
import { SettingsUI, findControl } from './settings-ui.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

// ---------------- state ----------------
const S = loadSettings();
function loadSettings() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch {}
  const st = { ...DEFAULTS, ...saved };
  const m = location.hash.match(/cfg=([^&]+)/);
  if (m) { try { Object.assign(st, JSON.parse(decodeURIComponent(escape(atob(m[1]))))); } catch {} }
  for (const k of Object.keys(st)) if (!(k in DEFAULTS)) delete st[k];
  return st;
}
let saveTimer = 0;
const persist = () => { clearTimeout(saveTimer); saveTimer = setTimeout(() => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(S)); } catch {} }, 250); };

// ---------------- elements ----------------
const video = $('#video');
const stage = $('#stage');
const c2d = $('#overlay');
const c3d = $('#gl');
const overlay = new Overlay2D(c2d);
let hand3d = null; // lazy-loaded
const tracker = new Tracker();

// ---------------- toasts ----------------
function toast(msg, kind = 'info', ic = 'info') {
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.innerHTML = `${icon(ic)}<span>${msg}</span>`;
  $('#toasts').appendChild(el);
  const life = kind === 'award' ? 4200 : 2600;
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 400); }, life);
}

// ---------------- personality ----------------
// Kinesis keeps its instrumentation dead serious, but talks like an
// over-enthusiastic lab assistant. `S.playful` switches the voice.
const QUIPS = {
  searching: ['Scanning for hands…', 'Where did your hands go?', 'Wave at the camera. Go on.', 'Still looking… don\u2019t be shy.'],
  tracking: ['Locked on. Very impressive.', 'Nailed it.', 'Hands: found. Science: happening.', 'Gotcha.'],
  greet: ['Tracking online — wiggle those fingers', 'All systems awake. Show me a hand.'],
};
function pick(list) { return list[Math.floor(Math.random() * list.length)]; }
function quip(kind, fallback) { return S.playful ? pick(QUIPS[kind]) : fallback; }

// ---------------- badges ----------------
const BADGES = {
  'first-hand': { label: 'First contact', desc: 'A hand appeared. Historic.', ic: 'hand' },
  'first-gesture': { label: 'Gesture master', desc: 'First gesture recognised.', ic: 'sparkles' },
  'first-capture': { label: 'Photographer', desc: 'First still captured.', ic: 'aperture' },
  'first-recording': { label: 'Director', desc: 'First recording saved.', ic: 'video' },
  'explorer': { label: 'Explorer', desc: 'Tried all four tracking modes.', ic: 'scan-search' },
  'graduate': { label: 'Certified operator', desc: 'Completed training mode.', ic: 'graduation-cap' },
  'marathon': { label: 'Marathon', desc: 'Five minutes of continuous tracking.', ic: 'timer' },
  'high-five': { label: 'High five', desc: 'Two hands, one celebration.', ic: 'party-popper' },
};
let badgeSet = new Set();
try { badgeSet = new Set(JSON.parse(localStorage.getItem('kinesis.badges') || '[]')); } catch {}
function awardBadge(key) {
  if (badgeSet.has(key) || !S.playful) return;
  const b = BADGES[key]; if (!b) return;
  badgeSet.add(key);
  try { localStorage.setItem('kinesis.badges', JSON.stringify([...badgeSet])); } catch {}
  toast(`<b>Badge earned — ${b.label}</b><span> · ${b.desc}</span>`, 'award', b.ic);
}

// ---------------- session stats ----------------
const session = { startedAt: 0, gestures: 0, highFived: 0, modesTried: new Set(), lastHighFive: 0 };

// ---------------- layout / mapping ----------------
const L = { w: 1, h: 1, vw: 1280, vh: 720, s: 1, ox: 0, oy: 0, dpr: 1 };
function layout() {
  const r = stage.getBoundingClientRect();
  L.w = Math.max(1, Math.round(r.width)); L.h = Math.max(1, Math.round(r.height));
  L.vw = video.videoWidth || 1280; L.vh = video.videoHeight || 720;
  L.s = S.videoFit === 'contain' ? Math.min(L.w / L.vw, L.h / L.vh) : Math.max(L.w / L.vw, L.h / L.vh);
  L.ox = (L.w - L.vw * L.s) / 2; L.oy = (L.h - L.vh * L.s) / 2;
  L.dpr = Math.min(3, (window.devicePixelRatio || 1) * S.renderScale * adaptiveLevel);
  overlay.resize(L.w, L.h, L.dpr);
  hand3d?.resize(L.w, L.h, Math.min(2, L.dpr));
  video.style.objectFit = S.videoFit;
}
const map = (nx, ny) => {
  let x = L.ox + nx * L.vw * L.s;
  if (S.mirror) x = L.w - x;
  return { x, y: L.oy + ny * L.vh * L.s };
};
new ResizeObserver(() => layout()).observe(stage);

// ---------------- video treatment ----------------
function videoFilterCSS() {
  const parts = [];
  if (S.videoDim !== 1) parts.push(`brightness(${S.videoDim})`);
  if (S.videoBlur) parts.push(`blur(${S.videoBlur}px)`);
  return parts.filter(Boolean).join(' ');
}
function applyVisuals() {
  video.style.filter = videoFilterCSS() || 'none';
  video.classList.toggle('mirrored', !!S.mirror);
  const root = document.documentElement;
  root.style.setProperty('--accent', S.uiAccent);
  document.body.classList.toggle('reduce-motion', !!S.reduceMotion);
  stage.classList.toggle('fx-grid', !!S.grid);
  stage.dataset.grid = S.gridStyle || 'lines';
  stage.classList.toggle('fx-scan', !!S.scanlines);
  stage.classList.toggle('fx-vignette', !!S.vignette);
  stage.classList.toggle('fx-frame', !!S.frameHud);
  stage.classList.toggle('fx-sweep', !!S.scanSweep);
  c3d.style.filter = S.hand3d && S.hand3dShadow ? 'drop-shadow(0 14px 18px rgba(0,0,0,.45))' : 'none';
  $('#telemetry').classList.toggle('hidden', !S.telemetry);
  $('#spark').classList.toggle('hidden', !S.fpsGraph);
  c3d.classList.toggle('hidden', !S.hand3d);
  const handsOnly = S.trackingMode === 'hands';
  $('#btn-3d').classList.toggle('hidden', !handsOnly);
}

// ---------------- camera ----------------
let stream = null, facing = 'user', sourceKind = 'camera';
async function startCamera() {
  stopStream();
  const w = +S.resolution;
  const constraints = { audio: false, video: { facingMode: facing, width: { ideal: w }, height: { ideal: Math.round(w * 9 / 16) }, frameRate: { ideal: 60, max: 60 } } };
  stream = await navigator.mediaDevices.getUserMedia(constraints);
  video.srcObject = stream; video.src = '';
  sourceKind = 'camera';
  await video.play();
  await waitForDims();
  const st = stream.getVideoTracks()[0]?.getSettings?.() || {};
  $('#t-res').textContent = `${video.videoWidth}×${video.videoHeight}${st.frameRate ? ' @' + Math.round(st.frameRate) : ''}`;
  layout();
}
function stopStream() { stream?.getTracks().forEach((t) => t.stop()); stream = null; }
function waitForDims() {
  return new Promise((res) => {
    if (video.videoWidth) return res();
    const f = () => { if (video.videoWidth) { video.removeEventListener('loadedmetadata', f); res(); } };
    video.addEventListener('loadedmetadata', f); setTimeout(res, 3000);
  });
}
async function useVideoFile(file) {
  stopStream();
  video.srcObject = null;
  video.src = URL.createObjectURL(file);
  video.loop = true; video.muted = true;
  sourceKind = 'file';
  await video.play();
  await waitForDims();
  $('#t-res').textContent = `${video.videoWidth}×${video.videoHeight} file`;
  layout();
}

// ---------------- tracking state ----------------
let nextId = 1;
let tracks = [];
const poseFilters = Array.from({ length: 33 }, () => [new OneEuro(), new OneEuro(), new OneEuro()]);
let poseSmoothed = null;
const stats = { renderFps: 0, inferHz: 0, ms: 0, frames: 0, infers: 0, last: performance.now(), hist: [] };
let lastVideoTime = -1, lastInfer = 0;
let adaptiveLevel = 1, adaptiveStable = 0;

function ingest(res, now) {
  if (res.objects) ingestObjects(res.objects, now);
  if (res.faces) ingestFaces(res.faces, now);
  const dets = res.hands || [];
  const used = new Set();
  // greedy match by wrist distance
  const pairs = [];
  tracks.forEach((t, ti) => dets.forEach((d, di) => pairs.push([Math.hypot(t.raw[0].x - d.landmarks[0].x, t.raw[0].y - d.landmarks[0].y) + (t.handedness !== d.handedness ? 0.08 : 0), ti, di])));
  pairs.sort((a, b) => a[0] - b[0]);
  const tUsed = new Set();
  for (const [dd, ti, di] of pairs) {
    if (dd > 0.3 || tUsed.has(ti) || used.has(di)) continue;
    tUsed.add(ti); used.add(di); update(tracks[ti], dets[di], now);
  }
  dets.forEach((d, di) => {
    if (used.has(di)) return;
    const t = { id: nextId++, filter: new HandFilter(), stab: new GestureStabiliser(7), missing: 0, pinching: false, lastToast: 0, gesture: 'Unknown' };
    tracks.push(t); update(t, d, now);
    if (t.norm) awardBadge('first-hand');
  });
  tracks.forEach((t, ti) => { if (!tUsed.has(ti) && !t.fresh) t.missing++; t.fresh = false; });
  tracks = tracks.filter((t) => t.missing <= S.holdFrames);

  // pose
  if (res.pose) {
    const p = res.pose;
    poseSmoothed = p.map((q, i) => {
      const f = poseFilters[i];
      const mc = S.smoothing ? S.smoothMinCutoff * 0.8 : 1e4, b = S.smoothing ? S.smoothBeta * 40 : 0;
      const sm = { x: f[0].filter(q.x, now, mc, b), y: f[1].filter(q.y, now, mc, b), z: f[2].filter(q.z, now, mc, b), v: q.visibility ?? 1 };
      sm.vx = f[0].vel; sm.vy = f[1].vel;
      return sm;
    });
  } else if (!S.armTracking || S.trackingMode !== 'hands') poseSmoothed = null;
  else if (res.pose === null) poseSmoothed = null;
}

// ---------------- object tracks ----------------
let objTracks = [], objNext = 1;
function objCenter(b) { return { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 }; }
function ingestObjects(dets, now) {
  const VW = L.vw || 1, VH = L.vh || 1;
  const norm = (d) => ({
    cls: d.categories[0].categoryName,
    score: d.categories[0].score,
    x0: d.boundingBox.originX / VW, y0: d.boundingBox.originY / VH,
    x1: (d.boundingBox.originX + d.boundingBox.width) / VW, y1: (d.boundingBox.originY + d.boundingBox.height) / VH,
  });
  let nd = dets.map(norm).filter((d) => d.cls);
  if (S.objClassFilter && S.objClassFilter.trim()) {
    const allow = S.objClassFilter.split(',').map((c) => c.trim().toLowerCase()).filter(Boolean);
    nd = nd.filter((d) => allow.includes(d.cls.toLowerCase()));
  }
  const used = new Set();
  const pairs = [];
  objTracks.forEach((t, ti) => nd.forEach((d, di) => pairs.push([Math.hypot(objCenter(t.box).x - objCenter(d).x, objCenter(t.box).y - objCenter(d).y), ti, di])));
  pairs.sort((a, b) => a[0] - b[0]);
  const tUsed = new Set();
  for (const [dd, ti, di] of pairs) {
    if (dd > 0.22 || tUsed.has(ti) || used.has(di)) continue;
    tUsed.add(ti); used.add(di); updateObj(objTracks[ti], nd[di], now);
  }
  nd.forEach((d, di) => {
    if (used.has(di)) return;
    const t = { id: objNext++, cls: d.cls, score: d.score, box: { ...d }, hist: [], vx: 0, vy: 0, missing: 0, fresh: true };
    objTracks.push(t); updateObj(t, d, now);
  });
  objTracks.forEach((t, ti) => { if (!tUsed.has(ti) && !t.fresh) t.missing++; t.fresh = false; });
  objTracks = objTracks.filter((t) => t.missing <= S.holdFrames);
}
function updateObj(t, d, now) {
  const dt = Math.max(0.001, (now - (t.lastT || now)) / 1000);
  const prev = objCenter(t.box);
  t.box.x0 += (d.x0 - t.box.x0) * 0.5; t.box.y0 += (d.y0 - t.box.y0) * 0.5;
  t.box.x1 += (d.x1 - t.box.x1) * 0.5; t.box.y1 += (d.y1 - t.box.y1) * 0.5;
  t.score = t.score ? t.score * 0.7 + d.score * 0.3 : d.score;
  t.cls = d.cls; t.missing = 0; t.fresh = true; t.lastT = now;
  const c = objCenter(t.box);
  t.vx = t.vx * 0.6 + ((c.x - prev.x) * (L.vw || 1) / dt) * 0.4;
  t.vy = t.vy * 0.6 + ((c.y - prev.y) * (L.vh || 1) / dt) * 0.4;
  t.hist.push({ x: c.x, y: c.y });
  while (t.hist.length > S.objTrailLength) t.hist.shift();
}

// ---------------- face tracks ----------------
let faceTracks = [];
function ingestFaces(faces, now) {
  const n = Math.min(faces.length, S.faceMax || 2);
  const out = [];
  for (let i = 0; i < n; i++) {
    const f = faces[i];
    const prev = faceTracks[i];
    const lm = f.landmarks.map((p, j) => {
      if (prev && prev.lm[j]) {
        return { x: prev.lm[j].x + (p.x - prev.lm[j].x) * 0.55, y: prev.lm[j].y + (p.y - prev.lm[j].y) * 0.55, z: prev.lm[j].z + (p.z - prev.lm[j].z) * 0.55 };
      }
      return { x: p.x, y: p.y, z: p.z };
    });
    out.push({ lm, blend: f.blend, matrix: f.matrix ? (f.matrix.data || f.matrix) : null });
  }
  faceTracks = out;
}

function update(t, d, now) {
  t.raw = d.landmarks; t.world = d.world; t.handedness = d.handedness; t.score = d.score; t.missing = 0; t.fresh = true;
  t.norm = t.filter.apply(d.landmarks, now, { smoothing: S.smoothing, minCutoff: S.smoothMinCutoff, beta: S.smoothBeta, prediction: S.prediction });
  const a = analyseHand(t.norm, d.world);
  // hysteresis on pinch
  const wasPinch = t.pinching;
  t.pinching = wasPinch ? a.pinchDist < 0.42 : a.pinchDist < 0.28;
  a.pinching = t.pinching;
  t.pinchStart = !wasPinch && t.pinching;
  t.analysis = a;
  t.pinchMM = d.world ? dist3(d.world[4], d.world[8]) * 1000 : null;
  let label = a.gesture;
  if (d.mlGesture && d.mlGesture.name !== 'None' && d.mlGesture.score > 0.55) label = mlGestureName(d.mlGesture.name);
  else if (a.pinching && a.gesture !== 'OK') label = 'Pinch';
  const prev = t.gesture;
  t.gesture = t.stab.push(label);
  if (t.gesture !== prev && t.gesture !== 'Unknown') { session.gestures++; awardBadge('first-gesture'); }
  if (S.gestures && S.gestureToast && t.gesture !== prev && t.gesture !== 'Unknown' && now - t.lastToast > 1100) {
    t.lastToast = now; gestureFlash(t);
  }
}

const GESTURE_ICON = { 'Open palm': 'hand', Fist: 'circle-dot', Point: 'pointer', Peace: 'git-branch', 'Thumbs up': 'check', 'Thumbs down': 'triangle-alert', Rock: 'hand-metal', Love: 'sparkles', OK: 'circle-gauge', Pinch: 'mouse-pointer-click', 'Call me': 'smartphone', Three: 'layers', Four: 'grid-3x3', 'L-shape': 'scan', Thumb: 'hand' };
const GESTURE_QUIP = { 'Open palm': 'Hello there.', Fist: 'Solid grip.', Peace: 'Peace, indeed.', 'Thumbs up': 'Two thumbs way up.', Rock: 'Very rock and roll.', Love: 'Feeling the love.', OK: 'A-OK.', Pinch: 'A delicate pinch.', 'Thumbs down': 'Harsh, but noted.', 'Call me': 'Ring ring.', Point: 'Right over there.' };
let gestureTimer = 0;
function gestureFlash(t) {
  const el = $('#gesture');
  const hand = t.handedness === 'Unknown' ? '' : (S.swapHands ? (t.handedness === 'Left' ? 'Right' : 'Left') : t.handedness) + ' hand';
  const quipTxt = S.playful && GESTURE_QUIP[t.gesture] ? GESTURE_QUIP[t.gesture] : hand;
  el.innerHTML = `${icon(GESTURE_ICON[t.gesture] || 'hand')}<b>${t.gesture}</b><span>${quipTxt}</span>`;
  el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  clearTimeout(gestureTimer); gestureTimer = setTimeout(() => el.classList.remove('show'), 1400);
}

function buildScene(now, dt) {
  const zScale = L.vw * L.s;
  const live = tracks.filter((t) => t.norm);
  // stable slot ordering by id
  live.sort((a, b) => a.id - b.id);
  const hands = live.map((t, slot) => {
    const pts = t.norm.map((p) => map(p.x, p.y));
    const palm = Math.hypot(pts[0].x - pts[9].x, pts[0].y - pts[9].y);
    return {
      id: t.id, slot, norm: t.norm, pts, world: t.world, handedness: t.handedness, score: t.score,
      analysis: t.analysis, gesture: t.gesture, scale: clamp(palm / 110, 0.45, 2.4), zScale,
      pinchMM: t.pinchMM, pinchStart: t.pinchStart, paintDown: t.pinching, palmPx: palm,
    };
  });
  live.forEach((t) => (t.pinchStart = false));

  const arms = [];
  let shoulders = null;
  const attached = new Set();
  if (S.armTracking && poseSmoothed) {
    const P = poseSmoothed;
    for (const [side, si, ei, wi] of [['L', 11, 13, 15], ['R', 12, 14, 16]]) {
      const s = P[si], e = P[ei], w = P[wi];
      if (e.v < 0.35) continue;
      // nearest hand to pose wrist
      let best = null, bd = 0.16;
      hands.forEach((h) => { if (attached.has(h.id)) return; const d = Math.hypot(h.norm[0].x - w.x, h.norm[0].y - w.y); if (d < bd) { bd = d; best = h; } });
      if (!best && w.v < 0.45) continue;
      const wristScreen = best ? best.pts[0] : map(w.x, w.y);
      const elbowScreen = map(e.x, e.y);
      if (best) {
        // Reject implausible pose arms: forearm too short, or bent >95° against the hand axis.
        const fx = elbowScreen.x - wristScreen.x, fy = elbowScreen.y - wristScreen.y, fl = Math.hypot(fx, fy) || 1;
        const hx = best.pts[0].x - best.pts[9].x, hy = best.pts[0].y - best.pts[9].y, hl = Math.hypot(hx, hy) || 1;
        const cos = (fx * hx + fy * hy) / (fl * hl);
        if (fl < best.palmPx * 1.3 || cos < -0.08) continue;
        attached.add(best.id);
      }
      const aspect = L.vw / L.vh;
      const ang = jointAngle({ x: s.x * aspect, y: s.y, z: s.z * aspect }, { x: e.x * aspect, y: e.y, z: e.z * aspect }, { x: w.x * aspect, y: w.y, z: w.z * aspect });
      const zk = 0.3;
      arms.push({
        side, shoulder: map(s.x, s.y), elbow: elbowScreen, wrist: wristScreen,
        sz: -(s.z - w.z) * zScale * zk, ez: -(e.z - w.z) * zScale * zk,
        handId: best?.id ?? null, angle: ang, estimated: false,
      });
    }
    if (S.shoulders && P[11].v > 0.5 && P[12].v > 0.5) shoulders = [map(P[11].x, P[11].y), map(P[12].x, P[12].y)];
  }
  if (S.forearmEstimate) {
    for (const h of hands) {
      if (attached.has(h.id)) continue;
      const w = h.pts[0], m = h.pts[9];
      // forearm runs from wrist away from the middle knuckle; ~2.6 palm lengths long
      const dx = w.x - m.x, dy = w.y - m.y, Ln = Math.hypot(dx, dy) || 1;
      const k = 2.6;
      arms.push({
        side: h.handedness === 'Left' ? 'L' : 'R', shoulder: null,
        elbow: { x: w.x + dx / Ln * h.palmPx * k, y: w.y + dy / Ln * h.palmPx * k }, wrist: w,
        sz: 0, ez: 0, handId: h.id, angle: null, estimated: true,
      });
    }
  }
  return { hands, arms, shoulders, t: now, dt, map, w: L.w, h: L.h, aspect: L.vw / L.vh };
}

// ---------------- mode scenes ----------------
function buildModeScene(scene) {
  if (S.trackingMode === 'body' && poseSmoothed) {
    scene.body = { pts: poseSmoothed.map((p) => map(p.x, p.y)), lm: poseSmoothed };
  }
  if (S.trackingMode === 'objects') {
    scene.objects = objTracks.map((t) => {
      const a = map(t.box.x0, t.box.y0), b = map(t.box.x1, t.box.y1);
      return {
        id: t.id, cls: t.cls, score: t.score, vx: t.vx, vy: t.vy,
        hist: t.hist.map((p) => map(p.x, p.y)),
        rect: { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) },
      };
    });
  }
  if (S.trackingMode === 'face') {
    scene.faces = faceTracks.map((f) => ({ pts: f.lm.map((p) => map(p.x, p.y)), blend: f.blend, matrix: f.matrix }));
  }
  return scene;
}

// ---------------- main loop ----------------
let running = false, paused = false, captureReq = null, recorder = null, recCanvas = null, recCtx = null;
let lastFrame = performance.now();
let lastClock = 0, startedAt = performance.now();
const clockEl = document.getElementById('frame-clock');

function loop() {
  if (!running) return;
  requestAnimationFrame(loop);
  const now = performance.now();
  const dt = Math.min(0.1, (now - lastFrame) / 1000); lastFrame = now;
  stats.frames++;

  if (!paused && tracker.ready && video.readyState >= 2 && video.currentTime !== lastVideoTime) {
    const minGap = +S.targetFps ? 1000 / +S.targetFps - 2 : 0;
    if (now - lastInfer >= minGap) {
      lastVideoTime = video.currentTime; lastInfer = now;
      try {
        const res = tracker.detect(video, now, S.poseEvery);
        if (res) {
          ingest(res, now);
          stats.infers++; stats.ms = stats.ms ? stats.ms * 0.85 + res.ms * 0.15 : res.ms;
        }
      } catch (e) { console.error(e); }
    }
  }

  const scene = buildModeScene(buildScene(now, dt));
  overlay.render(S, scene);
  if (hand3d) hand3d.render(S, scene);

  checkHighFive(now, scene);
  coachTick(now, scene);
  if (session.startedAt && now - session.startedAt > 5 * 60 * 1000) awardBadge('marathon');

  if (captureReq) { const r = captureReq; captureReq = null; r(composite()); }
  if (recorder && recorder.state === 'recording') composite(recCanvas, recCtx);

  sampleDataLog(now);
  runGestureCommands(now);
  if (now - stats.last > 500) { updateTelemetry(now, scene); runAdaptiveQuality(now); }
  if (S.frameHud && now - lastClock > 40) {
    lastClock = now;
    const ms = now - startedAt, f = Math.floor((ms % 1000) / 1000 * 30), sec = Math.floor(ms / 1000);
    clockEl.textContent = `${String(Math.floor(sec / 3600)).padStart(2, '0')}:${String(Math.floor(sec / 60) % 60).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}:${String(f).padStart(2, '0')}`;
  }
}

function updateTelemetry(now, scene) {
  const el = (now - stats.last) / 1000;
  stats.renderFps = stats.frames / el; stats.inferHz = stats.infers / el;
  stats.frames = 0; stats.infers = 0; stats.last = now;
  stats.hist.push({ f: stats.renderFps, i: stats.inferHz, ms: stats.ms }); if (stats.hist.length > 60) stats.hist.shift();
  $('#t-fps').textContent = stats.renderFps.toFixed(0);
  $('#t-hz').textContent = stats.inferHz.toFixed(0);
  $('#t-ms').textContent = stats.ms.toFixed(1);
  $('#t-hands').textContent =
    S.trackingMode === 'objects' ? scene.objects.length :
    S.trackingMode === 'face' ? faceTracks.length :
    S.trackingMode === 'body' ? (scene.body ? 1 : 0) : scene.hands.length;
  const modeRows = {
    hands: () => {
      $('#t-gesture').textContent = S.gestures ? (scene.hands.map((h) => h.gesture).filter((g) => g !== 'Unknown').join(' / ') || '—') : 'off';
      $('#t-pinch').textContent = scene.hands[0]?.pinchMM != null ? scene.hands[0].pinchMM.toFixed(0) + ' mm' : '—';
      $('#t-arm').textContent = !S.armTracking ? 'off' : scene.arms.filter((a) => !a.estimated).length ? scene.arms.filter((a) => !a.estimated).map((a) => `${a.side} ${Math.round(a.angle)}°`).join(' · ') : 'searching';
    },
    body: () => {
      const B = scene.body;
      if (!B) { $('#t-gesture').textContent = '—'; $('#t-pinch').textContent = '—'; $('#t-arm').textContent = '—'; return; }
      const P = B.lm;
      $('#t-gesture').textContent = 'tracking';
      const mSh = { x: (P[11].x + P[12].x) / 2, y: (P[11].y + P[12].y) / 2 };
      const mHp = { x: (P[23].x + P[24].x) / 2, y: (P[23].y + P[24].y) / 2 };
      $('#t-pinch').textContent = (Math.atan2(mSh.x - mHp.x, mHp.y - mSh.y) * 180 / Math.PI).toFixed(0) + '° lean';
      const knee = (a, b, c) => Math.round(180 - jointAngle({ x: P[a].x * scene.aspect, y: P[a].y, z: P[a].z * scene.aspect }, { x: P[b].x * scene.aspect, y: P[b].y, z: P[b].z * scene.aspect }, { x: P[c].x * scene.aspect, y: P[c].y, z: P[c].z * scene.aspect })) + '°';
      $('#t-arm').textContent = `${knee(23, 25, 27)} · ${knee(24, 26, 28)}`;
    },
    objects: () => {
      const n = scene.objects.length;
      const cls = [...new Set(scene.objects.map((o) => o.cls))];
      $('#t-gesture').textContent = n ? `${n} contact${n > 1 ? 's' : ''}` : '—';
      $('#t-pinch').textContent = n ? `${cls.length} class${cls.length > 1 ? 'es' : ''}` : '—';
      $('#t-arm').textContent = n ? scene.objects[0].cls : '—';
    },
    face: () => {
      const n = faceTracks.length;
      const f = faceTracks[0];
      $('#t-gesture').textContent = n ? `${n} face${n > 1 ? 's' : ''}` : '—';
      if (f?.blend) {
        const top = f.blend.filter((c) => c.categoryName !== '_neutral').sort((a, b) => b.score - a.score)[0];
        $('#t-pinch').textContent = top ? top.categoryName : '—';
      } else $('#t-pinch').textContent = '—';
      if (f?.matrix) {
        const m = f.matrix;
        $('#t-arm').textContent = `y${(Math.atan2(m[8], m[10]) * 180 / Math.PI).toFixed(0)} p${(Math.asin(clamp(-m[9], -1, 1)) * 180 / Math.PI).toFixed(0)}`;
      } else $('#t-arm').textContent = '—';
    },
  };
  (modeRows[S.trackingMode] || modeRows.hands)();
  $('#chip-fps').textContent = `${stats.renderFps.toFixed(0)} FPS`;
  if (session.startedAt) {
    const s = Math.max(0, Math.floor((now - session.startedAt) / 1000));
    $('#t-session').textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }
  $('#t-gestures').textContent = session.gestures;
  const n = S.trackingMode === 'objects' ? scene.objects.length : S.trackingMode === 'face' ? faceTracks.length : scene.hands.length;
  const label = { hands: 'hand', body: 'body', objects: 'contact', face: 'face' }[S.trackingMode] || 'contact';
  const searching = S.trackingMode === 'body' ? !scene.body : n === 0;
  const searchMsg = S.playful
    ? (S.trackingMode === 'hands' ? stickyQuip('searching', now) : `Searching for ${label}s…`)
    : `Searching`;
  const trackMsg = S.playful && n === 1 && S.trackingMode === 'hands' ? `Tracking 1 hand — ${stickyQuip('tracking', now)}` : `Tracking ${n} ${label}${n > 1 ? 's' : ''}`;
  setStatus(paused ? 'paused' : searching ? 'search' : 'tracking', paused ? 'Paused' : searching ? searchMsg : trackMsg);
  drawSpark();
}

function drawSpark() {
  if (!S.fpsGraph || !S.telemetry) return;
  const cv = $('#spark'); const dpr = window.devicePixelRatio || 1;
  const w = cv.clientWidth, h = cv.clientHeight;
  if (cv.width !== w * dpr) { cv.width = w * dpr; cv.height = h * dpr; }
  const c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, w, h);
  const H = stats.hist; if (H.length < 2) return;
  const max = 70;
  const line = (key, color, fill) => {
    c.beginPath();
    H.forEach((p, i) => { const x = (i / 59) * w, y = h - (Math.min(max, p[key]) / max) * (h - 4) - 2; i ? c.lineTo(x, y) : c.moveTo(x, y); });
    c.strokeStyle = color; c.lineWidth = 1.4; c.stroke();
    if (fill) { c.lineTo(((H.length - 1) / 59) * w, h); c.lineTo(0, h); c.closePath(); c.fillStyle = fill; c.fill(); }
  };
  const acc = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#9fc9a6';
  line('f', acc, acc + '22');
  line('i', '#f5b84b');
}

let statusKind = '';
let quipHold = { text: '', until: 0 };
function stickyQuip(kind, now) {
  if (now > quipHold.until || quipHold.kind !== kind) { quipHold = { kind, text: pick(QUIPS[kind]), until: now + 5000 }; }
  return quipHold.text;
}
function setStatus(kind, text) {
  const chip = $('#status');
  if (statusKind !== kind) { chip.dataset.state = kind; statusKind = kind; }
  chip.querySelector('span').textContent = text;
}

// ---------------- capture & record ----------------
function composite(cv, cx) {
  if (!cv) { cv = document.createElement('canvas'); cx = cv.getContext('2d'); }
  const W = Math.round(L.w * L.dpr), H = Math.round(L.h * L.dpr);
  if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
  cx.save();
  cx.fillStyle = '#050607'; cx.fillRect(0, 0, W, H);
  try { cx.filter = videoFilterCSS() || 'none'; } catch {}
  cx.save();
  if (S.mirror) { cx.translate(W, 0); cx.scale(-1, 1); }
  cx.drawImage(video, L.ox * L.dpr, L.oy * L.dpr, L.vw * L.s * L.dpr, L.vh * L.s * L.dpr);
  cx.restore();
  cx.filter = 'none';
  if (S.hand3d && hand3d) cx.drawImage(c3d, 0, 0, W, H);
  cx.drawImage(c2d, 0, 0, W, H);
  if (S.shotWatermark) {
    cx.font = `600 ${12 * L.dpr}px "Geist Mono", monospace`; cx.fillStyle = 'rgba(255,255,255,.55)';
    cx.fillText('KINESIS · ' + new Date().toISOString().slice(0, 19).replace('T', ' '), 16 * L.dpr, H - 16 * L.dpr);
  }
  cx.restore();
  return cv;
}
async function saveBlob(blob, name) {
  const file = new File([blob], name, { type: blob.type });
  if (navigator.canShare?.({ files: [file] }) && /iPad|iPhone|Macintosh/.test(navigator.userAgent) && 'ontouchend' in document) {
    try { await navigator.share({ files: [file], title: 'Kinesis capture' }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
function capture() {
  if (!running) return;
  $('#flash').classList.remove('go'); void $('#flash').offsetWidth; $('#flash').classList.add('go');
  captureReq = (cv) => cv.toBlob((b) => { if (b) { saveBlob(b, `kinesis-${Date.now()}.png`); toast(S.playful ? 'Snap! Still captured.' : 'Still captured', 'ok', 'aperture'); awardBadge('first-capture'); } }, 'image/png');
}
function toggleRecord() {
  if (!running) return;
  const btn = $('#btn-rec');
  if (recorder && recorder.state === 'recording') { recorder.stop(); return; }
  if (typeof MediaRecorder === 'undefined') { toast('Recording is not supported in this browser', 'warn', 'triangle-alert'); return; }
  recCanvas = document.createElement('canvas'); recCtx = recCanvas.getContext('2d');
  composite(recCanvas, recCtx);
  const types = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'];
  const mime = types.find((t) => MediaRecorder.isTypeSupported?.(t)) || '';
  const chunks = [];
  try { recorder = new MediaRecorder(recCanvas.captureStream(30), mime ? { mimeType: mime, videoBitsPerSecond: (+S.recBitrate || 8) * 1e6 } : undefined); }
  catch { toast('Could not start recorder', 'warn', 'triangle-alert'); return; }
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  recorder.onstop = () => {
    btn.classList.remove('recording'); $('#rec-pill').classList.remove('show');
    const blob = new Blob(chunks, { type: recorder.mimeType || 'video/webm' });
    saveBlob(blob, `kinesis-${Date.now()}.${(recorder.mimeType || '').includes('mp4') ? 'mp4' : 'webm'}`);
    toast(S.playful ? 'Recording saved — future you will thank present you.' : 'Recording saved', 'ok', 'video'); recorder = null;
    awardBadge('first-recording');
  };
  recorder.start(250);
  btn.classList.add('recording'); $('#rec-pill').classList.add('show');
  const t0 = Date.now();
  const tick = () => { if (!recorder) return; const s = Math.floor((Date.now() - t0) / 1000); $('#rec-time').textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; setTimeout(tick, 500); };
  tick();
}

// ---------------- data stream & frame export ----------------
let dataLog = null; // { rows: [], lastT: 0, header: string[], mode }
function startDataLog() {
  if (dataLog) return;
  const mode = S.trackingMode;
  dataLog = { rows: [], lastT: 0, mode };
  toast(`Recording ${mode} stream at ${S.dataLogHz} Hz`, 'ok', 'download');
}
function stopDataLog(silent) {
  if (!dataLog) return;
  const { rows, mode } = dataLog;
  dataLog = null;
  if (!rows.length) { if (!silent) toast('Stream was empty', 'warn', 'triangle-alert'); return; }
  let header;
  if (mode === 'body') header = 't_ms,landmark,x,y,z,visibility';
  else if (mode === 'objects') header = 't_ms,track_id,class,score,x0,y0,x1,y1';
  else if (mode === 'face') header = 't_ms,face,yaw_deg,pitch_deg,roll_deg,blink_l,blink_r';
  else header = 't_ms,track_id,handedness,gesture,pinch_mm,landmark,x,y,z';
  const csv = [header, ...rows].join('\n');
  saveBlob(new Blob([csv], { type: 'text/csv' }), `kinesis-${mode}-${Date.now()}.csv`);
  if (!silent) toast(`Stream saved · ${rows.length} rows`, 'ok', 'download');
}
function sampleDataLog(now) {
  if (!dataLog || paused) return;
  const interval = 1000 / (+S.dataLogHz || 30);
  if (now - dataLog.lastT < interval) return;
  dataLog.lastT = now;
  const R = dataLog.rows;
  if (dataLog.mode === 'hands') {
    for (const t of tracks) {
      if (!t.norm) continue;
      const g = t.gesture || 'Unknown';
      for (let i = 0; i < t.norm.length; i++) {
        const p = t.norm[i];
        R.push([now.toFixed(1), t.id, t.handedness, g, t.pinchMM != null ? t.pinchMM.toFixed(1) : '', i, p.x.toFixed(5), p.y.toFixed(5), p.z.toFixed(5)].join(','));
      }
    }
  } else if (dataLog.mode === 'body' && poseSmoothed) {
    poseSmoothed.forEach((p, i) => R.push([now.toFixed(1), i, p.x.toFixed(5), p.y.toFixed(5), p.z.toFixed(5), (p.v ?? 1).toFixed(3)].join(',')));
  } else if (dataLog.mode === 'objects') {
    for (const t of objTracks) R.push([now.toFixed(1), t.id, t.cls, t.score.toFixed(3), t.box.x0.toFixed(4), t.box.y0.toFixed(4), t.box.x1.toFixed(4), t.box.y1.toFixed(4)].join(','));
  } else if (dataLog.mode === 'face') {
    faceTracks.forEach((f, i) => {
      let yaw = '', pitch = '', roll = '', bl = '', br = '';
      if (f.matrix) {
        const m = f.matrix;
        yaw = (Math.atan2(m[8], m[10]) * 180 / Math.PI).toFixed(1);
        pitch = (Math.asin(clamp(-m[9], -1, 1)) * 180 / Math.PI).toFixed(1);
        roll = (Math.atan2(m[1], m[5]) * 180 / Math.PI).toFixed(1);
      }
      const get = (n) => f.blend?.find((c) => c.categoryName === n)?.score.toFixed(3) ?? '';
      bl = get('eyeBlinkLeft'); br = get('eyeBlinkRight');
      R.push([now.toFixed(1), i, yaw, pitch, roll, bl, br].join(','));
    });
  }
}
function exportFrame() {
  if (!running) { toast('Start tracking first', 'warn', 'triangle-alert'); return; }
  const frame = {
    app: 'Kinesis', version: '4.0.0', captured: new Date().toISOString(),
    mode: S.trackingMode, video: { width: L.vw, height: L.vh, mirrored: !!S.mirror },
    stats: { renderFps: +stats.renderFps.toFixed(1), inferHz: +stats.inferHz.toFixed(1), inferenceMs: +stats.ms.toFixed(1) },
  };
  if (S.trackingMode === 'hands' || S.armTracking) {
    frame.hands = tracks.filter((t) => t.norm).map((t) => ({
      id: t.id, handedness: t.handedness, score: +t.score.toFixed(3), gesture: t.gesture,
      pinchMM: t.pinchMM != null ? +t.pinchMM.toFixed(1) : null,
      landmarks: t.norm.map((p) => [+p.x.toFixed(5), +p.y.toFixed(5), +p.z.toFixed(5)]),
    }));
  }
  if (poseSmoothed) frame.pose = poseSmoothed.map((p) => [+p.x.toFixed(5), +p.y.toFixed(5), +p.z.toFixed(5), +(p.v ?? 1).toFixed(3)]);
  if (S.trackingMode === 'objects') frame.objects = objTracks.map((t) => ({ id: t.id, class: t.cls, score: +t.score.toFixed(3), box: [t.box.x0, t.box.y0, t.box.x1, t.box.y1].map((v) => +v.toFixed(4)) }));
  if (S.trackingMode === 'face') frame.faces = faceTracks.map((f) => ({ landmarks: f.lm.map((p) => [+p.x.toFixed(5), +p.y.toFixed(5), +p.z.toFixed(5)]), headMatrix: f.matrix ? [...f.matrix].map((v) => +v.toFixed(4)) : null, blendshapes: f.blend ? f.blend.map((c) => [c.categoryName, +c.score.toFixed(3)]) : null }));
  saveBlob(new Blob([JSON.stringify(frame, null, 2)], { type: 'application/json' }), `kinesis-frame-${Date.now()}.json`);
  toast('Frame exported', 'ok', 'download');
}

// ---------------- high five ----------------
// Two open palms brought close together earn a celebration. Purely scientific.
function checkHighFive(now, scene) {
  if (!S.playful || S.trackingMode !== 'hands' || paused) return;
  if (scene.hands.length < 2 || now - session.lastHighFive < 4000) return;
  const [a, b] = scene.hands;
  if (a.gesture !== 'Open palm' || b.gesture !== 'Open palm') return;
  const d = Math.hypot(a.pts[0].x - b.pts[0].x, a.pts[0].y - b.pts[0].y);
  if (d < Math.max(a.palmPx, b.palmPx) * 1.6) {
    session.lastHighFive = now; session.highFived++;
    toast('High five! Great teamwork.', 'ok', 'party-popper');
    awardBadge('high-five');
  }
}

// ---------------- gesture commands ----------------
const cmdState = { pinchSince: 0, thumbsSince: 0, pinchDone: false, thumbsDone: false };
function runGestureCommands(now) {
  if (!S.gestureCommands || S.trackingMode !== 'hands' || paused) { cmdState.pinchSince = cmdState.thumbsSince = 0; return; }
  const live = tracks.filter((t) => t.norm);
  const pinching = live.some((t) => t.analysis?.pinching);
  const thumbs = live.some((t) => t.gesture === 'Thumbs up');
  if (pinching) {
    if (!cmdState.pinchSince) { cmdState.pinchSince = now; cmdState.pinchDone = false; }
    if (!cmdState.pinchDone && now - cmdState.pinchSince > 1000) { cmdState.pinchDone = true; capture(); }
  } else cmdState.pinchSince = 0;
  if (thumbs) {
    if (!cmdState.thumbsSince) { cmdState.thumbsSince = now; cmdState.thumbsDone = false; }
    if (!cmdState.thumbsDone && now - cmdState.thumbsSince > 1000) { cmdState.thumbsDone = true; toggleRecord(); }
  } else cmdState.thumbsSince = 0;
}

// ---------------- adaptive quality ----------------
function runAdaptiveQuality(now) {
  if (!S.adaptiveQuality) { if (adaptiveLevel !== 1) { adaptiveLevel = 1; layout(); } return; }
  // react at most twice a second, only to sustained trends
  if (now - adaptiveStable < 500) return;
  const fps = stats.renderFps;
  if (fps > 10 && fps < 40 && adaptiveLevel > 0.5) { adaptiveLevel = Math.max(0.5, adaptiveLevel - 0.25); adaptiveStable = now; layout(); }
  else if (fps >= 55 && adaptiveLevel < 1) { adaptiveLevel = Math.min(1, adaptiveLevel + 0.25); adaptiveStable = now; layout(); }
}

// ---------------- wake lock / fullscreen ----------------
let wakeLock = null;
async function updateWakeLock() {
  try {
    if (S.keepAwake && running && document.visibilityState === 'visible' && 'wakeLock' in navigator) { if (!wakeLock) { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => (wakeLock = null)); } }
    else if (wakeLock) { await wakeLock.release(); wakeLock = null; }
  } catch {}
}
document.addEventListener('visibilitychange', updateWakeLock);
function toggleFullscreen() {
  const d = document, el = d.documentElement;
  const fs = d.fullscreenElement || d.webkitFullscreenElement;
  if (fs) (d.exitFullscreen || d.webkitExitFullscreen)?.call(d);
  else (el.requestFullscreen || el.webkitRequestFullscreen)?.call(el)?.catch?.(() => toast('Fullscreen not available here — use Add to Home Screen', 'info', 'maximize'));
}

// ---------------- 3D lazy load ----------------
let loading3d = null;
async function ensure3D() {
  if (hand3d || loading3d) return loading3d;
  loading3d = import('./hand3d.js').then(({ Hand3D }) => {
    hand3d = new Hand3D(c3d); hand3d.resize(L.w, L.h, Math.min(2, L.dpr));
  }).catch((e) => { console.error(e); toast('3D renderer failed to load', 'warn', 'triangle-alert'); S.hand3d = false; });
  return loading3d;
}

// ---------------- reinit ----------------
let reinitTimer = 0, reinitBusy = false;
function scheduleReinit(kind) {
  clearTimeout(reinitTimer);
  reinitTimer = setTimeout(async () => {
    if (!running) return;
    if (kind === 'camera' && sourceKind === 'camera') {
      try { await startCamera(); toast('Camera reconfigured', 'ok', 'camera'); } catch (e) { toast('Camera error: ' + e.message, 'warn', 'camera-off'); }
      return;
    }
    if (reinitBusy) { scheduleReinit(kind); return; }
    reinitBusy = true;
    setStatus('loading', 'Reloading model');
    try {
      await tracker.init(S, (m) => setStatus('loading', m));
      tracks = []; poseSmoothed = null;
      toast(`Model ready · ${tracker.activeDelegate}`, 'ok', 'cpu');
    } catch (e) { console.error(e); toast('Model failed to load: ' + (e.message || e), 'warn', 'triangle-alert'); }
    reinitBusy = false;
    updateDiag();
  }, 450);
}

// ---------------- settings ----------------
const VISUAL_KEYS = new Set(['mirror', 'videoDim', 'videoBlur', 'grid', 'gridStyle', 'scanlines', 'vignette', 'frameHud', 'scanSweep', 'uiAccent', 'reduceMotion', 'telemetry', 'fpsGraph', 'hand3d', 'hand3dShadow']);
function setTrackingMode(v) {
  S.trackingMode = v;
  tracks = []; objTracks = []; faceTracks = []; poseSmoothed = null;
  applyVisuals(); ui.refresh();
  session.modesTried.add(v);
  if (session.modesTried.size >= 4) awardBadge('explorer');
  const MODE_MSG = { hands: 'Hands it is. Show me what you\u2019ve got.', body: 'Full-body mode — stand back a little.', objects: 'Object hunt: everything in frame is a suspect.', face: 'Face mode. Try not to blink… actually, do. It counts them.' };
  toast(S.playful ? (MODE_MSG[v] || `Tracking mode: ${v}`) : `Tracking mode: ${v}`, 'ok', 'cpu');
}

const ui = new SettingsUI({
  panel: $('#panel'), state: S,
  onChange(key, v, final) {
    if (final) return;
    const c = findControl(key);
    if (key === 'trackingMode') { setTrackingMode(v); }
    if (VISUAL_KEYS.has(key)) applyVisuals();
    if (key === 'hand3d' && v) ensure3D();
    if (key === 'renderScale' || key === 'videoFit') layout();
    if (key === 'keepAwake') updateWakeLock();
    if (key === 'dataLog') v ? startDataLog() : stopDataLog();
    if (c?.reinit) scheduleReinit('model');
    if (c?.reinitCamera) scheduleReinit('camera');
    persist();
  },
  onAction(a, arg) {
    if (a === 'exportFrame') { exportFrame(); }
    else if (a === 'loadFile') { $('#file-input').click(); }
    else if (a === 'reset') {
      const needReinit = ['handModel', 'delegate', 'numHands', 'armTracking', 'poseModel', 'detectConf', 'presenceConf', 'trackConf', 'trackingMode', 'objModel', 'objScore', 'objMax', 'faceMax', 'faceDetectConf', 'bodyPoseConf', 'bodyTrackConf'].some((k) => S[k] !== DEFAULTS[k]);
      if (S.dataLog) stopDataLog(true);
      Object.keys(S).forEach((k) => delete S[k]); Object.assign(S, DEFAULTS);
      tracks = []; objTracks = []; faceTracks = []; poseSmoothed = null;
      applyVisuals(); layout(); persist(); ui.refresh(); if (needReinit) scheduleReinit('model');
      toast('Defaults restored', 'ok', 'rotate-ccw');
    } else if (a === 'export') {
      saveBlob(new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' }), 'kinesis-settings.json');
    } else if (a === 'importData') {
      for (const k of Object.keys(arg)) if (k in DEFAULTS) S[k] = arg[k];
      if (S.dataLog) startDataLog();
      applyVisuals(); layout(); persist(); ui.refresh(); scheduleReinit('model'); if (S.hand3d) ensure3D();
      toast('Configuration imported', 'ok', 'folder-open');
    } else if (a === 'importError') toast('That file is not a valid configuration', 'warn', 'triangle-alert');
    else if (a === 'share') {
      const diff = {}; for (const k in DEFAULTS) if (S[k] !== DEFAULTS[k]) diff[k] = S[k];
      const url = location.href.split('#')[0] + '#cfg=' + btoa(unescape(encodeURIComponent(JSON.stringify(diff))));
      (navigator.clipboard?.writeText(url) || Promise.reject()).then(() => toast('Share link copied', 'ok', 'check'), () => { prompt?.('Copy this link', url); });
    } else if (a === 'rendered') { if (arg === 'system') updateDiag(); }
  },
});

function updateDiag() {
  const d = $('#diag'); if (!d) return;
  const gl = (() => { try { const c = document.createElement('canvas').getContext('webgl2'); const e = c?.getExtension('WEBGL_debug_renderer_info'); return e ? c.getParameter(e.UNMASKED_RENDERER_WEBGL) : c ? 'WebGL2' : 'none'; } catch { return 'unknown'; } })();
  d.innerHTML = [['Mode', S.trackingMode], ['Hand model', S.handModel === 'gesture' ? 'Gesture recognizer' : 'Hand landmarker'], ['Delegate', tracker.activeDelegate || '—'], ['Pose model', S.armTracking || S.trackingMode === 'body' ? S.poseModel : 'off'], ['Video', `${video.videoWidth}×${video.videoHeight}`], ['Pixel ratio', L.dpr.toFixed(2)], ['GPU', gl]]
    .map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('');
}

// ---------------- panel / chrome ----------------
const panel = $('#panel');
function setPanel(open) {
  panel.classList.toggle('open', open); document.body.classList.toggle('panel-open', open);
  $('#btn-settings').setAttribute('aria-expanded', String(open));
  if (open) requestAnimationFrame(() => ui.moveIndicator());
}
$('#btn-settings').addEventListener('click', () => setPanel(!panel.classList.contains('open')));
$('#panel-close').addEventListener('click', () => setPanel(false));
$('#btn-flip').addEventListener('click', async () => {
  facing = facing === 'user' ? 'environment' : 'user';
  S.mirror = facing === 'user'; applyVisuals(); persist();
  try { await startCamera(); toast(facing === 'user' ? 'Front camera' : 'Rear camera', 'ok', 'switch-camera'); ui.refresh(); }
  catch (e) { toast('Could not switch camera', 'warn', 'camera-off'); }
});
$('#btn-shot').addEventListener('click', capture);
$('#btn-rec').addEventListener('click', toggleRecord);
$('#btn-full').addEventListener('click', toggleFullscreen);
$('#btn-hide').addEventListener('click', () => setHidden(true));
$('#btn-show').addEventListener('click', () => setHidden(false));
$('#btn-pause').addEventListener('click', togglePause);
$('#btn-3d').addEventListener('click', () => { S.hand3d = !S.hand3d; if (S.hand3d) ensure3D(); applyVisuals(); persist(); syncQuick(); ui.refresh(); toast(S.hand3d ? '3D hand on' : '3D hand off', 'ok', 'box'); });
function syncQuick() { $('#btn-3d').classList.toggle('on', !!S.hand3d); }
function togglePause() {
  paused = !paused;
  if (sourceKind === 'file') paused ? video.pause() : video.play();
  $('#btn-pause').innerHTML = icon(paused ? 'play' : 'pause');
  setStatus(paused ? 'paused' : 'search', paused ? 'Paused' : 'Resuming');
}
let hidden = false;
function setHidden(h) { hidden = h; document.body.classList.toggle('ui-hidden', h); if (h) { setPanel(false); toast('Interface hidden — double-tap to show', 'info', 'eye-off'); } }
let lastTap = 0;
stage.addEventListener('pointerup', (e) => {
  const n = performance.now();
  if (n - lastTap < 320) { setHidden(!hidden); lastTap = 0; } else lastTap = n;
});
window.addEventListener('keydown', (e) => {
  if (e.target.closest('input,select,textarea')) return;
  const k = e.key.toLowerCase();
  if (k === 's') setPanel(!panel.classList.contains('open'));
  else if (k === 'h') setHidden(!hidden);
  else if (k === 'p') capture();
  else if (k === 'r') toggleRecord();
  else if (k === 'f') toggleFullscreen();
  else if (k === 'm') { S.mirror = !S.mirror; applyVisuals(); persist(); }
  else if (k === 'l') { S.dataLog = !S.dataLog; if (S.dataLog) startDataLog(); else stopDataLog(); persist(); ui.refresh(); }
  else if (k === '3') $('#btn-3d').click();
  else if (k === '1' || k === '2' || k === '4') {
    const m = { 1: 'hands', 2: 'body', 4: 'face' }[k];
    if (S.trackingMode !== m) { setTrackingMode(m); scheduleReinit('model'); }
  }
  else if (k === '9') {
    if (S.trackingMode !== 'objects') { setTrackingMode('objects'); scheduleReinit('model'); }
  }
  else if (k === ' ') { e.preventDefault(); togglePause(); }
  else if (k === 'escape') setPanel(false);
});

// ---------------- boot ----------------
// No landing menu: Kinesis boots straight into live tracking. The boot HUD
// narrates startup in the top bar, a gate card appears if the camera refuses,
// and first-time visitors get a playful training coach.
const bootHud = $('#boot-hud'), bootMsg = $('#boot-msg'), bootFill = $('#boot-fill');
let bootStep = 0;
function logBoot(msg, detail = '') {
  bootStep++;
  bootHud.classList.add('show');
  bootMsg.textContent = detail ? `${msg} — ${detail}` : msg;
  bootFill.style.width = Math.min(96, bootStep * 14) + '%';
}
function bootDone() {
  bootFill.style.width = '100%';
  setTimeout(() => bootHud.classList.remove('show'), 600);
}

let preload = null;
function preloadModels() {
  if (!preload) preload = tracker.init(S, logBoot).catch((e) => { preload = null; throw e; });
  return preload;
}

function showGate(e) {
  const denied = e && (e.name === 'NotAllowedError' || e.name === 'SecurityError');
  const nocam = e && (e.name === 'NotFoundError' || e.name === 'OverconstrainedError');
  $('#gate-title').textContent = S.playful
    ? (denied ? 'The camera is being shy' : nocam ? 'No camera in sight' : 'Hmm, that did not work')
    : (denied ? 'Camera access blocked' : nocam ? 'No camera found' : 'Startup failed');
  $('#gate-msg').textContent = denied
    ? 'Allow camera access for this site in your browser settings (on iPad: Settings \u203a Safari \u203a Camera), then try again.'
    : nocam
      ? 'Connect a camera, or load a video file to analyse footage instead.'
      : (e?.message || String(e));
  $('#gate').hidden = false;
  bootHud.classList.remove('show');
}

async function start(fromFile) {
  $('#gate').hidden = true;
  bootStep = 0;
  try {
    logBoot(fromFile ? 'Opening video file' : 'Starting camera', fromFile ? fromFile.name : (facing === 'user' ? 'front' : 'rear'));
    const camP = fromFile ? useVideoFile(fromFile) : startCamera();
    await camP;
    logBoot('Video stream online', `${video.videoWidth}\u00d7${video.videoHeight}`);
    await preloadModels();
    if (S.hand3d) { logBoot('Compiling 3D renderer', 'three.js'); await ensure3D(); }
    logBoot('Calibrating overlay', tracker.activeDelegate + ' inference');
    bootDone();
    document.body.classList.add('live');
    applyVisuals(); layout();
    running = true; lastFrame = startedAt = performance.now(); session.startedAt = performance.now();
    loop();
    updateWakeLock();
    updateDiag();
    toast(quip('greet', 'Tracking online'), 'ok', 'hand');
    startCoach();
  } catch (e) {
    console.error(e);
    showGate(e);
  }
}

// Fallback camera: some devices report the chosen facingMode but fail to open.
const origStartCamera = startCamera;

$('#gate-retry').addEventListener('click', () => start());
$('#gate-file').addEventListener('click', () => $('#file-input').click());
$('#file-input').addEventListener('change', (e) => { const f = e.target.files[0]; if (!f) return; if (running) useVideoFile(f).then(() => toast('Video source loaded', 'ok', 'video')); else start(f); });

// ---------------- training coach ----------------
// A three-step first-run tutorial that completes itself by watching the user
// actually do the thing. Serious instrumentation, gentlest possible teaching.
const COACH_STEPS = [
  { label: 'Show a hand to the camera', hint: 'Any hand will do. Both is showing off.' },
  { label: 'Make a shape — a fist, a point or a peace sign', hint: 'The gesture recogniser is watching. No pressure.' },
  { label: 'Pinch thumb and index together', hint: 'That\u2019s the capture trigger. You\u2019re basically qualified now.' },
];
const COACH_KEY = 'kinesis.onboarded.v1';
let coachStep = -1, coachHold = 0, coachDone = false;
function coachEl() { return $('#coach'); }
function startCoach() {
  if (S.trackingMode !== 'hands') { coachDone = true; return; }
  try { if (localStorage.getItem(COACH_KEY)) { coachDone = true; return; } } catch {}
  coachStep = 0; renderCoach();
  coachEl().hidden = false;
}
function renderCoach() {
  const ol = $('#coach-steps');
  ol.innerHTML = COACH_STEPS.map((s, i) =>
    `<li class="${i < coachStep ? 'done' : i === coachStep ? 'active' : ''}"><span class="st">${i < coachStep ? '' : i + 1}</span><span>${s.label}</span></li>`).join('');
  const s = COACH_STEPS[Math.min(coachStep, COACH_STEPS.length - 1)];
  $('#coach-hint').textContent = s ? s.hint : '';
}
function coachAdvance() {
  coachStep++;
  if (coachStep >= COACH_STEPS.length) {
    coachDone = true;
    coachEl().hidden = true;
    try { localStorage.setItem(COACH_KEY, '1'); } catch {}
    awardBadge('graduate');
    toast(S.playful ? 'Training complete. Certified Kinesis operator.' : 'Training complete', 'ok', 'graduation-cap');
    return;
  }
  renderCoach();
}
function coachTick(now, scene) {
  if (coachDone || coachStep < 0 || S.trackingMode !== 'hands') return;
  const hands = scene.hands;
  if (coachStep === 0) {
    if (hands.length >= 1) { coachHold++; if (coachHold > 25) { coachHold = 0; coachAdvance(); } } else coachHold = 0;
  } else if (coachStep === 1) {
    if (hands.some((h) => h.gesture && h.gesture !== 'Unknown' && h.gesture !== 'Pinch')) { coachHold++; if (coachHold > 20) { coachHold = 0; coachAdvance(); } } else coachHold = 0;
  } else if (coachStep === 2) {
    if (hands.some((h) => h.analysis?.pinching)) { coachHold++; if (coachHold > 20) { coachHold = 0; coachAdvance(); } } else coachHold = 0;
  }
}
$('#coach-skip').addEventListener('click', () => {
  coachDone = true; coachEl().hidden = true;
  try { localStorage.setItem(COACH_KEY, '1'); } catch {}
});

// ---------------- init ----------------
if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
  // No camera API at all — go straight to the gate with the file option.
  showGate(Object.assign(new Error('Open this page over HTTPS in Safari or Chrome to use the camera.'), { name: 'SecurityError' }));
  bootHud.classList.remove('show');
} else {
  // Boot straight into tracking: warm the models, then open the camera.
  logBoot('Warming up neural models');
  setTimeout(() => start().catch(() => {}), 60);
}

hydrateIcons();
applyVisuals(); syncQuick(); layout();
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('./sw.js').catch(() => {});
window.__kinesis = { S, L, tracker, get tracks() { return tracks; }, overlay, get hand3d() { return hand3d; }, session, badges: badgeSet };
