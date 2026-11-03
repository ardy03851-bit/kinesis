// Real-time volumetric 3D hand (and forearm) rig rendered with three.js.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { HAND_BONES } from './geometry.js';

// Joint radius as fraction of palm length (wrist → middle MCP)
const JR = [0.2, 0.14, 0.12, 0.105, 0.09, 0.115, 0.1, 0.09, 0.08, 0.118, 0.102, 0.09, 0.08, 0.11, 0.096, 0.085, 0.076, 0.1, 0.086, 0.077, 0.07];
const PALM_OUTLINE = [0, 1, 2, 5, 9, 13, 17];

const fresnelVS = /* glsl */`
  varying vec3 vN; varying vec3 vWorld;
  void main(){
    vN = normalize(normalMatrix * normal);
    vec4 wp = modelMatrix * vec4(position,1.0); vWorld = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }`;
const fresnelFS = /* glsl */`
  uniform vec3 uColor; uniform float uPower; uniform float uBase; uniform float uOpacity; uniform float uTime; uniform float uScan;
  varying vec3 vN; varying vec3 vWorld;
  void main(){
    float f = 1.0 - abs(dot(normalize(vN), vec3(0.0,0.0,1.0)));
    float i = uBase + pow(f, uPower);
    if (uScan > 0.0) {
      float band = smoothstep(0.0, 1.0, sin(vWorld.y * 0.35 - uTime * 4.0) * 0.5 + 0.5);
      float fine = step(0.5, fract(vWorld.y * 0.25 + uTime * 0.5));
      i *= mix(0.55, 1.25, band) * mix(0.75, 1.0, fine);
    }
    gl_FragColor = vec4(uColor * (0.6 + i), clamp(i, 0.0, 1.0) * uOpacity);
  }`;

function fresnelMat(color, { power = 2.2, base = 0.1, opacity = 1, scan = 0, side = THREE.FrontSide } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(color) }, uPower: { value: power }, uBase: { value: base },
      uOpacity: { value: opacity }, uTime: { value: 0 }, uScan: { value: scan },
    },
    vertexShader: fresnelVS, fragmentShader: fresnelFS,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side,
  });
}

const UP = new THREE.Vector3(0, 1, 0);
const _v = new THREE.Vector3(), _q = new THREE.Quaternion();

function placeSegment(mesh, a, b, r, rz = r) {
  _v.subVectors(b, a);
  const len = _v.length() || 0.001;
  mesh.position.copy(a).addScaledVector(_v, 0.5);
  _q.setFromUnitVectors(UP, _v.divideScalar(len));
  mesh.quaternion.copy(_q);
  mesh.scale.set(r, len, rz);
}

