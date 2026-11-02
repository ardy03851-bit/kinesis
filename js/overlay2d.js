// 2D overlay renderer: skeleton, arms, tracers, reticles, effects.
import { HAND_BONES, LANDMARK_FINGER, TIPS, FINGER_NAMES, PALM_TRIS, tipsFor, convexHull, clamp, jointAngle } from './geometry.js';

const MONO = '"Geist Mono", ui-monospace, monospace';
const FINGER_COLORS = ['#f5b84b', '#5eead4', '#8fb3ff', '#c6f36b', '#ff5d73'];

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
    this.particles = [];
    this.ripples = [];
    this.strokes = []; // air paint: {pts:[{x,y,t}], color, handId, done}
    this.activeStroke = new Map();
    this.w = 1; this.h = 1; this.dpr = 1;
  }

  resize(w, h, dpr) {
    this.w = w; this.h = h; this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr); this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = w + 'px'; this.canvas.style.height = h + 'px';
    this.trails.clear();
  }

  clearPaint() { this.strokes = []; this.activeStroke.clear(); }

  colorFor(S, i, hand, t) {
    switch (S.colorMode) {
      case 'finger': { const f = LANDMARK_FINGER[i]; return f < 0 ? '#e8edf2' : FINGER_COLORS[f]; }
      case 'depth': { const z = hand.norm[i].z; return depthColor(0.5 - z * 5); }
      case 'rainbow': { const f = Math.max(0, LANDMARK_FINGER[i]); return `hsl(${(t * 0.06 + f * 46 + i * 4) % 360},90%,64%)`; }
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

    if (S.airPaint) this.updatePaint(S, scene); else if (this.activeStroke.size) this.activeStroke.clear();
    if (S.airPaint || this.strokes.length) this.drawPaint(S, scene);

    for (const arm of scene.arms) this.drawArm(S, arm, scene);
    if (S.armTracking && S.shoulders && scene.shoulders) this.drawShoulders(S, scene);

    if (S.stringWeb && scene.hands.length >= 2) this.drawWeb(S, scene.hands[0], scene.hands[1], t);

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
      if (S.lightning && hand.analysis.pinching) this.drawLightning(S, hand.pts[4], hand.pts[8], S.accent, 2);
      if (S.crosshairs) this.drawCrosshairs(S, hand, t);
      if (S.bbox || S.handLabels) this.drawFrame(S, hand, t);
      if (S.particles) this.emit(S, hand, scene.dt);
    }
    if (S.lightning && scene.hands.length >= 2) this.drawLightning(S, scene.hands[0].pts[8], scene.hands[1].pts[8], S.secondary, 3);
    if (!S.tracers && this.trails.size) this.trails.clear();
    this.prune(scene);
    this.drawParticles(S, scene.dt);
    this.drawRipples(t);
    ctx.globalAlpha = 1;
  }

  prune(scene) {
    const live = new Set(scene.hands.map((h) => h.id));
    for (const k of this.trails.keys()) if (!live.has(+k.split(':')[0])) this.trails.delete(k);
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
      ctx.fillStyle = 'rgba(6,9,10,0.78)'; ctx.fillRect(p.x + 7, p.y - 7, w, 13);
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
      ctx.fillStyle = 'rgba(6,9,10,0.8)'; ctx.fillRect(p.x - 15, p.y - 22, 30, 13);
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
      const col = S.colorMode === 'finger' ? FINGER_COLORS[TIPS.indexOf(tip)] : S.colorMode === 'rainbow' ? null : (hand.slot % 2 && S.colorMode === 'hand' ? S.secondary : S.accent);
      const n = arr.length;
      if (S.tracerStyle === 'dots') {
        for (let i = 0; i < n; i += 2) {
          const k2 = i / n; const c = col || `hsl(${(t * 0.06 + i * 8) % 360},90%,64%)`;
          ctx.fillStyle = rgba(toHex(c), k2 * 0.9);
          ctx.beginPath(); ctx.arc(arr[i].x, arr[i].y, S.tracerWidth * 0.45 * (0.4 + k2), 0, 7); ctx.fill();
        }
        continue;
      }
      ctx.globalCompositeOperation = S.tracerStyle === 'comet' ? 'lighter' : 'source-over';
      for (let i = 1; i < n; i++) {
        const k2 = i / n;
        const c = col || `hsl(${(t * 0.06 + i * 8) % 360},90%,64%)`;
        let w = S.tracerStyle === 'line' ? 1.2 : S.tracerWidth * (S.tracerStyle === 'comet' ? k2 * k2 * 1.6 : k2);
        ctx.strokeStyle = rgba(toHex(c), S.tracerStyle === 'line' ? k2 * 0.9 : k2 * 0.85);
        ctx.lineWidth = Math.max(0.5, w);
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
        ctx.fillStyle = 'rgba(6,9,10,0.72)'; ctx.fillRect(bx - 4, by - 3, 74, 42);
        ctx.fillStyle = col; ctx.fillRect(bx - 4, by - 3, 2, 42);
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
      ctx.fillStyle = col; ctx.fillRect(x0, ty, w1, 17);
      ctx.fillStyle = '#071012'; ctx.fillText(label, x0 + 7, ty + 9);
      if (gesture) {
        ctx.fillStyle = 'rgba(6,9,10,0.82)'; ctx.fillRect(x0 + w1, ty, w2, 17);
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
    ctx.fillStyle = 'rgba(6,9,10,0.8)'; ctx.fillRect(mx - w / 2, my - 8, w, 16);
    ctx.fillStyle = col; ctx.fillText(label, mx, my);
    if (hand.pinchStart) this.ripples.push({ x: mx, y: my, t0: t, col: S.secondary });
  }

  drawLightning(S, a, b, col, strands) {
    const { ctx } = this;
    const L = Math.hypot(b.x - a.x, b.y - a.y);
    if (L < 4) return;
    ctx.globalCompositeOperation = 'lighter';
    for (let s = 0; s < strands; s++) {
      let pts = [a, b];
      let disp = L * 0.18;
      for (let it = 0; it < 5; it++) {
        const np = [pts[0]];
        for (let i = 1; i < pts.length; i++) {
          const p = pts[i - 1], q = pts[i];
          const nx = -(q.y - p.y), ny = q.x - p.x, nl = Math.hypot(nx, ny) || 1;
          const off = (Math.random() - 0.5) * disp;
          np.push({ x: (p.x + q.x) / 2 + nx / nl * off, y: (p.y + q.y) / 2 + ny / nl * off }, q);
        }
        pts = np; disp *= 0.55;
      }
      for (const [w, al] of [[6, 0.12], [2.5, 0.45], [1, 0.95]]) {
        ctx.strokeStyle = al > 0.9 ? '#ffffff' : rgba(col, al); ctx.lineWidth = w;
        ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
        ctx.stroke();
      }
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  drawWeb(S, h1, h2, t) {
    const { ctx } = this;
    ctx.lineWidth = 1.1;
    TIPS.forEach((tip, k) => {
      const a = h1.pts[tip], b = h2.pts[tip];
      const sag = Math.min(60, Math.hypot(b.x - a.x, b.y - a.y) * 0.12);
      ctx.strokeStyle = rgba(FINGER_COLORS[k], 0.75);
      ctx.beginPath(); ctx.moveTo(a.x, a.y);
      ctx.quadraticCurveTo((a.x + b.x) / 2, (a.y + b.y) / 2 + sag + Math.sin(t * 0.004 + k) * 3, b.x, b.y);
      ctx.stroke();
    });
    // cross strings
    ctx.strokeStyle = rgba(S.accent, 0.25);
    for (let k = 0; k < 4; k++) {
      const a = h1.pts[TIPS[k]], b = h2.pts[TIPS[k + 1]];
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
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
      ctx.fillStyle = 'rgba(6,9,10,0.8)'; ctx.fillRect(lx - tw / 2, ly - 8, tw, 16);
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

  // ---------------- particles & ripples ----------------
  emit(S, hand, dt) {
    const rate = S.particleRate;
    for (const tip of TIPS) {
      const p = hand.pts[tip], n = hand.norm[tip];
      const speed = Math.hypot(n.vx || 0, n.vy || 0);
      const count = Math.min(6, Math.floor(rate * (0.15 + speed * 1.2) + Math.random()));
      for (let k = 0; k < count; k++) {
        if (this.particles.length > 700) this.particles.shift();
        const a = Math.random() * Math.PI * 2, v = 20 + Math.random() * 80;
        this.particles.push({
          x: p.x, y: p.y, vx: Math.cos(a) * v - (n.vx || 0) * 60 * (S.mirror ? -1 : 1), vy: Math.sin(a) * v - (n.vy || 0) * 60,
          life: 0, max: 0.5 + Math.random() * 0.8,
          col: S.colorMode === 'finger' ? FINGER_COLORS[TIPS.indexOf(tip)] : (Math.random() < 0.3 ? S.secondary : S.accent),
          s: 1 + Math.random() * 2.2,
        });
      }
    }
  }

  drawParticles(S, dt) {
    if (!this.particles.length) return;
    const { ctx } = this;
    ctx.globalCompositeOperation = 'lighter';
    const out = [];
    for (const p of this.particles) {
      p.life += dt; if (p.life > p.max) continue;
      p.vy += 60 * dt; p.vx *= 0.97; p.vy *= 0.97;
      p.x += p.vx * dt; p.y += p.vy * dt;
      const k = 1 - p.life / p.max;
      ctx.fillStyle = rgba(p.col, k);
      ctx.fillRect(p.x - p.s / 2, p.y - p.s / 2, p.s, p.s);
      out.push(p);
    }
    this.particles = out;
    ctx.globalCompositeOperation = 'source-over';
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

  // ---------------- air paint ----------------
  updatePaint(S, scene) {
    const now = scene.t;
    const live = new Set();
    for (const hand of scene.hands) {
      live.add(hand.id);
      const n4 = hand.norm[4], n8 = hand.norm[8];
      const pt = { x: (n4.x + n8.x) / 2, y: (n4.y + n8.y) / 2, t: now };
      let stroke = this.activeStroke.get(hand.id);
      if (hand.paintDown) {
        if (!stroke) {
          stroke = { pts: [], color: S.colorMode === 'rainbow' ? `hsl(${(now * 0.05) % 360},90%,64%)` : (hand.slot % 2 ? S.secondary : S.accent), done: false, t: now };
          this.strokes.push(stroke); this.activeStroke.set(hand.id, stroke);
        }
        const last = stroke.pts[stroke.pts.length - 1];
        if (!last || Math.hypot(last.x - pt.x, last.y - pt.y) > 0.002) stroke.pts.push(pt);
        stroke.t = now;
      } else if (stroke) { stroke.done = true; this.activeStroke.delete(hand.id); }
    }
    for (const [id, s] of this.activeStroke) if (!live.has(id)) { s.done = true; this.activeStroke.delete(id); }
    if (S.paintFade > 0) {
      const life = S.paintFade * 1000;
      this.strokes = this.strokes.filter((s) => !s.done || now - s.t < life);
    }
    if (this.strokes.length > 400) this.strokes.shift();
  }

  drawPaint(S, scene) {
    const { ctx } = this;
    const map = scene.map;
    const now = scene.t;
    for (const s of this.strokes) {
      if (s.pts.length < 2) continue;
      const fade = S.paintFade > 0 && s.done ? clamp(1 - (now - s.t) / (S.paintFade * 1000), 0, 1) : 1;
      const pts = s.pts.map((p) => map(p.x, p.y));
      const col = toHex(s.color);
      for (const [w, a] of [[14, 0.08], [7, 0.22], [3, 1]]) {
        ctx.strokeStyle = w === 3 ? rgba(col, fade) : rgba(col, a * fade);
        ctx.lineWidth = w;
        ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length - 1; i++) {
          const mx = (pts[i].x + pts[i + 1].x) / 2, my = (pts[i].y + pts[i + 1].y) / 2;
          ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
        }
        ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
        ctx.stroke();
      }
    }
    // cursor for painting hands
    for (const hand of scene.hands) {
      const a = hand.pts[4], b = hand.pts[8];
      const x = (a.x + b.x) / 2, y = (a.y + b.y) / 2;
      ctx.strokeStyle = hand.paintDown ? S.secondary : rgba(S.accent, 0.6); ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(x, y, hand.paintDown ? 5 : 9, 0, 7); ctx.stroke();
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
