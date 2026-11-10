// 2D overlay renderer: skeleton, arms, tracers, reticles, effects,
// full-body skeleton, object detections and face mesh.
import { HAND_BONES, LANDMARK_FINGER, TIPS, FINGER_NAMES, PALM_TRIS, POSE_BONES, FACE_RINGS, tipsFor, convexHull, clamp, jointAngle } from './geometry.js';

const MONO = '"Geist Mono", ui-monospace, monospace';
const FINGER_COLORS = ['#f5b84b', '#9fc9a6', '#8fb3ff', '#c6f36b', '#ff5d73'];

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const rgba = (hex, a) => { const [r, g, b] = hexToRgb(hex); return `rgba(${r},${g},${b},${a})`; };
const DEPTH_STOPS = [[0, [90, 140, 255]], [0.35, [94, 234, 212]], [0.65, [245, 184, 75]], [1, [255, 93, 115]]];
function depthColor(t) {
  t = clamp(t, 0, 1);
  for (let i = 1; i < DEPTH_STOPS.length; i++) {
    const [p1, c1] = DEPTH_STOPS[i]; const [p0, c0] = DEPTH_STOPS[i - 1];
    if (t <= p1) { const k = (t - p0) / (p1 - p0); return `rgb(${c0.map((c, j) => Math.round(c + (c1[j] - c) * k)).join(',')})`; }
  }
  return 'rgb(255,93,115)';
}