class Rig {
  constructor(owner) {
    this.o = owner;
    this.group = new THREE.Group();
    this.bones = []; this.joints = []; this.boneShells = []; this.jointShells = [];
    for (let i = 0; i < HAND_BONES.length; i++) {
      const m = new THREE.Mesh(owner.geo.cyl, owner.mat.body); m.frustumCulled = false; this.group.add(m); this.bones.push(m);
      const s = new THREE.Mesh(owner.geo.cyl, owner.mat.shell); s.frustumCulled = false; this.group.add(s); this.boneShells.push(s);
    }
    for (let i = 0; i < 21; i++) {
      const m = new THREE.Mesh(owner.geo.sph, owner.mat.joint); m.frustumCulled = false; this.group.add(m); this.joints.push(m);
      const s = new THREE.Mesh(owner.geo.sph, owner.mat.shell); s.frustumCulled = false; this.group.add(s); this.jointShells.push(s);
    }
    // Thick palm: front cap, back cap, sides
    const n = PALM_OUTLINE.length;
    this.palmGeo = new THREE.BufferGeometry();
    this.palmPos = new Float32Array((n * 2 + 2) * 3);
    this.palmGeo.setAttribute('position', new THREE.BufferAttribute(this.palmPos, 3));
    const idx = [];
    const cF = n * 2, cB = n * 2 + 1;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      idx.push(cF, i, j); idx.push(cB, n + j, n + i);
      idx.push(i, n + i, j); idx.push(j, n + i, n + j);
    }
    this.palmGeo.setIndex(idx);
    this.palm = new THREE.Mesh(this.palmGeo, owner.mat.palm); this.palm.frustumCulled = false;
    this.group.add(this.palm);
    this.pts = Array.from({ length: 21 }, () => new THREE.Vector3());
    // Forearm
    this.arm = {
      upper: new THREE.Mesh(owner.geo.cyl, owner.mat.body), fore: new THREE.Mesh(owner.geo.cyl, owner.mat.body),
      elbow: new THREE.Mesh(owner.geo.sph, owner.mat.joint), shoulder: new THREE.Mesh(owner.geo.sph, owner.mat.joint),
      wristCap: new THREE.Mesh(owner.geo.sph, owner.mat.body),
    };
    Object.values(this.arm).forEach((m) => { m.frustumCulled = false; this.group.add(m); });
    this.group.visible = false;
  }

  applyMaterials() {
    const M = this.o.mat; const G = this.o.geo;
    const segGeo = this.o.style === 'robot' ? G.box : G.cyl;
    this.bones.forEach((m) => { m.material = M.body; m.geometry = segGeo; });
    this.joints.forEach((m) => { m.material = M.joint; m.geometry = this.o.style === 'robot' ? G.servo : G.sph; });
    this.boneShells.forEach((m) => (m.material = M.shell));
    this.jointShells.forEach((m) => (m.material = M.shell));
    this.palm.material = M.palm;
    this.arm.upper.material = M.body; this.arm.fore.material = M.body; this.arm.wristCap.material = M.body;
    this.arm.upper.geometry = segGeo; this.arm.fore.geometry = segGeo;
    this.arm.elbow.material = M.joint; this.arm.shoulder.material = M.joint;
  }

  update(hand, arm, S, W, H) {
    const st = this.o.style;
    const depth = S.hand3dDepth;
    const P = this.pts;
    for (let i = 0; i < 21; i++) {
      const p = hand.pts[i];
      P[i].set(p.x - W / 2, H / 2 - p.y, -hand.norm[i].z * hand.zScale * depth);
    }
    const palmLen = Math.max(8, P[0].distanceTo(P[9]));
    const girth = S.hand3dThickness * (st === 'neon' ? 0.45 : st === 'xray' ? 0.42 : st === 'wire' ? 0.9 : 1);
    const jointBoost = st === 'xray' ? 1.55 : st === 'robot' ? 1.1 : 1;
    const shell = S.hand3dGlow || st === 'xray' || st === 'neon';
    const shellK = st === 'xray' ? 2.35 : 1.7;

    HAND_BONES.forEach(([a, b], k) => {
      const r = palmLen * (JR[a] + JR[b]) * 0.5 * girth;
      if (st === 'robot') placeSegment(this.bones[k], P[a], P[b], r * 1.35, r * 1.1);
      else placeSegment(this.bones[k], P[a], P[b], r);
      const s = this.boneShells[k];
      s.visible = shell;
      if (shell) placeSegment(s, P[a], P[b], r * shellK);
    });
    for (let i = 0; i < 21; i++) {
      const r = palmLen * JR[i] * girth * jointBoost;
      const m = this.joints[i];
      m.position.copy(P[i]);
      if (st === 'robot') {
        // servo cylinders aligned with the bone axis feeding this joint
        const parent = i === 0 ? 9 : HAND_BONES.find(([, b]) => b === i)?.[0] ?? 0;
        _v.subVectors(P[i], P[parent]).normalize();
        m.quaternion.setFromUnitVectors(UP, _v);
        m.scale.set(r * 1.25, r * 0.9, r * 1.25);
      } else { m.quaternion.identity(); m.scale.setScalar(r); }
      const s = this.jointShells[i]; s.visible = shell;
      if (shell) { s.position.copy(P[i]); s.scale.setScalar(r * shellK * (st === 'xray' ? 1 / jointBoost : 1)); }
    }
    // Palm slab
    this.palm.visible = st !== 'xray' && st !== 'neon';
    if (this.palm.visible) {
      const a = _v.subVectors(P[5], P[0]);
      const b = new THREE.Vector3().subVectors(P[17], P[0]);
      const nrm = new THREE.Vector3().crossVectors(a, b).normalize();
      const th = palmLen * 0.11 * girth;
      const n = PALM_OUTLINE.length;
      const c = new THREE.Vector3();
      PALM_OUTLINE.forEach((id) => c.add(P[id])); c.divideScalar(n);
      const pos = this.palmPos;
      PALM_OUTLINE.forEach((id, i) => {
        // pull outline slightly toward centre so slab sits inside the bone tubes
        const q = P[id].clone().lerp(c, 0.12);
        pos[i * 3] = q.x + nrm.x * th; pos[i * 3 + 1] = q.y + nrm.y * th; pos[i * 3 + 2] = q.z + nrm.z * th;
        pos[(n + i) * 3] = q.x - nrm.x * th; pos[(n + i) * 3 + 1] = q.y - nrm.y * th; pos[(n + i) * 3 + 2] = q.z - nrm.z * th;
      });
      const cf = n * 2;
      pos[cf * 3] = c.x + nrm.x * th * 1.25; pos[cf * 3 + 1] = c.y + nrm.y * th * 1.25; pos[cf * 3 + 2] = c.z + nrm.z * th * 1.25;
      pos[(cf + 1) * 3] = c.x - nrm.x * th * 1.25; pos[(cf + 1) * 3 + 1] = c.y - nrm.y * th * 1.25; pos[(cf + 1) * 3 + 2] = c.z - nrm.z * th * 1.25;
      this.palmGeo.attributes.position.needsUpdate = true;
      this.palmGeo.computeVertexNormals();
      this.palmGeo.computeBoundingSphere();
    }
    // Forearm
    const A = this.arm;
    const showArm = !!(arm && S.arm3d);
    Object.values(A).forEach((m) => (m.visible = showArm));
    if (showArm) {
      const toV = (p, z) => new THREE.Vector3(p.x - W / 2, H / 2 - p.y, z * depth);
      const el = toV(arm.elbow, arm.ez), wr = P[0].clone();
      const sh = arm.shoulder ? toV(arm.shoulder, arm.sz) : null;
      const rf = palmLen * 0.21 * S.hand3dThickness, ru = palmLen * 0.27 * S.hand3dThickness;
      const st2 = st === 'neon' || st === 'xray' ? 0.45 : 1;
      A.upper.visible = A.shoulder.visible = !!sh;
      if (sh) placeSegment(A.upper, sh, el, ru * st2 * (st === 'robot' ? 1.2 : 1), ru * st2);
      placeSegment(A.fore, el, wr, rf * st2 * (st === 'robot' ? 1.2 : 1), rf * st2);
      A.elbow.position.copy(el); A.elbow.scale.setScalar(rf * 1.12 * st2); A.elbow.quaternion.identity();
      if (sh) A.shoulder.position.copy(sh);
      A.shoulder.scale.setScalar(ru * 1.15 * st2); A.shoulder.quaternion.identity();
      A.wristCap.position.copy(wr); A.wristCap.scale.setScalar(rf * st2); A.wristCap.quaternion.identity();
    }
    this.group.visible = true;
  }
}

