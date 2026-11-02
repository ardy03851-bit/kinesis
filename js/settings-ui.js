// Schema-driven settings panel.
import { SCHEMA, PRESETS, DEFAULTS, VERSION } from './config.js';
import { icon } from './icons.js';

const fmt = (c, v) => {
  switch (c.fmt) {
    case 'pct': return Math.round(v * 100) + '%';
    case 'ms': return v + ' ms';
    case 'fr': return v + ' f';
    case 'px': return (+v).toFixed(c.step < 1 ? 1 : 0) + ' px';
    case 'x': return (+v).toFixed(2) + '×';
    case 's0': return v == 0 ? '∞' : v + ' s';
    default: return String(c.step < 1 ? (+v).toFixed(c.step < 0.01 ? 3 : 2) : v);
  }
};
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export class SettingsUI {
  constructor({ panel, state, onChange, onAction }) {
    this.panel = panel; this.state = state; this.onChange = onChange; this.onAction = onAction;
    this.tab = 'presets';
    this.rail = panel.querySelector('.rail');
    this.body = panel.querySelector('.panel-body');
    this.search = panel.querySelector('#settings-search');
    this.buildRail();
    this.renderTab();
    this.search.addEventListener('input', () => this.renderTab());
  }

  buildRail() {
    this.rail.innerHTML = SCHEMA.map((t) => `
      <button class="rail-btn" data-tab="${t.id}" role="tab" aria-label="${t.label}" title="${t.label}">
        ${icon(t.icon)}<span>${t.label}</span>
      </button>`).join('') + '<span class="rail-ind" aria-hidden="true"></span>';
    this.rail.addEventListener('click', (e) => {
      const b = e.target.closest('.rail-btn'); if (!b) return;
      this.tab = b.dataset.tab; this.search.value = ''; this.renderTab();
    });
  }

  moveIndicator() {
    const btn = this.rail.querySelector(`.rail-btn[data-tab="${this.tab}"]`);
    const ind = this.rail.querySelector('.rail-ind');
    this.rail.querySelectorAll('.rail-btn').forEach((b) => b.classList.toggle('active', b === btn));
    if (!btn || this.search.value) { ind.style.opacity = 0; return; }
    ind.style.opacity = 1;
    const horizontal = getComputedStyle(this.rail).flexDirection === 'row';
    if (horizontal) { ind.style.transform = `translateX(${btn.offsetLeft}px)`; ind.style.width = btn.offsetWidth + 'px'; ind.style.height = ''; }
    else { ind.style.transform = `translateY(${btn.offsetTop}px)`; ind.style.height = btn.offsetHeight + 'px'; ind.style.width = ''; }
  }

  renderTab() {
    const q = this.search.value.trim().toLowerCase();
    let html = '';
    if (q) {
      for (const t of SCHEMA) for (const s of t.sections) {
        if (!s.controls) continue;
        const ctrls = s.controls.filter((c) => (c.label + ' ' + (c.desc || '') + ' ' + s.label + ' ' + t.label).toLowerCase().includes(q));
        if (ctrls.length) html += this.sectionHTML({ ...s, label: `${t.label} / ${s.label}` }, ctrls);
      }
      if (!html) html = `<div class="empty">${icon('search')}<p>No settings match “${esc(q)}”.</p><span>Try “tracer”, “3d”, “glow” or “arm”.</span></div>`;
    } else {
      const tab = SCHEMA.find((t) => t.id === this.tab);
      html = `<header class="tab-head"><div class="tab-ico">${icon(tab.icon)}</div><div><h2>${tab.label}</h2><p>${tabBlurb[tab.id] || ''}</p></div></header>`;
      for (const s of tab.sections) {
        if (s.type === 'presets') html += this.presetsHTML();
        else if (s.type === 'system') html += this.systemHTML();
        else html += this.sectionHTML(s, s.controls);
      }
    }
    this.body.innerHTML = html;
    this.body.scrollTop = 0;
    this.body.classList.remove('enter'); void this.body.offsetWidth; this.body.classList.add('enter');
    this.bind();
    this.syncVisibility();
    requestAnimationFrame(() => this.moveIndicator());
  }

  sectionHTML(s, controls) {
    return `<section class="card"><h3>${esc(s.label)}</h3>${controls.map((c) => this.controlHTML(c)).join('')}</section>`;
  }

  controlHTML(c) {
    const v = this.state[c.key];
    const desc = c.desc ? `<p class="desc">${esc(c.desc)}</p>` : '';
    const attrs = `data-key="${c.key}" ${c.showIf ? `data-show-if="${c.showIf}"` : ''}`;
    const badge = c.reinit || c.reinitCamera ? `<span class="badge" title="Reloads the model">${icon('refresh-cw')}</span>` : '';
    switch (c.type) {
      case 'toggle':
        return `<label class="row ctl toggle-row" ${attrs}>
          <div class="lbl"><span>${esc(c.label)}${badge}</span>${desc}</div>
          <span class="switch"><input type="checkbox" ${v ? 'checked' : ''} data-input="${c.key}"><i></i></span>
        </label>`;
      case 'range': {
        const p = ((v - c.min) / (c.max - c.min)) * 100;
        return `<div class="ctl range-row" ${attrs}>
          <div class="row"><div class="lbl"><span>${esc(c.label)}${badge}</span></div><output data-out="${c.key}">${fmt(c, v)}</output></div>
          <input type="range" min="${c.min}" max="${c.max}" step="${c.step}" value="${v}" data-input="${c.key}" style="--p:${p}%" aria-label="${esc(c.label)}">
          ${desc}
        </div>`;
      }
      case 'select':
        return `<div class="ctl row" ${attrs}>
          <div class="lbl"><span>${esc(c.label)}${badge}</span>${desc}</div>
          <div class="select">${'' }<select data-input="${c.key}" aria-label="${esc(c.label)}">${c.options.map((o) => `<option value="${o.value}" ${String(v) === String(o.value) ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select>${icon('chevron-down')}</div>
        </div>`;
      case 'segment':
        return `<div class="ctl seg-row" ${attrs}>
          <div class="lbl"><span>${esc(c.label)}${badge}</span>${desc}</div>
          <div class="segment" data-seg="${c.key}" style="--n:${c.options.length}">
            <span class="seg-ind"></span>
            ${c.options.map((o) => `<button type="button" data-val="${o.value}" class="${String(v) === String(o.value) ? 'on' : ''}">${esc(o.label)}</button>`).join('')}
          </div>
        </div>`;
      case 'color':
        return `<div class="ctl color-row" ${attrs}>
          <div class="lbl"><span>${esc(c.label)}</span></div>
          <div class="swatches">
            ${(c.swatches || []).map((s) => `<button type="button" class="sw ${s.value.toLowerCase() === String(v).toLowerCase() ? 'on' : ''}" data-color="${s.value}" data-ckey="${c.key}" title="${s.label}" style="--c:${s.value}" aria-label="${s.label}"></button>`).join('')}
            <label class="sw custom" title="Custom colour" style="--c:${v}">${icon('palette')}<input type="color" value="${v}" data-input="${c.key}" aria-label="Custom colour"></label>
          </div>
        </div>`;
      case 'button':
        return `<div class="ctl" ${attrs}><button type="button" class="btn ghost wide" data-action="${c.key}">${icon(c.icon || 'zap')}<span>${esc(c.label)}</span></button></div>`;
    }
    return '';
  }

  presetsHTML() {
    return `<section class="presets">${PRESETS.map((p, i) => `
      <button type="button" class="preset" data-preset="${p.id}" style="--a:${p.swatch[0]};--b:${p.swatch[1]};--d:${i * 40}ms">
        <span class="preset-art">${icon(p.icon)}</span>
        <span class="preset-meta"><b>${p.name}</b><small>${p.desc}</small></span>
        <span class="preset-check">${icon('check')}</span>
      </button>`).join('')}</section>
      <p class="hint">${icon('info')} Presets change visuals only. Tracking and model settings are preserved.</p>`;
  }

  systemHTML() {
    const keys = [['S', 'Toggle settings'], ['H', 'Hide interface'], ['P', 'Capture still'], ['R', 'Start / stop recording'], ['F', 'Fullscreen'], ['C', 'Clear air paint'], ['M', 'Mirror view'], ['3', 'Toggle 3D hand']];
    return `
      <section class="card">
        <h3>Configuration</h3>
        <div class="btn-grid">
          <button class="btn ghost" data-action="export">${icon('download')}<span>Export JSON</span></button>
          <button class="btn ghost" data-action="import">${icon('folder-open')}<span>Import JSON</span></button>
          <button class="btn ghost" data-action="share">${icon('git-branch')}<span>Copy share link</span></button>
          <button class="btn danger" data-action="reset">${icon('rotate-ccw')}<span>Reset defaults</span></button>
        </div>
        <input type="file" accept="application/json" id="import-file" hidden>
      </section>
      <section class="card">
        <h3>Keyboard</h3>
        <div class="keys">${keys.map(([k, d]) => `<div><kbd>${k}</kbd><span>${d}</span></div>`).join('')}</div>
      </section>
      <section class="card about">
        <h3>About</h3>
        <p>Kinesis ${VERSION}. Runs entirely on this device — video never leaves the browser. Hand, gesture and pose inference by Google MediaPipe Tasks; 3D rendering by three.js; icons by Lucide.</p>
        <div class="diag" id="diag"></div>
      </section>`;
  }

  bind() {
    const B = this.body;
    B.querySelectorAll('[data-input]').forEach((el) => {
      const key = el.dataset.input;
      const ev = el.type === 'range' || el.type === 'color' ? 'input' : 'change';
      el.addEventListener(ev, () => {
        let v;
        if (el.type === 'checkbox') v = el.checked;
        else if (el.type === 'range') {
          v = parseFloat(el.value);
          const c = findControl(key);
          el.style.setProperty('--p', ((v - c.min) / (c.max - c.min)) * 100 + '%');
          const out = B.querySelector(`[data-out="${key}"]`); if (out) out.textContent = fmt(c, v);
        } else v = el.value;
        if (el.type === 'color') {
          el.closest('.swatches')?.querySelectorAll('.sw').forEach((s) => s.classList.remove('on'));
          el.parentElement.style.setProperty('--c', v); el.parentElement.classList.add('on');
        }
        this.set(key, v);
      });
      if (el.type === 'range') el.addEventListener('change', () => this.onChange(key, this.state[key], true));
    });
    B.querySelectorAll('.segment').forEach((seg) => {
      this.placeSeg(seg);
      seg.addEventListener('click', (e) => {
        const b = e.target.closest('button'); if (!b) return;
        seg.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
        this.placeSeg(seg);
        this.set(seg.dataset.seg, b.dataset.val);
      });
    });
    B.querySelectorAll('[data-color]').forEach((b) => b.addEventListener('click', () => {
      b.parentElement.querySelectorAll('.sw').forEach((s) => s.classList.toggle('on', s === b));
      this.set(b.dataset.ckey, b.dataset.color);
    }));
    B.querySelectorAll('[data-preset]').forEach((b) => b.addEventListener('click', () => {
      B.querySelectorAll('[data-preset]').forEach((x) => x.classList.toggle('on', x === b));
      this.onAction('preset', b.dataset.preset);
    }));
    B.querySelectorAll('[data-action]').forEach((b) => b.addEventListener('click', () => {
      const a = b.dataset.action;
      if (a === 'import') { B.querySelector('#import-file').click(); return; }
      this.onAction(a);
    }));
    const file = B.querySelector('#import-file');
    if (file) file.addEventListener('change', async () => {
      const f = file.files[0]; if (!f) return;
      try { this.onAction('importData', JSON.parse(await f.text())); } catch { this.onAction('importError'); }
    });
    if (this.tab === 'presets') {
      const active = this.state.__preset; if (active) B.querySelector(`[data-preset="${active}"]`)?.classList.add('on');
    }
    this.onAction('rendered', this.tab);
  }

  placeSeg(seg) {
    const on = seg.querySelector('button.on'); const ind = seg.querySelector('.seg-ind');
    if (!on) { ind.style.opacity = 0; return; }
    ind.style.opacity = 1;
    ind.style.width = on.offsetWidth + 'px';
    ind.style.transform = `translateX(${on.offsetLeft - 3}px)`;
  }

  set(key, v) {
    this.state[key] = v;
    this.onChange(key, v);
    this.syncVisibility();
  }

  syncVisibility() {
    this.body.querySelectorAll('[data-show-if]').forEach((el) => {
      const on = !!this.state[el.dataset.showIf];
      el.classList.toggle('collapsed', !on);
      el.setAttribute('aria-hidden', String(!on));
      el.querySelectorAll('input,select,button').forEach((i) => (i.tabIndex = on ? 0 : -1));
    });
  }

  refresh() { this.renderTab(); }
  open(tab) { if (tab) { this.tab = tab; this.renderTab(); } }
}

const tabBlurb = {
  presets: 'One-tap visual profiles tuned for different looks.',
  tracking: 'Models, confidence thresholds and signal filtering.',
  skeleton: 'How bones, joints and colour are drawn.',
  effects: 'Tracers, reticles and interactive effects.',
  model3d: 'A lit 3D hand rig fitted to your hand in real time.',
  arm: 'Pose-model arm bones joined to the wrist.',
  scene: 'Camera feed treatment and screen overlays.',
  hud: 'Telemetry, labels, gestures and interface.',
  system: 'Save, share and restore configurations.',
};

function findControl(key) {
  for (const t of SCHEMA) for (const s of t.sections) for (const c of s.controls || []) if (c.key === key) return c;
  return null;
}
export { findControl, DEFAULTS };
