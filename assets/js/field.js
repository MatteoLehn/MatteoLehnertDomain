// Hero: ein Netz aus Truchet-Kacheln. Jede Kachel hat zwei Viertelbögen, zusammen ergeben
// sie lange Leitungen. Pakete laufen auf den Bögen von Kachel zu Kachel. Die Maus dreht
// Kacheln um 90 Grad und legt damit Routen um, ein Klick schickt einen Ping los.

import { rng, fitCanvas, cssVar, toRgb, rgba, reducedMotion, finePointer, visibleLoop, easeOut, lerp } from './util.js';

const QUARTER = Math.PI / 2;
const MID = [[0.5, 0], [1, 0.5], [0.5, 1], [0, 0.5]]; // Kantenmitten: oben, rechts, unten, links
const STEP = [[0, -1], [1, 0], [0, 1], [-1, 0]];      // Nachbar beim Verlassen über diese Kante
const OPPOSITE = [2, 3, 0, 1];
// Kachel 0: Bögen oben-links und rechts-unten. Kachel 1: oben-rechts und unten-links.
const EXIT = [[3, 2, 1, 0], [1, 0, 3, 2]];
const TRAIL = 24;
const FLIP_TIME = 0.42;

export class Field {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.hero = canvas.closest('[data-field]');
    this.ring = this.hero.querySelector('.field-ring');
    this.rand = rng(4207);
    this.packets = [];
    this.ripples = [];
    this.animating = new Set();
    this.near = new Set();
    this.pointer = { x: -9999, y: -9999, rx: -9999, ry: -9999, inside: false };
    this.still = reducedMotion();

    this.color = {
      line: cssVar('--field-line'),
      node: cssVar('--field-node'),
      accent: toRgb(cssVar('--field-hot')),
      fg: toRgb(cssVar('--fg')),
    };

    this.resize(true);
    new ResizeObserver(() => this.resize()).observe(canvas);
    this.bind();