export class Hand3D {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance', premultipliedAlpha: true });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 6000);
    this.camera.position.set(0, 0, 3000);
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environment = this.env;

    this.hemi = new THREE.HemisphereLight(0xffffff, 0x223040, 0.7);
    this.key = new THREE.DirectionalLight(0xffffff, 2.2);
    this.rim = new THREE.DirectionalLight(0x9fd8ff, 1.2);
    this.rim.position.set(-400, 200, -600);
    this.scene.add(this.hemi, this.key, this.rim);

    this.geo = {
      cyl: new THREE.CylinderGeometry(1, 1, 1, 20, 1, true),
      sph: new THREE.SphereGeometry(1, 24, 16),
      box: new THREE.BoxGeometry(1.4, 0.84, 1.1),
      servo: new THREE.CylinderGeometry(1, 1, 1.2, 18, 1),
    };
    this.mat = {};
    this.style = null; this.tint = null;
    this.rigs = [];
    this.w = 1; this.h = 1;
    this.setStyle('mannequin', '#9fc9a6');
  }

  resize(w, h, dpr) {
    this.w = w; this.h = h;
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.canvas.style.width = w + 'px'; this.canvas.style.height = h + 'px';
    Object.assign(this.camera, { left: -w / 2, right: w / 2, top: h / 2, bottom: -h / 2 });
    this.camera.updateProjectionMatrix();
  }

  setStyle(style, tint) {
    if (style === this.style && tint === this.tint) return;
    this.style = style; this.tint = tint;
    Object.values(this.mat).forEach((m) => m.dispose?.());
    const T = new THREE.Color(tint);
    const std = (o) => new THREE.MeshStandardMaterial(o);
    let body, joint, palm, shell;
    switch (style) {
      case 'chrome':
        body = std({ color: 0xffffff, metalness: 1, roughness: 0.06, envMapIntensity: 1.4 });
        joint = body; palm = body; break;
      case 'gold':
        body = std({ color: 0xf0bd62, metalness: 1, roughness: 0.2, envMapIntensity: 1.3 });
        joint = body; palm = body; break;
      case 'hologram':
        body = fresnelMat(T, { power: 1.6, base: 0.12, scan: 1 });
        joint = fresnelMat(T, { power: 1.2, base: 0.3, scan: 1 });
        palm = fresnelMat(T, { power: 1.4, base: 0.05, scan: 1, side: THREE.DoubleSide }); break;
      case 'robot':
        body = std({ color: 0x2b3036, metalness: 0.75, roughness: 0.32, envMapIntensity: 0.9 });
        joint = std({ color: T, emissive: T, emissiveIntensity: 0.9, metalness: 0.3, roughness: 0.4 });
        palm = std({ color: 0x1f2328, metalness: 0.8, roughness: 0.38, flatShading: true }); break;
      case 'xray':
        body = fresnelMat(0xeef4ff, { power: 1.1, base: 0.35 });
        joint = fresnelMat(0xeef4ff, { power: 1.0, base: 0.45 });
        palm = fresnelMat(T, { power: 2, base: 0.02, side: THREE.DoubleSide }); break;
      case 'glass':
        body = new THREE.MeshPhysicalMaterial({ color: T.clone().lerp(new THREE.Color(0xffffff), 0.6), metalness: 0, roughness: 0.12, transparent: true, opacity: 0.38, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 1.6, depthWrite: false });
        joint = body; palm = body; break;
      case 'wire':
        body = new THREE.MeshBasicMaterial({ color: T, wireframe: true, transparent: true, opacity: 0.85 });
        joint = body; palm = body; break;
      case 'neon':
        body = new THREE.MeshBasicMaterial({ color: T.clone().lerp(new THREE.Color(0xffffff), 0.35) });
        joint = new THREE.MeshBasicMaterial({ color: 0xffffff });
        palm = body; break;
      case 'ghost':
        body = std({ color: 0xf2f5f7, emissive: T, emissiveIntensity: 0.18, roughness: 0.6, transparent: true, opacity: 0.42, depthWrite: false });
        joint = body; palm = body; break;
      case 'carbon':
        body = std({ color: 0x191c1f, metalness: 0.5, roughness: 0.4, envMapIntensity: 0.75 });
        joint = std({ color: 0x2b3036, metalness: 0.62, roughness: 0.3, envMapIntensity: 0.8 });
        palm = body; break;
      case 'obsidian':
        body = new THREE.MeshPhysicalMaterial({ color: 0x0b0d10, metalness: 0.1, roughness: 0.07, clearcoat: 1, clearcoatRoughness: 0.04, envMapIntensity: 1.6 });
        joint = body; palm = body; break;
      case 'titanium':
        body = std({ color: 0x929aa2, metalness: 0.94, roughness: 0.3, envMapIntensity: 1.15 });
        joint = body; palm = body; break;
      case 'graphite':
        body = std({ color: 0x3c4147, metalness: 0.18, roughness: 0.7, flatShading: true, envMapIntensity: 0.55 });
        joint = body; palm = body; break;
      case 'aerogel':
        body = new THREE.MeshPhysicalMaterial({ color: T.clone().lerp(new THREE.Color(0xffffff), 0.65), roughness: 0.22, metalness: 0, transparent: true, opacity: 0.3, transmission: 0.55, thickness: 1.6, envMapIntensity: 1.4, depthWrite: false });
        joint = body; palm = body; break;
      default: // mannequin
        body = std({ color: 0xd8d2c8, roughness: 0.58, metalness: 0.0, envMapIntensity: 0.6 });
        joint = body;
        palm = std({ color: 0xd2ccc2, roughness: 0.62, metalness: 0.0, envMapIntensity: 0.6 });
    }
    shell = fresnelMat(style === 'xray' ? 0x6fa8ff : T, { power: style === 'xray' ? 2.6 : 3.2, base: 0.0, opacity: style === 'xray' ? 0.55 : 0.8, side: THREE.BackSide });
    this.mat = { body, joint, palm, shell };
    this.baseOpacity = new Map([[body, body.opacity ?? 1], [joint, joint.opacity ?? 1], [palm, palm.opacity ?? 1], [shell, 1]]);
    this.rigs.forEach((r) => r.applyMaterials());
  }

  setOpacity(o) {
    for (const [m, base] of this.baseOpacity) {
      if (m.uniforms?.uOpacity) { m.uniforms.uOpacity.value = (m === this.mat.shell ? (this.style === 'xray' ? 0.55 : 0.8) : 1) * o; continue; }
      m.opacity = base * o;
      m.transparent = m.opacity < 0.999 || m.transparent;
    }
  }

  render(S, scene) {
    if (!S.hand3d) { if (this.visible) { this.renderer.clear(); this.visible = false; } return; }
    this.visible = true;
    this.setStyle(S.hand3dStyle, S.hand3dTint);
    this.setOpacity(S.hand3dOpacity);
    const t = scene.t * 0.001;
    for (const m of Object.values(this.mat)) if (m.uniforms?.uTime) m.uniforms.uTime.value = t;
    const k = S.lightIntensity;
    const a = S.lightOrbit ? t * 0.7 : 0.7;
    this.key.position.set(Math.cos(a) * 900, 600 + Math.sin(a * 0.7) * 200, 700 + Math.sin(a) * 500);
    this.key.intensity = 2.2 * k; this.rim.intensity = 1.2 * k; this.hemi.intensity = 0.7 * k;
    this.renderer.toneMappingExposure = 0.9 + 0.2 * k;

    while (this.rigs.length < scene.hands.length) {
      const r = new Rig(this); r.applyMaterials(); this.scene.add(r.group); this.rigs.push(r);
    }
    this.rigs.forEach((r, i) => {
      const h = scene.hands[i];
      if (!h) { r.group.visible = false; return; }
      const arm = scene.arms.find((a2) => a2.handId === h.id);
      r.update(h, arm, S, this.w, this.h);
    });
    this.renderer.render(this.scene, this.camera);
  }
}