export class Overlay2D {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: true, desynchronized: true });
    this.trails = new Map(); // key handId:tip -> [{x,y,t}]
    this.ripples = [];
    this.w = 1; this.h = 1; this.dpr = 1;
  }

  resize(w, h, dpr) {
    this.w = w; this.h = h; this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr); this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = w + 'px'; this.canvas.style.height = h + 'px';
    this.trails.clear();
  }

  colorFor(S, i, hand, t) {
    switch (S.colorMode) {
      case 'finger': { const f = LANDMARK_FINGER[i]; return f < 0 ? '#e8edf2' : FINGER_COLORS[f]; }
      case 'depth': { const z = hand.norm[i].z; return depthColor(0.5 - z * 5); }
      case 'velocity': { const p = hand.norm[i]; const v = Math.hypot(p.vx || 0, p.vy || 0); return mixHex(S.accent, S.secondary, clamp(v * 1.6, 0, 1)); }
      case 'confidence': { return mixHex('#5b646b', S.accent, clamp(hand.score ?? 0.5, 0, 1)); }
      case 'hand': return hand.slot % 2 ? S.secondary : S.accent;
      default: return S.accent;
    }
  }

  // ---------------------------------------------------------------
  render(S, scene) {
    const { ctx, dpr } = this;
    const t = scene.t;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = S.opacity;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';

    for (const arm of scene.arms) this.drawArm(S, arm, scene);
    if (S.armTracking && S.shoulders && scene.shoulders) this.drawShoulders(S, scene);

    for (const hand of scene.hands) {
      if (S.hull) this.drawHull(S, hand);
      if (S.palmMesh) this.drawPalm(S, hand, t);
      if (S.tracers) this.updateAndDrawTrails(S, hand, t);
      if (S.showBones) this.drawBones(S, hand, t);
      if (S.showJoints) this.drawJoints(S, hand, t);
      if (S.showAngles) this.drawAngles(S, hand);
      if (S.showIndices) this.drawIndices(S, hand);
      if (S.palmHud) this.drawPalmHud(S, hand, t);
      if (S.velocity) this.drawVelocity(S, hand);
      if (S.pinchLine) this.drawPinch(S, hand, t);
      if (S.pointRay) this.drawRay(S, hand, t);
      if (S.crosshairs) this.drawCrosshairs(S, hand, t);
      if (S.bbox || S.handLabels) this.drawFrame(S, hand, t);
    }
    if (S.spanGauge && scene.hands.length === 2) this.drawSpan(S, scene, t);
    this.drawTactical(S, scene, t);
    if (S.trackingMode === 'body' && scene.body) this.drawBody(S, scene, t);
    if (S.trackingMode === 'objects') this.drawObjects(S, scene, t);
    if (S.trackingMode === 'face') this.drawFace(S, scene, t);
    if (!S.tracers && this.trails.size) this.trails.clear();
    this.prune(scene);
    this.drawRipples(t);
    ctx.globalAlpha = 1;
  }

  // ---------------------------------------------------------------- tactical
  handCenter(hand) {
    const P = hand.pts, ids = [0, 5, 9, 13, 17];
    return { x: ids.reduce((s, i) => s + P[i].x, 0) / 5, y: ids.reduce((s, i) => s + P[i].y, 0) / 5 };
  }
  rangeCm(hand) {
    const P = hand.pts; const palmPx = Math.hypot(P[9].x - P[0].x, P[9].y - P[0].y) || 1;
    const f = Math.max(this.w, this.h) * 0.87; // ~60 deg horizontal FOV
    return clamp((9.6 * f) / palmPx, 5, 400);
  }
  drawTactical(S, scene, t) {
    const { ctx, w, h } = this; const col = S.tacColor || S.accent; const cx = w / 2, cy = h / 2;
    this.locks = this.locks || new Map();
    const live = new Set(scene.hands.map((k) => k.id));
    for (const k of this.locks.keys()) if (!live.has(k)) this.locks.delete(k);
    ctx.save(); ctx.font = `600 10px ${MONO}`; ctx.textBaseline = 'middle';
    if (S.boresight) {
      ctx.strokeStyle = rgba(col, 0.75); ctx.fillStyle = rgba(col, 0.75); ctx.lineWidth = 1;
      const L = S.boresightSize || 70;
      if (S.boresightStyle === 'cross') {
        ctx.beginPath();
        ctx.moveTo(cx - L, cy); ctx.lineTo(cx + L, cy);
        ctx.moveTo(cx, cy - L); ctx.lineTo(cx, cy + L); ctx.stroke();
        ctx.beginPath(); ctx.arc(cx, cy, 2, 0, 7); ctx.fill();
      } else if (S.boresightStyle === 'ring') {
        ctx.beginPath(); ctx.arc(cx, cy, L * 0.6, 0, 7); ctx.stroke();
        ctx.setLineDash([2, 4]); ctx.beginPath(); ctx.arc(cx, cy, L, 0, 7); ctx.stroke(); ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(cx - L * 0.6 - 8, cy); ctx.lineTo(cx - L * 0.6 + 8, cy);
        ctx.moveTo(cx + L * 0.6 - 8, cy); ctx.lineTo(cx + L * 0.6 + 8, cy);
        ctx.moveTo(cx, cy - L * 0.6 - 8); ctx.lineTo(cx, cy - L * 0.6 + 8);
        ctx.moveTo(cx, cy + L * 0.6 - 8); ctx.lineTo(cx, cy + L * 0.6 + 8); ctx.stroke();
      } else {
        const g = L * 0.23; ctx.beginPath();
        ctx.moveTo(cx - L, cy); ctx.lineTo(cx - g, cy); ctx.moveTo(cx + g, cy); ctx.lineTo(cx + L, cy);
        ctx.moveTo(cx, cy + g); ctx.lineTo(cx, cy + L); ctx.moveTo(cx, cy - g); ctx.lineTo(cx, cy - L * 0.5); ctx.stroke();
        for (let k = 1; k <= 4; k++) { const d = g + k * ((L - g) / 4); for (const [dx, dy] of [[d, 0], [-d, 0], [0, d]]) { ctx.beginPath(); ctx.arc(cx + dx, cy + dy, 1.4, 0, 7); ctx.fill(); } }
        ctx.beginPath(); ctx.arc(cx, cy, 1.2, 0, 7); ctx.fill();
      }
    }
    if (S.headingTape) {
      const prim = scene.hands[0]; const hdg = prim ? ((this.handCenter(prim).x / w) - 0.5) * 60 : 0;
      this.hdg = this.hdg == null ? hdg : this.hdg + (hdg - this.hdg) * 0.2;
      const brg = (this.hdg + 360) % 360; const y = 92, half = Math.min(220, w * 0.3), ppd = half / 30;
      ctx.strokeStyle = rgba(col, 0.7); ctx.fillStyle = rgba(col, 0.85); ctx.lineWidth = 1; ctx.textAlign = 'center';
      ctx.beginPath(); ctx.moveTo(cx - half, y + 10); ctx.lineTo(cx + half, y + 10); ctx.stroke();
      const start = Math.floor(brg - 30);
      for (let d = start; d <= brg + 30; d++) {
        if (d % 5) continue; const x = cx + (d - brg) * ppd; const big = d % 10 === 0;
        ctx.beginPath(); ctx.moveTo(x, y + 10); ctx.lineTo(x, y + (big ? 2 : 6)); ctx.stroke();
        if (d % 10 === 0) { const v = ((d % 360) + 360) % 360; const lab = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' }[v] ?? String(v).padStart(3, '0'); ctx.fillText(lab, x, y - 6); }
      }
      ctx.beginPath(); ctx.moveTo(cx, y + 13); ctx.lineTo(cx - 5, y + 20); ctx.lineTo(cx + 5, y + 20); ctx.closePath(); ctx.fill();
      this.rrect(cx - 22, y + 22, 44, 15, 7); ctx.fillStyle = 'rgba(5,7,8,.85)'; ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.stroke();
      ctx.fillStyle = col; ctx.fillText(String(Math.round(brg) % 360).padStart(3, '0'), cx, y + 30);
    }
    scene.hands.forEach((hand, idx) => {
      const c = this.handCenter(hand); const rng = this.rangeCm(hand);
      if (S.targetLock) {
        let L = this.locks.get(hand.id); if (!L) { L = { t0: t }; this.locks.set(hand.id, L); }
        const k = clamp((t - L.t0) / 900, 0, 1); const locked = k >= 1;
        const r = (60 - 28 * k) * hand.scale + 22; const lc = locked ? '#e0624f' : col;
        ctx.strokeStyle = lc; ctx.lineWidth = 1.4;
        ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(Math.PI / 4 * (1 - k) + (locked ? 0 : t * 0.002));
        ctx.beginPath(); ctx.moveTo(0, -r); ctx.lineTo(r, 0); ctx.lineTo(0, r); ctx.lineTo(-r, 0); ctx.closePath();
        ctx.setLineDash(locked ? [] : [6, 5]); ctx.stroke(); ctx.setLineDash([]); ctx.restore();
        ctx.beginPath(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { ctx.moveTo(c.x + dx * (r + 4), c.y + dy * (r + 4)); ctx.lineTo(c.x + dx * (r + 12), c.y + dy * (r + 12)); } ctx.stroke();
        ctx.strokeStyle = rgba(lc, 0.35); ctx.setLineDash([3, 6]); ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(c.x, c.y); ctx.stroke(); ctx.setLineDash([]);
        const az = ((c.x - cx) / w) * 60, el = -((c.y - cy) / h) * 45;
        const lines = [[`TGT-${String(hand.id).padStart(2, '0')}  ${locked ? 'LOCKED' : 'ACQ ' + Math.round(k * 100) + '%'}`, lc], [`AZ ${az >= 0 ? '+' : ''}${az.toFixed(1)}  EL ${el >= 0 ? '+' : ''}${el.toFixed(1)}`, col]];
        if (S.rangeFinder) lines.push([`RNG ${rng.toFixed(0)} CM`, col]);
        let y0 = Infinity; for (const p of hand.pts) y0 = Math.min(y0, p.y);
        const bw = Math.max(...lines.map(([s]) => ctx.measureText(s).width)) + 14, bh = lines.length * 13 + 6;
        let tx = c.x - bw / 2, ty = y0 - 14 * hand.scale - 34 - bh; if (ty < 130) { let y1 = -Infinity; for (const p of hand.pts) y1 = Math.max(y1, p.y); ty = y1 + 20; }
        tx = clamp(tx, 8, w - bw - 8);
        this.rrect(tx, ty, bw, bh, 6); ctx.fillStyle = 'rgba(5,7,8,.78)'; ctx.fill(); this.rrect(tx, ty, 2.5, bh, 1.25); ctx.fillStyle = lc; ctx.fill();
        ctx.textAlign = 'left'; lines.forEach(([s2, cc], j) => { ctx.fillStyle = cc; ctx.fillText(s2, tx + 8, ty + 10 + j * 13); });
      } else if (S.rangeFinder) {
        ctx.textAlign = 'center'; ctx.fillStyle = col; ctx.fillText(`RNG ${rng.toFixed(0)} CM`, c.x, c.y + 70 * hand.scale);
      }
    });
    if (S.radar && S.trackingMode === 'hands') {
      const R = Math.min(S.radarSize || 64, w * 0.22), rx = w - R - 28, ry = h - R - 160;
      ctx.fillStyle = 'rgba(5,7,8,.6)'; ctx.beginPath(); ctx.arc(rx, ry, R, 0, 7); ctx.fill();
      ctx.strokeStyle = rgba(col, 0.5); ctx.lineWidth = 1;
      if (S.radarRings !== false) for (const f of [1, 0.66, 0.33]) { ctx.beginPath(); ctx.arc(rx, ry, R * f, 0, 7); ctx.stroke(); }
      ctx.beginPath(); ctx.moveTo(rx - R, ry); ctx.lineTo(rx + R, ry); ctx.moveTo(rx, ry - R); ctx.lineTo(rx, ry + R); ctx.stroke();
      if (S.radarSweep !== false) {
        const a = (t * 0.0022) % (Math.PI * 2);
        const gr = ctx.createConicGradient ? ctx.createConicGradient(a - 0.9, rx, ry) : null;
        if (gr) { gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.14, rgba(col, 0.28)); gr.addColorStop(0.1433, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(rx, ry, R, 0, 7); ctx.fill(); }
      }
      for (const hand of scene.hands) {
        const c = this.handCenter(hand); const rng = this.rangeCm(hand);
        const bx = rx + ((c.x / w) - 0.5) * 2 * R * 0.85, by = ry + R - clamp(rng / 150, 0, 1) * 2 * R * 0.9;
        ctx.fillStyle = hand.slot % 2 ? S.secondary : col; ctx.beginPath(); ctx.arc(bx, by, 3, 0, 7); ctx.fill();
      }
      ctx.fillStyle = rgba(col, 0.8); ctx.textAlign = 'center';
      ctx.fillText(`CONTACTS ${String(scene.hands.length).padStart(2, '0')}`, rx, ry + R + 12);
    }
    ctx.restore();
  }

  prune(scene) {
    const live = new Set(scene.hands.map((h) => h.id));
    for (const k of this.trails.keys()) if (!k.startsWith('body:') && !live.has(+k.split(':')[0])) this.trails.delete(k);
  }

  // ---------------- skeleton ----------------
  widthAt(S, hand, i) {
    if (!S.depthWidth) return S.boneWidth;
    return S.boneWidth * hand.scale * clamp(1 - hand.norm[i].z * 3.5, 0.55, 1.7);
  }

  drawBones(S, hand, t) {
    const { ctx } = this; const P = hand.pts;
    const style = S.boneStyle;
    for (let b = 0; b < HAND_BONES.length; b++) {
      const [i, j] = HAND_BONES[b];
      const a = P[i], c = P[j];
      const col = this.colorFor(S, j, hand, t);
      const w = (this.widthAt(S, hand, i) + this.widthAt(S, hand, j)) / 2;
      if (style === 'neon') {
        ctx.globalCompositeOperation = 'lighter';
        this.seg(a, c, w * 4.2, rgba(toHex(col), 0.08));
        this.seg(a, c, w * 2.2, rgba(toHex(col), 0.22));
        ctx.globalCompositeOperation = 'source-over';
        this.seg(a, c, w, col);
        this.seg(a, c, Math.max(0.6, w * 0.35), 'rgba(255,255,255,0.85)');
      } else if (style === 'dashed') {
        ctx.setLineDash([w * 2.2, w * 1.6]); ctx.lineDashOffset = -t * 0.03;
        ctx.lineCap = 'butt'; this.seg(a, c, w, col); ctx.lineCap = 'round';
        ctx.setLineDash([]);
      } else if (style === 'double') {
        const dx = c.x - a.x, dy = c.y - a.y, L = Math.hypot(dx, dy) || 1;
        const nx = (-dy / L) * w * 0.9, ny = (dx / L) * w * 0.9;
        const lw = Math.max(1, w * 0.4);
        this.seg({ x: a.x + nx, y: a.y + ny }, { x: c.x + nx, y: c.y + ny }, lw, col);
        this.seg({ x: a.x - nx, y: a.y - ny }, { x: c.x - nx, y: c.y - ny }, lw, col);
        this.seg(a, c, lw * 0.5, rgba(toHex(col), 0.35));
      } else if (style === 'tapered') {
        const w1 = this.widthAt(S, hand, i) * 1.25, w2 = this.widthAt(S, hand, j) * 0.7;
        this.taper(a, c, w1, w2, col);
      } else if (style === 'pulse') {
        this.seg(a, c, Math.max(1, w * 0.5), rgba(toHex(col), 0.55));
        const k = ((t * 0.0012) + b * 0.13) % 1;
        const px = a.x + (c.x - a.x) * k, py = a.y + (c.y - a.y) * k;
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = rgba(toHex(col), 0.35); ctx.beginPath(); ctx.arc(px, py, w * 2.2, 0, 7); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(px, py, w * 0.7, 0, 7); ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
      } else {
        this.seg(a, c, w, col);
      }
    }
  }

  seg(a, b, w, color) {
    const { ctx } = this;
    ctx.strokeStyle = color; ctx.lineWidth = w;
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  }

  taper(a, b, w1, w2, color) {
    const { ctx } = this;
    const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1;
    const nx = -dy / L, ny = dx / L;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(a.x + nx * w1 / 2, a.y + ny * w1 / 2);
    ctx.lineTo(b.x + nx * w2 / 2, b.y + ny * w2 / 2);
    ctx.arc(b.x, b.y, w2 / 2, Math.atan2(ny, nx), Math.atan2(ny, nx) + Math.PI);
    ctx.lineTo(a.x - nx * w1 / 2, a.y - ny * w1 / 2);
    ctx.arc(a.x, a.y, w1 / 2, Math.atan2(-ny, -nx), Math.atan2(-ny, -nx) + Math.PI);
    ctx.closePath(); ctx.fill();
  }

  drawJoints(S, hand, t) {
    const { ctx } = this; const P = hand.pts;
    for (let i = 0; i < 21; i++) {
      const p = P[i];
      const col = this.colorFor(S, i, hand, t);
      const isTip = TIPS.includes(i);
      let r = S.jointSize * (S.depthWidth ? hand.scale * clamp(1 - hand.norm[i].z * 3, 0.6, 1.6) : 1);
      if (isTip && S.tipHighlight) r *= 1.35;
      this.shape(S.jointShape, p.x, p.y, r, col);
      if (isTip && S.tipHighlight) {
        ctx.strokeStyle = rgba(toHex(col), 0.45); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(p.x, p.y, r + 4 + Math.sin(t * 0.005 + i) * 1.5, 0, 7); ctx.stroke();
      }
    }
  }

  shape(kind, x, y, r, col) {
    const { ctx } = this;
    ctx.fillStyle = col; ctx.strokeStyle = col;
    switch (kind) {
      case 'ring':
        ctx.fillStyle = 'rgba(6,9,10,0.85)'; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
        ctx.lineWidth = Math.max(1.2, r * 0.45); ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.stroke(); break;
      case 'square': ctx.fillRect(x - r, y - r, r * 2, r * 2); break;
      case 'diamond': ctx.beginPath(); ctx.moveTo(x, y - r * 1.3); ctx.lineTo(x + r * 1.3, y); ctx.lineTo(x, y + r * 1.3); ctx.lineTo(x - r * 1.3, y); ctx.closePath(); ctx.fill(); break;
      case 'cross': ctx.lineWidth = Math.max(1.2, r * 0.4); ctx.beginPath(); ctx.moveTo(x - r, y - r); ctx.lineTo(x + r, y + r); ctx.moveTo(x + r, y - r); ctx.lineTo(x - r, y + r); ctx.stroke(); break;
      default: ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
    }
  }

  drawPalm(S, hand, t) {
    const { ctx } = this; const P = hand.pts;
    ctx.fillStyle = rgba(toHex(this.colorFor(S, 0, hand, t)), 0.07);
    ctx.strokeStyle = rgba(toHex(this.colorFor(S, 0, hand, t)), 0.28);
    ctx.lineWidth = 0.8;
    for (const [a, b, c] of PALM_TRIS) {
      ctx.beginPath(); ctx.moveTo(P[a].x, P[a].y); ctx.lineTo(P[b].x, P[b].y); ctx.lineTo(P[c].x, P[c].y); ctx.closePath();
      ctx.fill(); ctx.stroke();
    }
    // knuckle line + cross braces
    ctx.setLineDash([2, 3]);
    ctx.beginPath(); ctx.moveTo(P[2].x, P[2].y); ctx.lineTo(P[5].x, P[5].y);
    ctx.moveTo(P[0].x, P[0].y); ctx.lineTo(P[9].x, P[9].y); ctx.moveTo(P[0].x, P[0].y); ctx.lineTo(P[13].x, P[13].y);
    ctx.stroke(); ctx.setLineDash([]);
  }

  drawHull(S, hand) {
    const { ctx } = this;
    const hull = convexHull(hand.pts);
    if (hull.length < 3) return;
    ctx.beginPath();
    // Rounded silhouette via midpoint quadratic curves
    const m = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    const first = m(hull[hull.length - 1], hull[0]);
    ctx.moveTo(first.x, first.y);
    for (let i = 0; i < hull.length; i++) { const p = hull[i], q = m(p, hull[(i + 1) % hull.length]); ctx.quadraticCurveTo(p.x, p.y, q.x, q.y); }
    ctx.closePath();
    const col = hand.slot % 2 ? S.secondary : S.accent;
    ctx.fillStyle = rgba(col, 0.13); ctx.fill();
    ctx.setLineDash([4, 4]); ctx.strokeStyle = rgba(col, 0.6); ctx.lineWidth = 1; ctx.stroke(); ctx.setLineDash([]);
  }

  drawIndices(S, hand) {
    const { ctx } = this;
    ctx.font = `500 10px ${MONO}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    hand.pts.forEach((p, i) => {
      const s = String(i); const w = ctx.measureText(s).width + 6;
      this.rrect(p.x + 7, p.y - 7, w, 13, 6.5); ctx.fillStyle = 'rgba(6,9,10,0.78)'; ctx.fill();
      ctx.fillStyle = '#e8edf2'; ctx.fillText(s, p.x + 10, p.y);
    });
  }

  drawAngles(S, hand) {
    const { ctx } = this; const N = hand.norm; const P = hand.pts;
    ctx.font = `500 10px ${MONO}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const joints = [[1, 2, 3], [2, 3, 4], [5, 6, 7], [6, 7, 8], [9, 10, 11], [10, 11, 12], [13, 14, 15], [14, 15, 16], [17, 18, 19], [18, 19, 20]];
    const src = hand.world || N;
    for (const [a, b, c] of joints) {
      const ang = Math.round(180 - jointAngle(src[a], src[b], src[c]));
      const p = P[b];
      this.rrect(p.x - 15, p.y - 22, 30, 13, 6.5); ctx.fillStyle = 'rgba(6,9,10,0.8)'; ctx.fill();
      ctx.fillStyle = S.secondary; ctx.fillText(ang + '°', p.x, p.y - 15.5);
    }
  }

  // ---------------- tracers ----------------
  updateAndDrawTrails(S, hand, t) {
    const { ctx } = this;
    for (const tip of tipsFor(S.tracerTips)) {
      const k = hand.id + ':' + tip;
      let arr = this.trails.get(k);
      if (!arr) { arr = []; this.trails.set(k, arr); }
      const p = hand.pts[tip];
      arr.push({ x: p.x, y: p.y, t });
      while (arr.length > S.tracerLength) arr.shift();
      if (arr.length < 2) continue;
      const col = S.colorMode === 'finger' ? FINGER_COLORS[TIPS.indexOf(tip)] : (hand.slot % 2 && S.colorMode === 'hand' ? S.secondary : S.accent);
      const n = arr.length;
      if (S.tracerStyle === 'dots') {
        for (let i = 0; i < n; i += 2) {
          const k2 = i / n; const c = col;
          ctx.fillStyle = rgba(toHex(c), k2 * 0.9);
          ctx.beginPath(); ctx.arc(arr[i].x, arr[i].y, S.tracerWidth * 0.45 * (0.4 + k2), 0, 7); ctx.fill();
        }
        continue;
      }
      ctx.globalCompositeOperation = S.tracerStyle === 'comet' ? 'lighter' : 'source-over';
      for (let i = 1; i < n; i++) {
        const k2 = i / n;
        ctx.strokeStyle = rgba(toHex(col), S.tracerStyle === 'line' ? k2 * 0.9 : k2 * 0.85);
        ctx.lineWidth = Math.max(0.5, S.tracerStyle === 'line' ? 1.2 : S.tracerWidth * (S.tracerStyle === 'comet' ? k2 * k2 * 1.6 : k2));
        ctx.beginPath(); ctx.moveTo(arr[i - 1].x, arr[i - 1].y); ctx.lineTo(arr[i].x, arr[i].y); ctx.stroke();
      }
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  // ---------------- targeting ----------------
  drawCrosshairs(S, hand, t) {
    const { ctx } = this;
    const R = S.crosshairSize;
    for (const tip of tipsFor(S.crosshairTips)) {
      const p = hand.pts[tip];
      const col = S.colorMode === 'finger' ? FINGER_COLORS[TIPS.indexOf(tip)] : (hand.slot % 2 && S.colorMode === 'hand' ? S.secondary : S.accent);
      const pinch = hand.analysis.pinching && (tip === 8 || tip === 4);
      ctx.save(); ctx.translate(p.x, p.y);
      ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 1.4;
      if (S.crosshairStyle === 'tactical') {
        ctx.rotate(t * 0.0008);
        const gap = 0.32;
        for (let q = 0; q < 4; q++) { ctx.beginPath(); ctx.arc(0, 0, R, q * Math.PI / 2 + gap, (q + 1) * Math.PI / 2 - gap); ctx.stroke(); }
        ctx.rotate(-t * 0.0008);
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(-R - 6, 0); ctx.lineTo(-R * 0.45, 0); ctx.moveTo(R * 0.45, 0); ctx.lineTo(R + 6, 0);
        ctx.moveTo(0, -R - 6); ctx.lineTo(0, -R * 0.45); ctx.moveTo(0, R * 0.45); ctx.lineTo(0, R + 6);
        ctx.stroke();
        ctx.beginPath(); ctx.arc(0, 0, 1.8, 0, 7); ctx.fill();
      } else if (S.crosshairStyle === 'lock') {
        const s = pinch ? R * 0.6 : R * (1 + Math.sin(t * 0.006) * 0.08);
        ctx.rotate(pinch ? 0 : t * 0.0015);
        const L = s * 0.45;
        for (let q = 0; q < 4; q++) {
          ctx.save(); ctx.rotate(q * Math.PI / 2);
          ctx.beginPath(); ctx.moveTo(-s, -s + L); ctx.lineTo(-s, -s); ctx.lineTo(-s + L, -s); ctx.stroke(); ctx.restore();
        }
        ctx.rotate(-(pinch ? 0 : t * 0.0015));
        ctx.beginPath(); ctx.moveTo(-4, 0); ctx.lineTo(4, 0); ctx.moveTo(0, -4); ctx.lineTo(0, 4); ctx.stroke();
        if (pinch) { ctx.font = `600 10px ${MONO}`; ctx.textAlign = 'center'; ctx.fillText('LOCKED', 0, -s - 8); }
      } else if (S.crosshairStyle === 'circle') {
        ctx.beginPath(); ctx.arc(0, 0, R, 0, 7); ctx.stroke();
        ctx.globalAlpha *= 0.5; ctx.beginPath(); ctx.arc(0, 0, R * 0.55, 0, 7); ctx.stroke(); ctx.globalAlpha = S.opacity;
        ctx.beginPath(); ctx.moveTo(-R * 1.5, 0); ctx.lineTo(R * 1.5, 0); ctx.moveTo(0, -R * 1.5); ctx.lineTo(0, R * 1.5); ctx.stroke();
        for (let k = -3; k <= 3; k++) { if (!k) continue; const x = k * R / 3; ctx.beginPath(); ctx.moveTo(x, -3); ctx.lineTo(x, 3); ctx.moveTo(-3, x); ctx.lineTo(3, x); ctx.stroke(); }
      } else {
        const s = R * 0.8;
        ctx.beginPath();
        ctx.moveTo(-s + 6, -s); ctx.lineTo(-s, -s); ctx.lineTo(-s, s); ctx.lineTo(-s + 6, s);
        ctx.moveTo(s - 6, -s); ctx.lineTo(s, -s); ctx.lineTo(s, s); ctx.lineTo(s - 6, s);
        ctx.stroke();
        ctx.beginPath(); ctx.arc(0, 0, 2, 0, 7); ctx.fill();
      }
      if (S.coords && tip === tipsFor(S.crosshairTips)[tipsFor(S.crosshairTips).length - 1]) {
        const n = hand.norm[tip];
        const lines = [`X ${n.x.toFixed(3)}`, `Y ${n.y.toFixed(3)}`, `Z ${n.z >= 0 ? '+' : ''}${n.z.toFixed(3)}`];
        ctx.font = `500 10px ${MONO}`; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        const bx = R + 10, by = -R - 4;
        this.rrect(bx - 4, by - 3, 74, 42, 8); ctx.fillStyle = 'rgba(6,9,10,0.72)'; ctx.fill();
        this.rrect(bx - 4, by - 3, 2.5, 42, 1.25); ctx.fillStyle = col; ctx.fill();
        ctx.fillStyle = '#e8edf2';
        lines.forEach((l, i) => ctx.fillText(l, bx + 2, by + i * 13));
      }
      ctx.restore();
    }
  }

  drawFrame(S, hand, t) {
    const { ctx } = this;
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const p of hand.pts) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
    const pad = 14 * hand.scale;
    x0 -= pad; y0 -= pad; x1 += pad; y1 += pad;
    const col = hand.slot % 2 ? S.secondary : S.accent;
    if (S.bbox) {
      const L = Math.min(22, (x1 - x0) * 0.2);
      ctx.strokeStyle = col; ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x0, y0 + L); ctx.lineTo(x0, y0); ctx.lineTo(x0 + L, y0);
      ctx.moveTo(x1 - L, y0); ctx.lineTo(x1, y0); ctx.lineTo(x1, y0 + L);
      ctx.moveTo(x1, y1 - L); ctx.lineTo(x1, y1); ctx.lineTo(x1 - L, y1);
      ctx.moveTo(x0 + L, y1); ctx.lineTo(x0, y1); ctx.lineTo(x0, y1 - L);
      ctx.stroke();
      // side ticks
      ctx.strokeStyle = rgba(col, 0.4); ctx.lineWidth = 1;
      ctx.beginPath();
      for (let k = 1; k < 8; k++) { const y = y0 + (y1 - y0) * k / 8; ctx.moveTo(x0, y); ctx.lineTo(x0 + (k % 4 ? 3 : 7), y); }
      ctx.stroke();
    }
    if (S.handLabels) {
      const side = hand.handedness === 'Unknown' ? '—' : (S.swapHands ? (hand.handedness === 'Left' ? 'R' : 'L') : hand.handedness[0]);
      const gesture = S.gestures && hand.gesture && hand.gesture !== 'Unknown' ? hand.gesture.toUpperCase() : null;
      const label = `${side} · H${String(hand.id).padStart(2, '0')} · ${Math.round(hand.score * 100)}%`;
      ctx.font = `600 10.5px ${MONO}`; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
      const w1 = ctx.measureText(label).width + 14;
      const w2 = gesture ? ctx.measureText(gesture).width + 14 : 0;
      const ty = y0 - 22;
      this.rrect(x0, ty, w1, 17, 8.5); ctx.fillStyle = col; ctx.fill();
      ctx.fillStyle = '#071012'; ctx.fillText(label, x0 + 7, ty + 9);
      if (gesture) {
        this.rrect(x0 + w1, ty, w2, 17, 8.5); ctx.fillStyle = 'rgba(6,9,10,0.82)'; ctx.fill();
        ctx.fillStyle = col; ctx.fillText(gesture, x0 + w1 + 7, ty + 9);
      }
    }
  }

  drawPalmHud(S, hand, t) {
    const { ctx } = this; const P = hand.pts; const N = hand.norm;
    const ids = [0, 5, 9, 13, 17];
    const cx = ids.reduce((s, i) => s + P[i].x, 0) / 5, cy = ids.reduce((s, i) => s + P[i].y, 0) / 5;
    // palm normal from normalized coords (aspect-corrected)
    const A = N[5], B = N[17], C = N[0];
    const u = [A.x - C.x, A.y - C.y, A.z - C.z], v = [B.x - C.x, B.y - C.y, B.z - C.z];
    let n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const m = Math.hypot(...n) || 1; n = n.map((k) => k / m);
    const r = 34 * hand.scale;
    const col = S.secondary;
    const facing = (n[2] < 0) !== (hand.handedness === 'Left');
    ctx.save(); ctx.translate(cx, cy);
    const rot = Math.atan2(n[1], n[0] * (S.mirror ? -1 : 1));
    ctx.rotate(rot);
    ctx.strokeStyle = col; ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.ellipse(0, 0, Math.max(4, r * Math.abs(n[2])), r, 0, 0, 7); ctx.stroke();
    ctx.setLineDash([2, 4]); ctx.beginPath(); ctx.ellipse(0, 0, Math.max(4, r * 1.25 * Math.abs(n[2])), r * 1.25, 0, 0, 7); ctx.stroke(); ctx.setLineDash([]);
    const len = r * Math.hypot(n[0], n[1]) * 1.6;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(len, 0); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(len, 0); ctx.lineTo(len - 6, -4); ctx.lineTo(len - 6, 4); ctx.closePath(); ctx.fillStyle = col; ctx.fill();
    ctx.restore();
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(t * 0.001);
    ctx.strokeStyle = rgba(col, 0.6);
    for (let k = 0; k < 24; k++) { const a = k * Math.PI / 12; const r1 = r * 1.45, r2 = r1 + (k % 6 ? 3 : 7); ctx.beginPath(); ctx.moveTo(Math.cos(a) * r1, Math.sin(a) * r1); ctx.lineTo(Math.cos(a) * r2, Math.sin(a) * r2); ctx.stroke(); }
    ctx.restore();
    ctx.font = `600 10px ${MONO}`; ctx.textAlign = 'center'; ctx.fillStyle = col; ctx.textBaseline = 'top';
    ctx.fillText(facing ? 'PALM' : 'DORSAL', cx, cy + r * 1.6 + 8);
  }

  drawVelocity(S, hand) {
    const { ctx } = this;
    for (const i of [0, 8]) {
      const p = hand.pts[i]; const n = hand.norm[i];
      const vx = (n.vx || 0) * this.w * 0.12 * (S.mirror ? -1 : 1), vy = (n.vy || 0) * this.h * 0.12;
      const L = Math.hypot(vx, vy); if (L < 4) continue;
      const k = Math.min(1, 120 / L);
      const ex = p.x + vx * k, ey = p.y + vy * k;
      ctx.strokeStyle = S.secondary; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(ex, ey); ctx.stroke();
      const a = Math.atan2(ey - p.y, ex - p.x);
      ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(ex - Math.cos(a - 0.4) * 8, ey - Math.sin(a - 0.4) * 8); ctx.moveTo(ex, ey); ctx.lineTo(ex - Math.cos(a + 0.4) * 8, ey - Math.sin(a + 0.4) * 8); ctx.stroke();
    }
  }

  drawPinch(S, hand, t) {
    const { ctx } = this; const a = hand.pts[4], b = hand.pts[8];
    const pd = hand.analysis.pinchDist;
    const k = clamp(1 - (pd - 0.2) / 0.9, 0, 1);
    const col = hand.analysis.pinching ? S.secondary : S.accent;
    ctx.strokeStyle = rgba(col, 0.35 + k * 0.6); ctx.lineWidth = 1 + k * 1.5;
    ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.setLineDash([]);
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    const mm = hand.pinchMM;
    const label = mm != null ? `${mm.toFixed(0)} mm` : `${(pd * 100).toFixed(0)}%`;
    ctx.font = `600 10px ${MONO}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const w = ctx.measureText(label).width + 10;
    this.rrect(mx - w / 2, my - 8, w, 16, 8); ctx.fillStyle = 'rgba(6,9,10,0.8)'; ctx.fill();
    ctx.fillStyle = col; ctx.fillText(label, mx, my);
    if (hand.pinchStart) this.ripples.push({ x: mx, y: my, t0: t, col: S.secondary });
  }

  // designator ray — projects the index finger axis to the frame edge with a range readout
  drawRay(S, hand, t) {
    const { ctx } = this;
    const a = hand.pts[5], b = hand.pts[8];
    const dx = b.x - a.x, dy = b.y - a.y; const L = Math.hypot(dx, dy) || 1;
    const ux = dx / L, uy = dy / L;
    let far = 1e4;
    if (ux > 1e-6) far = Math.min(far, (this.w - b.x) / ux); else if (ux < -1e-6) far = Math.min(far, -b.x / ux);
    if (uy > 1e-6) far = Math.min(far, (this.h - b.y) / uy); else if (uy < -1e-6) far = Math.min(far, -b.y / uy);
    if (!(far > 0)) far = 0;
    const ex = b.x + ux * far, ey = b.y + uy * far;
    const col = S.tacColor || S.accent;
    const grad = ctx.createLinearGradient(b.x, b.y, ex, ey);
    grad.addColorStop(0, rgba(col, 0.85)); grad.addColorStop(1, rgba(col, 0.05));
    ctx.strokeStyle = grad; ctx.lineWidth = 1.2;
    ctx.setLineDash([7, 5]);
    ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(ex, ey); ctx.stroke();
    ctx.setLineDash([]);
    this.shape('ring', b.x, b.y, 7, col);
    const r = this.rangeCm(hand);
    const label = `${r < 100 ? r.toFixed(1) : r.toFixed(0)} cm`;
    const k = Math.min(110, far * 0.45);
    const mx = b.x + ux * k, my = b.y + uy * k;
    ctx.font = `600 10px ${MONO}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const w = ctx.measureText(label).width + 10;
    this.rrect(mx - w / 2, my - 8, w, 16, 8); ctx.fillStyle = 'rgba(6,9,10,0.8)'; ctx.fill();
    ctx.fillStyle = col; ctx.fillText(label, mx, my);
  }

  // span caliper — projected distance between both index fingertips
  drawSpan(S, scene, t) {
    const { ctx } = this;
    const [a, b] = scene.hands;
    const p = a.pts[8], q = b.pts[8];
    const col = S.tacColor || S.accent;
    const dx = q.x - p.x, dy = q.y - p.y, L = Math.hypot(dx, dy) || 1;
    const nx = -dy / L, ny = dx / L;
    ctx.strokeStyle = rgba(col, 0.85); ctx.lineWidth = 1.2;
    ctx.setLineDash([5, 4]);
    ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
    ctx.setLineDash([]);
    for (const pt of [p, q]) {
      ctx.beginPath();
      ctx.moveTo(pt.x - nx * 9, pt.y - ny * 9); ctx.lineTo(pt.x + nx * 9, pt.y + ny * 9);
      ctx.stroke();
    }
    let mm = null;
    if (a.world?.[8] && b.world?.[8]) {
      const w1 = a.world[8], w2 = b.world[8];
      mm = Math.hypot(w1.x - w2.x, w1.y - w2.y, w1.z - w2.z) * 1000;
    }
    const mx = (p.x + q.x) / 2, my = (p.y + q.y) / 2;
    const label = mm != null ? `${mm.toFixed(0)} mm` : `${Math.round(L)} px`;
    ctx.font = `600 10px ${MONO}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const w = ctx.measureText(label).width + 10;
    this.rrect(mx - w / 2, my - 8, w, 16, 8); ctx.fillStyle = 'rgba(6,9,10,0.8)'; ctx.fill();
    ctx.fillStyle = col; ctx.fillText(label, mx, my);
  }

  // ---------------- arms ----------------
  drawArm(S, arm, scene) {
    const { ctx } = this;
    const { shoulder: s, elbow: e, wrist: w } = arm;
    const col = arm.side === 'L' ? S.accent : S.secondary;
    const W = S.armWidth;
    const segs = s ? [[s, e, 1.4, 1.0], [e, w, 1.05, 0.75]] : [[e, w, 1.05, 0.75]];
    if (arm.estimated) ctx.globalAlpha = S.opacity * 0.75;
    if (S.armStyle === 'bone') {
      const base = ctx.globalAlpha;
      ctx.globalAlpha = base * 0.9;
      for (const [a, b, w1, w2] of segs) this.taper(a, b, W * w1, W * w2, rgba(col, 0.26));
      ctx.globalAlpha = base;
      if (s) this.seg(s, e, Math.max(2, W * 0.35), col);
      // radius + ulna twin bones in the forearm
      const dx = w.x - e.x, dy = w.y - e.y, L = Math.hypot(dx, dy) || 1;
      const nx = -dy / L * W * 0.28, ny = dx / L * W * 0.28;
      this.seg({ x: e.x + nx * 0.5, y: e.y + ny * 0.5 }, { x: w.x + nx, y: w.y + ny }, Math.max(1.5, W * 0.2), col);
      this.seg({ x: e.x - nx * 0.5, y: e.y - ny * 0.5 }, { x: w.x - nx, y: w.y - ny }, Math.max(1.5, W * 0.2), col);
    } else if (S.armStyle === 'rail') {
      for (const [a, b] of segs) {
        const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1;
        const nx = -dy / L * W * 0.6, ny = dx / L * W * 0.6;
        this.seg({ x: a.x + nx, y: a.y + ny }, { x: b.x + nx, y: b.y + ny }, 1.5, col);
        this.seg({ x: a.x - nx, y: a.y - ny }, { x: b.x - nx, y: b.y - ny }, 1.5, col);
      }
    } else {
      for (const [a, b] of segs) this.seg(a, b, Math.max(1.5, W * 0.4), col);
    }
    for (const p of s ? [s, e] : [e]) this.shape('ring', p.x, p.y, Math.max(4, W * 0.55), col);
    if (arm.estimated) {
      ctx.font = `600 9.5px ${MONO}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = rgba(col, 0.9); ctx.fillText('EST', e.x, e.y - Math.max(4, W * 0.55) - 9);
    }
    ctx.globalAlpha = S.opacity;
    if (S.elbowAngle && s && arm.angle != null) {
      const ang = arm.angle;
      const a1 = Math.atan2(s.y - e.y, s.x - e.x), a2 = Math.atan2(w.y - e.y, w.x - e.x);
      let d = a2 - a1; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
      const R = 26;
      ctx.strokeStyle = rgba(col, 0.8); ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(e.x, e.y, R, a1, a1 + d, d < 0); ctx.stroke();
      const mid = a1 + d / 2;
      const lx = e.x + Math.cos(mid) * (R + 22), ly = e.y + Math.sin(mid) * (R + 22);
      ctx.font = `600 11px ${MONO}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const label = `${Math.round(ang)}°`;
      const tw = ctx.measureText(label).width + 10;
      this.rrect(lx - tw / 2, ly - 8, tw, 16, 8); ctx.fillStyle = 'rgba(6,9,10,0.8)'; ctx.fill();
      ctx.fillStyle = col; ctx.fillText(label, lx, ly);
    }
  }

  drawShoulders(S, scene) {
    const [l, r] = scene.shoulders;
    this.ctx.setLineDash([5, 5]);
    this.seg(l, r, 1.5, rgba(S.accent, 0.7));
    this.ctx.setLineDash([]);
    const m = { x: (l.x + r.x) / 2, y: (l.y + r.y) / 2 };
    this.shape('diamond', m.x, m.y, 4, S.accent);
  }

  // ---------------- full body ----------------
  bodyCol(S, i, lm) {
    if (S.bodyColorMode === 'accent') return S.accent;
    if (S.bodyColorMode === 'depth') return depthColor(0.5 - (lm[i]?.z ?? 0) * 5);
    return i % 2 ? S.accent : S.secondary; // odd indices = left side
  }

  drawBody(S, scene, t) {
    const { ctx } = this; const B = scene.body;
    const P = B.pts, LM = B.lm, aspect = scene.aspect || 1.5;
    const vis = (i) => (LM[i]?.v ?? 1) > 0.4;
    const scale = Math.hypot(P[11].x - P[12].x, P[11].y - P[12].y) || 100; // shoulder width px
    const k = clamp(scale / 120, 0.5, 2.2);

    if (S.bodyTrail) {
      for (const wi of [15, 16]) {
        const key = 'body:' + wi;
        let arr = this.trails.get(key);
        if (!arr) { arr = []; this.trails.set(key, arr); }
        arr.push({ x: P[wi].x, y: P[wi].y, t });
        while (arr.length > S.bodyTrailLength) arr.shift();
        if (arr.length > 2) {
          const col = this.bodyCol(S, wi, LM);
          for (let i = 1; i < arr.length; i++) {
            const kk = i / arr.length;
            ctx.strokeStyle = rgba(toHex(col), kk * 0.7);
            ctx.lineWidth = Math.max(0.6, 3 * kk * k);
            ctx.beginPath(); ctx.moveTo(arr[i - 1].x, arr[i - 1].y); ctx.lineTo(arr[i].x, arr[i].y); ctx.stroke();
          }
        }
      }
    } else if (this.trails.size) {
      for (const key of this.trails.keys()) if (key.startsWith('body:')) this.trails.delete(key);
    }

    if (S.bodyBones) {
      const style = S.bodyBoneStyle;
      for (const [a, b] of POSE_BONES) {
        if (!vis(a) || !vis(b)) continue;
        const col = this.bodyCol(S, b, LM);
        let w = S.bodyBoneWidth * k;
        if (S.bodyDepthWidth) w *= clamp(1 - (LM[b]?.z ?? 0) * 2.2, 0.6, 1.5);
        if (style === 'neon') {
          ctx.globalCompositeOperation = 'lighter';
          this.seg(P[a], P[b], w * 3.4, rgba(toHex(col), 0.16));
          this.seg(P[a], P[b], w * 1.9, rgba(toHex(col), 0.34));
          ctx.globalCompositeOperation = 'source-over';
          this.seg(P[a], P[b], w, col);
          this.seg(P[a], P[b], Math.max(0.6, w * 0.3), 'rgba(255,255,255,0.8)');
        } else if (style === 'dashed') {
          ctx.setLineDash([w * 2.2, w * 1.6]); ctx.lineCap = 'butt';
          this.seg(P[a], P[b], w, col); ctx.lineCap = 'round'; ctx.setLineDash([]);
        } else if (style === 'double') {
          const dx = P[b].x - P[a].x, dy = P[b].y - P[a].y, L = Math.hypot(dx, dy) || 1;
          const nx = (-dy / L) * w * 0.75, ny = (dx / L) * w * 0.75;
          const lw = Math.max(1, w * 0.4);
          this.seg({ x: P[a].x + nx, y: P[a].y + ny }, { x: P[b].x + nx, y: P[b].y + ny }, lw, col);
          this.seg({ x: P[a].x - nx, y: P[a].y - ny }, { x: P[b].x - nx, y: P[b].y - ny }, lw, col);
        } else {
          this.seg(P[a], P[b], w, col);
        }
      }
    }

    if (S.bodyJoints) {
      for (let i = 0; i < 33; i++) {
        if (!vis(i) || (i >= 17 && i <= 22)) continue; // skip hand points (dense, noisy)
        const col = this.bodyCol(S, i, LM);
        let r = S.bodyJointSize * k;
        if (S.bodyDepthWidth) r *= clamp(1 - (LM[i]?.z ?? 0) * 2.2, 0.6, 1.5);
        this.shape(S.bodyJointShape, P[i].x, P[i].y, r, col);
      }
    }

    // torso datum + lean
    const mSh = { x: (P[11].x + P[12].x) / 2, y: (P[11].y + P[12].y) / 2 };
    const mHp = { x: (P[23].x + P[24].x) / 2, y: (P[23].y + P[24].y) / 2 };
    if (S.bodyLean && vis(11) && vis(23)) {
      const up = Math.hypot(mSh.x - mHp.x, mSh.y - mHp.y) || 1;
      const plumbX = mHp.x, plumbY = mHp.y - up * 1.35;
      ctx.setLineDash([4, 5]);
      this.seg({ x: plumbX, y: plumbY }, { x: plumbX, y: mHp.y + up * 0.15 }, 1, rgba(S.secondary, 0.55));
      ctx.setLineDash([]);
      this.seg(mHp, mSh, 1.4, S.secondary);
      const leanDeg = Math.atan2(mSh.x - mHp.x, mHp.y - mSh.y) * 180 / Math.PI;
      const over = S.bodyLeanWarn && Math.abs(leanDeg) > (S.bodyLeanThreshold || 12);
      const mid = { x: (mHp.x + mSh.x) / 2, y: (mHp.y + mSh.y) / 2 };
      this.readout(S, mid.x + 14 * k, mid.y, `LEAN ${leanDeg >= 0 ? '+' : ''}${leanDeg.toFixed(0)}°${over ? ' ⚠' : ''}`, over ? '#ff5d73' : S.secondary);
      if (S.bodyTilt && vis(11) && vis(12)) {
        const tilt = Math.atan2(P[12].y - P[11].y, P[12].x - P[11].x) * 180 / Math.PI;
        ctx.setLineDash([2, 4]);
        this.seg({ x: P[11].x - 24 * k, y: P[11].y }, { x: P[12].x + 24 * k, y: P[12].y }, 1, rgba(S.accent, 0.5));
        ctx.setLineDash([]);
        this.readout(S, mSh.x, P[11].y - 16 * k, `TILT ${tilt >= 0 ? '+' : ''}${tilt.toFixed(0)}°`, S.accent);
      }
    }

    // joint angles: elbows + knees
    if (S.bodyAngles) {
      const groups = [['ELBOW L', 11, 13, 15], ['ELBOW R', 12, 14, 16], ['KNEE L', 23, 25, 27], ['KNEE R', 24, 26, 28]];
      ctx.font = `600 10px ${MONO}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (const [label, a, b, c] of groups) {
        if (!vis(a) || !vis(b) || !vis(c)) continue;
        const A = { x: LM[a].x * aspect, y: LM[a].y, z: LM[a].z * aspect };
        const Bp = { x: LM[b].x * aspect, y: LM[b].y, z: LM[b].z * aspect };
        const C = { x: LM[c].x * aspect, y: LM[c].y, z: LM[c].z * aspect };
        const ang = Math.round(180 - jointAngle(A, Bp, C));
        const col = b % 2 ? S.accent : S.secondary;
        this.readout(S, P[b].x, P[b].y - 18 * k, `${label.split(' ')[0]} ${ang}°`, col);
      }
    }

    if (S.bodyVelocity) {
      for (const i of [15, 16, 27, 28]) {
        const p = P[i]; const lm = LM[i];
        const vx = (lm.vx || 0) * this.w * 0.1 * (S.mirror ? -1 : 1), vy = (lm.vy || 0) * this.h * 0.1;
        const L = Math.hypot(vx, vy); if (L < 4) continue;
        const kk = Math.min(1, 130 / L);
        const ex = p.x + vx * kk, ey = p.y + vy * kk;
        ctx.strokeStyle = S.secondary; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(ex, ey); ctx.stroke();
        const a = Math.atan2(ey - p.y, ex - p.x);
        ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(ex - Math.cos(a - 0.4) * 8, ey - Math.sin(a - 0.4) * 8); ctx.moveTo(ex, ey); ctx.lineTo(ex - Math.cos(a + 0.4) * 8, ey - Math.sin(a + 0.4) * 8); ctx.stroke();
      }
    }

    if (S.bodyBBox) {
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      for (let i = 0; i < 33; i++) { if (!vis(i)) continue; x0 = Math.min(x0, P[i].x); y0 = Math.min(y0, P[i].y); x1 = Math.max(x1, P[i].x); y1 = Math.max(y1, P[i].y); }
      const pad = 16 * k; x0 -= pad; y0 -= pad; x1 += pad; y1 += pad;
      const col = S.accent;
      const L = Math.min(26, (x1 - x0) * 0.18);
      ctx.strokeStyle = col; ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x0, y0 + L); ctx.lineTo(x0, y0); ctx.lineTo(x0 + L, y0);
      ctx.moveTo(x1 - L, y0); ctx.lineTo(x1, y0); ctx.lineTo(x1, y0 + L);
      ctx.moveTo(x1, y1 - L); ctx.lineTo(x1, y1); ctx.lineTo(x1 - L, y1);
      ctx.moveTo(x0 + L, y1); ctx.lineTo(x0, y1); ctx.lineTo(x0, y1 - L);
      ctx.stroke();
      ctx.font = `600 10.5px ${MONO}`; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
      const label = `BODY-01 · TRACKING`;
      const tw = ctx.measureText(label).width + 14;
      this.rrect(x0, y0 - 21, tw, 17, 8.5); ctx.fillStyle = col; ctx.fill();
      ctx.fillStyle = '#071012'; ctx.fillText(label, x0 + 7, y0 - 12.5);
    }

    if (S.bodyPosture) {
      const rows = [];
      if (vis(11) && vis(23)) rows.push(['LEAN', `${(Math.atan2(mSh.x - mHp.x, mHp.y - mSh.y) * 180 / Math.PI).toFixed(0)}°`]);
      if (vis(11) && vis(12)) rows.push(['TILT', `${(Math.atan2(P[12].y - P[11].y, P[12].x - P[11].x) * 180 / Math.PI).toFixed(0)}°`]);
      for (const [label, a, b, c] of [['KNEE L', 23, 25, 27], ['KNEE R', 24, 26, 28]]) {
        if (!vis(a) || !vis(b) || !vis(c)) continue;
        const ang = Math.round(180 - jointAngle({ x: LM[a].x * aspect, y: LM[a].y, z: LM[a].z * aspect }, { x: LM[b].x * aspect, y: LM[b].y, z: LM[b].z * aspect }, { x: LM[c].x * aspect, y: LM[c].y, z: LM[c].z * aspect }));
        rows.push([label, ang + '°']);
      }
      if (rows.length) this.panel(S, 18, 136, 118, rows.length * 17 + 10, 'POSTURE', rows, S.accent);
    }
  }

  // Rounded-rect path with graceful fallback
  rrect(x, y, w, h, r) {
    const { ctx } = this;
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, rr);
    else {
      ctx.moveTo(x + rr, y);
      ctx.arcTo(x + w, y, x + w, y + h, rr);
      ctx.arcTo(x + w, y + h, x, y + h, rr);
      ctx.arcTo(x, y + h, x, y, rr);
      ctx.arcTo(x, y, x + w, y, rr);
      ctx.closePath();
    }
  }

  // Small HUD readout chip
  readout(S, x, y, text, col) {
    const { ctx } = this;
    ctx.font = `600 10px ${MONO}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const w = ctx.measureText(text).width + 10;
    this.rrect(x - w / 2, y - 8, w, 15, 7.5); ctx.fillStyle = 'rgba(6,9,10,0.78)'; ctx.fill();
    ctx.strokeStyle = rgba(col, 0.3); ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = col; ctx.fillText(text, x, y);
  }

  // Labelled HUD panel
  panel(S, x, y, w, h, title, rows, col) {
    const { ctx } = this;
    this.rrect(x, y, w, h, 10); ctx.fillStyle = 'rgba(5,7,8,.78)'; ctx.fill();
    ctx.strokeStyle = rgba(col, 0.4); ctx.lineWidth = 1; ctx.stroke();
    this.rrect(x + 5, y + 5, 2.5, h - 10, 1.25); ctx.fillStyle = col; ctx.fill();
    ctx.font = `600 9.5px ${MONO}`; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    ctx.fillStyle = rgba(col, 0.9); ctx.fillText(title, x + 8, y + 11);
    rows.forEach(([k, v], i) => {
      ctx.fillStyle = 'rgba(232,237,242,.6)'; ctx.fillText(k, x + 8, y + 26 + i * 17);
      ctx.fillStyle = '#e8edf2'; ctx.textAlign = 'right'; ctx.fillText(v, x + w - 8, y + 26 + i * 17); ctx.textAlign = 'left';
    });
  }

  // ---------------- object detection ----------------
  drawObjects(S, scene, t) {
    const { ctx, w, h } = this;
    const objs = scene.objects || [];
    const col = S.tacColor || S.accent;
    const f = Math.max(w, h) * 0.87;

    for (const o of objs) {
      const r = o.rect;
      if (r.w < 4 || r.h < 4) continue;
      const isPerson = o.cls === 'person';
      const c = isPerson ? col : S.secondary;
      if (S.objFill) { ctx.fillStyle = rgba(c, 0.07); ctx.fillRect(r.x, r.y, r.w, r.h); }
      if (S.objBoxes) {
        ctx.strokeStyle = c; ctx.lineWidth = 1.5;
        if (S.objBoxStyle === 'full') { ctx.strokeRect(r.x, r.y, r.w, r.h); }
        else if (S.objBoxStyle === 'dashed') { ctx.setLineDash([6, 5]); ctx.strokeRect(r.x, r.y, r.w, r.h); ctx.setLineDash([]); }
        else {
          const L = Math.min(22, Math.min(r.w, r.h) * 0.22);
          ctx.beginPath();
          ctx.moveTo(r.x, r.y + L); ctx.lineTo(r.x, r.y); ctx.lineTo(r.x + L, r.y);
          ctx.moveTo(r.x + r.w - L, r.y); ctx.lineTo(r.x + r.w, r.y); ctx.lineTo(r.x + r.w, r.y + L);
          ctx.moveTo(r.x + r.w, r.y + r.h - L); ctx.lineTo(r.x + r.w, r.y + r.h); ctx.lineTo(r.x + r.w - L, r.y + r.h);
          ctx.moveTo(r.x + L, r.y + r.h); ctx.lineTo(r.x, r.y + r.h); ctx.lineTo(r.x, r.y + r.h - L);
          ctx.stroke();
        }
      }
      if (S.objScan) {
        ctx.save(); ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); ctx.clip();
        const sy = r.y + ((t * 0.06 + o.id * 53) % (r.h + 40)) - 20;
        ctx.strokeStyle = rgba(c, 0.55); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(r.x, sy); ctx.lineTo(r.x + r.w, sy); ctx.stroke();
        ctx.fillStyle = rgba(c, 0.1); ctx.fillRect(r.x, sy - 14, r.w, 14);
        ctx.restore();
      }
      const head = [];
      if (S.objLabels) {
        head.push([`${o.cls.toUpperCase()}`, c]);
        if (S.objConfidence) head.push([`${Math.round(o.score * 100)}%`, col]);
        if (S.objIds) head[0] = [`OBJ-${String(o.id).padStart(2, '0')} · ${o.cls.toUpperCase()}`, c];
      }
      if (head.length) {
        ctx.font = `600 10.5px ${MONO}`; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
        const bw = Math.max(...head.map(([s]) => ctx.measureText(s).width)) + 16;
        const bh = head.length * 15 + 8;
        const by = Math.max(r.y - bh - 4, 8);
        this.rrect(r.x, by, bw, bh, 6); ctx.fillStyle = 'rgba(5,7,8,.82)'; ctx.fill();
        this.rrect(r.x, by, 2.5, bh, 1.25); ctx.fillStyle = c; ctx.fill();
        head.forEach(([s, cc], i) => { ctx.fillStyle = cc; ctx.fillText(s, r.x + 8, by + 11 + i * 15); });
        if (S.objConfidence) {
          const bwid = 54;
          this.rrect(r.x, by + bh + 4, bwid, 3, 1.5); ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fill();
          this.rrect(r.x, by + bh + 4, bwid * clamp(o.score, 0, 1), 3, 1.5); ctx.fillStyle = c; ctx.fill();
        }
      }
      if (S.objRange) {
        const rng = isPerson ? clamp((168 * f) / r.h, 15, 800) : clamp((32 * f) / r.w, 5, 800);
        this.readout(S, r.x + r.w / 2, r.y + r.h + 14, `RNG ${rng.toFixed(0)} CM`, c);
      }
      if (S.objTrails && o.hist.length > 1) {
        ctx.lineWidth = 1.4;
        for (let i = 1; i < o.hist.length; i++) {
          const kk = i / o.hist.length;
          ctx.strokeStyle = rgba(toHex(c), kk * 0.6);
          ctx.beginPath(); ctx.moveTo(o.hist[i - 1].x, o.hist[i - 1].y); ctx.lineTo(o.hist[i].x, o.hist[i].y); ctx.stroke();
        }
      }
      if (S.objVelocity) {
        const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
        const L = Math.hypot(o.vx, o.vy);
        if (L > 12) {
          const kk = Math.min(1, 220 / L);
          const ex = cx + o.vx * kk * 0.28, ey = cy + o.vy * kk * 0.28;
          ctx.strokeStyle = c; ctx.lineWidth = 1.6;
          ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(ex, ey); ctx.stroke();
          const a = Math.atan2(ey - cy, ex - cx);
          ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(ex - Math.cos(a - 0.4) * 8, ey - Math.sin(a - 0.4) * 8); ctx.moveTo(ex, ey); ctx.lineTo(ex - Math.cos(a + 0.4) * 8, ey - Math.sin(a + 0.4) * 8); ctx.stroke();
        }
      }
      if (S.objPredict && Math.hypot(o.vx, o.vy) > 15) {
        // trajectory prediction: dashed lead line + ghost box at the projected position
        const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
        const lead = S.objPredictMs / 1000;
        const px = cx + o.vx * lead, py = cy + o.vy * lead;
        const m = 1 - Math.min(0.9, Math.hypot(o.vx, o.vy) / 900);
        ctx.save();
        ctx.globalAlpha = 0.28 + 0.3 * m;
        ctx.strokeStyle = c; ctx.lineWidth = 1.4;
        ctx.setLineDash([7, 6]);
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(px, py); ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha *= 0.8;
        this.rrect(px - r.w / 2, py - r.h / 2, r.w, r.h, 7); ctx.stroke();
        // centre marker
        ctx.beginPath(); ctx.moveTo(px - 6, py); ctx.lineTo(px + 6, py); ctx.moveTo(px, py - 6); ctx.lineTo(px, py + 6); ctx.stroke();
        ctx.restore();
      }
      if (S.objLock) {
        this.objLocks = this.objLocks || new Map();
        let Lk = this.objLocks.get(o.id); if (!Lk) { Lk = { t0: t }; this.objLocks.set(o.id, Lk); }
        const kk = clamp((t - Lk.t0) / 900, 0, 1); const locked = kk >= 1;
        const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
        const rr = Math.max(r.w, r.h) * 0.62 + 14;
        const lc = locked ? '#e0624f' : c;
        ctx.strokeStyle = lc; ctx.lineWidth = 1.4;
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(Math.PI / 4 * (1 - kk) + (locked ? 0 : t * 0.002));
        ctx.beginPath(); ctx.moveTo(0, -rr); ctx.lineTo(rr, 0); ctx.lineTo(0, rr); ctx.lineTo(-rr, 0); ctx.closePath();
        ctx.setLineDash(locked ? [] : [6, 5]); ctx.stroke(); ctx.setLineDash([]); ctx.restore();
      }
    }
    const liveIds = new Set(objs.map((o) => o.id));
    if (this.objLocks) for (const k of this.objLocks.keys()) if (!liveIds.has(k)) this.objLocks.delete(k);

    if (S.objHistogram && objs.length) {
      const counts = {};
      for (const o of objs) counts[o.cls] = (counts[o.cls] || 0) + 1;
      const rows = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 6)
        .map(([k, v]) => [k.toUpperCase(), String(v).padStart(2, '0')]);
      this.panel(S, 18, h - 150 - rows.length * 17, 150, rows.length * 17 + 10, 'CLASS CENSUS', rows, S.secondary);
    }
    if (S.objRadar) {
      const R = Math.min(S.radarSize || 64, w * 0.22), rx = w - R - 28, ry = h - R - 160;
      ctx.fillStyle = 'rgba(5,7,8,.6)'; ctx.beginPath(); ctx.arc(rx, ry, R, 0, 7); ctx.fill();
      ctx.strokeStyle = rgba(col, 0.5); ctx.lineWidth = 1;
      if (S.radarRings !== false) for (const fk of [1, 0.66, 0.33]) { ctx.beginPath(); ctx.arc(rx, ry, R * fk, 0, 7); ctx.stroke(); }
      ctx.beginPath(); ctx.moveTo(rx - R, ry); ctx.lineTo(rx + R, ry); ctx.moveTo(rx, ry - R); ctx.lineTo(rx, ry + R); ctx.stroke();
      if (S.radarSweep !== false) {
        const a = (t * 0.0022) % (Math.PI * 2);
        const gr = ctx.createConicGradient ? ctx.createConicGradient(a - 0.9, rx, ry) : null;
        if (gr) { gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.14, rgba(col, 0.28)); gr.addColorStop(0.1433, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(rx, ry, R, 0, 7); ctx.fill(); }
      }
      const f2 = Math.max(w, h) * 0.87;
      for (const o of objs) {
        const r = o.rect;
        const rng = o.cls === 'person' ? clamp((168 * f2) / r.h, 15, 800) : clamp((32 * f2) / r.w, 5, 800);
        const bx = rx + (((r.x + r.w / 2) / w) - 0.5) * 2 * R * 0.85;
        const by = ry + R - clamp(rng / 300, 0, 1) * 2 * R * 0.9;
        ctx.fillStyle = o.cls === 'person' ? col : S.secondary;
        ctx.beginPath(); ctx.arc(bx, by, 3, 0, 7); ctx.fill();
      }
      ctx.fillStyle = rgba(col, 0.8); ctx.font = `600 10px ${MONO}`; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      ctx.fillText(`CONTACTS ${String(objs.length).padStart(2, '0')}`, rx, ry + R + 12);
    }
  }

  // ---------------- face mesh ----------------
  drawFace(S, scene, t) {
    const { ctx, w, h } = this;
    const faces = scene.faces || [];
    for (const face of faces) {
      const P = face.pts;
      const col = S.accent;
      const stroke = (ring, color, width) => {
        if (ring.length < 2) return;
        ctx.strokeStyle = color; ctx.lineWidth = width;
        ctx.beginPath();
        ring.forEach((idx, i) => (i ? ctx.lineTo(P[idx].x, P[idx].y) : ctx.moveTo(P[idx].x, P[idx].y)));
        ctx.closePath(); ctx.stroke();
      };
      if (S.faceMesh) {
        const groups = [
          [FACE_RINGS.oval, S.faceContour ? 2.2 : 1.4],
          [FACE_RINGS.browL, 1.2], [FACE_RINGS.browR, 1.2],
          [FACE_RINGS.eyeL, 1.2], [FACE_RINGS.eyeR, 1.2],
          [FACE_RINGS.lipsOuter, 1.2], [FACE_RINGS.lipsInner, 1],
        ];
        for (const [ring, wd] of groups) {
          if (S.faceMeshStyle === 'neon') {
            ctx.globalCompositeOperation = 'lighter';
            stroke(ring, rgba(toHex(col), 0.18), wd * 3.2);
            ctx.globalCompositeOperation = 'source-over';
            stroke(ring, col, wd);
          } else if (S.faceMeshStyle === 'thin') {
            stroke(ring, rgba(toHex(col), 0.55), Math.max(0.6, wd * 0.5));
          } else {
            stroke(ring, col, wd);
          }
        }
      }
      if (S.facePoints) {
        ctx.fillStyle = rgba(toHex(S.secondary), 0.7);
        for (let i = 0; i < P.length; i += 2) {
          ctx.beginPath(); ctx.arc(P[i].x, P[i].y, S.facePointSize, 0, 7); ctx.fill();
        }
      }
      if (S.faceIris) {
        for (const ring of [FACE_RINGS.irisL, FACE_RINGS.irisR]) {
          const c = { x: ring.reduce((s, i) => s + P[i].x, 0) / ring.length, y: ring.reduce((s, i) => s + P[i].y, 0) / ring.length };
          const rr = Math.hypot(P[ring[0]].x - c.x, P[ring[0]].y - c.y);
          ctx.strokeStyle = S.secondary; ctx.lineWidth = 1.3;
          ctx.beginPath(); ctx.arc(c.x, c.y, rr + 2, 0, 7); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(c.x - rr - 6, c.y); ctx.lineTo(c.x - rr - 1, c.y); ctx.moveTo(c.x + rr + 1, c.y); ctx.lineTo(c.x + rr + 6, c.y);
          ctx.moveTo(c.x, c.y - rr - 6); ctx.lineTo(c.x, c.y - rr - 1); ctx.moveTo(c.x, c.y + rr + 1); ctx.lineTo(c.x, c.y + rr + 6); ctx.stroke();
          ctx.fillStyle = S.secondary; ctx.beginPath(); ctx.arc(c.x, c.y, 1.5, 0, 7); ctx.fill();
        }
      }
      if (S.faceGaze && S.faceIris) {
        // gaze vector: iris-centre offset from eye-centre, mapped to degrees
        const eye = (ring, iris) => {
          const ec = { x: ring.reduce((s, i) => s + P[i].x, 0) / ring.length, y: ring.reduce((s, i) => s + P[i].y, 0) / ring.length };
          const ic = { x: iris.reduce((s, i) => s + P[i].x, 0) / iris.length, y: iris.reduce((s, i) => s + P[i].y, 0) / iris.length };
          const rr = Math.hypot(P[ring[0]].x - ec.x, P[ring[0]].y - ec.y) || 1;
          return { dx: (ic.x - ec.x) / rr, dy: (ic.y - ec.y) / rr };
        };
        const gl = eye(FACE_RINGS.eyeL, FACE_RINGS.irisL);
        const gr = eye(FACE_RINGS.eyeR, FACE_RINGS.irisR);
        const bearing = clamp(((gl.dx + gr.dx) / 2) * 38, -45, 45); // horizontal look angle, deg
        const elev = clamp(((gl.dy + gr.dy) / 2) * 30, -35, 35);  // vertical look angle, deg
        ctx.strokeStyle = rgba(S.secondary, 0.8); ctx.lineWidth = 1.2;
        ctx.font = `600 10px ${MONO}`; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
        const ox = (P[FACE_RINGS.oval[0]].x + P[FACE_RINGS.oval[8]].x) / 2;
        const oy = Math.min(P[FACE_RINGS.oval[16]].y, P[FACE_RINGS.oval[0]].y) - 14;
        ctx.beginPath(); ctx.moveTo(ox - 18, oy); ctx.lineTo(ox + 18, oy); ctx.stroke();
        const px = ox + clamp(bearing / 45, -1, 1) * 18;
        const py = oy + clamp(elev / 35, -1, 1) * 7;
        ctx.strokeStyle = S.accent; ctx.beginPath(); ctx.moveTo(ox - 18, oy); ctx.lineTo(px, py); ctx.stroke();
        ctx.fillStyle = S.accent; ctx.beginPath(); ctx.arc(px, py, 2.2, 0, 7); ctx.fill();
        ctx.fillStyle = rgba(S.secondary, 0.85);
        ctx.fillText(`GAZE ${bearing >= 0 ? '+' : ''}${bearing.toFixed(0)}° ${elev >= 0 ? '+' : ''}${elev.toFixed(0)}°`, ox, oy - 6);
      }
      if (S.faceBBox) {
        let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
        for (const i of FACE_RINGS.oval) { x0 = Math.min(x0, P[i].x); y0 = Math.min(y0, P[i].y); x1 = Math.max(x1, P[i].x); y1 = Math.max(y1, P[i].y); }
        const pad = 16; x0 -= pad; y0 -= pad; x1 += pad; y1 += pad;
        const L = 22;
        ctx.strokeStyle = col; ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x0, y0 + L); ctx.lineTo(x0, y0); ctx.lineTo(x0 + L, y0);
        ctx.moveTo(x1 - L, y0); ctx.lineTo(x1, y0); ctx.lineTo(x1, y0 + L);
        ctx.moveTo(x1, y1 - L); ctx.lineTo(x1, y1); ctx.lineTo(x1 - L, y1);
        ctx.moveTo(x0 + L, y1); ctx.lineTo(x0, y1); ctx.lineTo(x0, y1 - L);
        ctx.stroke();
        ctx.font = `600 10.5px ${MONO}`; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
        const label = 'FACE-01 · LOCK';
        const tw = ctx.measureText(label).width + 14;
        this.rrect(x0, y0 - 21, tw, 17, 8.5); ctx.fillStyle = col; ctx.fill();
        ctx.fillStyle = '#071012'; ctx.fillText(label, x0 + 7, y0 - 12.5);
      }
      if (S.faceHead && face.matrix) {
        const m = face.matrix;
        const pitch = Math.asin(clamp(-m[9], -1, 1)) * 180 / Math.PI;
        const yaw = Math.atan2(m[8], m[10]) * 180 / Math.PI;
        const roll = Math.atan2(m[1], m[5]) * 180 / Math.PI;
        const rows = [['YAW', `${yaw >= 0 ? '+' : ''}${yaw.toFixed(1)}°`], ['PITCH', `${pitch >= 0 ? '+' : ''}${pitch.toFixed(1)}°`], ['ROLL', `${roll >= 0 ? '+' : ''}${roll.toFixed(1)}°`]];
        this.panel(S, w - 150, 136, 120, rows.length * 17 + 10, 'HEAD ATTITUDE', rows, S.secondary);
        if (S.faceGizmo) {
          const gx = w - 86, gy = 136 + rows.length * 17 + 52;
          const R = 30;
          ctx.fillStyle = 'rgba(5,7,8,.7)'; ctx.beginPath(); ctx.arc(gx, gy, R + 8, 0, 7); ctx.fill();
          ctx.strokeStyle = rgba(S.secondary, 0.6); ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(gx, gy, R, 0, 7); ctx.stroke();
          ctx.save();
          ctx.beginPath(); ctx.arc(gx, gy, R, 0, 7); ctx.clip();
          ctx.translate(gx, gy); ctx.rotate(-roll * Math.PI / 180);
          const off = clamp(pitch / 45, -1, 1) * R;
          ctx.fillStyle = 'rgba(255,255,255,.08)'; ctx.fillRect(-R, -R, R * 2, R + off);
          ctx.strokeStyle = S.accent; ctx.lineWidth = 1.4;
          ctx.beginPath(); ctx.moveTo(-R, off); ctx.lineTo(R, off); ctx.stroke();
          for (let i = -2; i <= 2; i++) { const yy = off + i * 7; ctx.beginPath(); ctx.moveTo(i % 2 ? -6 : -12, yy); ctx.lineTo(12, yy); ctx.stroke(); }
          ctx.restore();
          ctx.strokeStyle = S.secondary; ctx.lineWidth = 1.6;
          ctx.beginPath(); ctx.moveTo(gx, gy - R); ctx.lineTo(gx, gy - R + 8); ctx.moveTo(gx - 4, gy - R + 12); ctx.lineTo(gx, gy - R + 8); ctx.lineTo(gx + 4, gy - R + 12); ctx.stroke();
        }
      }
    }
    if (!faces.length) { this.blinkCount = 0; this.blinkOpen = true; }
    const face = faces[0];
    if (face && S.faceBlinks && face.blend) {
      const b = (n) => { const e = face.blend.find((c) => c.categoryName === n); return e ? e.score : 0; };
      const closed = Math.max(b('eyeBlinkLeft'), b('eyeBlinkRight'));
      if (closed > 0.5 && this.blinkOpen !== false) { this.blinkOpen = false; this.blinkCount = (this.blinkCount || 0) + 1; }
      else if (closed < 0.35 && this.blinkOpen !== true) this.blinkOpen = true;
    }
    if (face && S.faceBlinks) {
      this.panel(S, 18, 136, 150, 44, 'BLINK COUNT', [['TALLY', String(this.blinkCount || 0).padStart(3, '0')], ['LIDS', this.blinkOpen === false ? 'CLOSED' : 'OPEN']], S.secondary);
    }
    if (face && S.faceBlend && face.blend) {
      const cats = face.blend.filter((c) => c.categoryName !== '_neutral').sort((a, b) => b.score - a.score).slice(0, S.faceBlendCount);
      const bw = 250, bh = cats.length * 16 + 30;
      const bx = w / 2 - bw / 2, by = h - 170 - bh;
      this.rrect(bx, by, bw, bh, 10); ctx.fillStyle = 'rgba(5,7,8,.8)'; ctx.fill();
      ctx.strokeStyle = rgba(S.accent, 0.35); ctx.lineWidth = 1; ctx.stroke();
      ctx.font = `600 9.5px ${MONO}`; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
      ctx.fillStyle = rgba(S.accent, 0.9); ctx.fillText('BLENDSHAPE TELEMETRY', bx + 10, by + 12);
      cats.forEach((c, i) => {
        const yy = by + 30 + i * 16;
        ctx.fillStyle = 'rgba(232,237,242,.75)'; ctx.fillText(c.categoryName.toUpperCase(), bx + 10, yy);
        this.rrect(bx + 140, yy - 3, 96, 6, 3); ctx.fillStyle = 'rgba(255,255,255,.1)'; ctx.fill();
        this.rrect(bx + 140, yy - 3, 96 * clamp(c.score, 0, 1), 6, 3); ctx.fillStyle = S.accent; ctx.fill();
        ctx.fillStyle = '#e8edf2'; ctx.textAlign = 'right'; ctx.fillText(Math.round(c.score * 100) + '%', bx + bw - 10, yy); ctx.textAlign = 'left';
      });
      if (S.faceExpr && cats.length) {
        const top = cats[0];
        const el = document.getElementById('gesture');
        if (el) {
          const label = `EXPR · ${top.categoryName.toUpperCase()} ${Math.round(top.score * 100)}%`;
          if (el.dataset.expr !== label) {
            el.dataset.expr = label;
            el.innerHTML = `<b>${top.categoryName.replace(/([A-Z])/g, ' $1').trim().toUpperCase()}</b><span>coefficient ${Math.round(top.score * 100)}%</span>`;
            el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
            clearTimeout(this._exprTimer);
            this._exprTimer = setTimeout(() => { el.classList.remove('show'); el.dataset.expr = ''; }, 1200);
          }
        }
      }
    }
  }

  drawRipples(t) {
    const { ctx } = this;
    this.ripples = this.ripples.filter((r) => t - r.t0 < 600);
    for (const r of this.ripples) {
      const k = (t - r.t0) / 600;
      ctx.strokeStyle = rgba(r.col, 1 - k); ctx.lineWidth = 2 * (1 - k) + 0.5;
      ctx.beginPath(); ctx.arc(r.x, r.y, 6 + k * 44, 0, 7); ctx.stroke();
      ctx.beginPath(); ctx.arc(r.x, r.y, 3 + k * 24, 0, 7); ctx.stroke();
    }
  }

}

// Convert hsl()/rgb()/hex to hex for rgba helper
const _c = document.createElement('canvas').getContext('2d');
const _cache = new Map();
function toHex(col) {
  if (col[0] === '#') return col;
  let v = _cache.get(col);
  if (v) return v;
  _c.fillStyle = col; v = _c.fillStyle;
  if (v[0] !== '#') { const m = v.match(/\d+/g); v = '#' + m.slice(0, 3).map((n) => (+n).toString(16).padStart(2, '0')).join(''); }
  if (_cache.size > 2000) _cache.clear();
  _cache.set(col, v);
  return v;
}

// linear interpolation between two hex colours, t in [0, 1]
function mixHex(a, b, t) {
  const pa = hexToRgb(toHex(a)), pb = hexToRgb(toHex(b));
  const mix = (x, y) => Math.round(x + (y - x) * clamp(t, 0, 1));
  return '#' + [mix(pa[0], pb[0]), mix(pa[1], pb[1]), mix(pa[2], pb[2])]
    .map((n) => n.toString(16).padStart(2, '0')).join('');
}