    if (this.still) {
      this.drawStill();
    } else {
      this.loop = visibleLoop(this.hero, (dt) => this.frame(dt));
    }
  }

  resize(force = false) {
    const { w, h, dpr } = fitCanvas(this.canvas, 2);
    if (!force && Math.abs(w - this.w) < 1 && Math.abs(h - this.h) < 1 && dpr === this.dpr) return;
    this.w = w; this.h = h; this.dpr = dpr;

    // Kachelgrösse folgt dem Viewport, damit das Muster auf dem Handy nicht zu fein wird
    this.s = Math.round(Math.min(58, Math.max(30, Math.min(w, h) / 16)));
    this.cols = Math.ceil(w / this.s) + 1;
    this.rows = Math.ceil(h / this.s) + 1;
    const n = this.cols * this.rows;

    const r = rng(2027);
    this.tiles = new Uint8Array(n);
    for (let i = 0; i < n; i++) this.tiles[i] = r() < 0.5 ? 0 : 1;
    this.anim = new Float32Array(n).fill(1);
    this.cool = new Float32Array(n);
    this.animating.clear();

    this.routers = [];
    const count = Math.max(6, Math.round(n / 34));
    for (let i = 0; i < count; i++) this.routers.push((r() * n) | 0);

    this.packets.length = 0;
    const packets = Math.round(n / 12);
    for (let i = 0; i < packets; i++) this.packets.push(this.spawn({ age: this.rand() * 6 }));

    if (this.ring) this.hero.style.setProperty('--ring', `${Math.round(this.s * 3.4)}px`);
    if (this.still) this.drawStill();
  }

  // ---------------------------------------------------------------- Pakete

  spawn({ age = 0, cell = null, entry = null, hot = null, speed = null } = {}) {
    const c = cell ?? this.routers[(this.rand() * this.routers.length) | 0];
    const p = {
      cx: c % this.cols,
      cy: (c / this.cols) | 0,
      entry: entry ?? ((this.rand() * 4) | 0),
      t: 0,
      speed: speed ?? 2.1 + this.rand() * 2.6,  // Bögen pro Sekunde
      life: 5 + this.rand() * 9,
      age,
      hot: hot ?? this.rand() < 0.8,
      trail: [],
      dead: false,
    };
    this.enter(p);
    return p;
  }

  // Bogen für die aktuelle Kachel berechnen: Ecke als Mittelpunkt, Start- und Endwinkel
  enter(p) {
    const tile = this.tiles[p.cy * this.cols + p.cx];
    const exit = EXIT[tile][p.entry];
    const cx = p.entry === 1 || exit === 1 ? 1 : 0;
    const cy = p.entry === 2 || exit === 2 ? 1 : 0;
    const a0 = Math.atan2(MID[p.entry][1] - cy, MID[p.entry][0] - cx);
    const a1 = Math.atan2(MID[exit][1] - cy, MID[exit][0] - cx);
    let da = a1 - a0;
    if (da > Math.PI) da -= 2 * Math.PI;
    if (da < -Math.PI) da += 2 * Math.PI;
    p.exit = exit; p.ox = cx; p.oy = cy; p.a0 = a0; p.da = da;
  }

  advance(p, dt) {
    p.age += dt;
    p.t += dt * p.speed;
    while (p.t >= 1) {
      p.t -= 1;
      const [dx, dy] = STEP[p.exit];
      p.cx += dx; p.cy += dy;
      p.entry = OPPOSITE[p.exit];
      if (p.cx < 0 || p.cy < 0 || p.cx >= this.cols || p.cy >= this.rows) { p.dead = true; return; }
      this.enter(p);
    }
    const a = p.a0 + p.da * p.t;
    const x = (p.cx + p.ox + 0.5 * Math.cos(a)) * this.s;
    const y = (p.cy + p.oy + 0.5 * Math.sin(a)) * this.s;
    p.trail.push(x, y);
    if (p.trail.length > TRAIL * 2) p.trail.splice(0, 2);
  }

  // ---------------------------------------------------------------- Interaktion

  flip(i, now) {
    if (i < 0 || i >= this.tiles.length || this.cool[i] > now) return;
    this.tiles[i] ^= 1;
    this.anim[i] = 0;
    this.cool[i] = now + 0.55;
    this.animating.add(i);
  }

  local(e) {
    const r = this.canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }

  bind() {
    const hero = this.hero;

    hero.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      const [x, y] = this.local(e);
      this.pointer.x = x; this.pointer.y = y;
      if (!this.pointer.inside) {
        this.pointer.inside = true;
        this.pointer.rx = x; this.pointer.ry = y;
        if (finePointer()) hero.classList.add('is-pointer');
      }
      this.reroute(x, y);
    });

    hero.addEventListener('pointerleave', () => {
      this.pointer.inside = false;
      this.near.clear();
      hero.classList.remove('is-pointer');
    });

    hero.addEventListener('click', (e) => {
      if (e.target !== this.canvas) return;
      const [x, y] = this.local(e);
      this.ping(x, y);
    });
  }

  reroute(x, y) {
    const s = this.s;
    const R = s * 1.7;
    const now = performance.now() / 1000;
    const next = new Set();
    const x0 = Math.max(0, Math.floor((x - R) / s));
    const x1 = Math.min(this.cols - 1, Math.floor((x + R) / s));
    const y0 = Math.max(0, Math.floor((y - R) / s));
    const y1 = Math.min(this.rows - 1, Math.floor((y + R) / s));
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const dx = (cx + 0.5) * s - x;
        const dy = (cy + 0.5) * s - y;
        if (dx * dx + dy * dy > R * R) continue;
        const i = cy * this.cols + cx;
        next.add(i);
        if (!this.near.has(i) && this.rand() < 0.55) this.flip(i, now);
      }
    }
    this.near = next;
    if (this.still) this.drawStill();
  }

  ping(x, y) {
    const cx = Math.min(this.cols - 1, Math.max(0, Math.floor(x / this.s)));
    const cy = Math.min(this.rows - 1, Math.max(0, Math.floor(y / this.s)));
    const cell = cy * this.cols + cx;
    if (this.still) return;
    for (let e = 0; e < 4; e++) {
      this.packets.push(this.spawn({ cell, entry: e, hot: true, speed: 4.2, age: 0 }));
    }
    this.ripples.push({ x: (cx + 0.5) * this.s, y: (cy + 0.5) * this.s, t: 0 });
  }

  // ---------------------------------------------------------------- Zeichnen

  tilePath(ctx, px, py, tile) {
    const s = this.s;
    const r = s / 2;
    if (tile === 0) {
      ctx.moveTo(px + r, py);
      ctx.arc(px, py, r, 0, QUARTER);
      ctx.moveTo(px + r, py + s);
      ctx.arc(px + s, py + s, r, Math.PI, Math.PI * 1.5);
    } else {
      ctx.moveTo(px + s, py + r);
      ctx.arc(px + s, py, r, QUARTER, Math.PI);
      ctx.moveTo(px, py + r);
      ctx.arc(px, py + s, r, -QUARTER, 0);
    }
  }

  drawTiles() {
    const { ctx, s, cols, rows } = this;
    ctx.beginPath();
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const i = y * cols + x;
        if (this.anim[i] < 1) continue;
        this.tilePath(ctx, x * s, y * s, this.tiles[i]);
      }
    }
    ctx.strokeStyle = this.color.line;
    ctx.lineWidth = 1;
    ctx.stroke();

    // Kacheln, die gerade drehen: neue Lage, zurückgedreht um den Rest der Animation
    const r = s / 2;
    for (const i of this.animating) {
      const x = i % cols;
      const y = (i / cols) | 0;
      const k = easeOut(this.anim[i]);
      ctx.save();
      ctx.translate(x * s + r, y * s + r);
      ctx.rotate(-(1 - k) * QUARTER);
      ctx.beginPath();
      this.tilePath(ctx, -r, -r, this.tiles[i]);
      ctx.strokeStyle = rgba(this.color.accent, 0.12 + 0.5 * (1 - k));
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
    }
  }

  drawRouters() {
    const { ctx, s, cols } = this;
    ctx.fillStyle = this.color.node;
    for (const c of this.routers) {
      const x = (c % cols + 0.5) * s;
      const y = ((c / cols) | 0) * s + s / 2;
      ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
    }
  }

  drawPacket(p) {
    const tr = p.trail;
    if (tr.length < 4) return;
    const fade = Math.min(1, p.age / 0.35) * Math.max(0, Math.min(1, (p.life - p.age) / 0.7));
    if (fade <= 0) return;
    const col = p.hot ? this.color.accent : this.color.fg;
    const ctx = this.ctx;
    const n = tr.length;

    const g = ctx.createLinearGradient(tr[0], tr[1], tr[n - 2], tr[n - 1]);
    g.addColorStop(0, rgba(col, 0));
    g.addColorStop(1, rgba(col, 0.85 * fade));
    ctx.beginPath();
    ctx.moveTo(tr[0], tr[1]);
    for (let k = 2; k < n; k += 2) ctx.lineTo(tr[k], tr[k + 1]);
    ctx.strokeStyle = g;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    const hx = tr[n - 2];
    const hy = tr[n - 1];
    ctx.fillStyle = rgba(col, 0.13 * fade);
    ctx.beginPath();
    ctx.arc(hx, hy, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = rgba(col, fade);
    ctx.beginPath();
    ctx.arc(hx, hy, 1.6, 0, Math.PI * 2);
    ctx.fill();
  }

  frame(dt) {
    const { ctx, dpr } = this;
    const now = performance.now() / 1000;

    // ab und zu kippt eine Kachel von selbst, damit das Netz lebt
    if (this.rand() < dt * 4) this.flip((this.rand() * this.tiles.length) | 0, now);

    for (const i of this.animating) {
      this.anim[i] = Math.min(1, this.anim[i] + dt / FLIP_TIME);
      if (this.anim[i] >= 1) this.animating.delete(i);
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, this.w, this.h);
    this.drawTiles();
    this.drawRouters();

    ctx.globalCompositeOperation = 'lighter';
    for (let i = this.packets.length - 1; i >= 0; i--) {
      const p = this.packets[i];
      if (!p.dead) this.advance(p, dt);
      else p.trail.splice(0, 4);
      this.drawPacket(p);
      const gone = (p.dead && p.trail.length < 4) || p.age > p.life;
      if (gone) {
        if (this.packets.length > this.target()) this.packets.splice(i, 1);
        else this.packets[i] = this.spawn();
      }
    }

    for (let i = this.ripples.length - 1; i >= 0; i--) {
      const r = this.ripples[i];
      r.t += dt;
      const k = r.t / 0.9;
      if (k >= 1) { this.ripples.splice(i, 1); continue; }
      ctx.strokeStyle = rgba(this.color.accent, 0.55 * (1 - k));
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(r.x, r.y, 6 + easeOut(k) * this.s * 2.6, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';

    // Ring folgt der Maus mit etwas Verzögerung
    if (this.ring && this.pointer.inside) {
      this.pointer.rx = lerp(this.pointer.rx, this.pointer.x, Math.min(1, dt * 14));
      this.pointer.ry = lerp(this.pointer.ry, this.pointer.y, Math.min(1, dt * 14));
      this.ring.style.transform = `translate3d(${this.pointer.rx}px, ${this.pointer.ry}px, 0)`;
    }
  }

  target() {
    return Math.round((this.cols * this.rows) / 12);
  }

  // Ohne Bewegung: ein Standbild mit ein paar Paketen samt Spur
  drawStill() {
    const { ctx, dpr } = this;
    if (!this.packets.length) return;
    const sim = this.packets.map((p) => ({ ...p, trail: [], age: 1, life: 99 }));
    for (let k = 0; k < 40; k++) for (const p of sim) if (!p.dead) this.advance(p, 1 / 60);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, this.w, this.h);
    this.anim.fill(1);
    this.animating.clear();
    this.drawTiles();
    this.drawRouters();
    ctx.globalCompositeOperation = 'lighter';
    sim.forEach((p) => this.drawPacket(p));
    ctx.globalCompositeOperation = 'source-over';
  }
}
