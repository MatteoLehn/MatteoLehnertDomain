// Kleine Netzwerk-Schemas für die Projekt-Bühne. Gleiche Bildsprache wie der Hero:
// dünne Linien, Knoten als Quadrate, Pakete mit Leuchtspur. Gezeichnet in einer
// 400 x 300 Box, die in die Bühne eingepasst wird.

import { fitCanvas, cssVar, toRgb, rgba, reducedMotion, visibleLoop, easeOut, clamp } from './util.js';

const BOX_W = 400;
const BOX_H = 300;

class Scene {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.active = false;
    this.t = 0;
    this.packets = [];
    this.still = reducedMotion();
    this.c = {
      fg: toRgb(cssVar('--fg')),
      fg2: toRgb(cssVar('--fg-2')),
      muted: toRgb(cssVar('--muted')),
      accent: toRgb(cssVar('--accent')),
      warn: toRgb(cssVar('--warn')),
      bg: toRgb(cssVar('--bg')),
    };
    this.size();
    new ResizeObserver(() => { this.size(); this.draw(); }).observe(canvas);
    this.loop = visibleLoop(canvas, (dt) => this.tick(dt), { enabled: () => this.active && !this.still });
  }

  size() {
    const { w, h, dpr } = fitCanvas(this.canvas, 2);
    this.w = w; this.h = h; this.dpr = dpr;
    const pad = Math.min(w, h) * 0.06;
    this.k = Math.max(0.1, Math.min((w - pad * 2) / BOX_W, (h - pad * 2) / BOX_H));
    this.ox = (w - BOX_W * this.k) / 2;
    this.oy = (h - BOX_H * this.k) / 2;
    this.fs = clamp(9.5 * Math.sqrt(this.k), 8.5, 11.5); // Schriftgrösse in CSS-Pixeln
  }

  setActive(on) {
    this.active = on;
    if (on) {
      this.draw();
      this.loop.start();
    }
  }

  tick(dt) {
    this.t += dt;
    this.update(dt);
    this.draw();
  }

  X(x) { return this.ox + x * this.k; }
  Y(y) { return this.oy + y * this.k; }

  begin() {
    const { ctx, dpr } = this;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, this.w, this.h);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }

  line(points, color, width = 1, dash = null) {
    const { ctx } = this;
    ctx.beginPath();
    points.forEach(([x, y], i) => (i ? ctx.lineTo(this.X(x), this.Y(y)) : ctx.moveTo(this.X(x), this.Y(y))));
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.setLineDash(dash || []);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  rect(x, y, w, h, { stroke = null, fill = null, dash = null, radius = 0 } = {}) {
    const { ctx } = this;
    ctx.beginPath();
    if (ctx.roundRect && radius) ctx.roundRect(this.X(x), this.Y(y), w * this.k, h * this.k, radius * this.k);
    else ctx.rect(this.X(x), this.Y(y), w * this.k, h * this.k);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) {
      ctx.setLineDash(dash || []);
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  text(str, x, y, { color = rgba(this.c.muted, 1), align = 'left', size = 1, weight = 400 } = {}) {
    const { ctx } = this;
    ctx.font = `${weight} ${this.fs * size}px "Geist Mono", ui-monospace, monospace`;
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0.06em';
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    ctx.fillText(str.toUpperCase(), this.X(x), this.Y(y));
  }

  node(x, y, { size = 12, on = false, color = this.c.fg } = {}) {
    const h = size / 2;
    this.rect(x - h, y - h, size, size, {
      stroke: rgba(on ? this.c.accent : color, on ? 1 : 0.8),
      fill: on ? rgba(this.c.accent, 0.22) : rgba(this.c.bg, 1),
    });
  }

  // Paket entlang eines Polygonzugs. Länge in Box-Einheiten, Tempo in Einheiten pro Sekunde.
  send(path, { color = this.c.accent, speed = 150, onDone = null, fadeEnd = false } = {}) {
    const seg = [];
    let len = 0;
    for (let i = 1; i < path.length; i++) {
      const d = Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]);
      seg.push(d);
      len += d;
    }
    this.packets.push({ path, seg, len, d: 0, speed, color, onDone, fadeEnd, trail: [], done: false });
  }

  at(p, d) {
    let rest = d;
    for (let i = 0; i < p.seg.length; i++) {
      if (rest <= p.seg[i]) {
        const k = p.seg[i] ? rest / p.seg[i] : 0;
        const a = p.path[i];
        const b = p.path[i + 1];
        return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
      }
      rest -= p.seg[i];
    }
    return p.path[p.path.length - 1];
  }

  movePackets(dt) {
    for (let i = this.packets.length - 1; i >= 0; i--) {
      const p = this.packets[i];
      if (!p.done) {
        p.d = Math.min(p.len, p.d + p.speed * dt);
        p.trail.push(this.at(p, p.d));
        if (p.trail.length > 9) p.trail.shift();
        if (p.d >= p.len) {
          p.done = true;
          if (p.onDone) p.onDone(p);
        }
      } else {
        p.trail.shift();
        if (!p.trail.length) this.packets.splice(i, 1);
      }
    }
  }

  drawPackets() {
    const { ctx } = this;
    ctx.globalCompositeOperation = 'lighter';
    for (const p of this.packets) {
      const tr = p.trail;
      if (tr.length < 2) continue;
      const a = tr[0];
      const b = tr[tr.length - 1];
      const g = ctx.createLinearGradient(this.X(a[0]), this.Y(a[1]), this.X(b[0]), this.Y(b[1]));
      g.addColorStop(0, rgba(p.color, 0));
      g.addColorStop(1, rgba(p.color, 0.9));
      ctx.beginPath();
      tr.forEach(([x, y], i) => (i ? ctx.lineTo(this.X(x), this.Y(y)) : ctx.moveTo(this.X(x), this.Y(y))));
      ctx.strokeStyle = g;
      ctx.lineWidth = 1.6;
      ctx.stroke();
      if (!p.done) {
        ctx.fillStyle = rgba(p.color, 0.16);
        ctx.beginPath();
        ctx.arc(this.X(b[0]), this.Y(b[1]), 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = rgba(p.color, 1);
        ctx.beginPath();
        ctx.arc(this.X(b[0]), this.Y(b[1]), 1.8, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  flash(x, y, age, color) {
    if (age < 0 || age > 0.9) return;
    const k = age / 0.9;
    const { ctx } = this;
    ctx.strokeStyle = rgba(color, 0.7 * (1 - k));
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(this.X(x), this.Y(y), (6 + easeOut(k) * 16) * this.k, 0, Math.PI * 2);
    ctx.stroke();
  }
}

// ---------------------------------------------------------------- 01 Firewall-Umzug

const INET = [52, 150];
const FW_X = 150;
const ZONE = { x: 188, y: 34, w: 194, h: 232 };
const BUS_X = 210;
const SERVERS = [[252, 92], [334, 92], [252, 150], [334, 150], [252, 208], [334, 208]];
const SWITCH_AT = SERVERS.map((_, i) => 1.4 + i * 1.65);
const CYCLE = 15;

function bezier(p0, c, p2, steps = 22) {
  const out = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const u = 1 - t;
    out.push([u * u * p0[0] + 2 * u * t * c[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * c[1] + t * t * p2[1]]);
  }
  return out;
}

class FirewallScene extends Scene {
  constructor(canvas) {
    super(canvas);
    this.spawnClock = 0;
    this.drops = [];
    this.bypass = SERVERS.map(([x, y]) => bezier([INET[0] + 8, INET[1] - 12], [FW_X, -70], [x - 7, y - 7]));
    this.routed = SERVERS.map(([x, y]) => [[INET[0] + 16, INET[1]], [FW_X, 150], [BUS_X, 150], [BUS_X, y], [x - 7, y]]);
    if (this.still) this.t = 12;
    this.draw();
  }

  cycleT() { return this.t % CYCLE; }
  moved(i) { return this.cycleT() >= SWITCH_AT[i]; }

  update(dt) {
    const ct = this.cycleT();
    if (ct < dt) this.packets.length = 0;
    this.spawnClock += dt;
    if (ct > 0.4 && ct < CYCLE - 1.6 && this.spawnClock > 0.24) {
      this.spawnClock = 0;
      const i = (Math.random() * SERVERS.length) | 0;
      if (!this.moved(i)) {
        this.send(this.bypass[i], { color: this.c.fg2, speed: 170 });
      } else if (Math.random() < 0.2) {
        const path = [[INET[0] + 16, INET[1]], [FW_X - 3, 150]];
        this.send(path, { color: this.c.warn, speed: 150, onDone: () => { this.drops.push({ t: this.t }); } });
      } else {
        this.send(this.routed[i], { color: this.c.accent, speed: 165 });
      }
    }
    this.movePackets(dt);
  }

  draw() {
    if (!this.w) return;
    this.begin();
    const c = this.c;
    const ct = this.cycleT();
    const fadeOut = clamp((ct - (CYCLE - 1.4)) / 1.2, 0, 1);
    const count = SERVERS.filter((_, i) => this.moved(i)).length;

    // Zone hinter der Firewall
    this.rect(ZONE.x, ZONE.y, ZONE.w, ZONE.h, { stroke: rgba(c.fg, 0.28), dash: [3, 4] });
    this.text('Sandbox', ZONE.x + 10, ZONE.y + 14);
    this.text(`${count}/6 hinter der Firewall`, ZONE.x + ZONE.w, ZONE.y - 14, { align: 'right', color: rgba(c.fg, 0.9) });

    // Internet
    this.ctx.beginPath();
    this.ctx.arc(this.X(INET[0]), this.Y(INET[1]), 16 * this.k, 0, Math.PI * 2);
    this.ctx.strokeStyle = rgba(c.fg, 0.8);
    this.ctx.lineWidth = 1;
    this.ctx.stroke();
    this.line([[INET[0] - 16, INET[1]], [INET[0] + 16, INET[1]]], rgba(c.fg, 0.35));
    this.ctx.beginPath();
    this.ctx.ellipse(this.X(INET[0]), this.Y(INET[1]), 7 * this.k, 16 * this.k, 0, 0, Math.PI * 2);
    this.ctx.strokeStyle = rgba(c.fg, 0.35);
    this.ctx.stroke();
    this.text('Internet', INET[0], INET[1] + 30, { align: 'center' });

    // Firewall: Wand mit einem Port in der Mitte
    this.line([[FW_X, 58], [FW_X, 140]], rgba(c.fg, 0.95), 2.5);
    this.line([[FW_X, 160], [FW_X, 242]], rgba(c.fg, 0.95), 2.5);
    this.rect(FW_X - 5, 144, 10, 12, { stroke: rgba(c.accent, 0.9) });
    this.text('OPNsense', FW_X, 258, { align: 'center' });

    // Leitungen
    const anyMoved = count > 0;
    if (anyMoved) this.line([[INET[0] + 16, INET[1]], [FW_X - 5, 150]], rgba(c.fg, 0.3));
    if (anyMoved) this.line([[FW_X + 5, 150], [BUS_X, 150]], rgba(c.accent, 0.5));
    const ys = SERVERS.filter((_, i) => this.moved(i)).map(([, y]) => y);
    if (ys.length) this.line([[BUS_X, Math.min(150, ...ys)], [BUS_X, Math.max(150, ...ys)]], rgba(c.accent, 0.5));

    SERVERS.forEach(([x, y], i) => {
      const on = this.moved(i);
      if (on) this.line([[BUS_X, y], [x - 7, y]], rgba(c.accent, 0.5));
      else this.line(this.bypass[i], rgba(c.fg, 0.16), 1, [2, 4]);
    });

    // Server
    SERVERS.forEach(([x, y], i) => {
      const on = this.moved(i);
      this.node(x, y, { size: 14, on });
      this.text(`S${i + 1}`, x, y + 18, { align: 'center', color: rgba(on ? c.fg : c.muted, 1) });
      if (!this.still) this.flash(x, y, ct - SWITCH_AT[i], c.accent);
    });

    // verworfene Pakete blitzen an der Wand auf
    this.drops = this.drops.filter((d) => this.t - d.t < 0.6);
    for (const d of this.drops) {
      const k = (this.t - d.t) / 0.6;
      this.text('×', FW_X - 12, 150 - 10 - k * 8, { color: rgba(c.warn, 1 - k), align: 'center', size: 1.3 });
    }

    this.drawPackets();

    if (this.still) {
      // Standbild: je ein Paket auf jeder neuen Route
      SERVERS.forEach((_, i) => {
        const pts = this.routed[i];
        const mid = pts[Math.min(pts.length - 2, 2 + (i % 2))];
        this.ctx.fillStyle = rgba(c.accent, 1);
        this.ctx.beginPath();
        this.ctx.arc(this.X(mid[0]), this.Y(mid[1]), 1.8, 0, Math.PI * 2);
        this.ctx.fill();
      });
    }

    if (fadeOut > 0) {
      this.ctx.fillStyle = rgba(c.bg, fadeOut * 0.92);
      this.ctx.fillRect(0, 0, this.w, this.h);
    }
  }
}

// ---------------------------------------------------------------- 03 Smart Fridge

const FRIDGE = { x: 24, y: 42, w: 104, h: 216 };
const CAMS = [[54, 78], [98, 150], [54, 222]];
const MAIN = [128, 150];
const LAB = { x: 222, y: 122, w: 86, h: 56 };
const AWS = { x: 222, y: 30, w: 86, h: 54 };
const PHONE = { x: 338, y: 26, w: 36, h: 64 };
const ROUND = 3.1;

class FridgeScene extends Scene {
  constructor(canvas) {
    super(canvas);
    this.count = 6;
    this.round = -1;
    this.events = {};
    this.sms = -99;
    if (this.still) { this.count = 2; this.sms = 0; this.t = 1; }
    this.draw();
  }

  // Ein Durchgang: Kamera wacht auf, Foto zur Haupt-Kamera, Tunnel ins Homelab, zählen.
  // Nach vier Durchgängen sind noch zwei Bananen da und die SMS geht raus.
  update(dt) {
    const round = Math.floor(this.t / ROUND);
    const loopLen = 5;

    if (round !== this.round) {
      this.round = round;
      const r = round % loopLen;
      if (r === 0) { this.count = 6; this.sms = -99; }
      if (r < 4) {
        const cam = CAMS[r % CAMS.length];
        this.wake = { cam: r % CAMS.length, t: this.t };
        this.send([cam, [cam[0] + 18, cam[1]], [MAIN[0] - 7, MAIN[1]]], {
          color: this.c.fg2,
          speed: 120,
          onDone: () => {
            this.send([[MAIN[0] + 8, MAIN[1]], [LAB.x, LAB.y + LAB.h / 2]], {
              color: this.c.accent,
              speed: 115,
              onDone: () => {
                this.count -= 1;
                this.counted = this.t;
                if (this.count <= 2) {
                  const cx = LAB.x + LAB.w / 2;
                  this.send([[cx, LAB.y], [cx, AWS.y + AWS.h]], {
                    color: this.c.accent,
                    speed: 110,
                    onDone: () => {
                      this.send([[AWS.x + AWS.w, AWS.y + AWS.h / 2], [PHONE.x, AWS.y + AWS.h / 2]], {
                        color: this.c.accent,
                        speed: 110,
                        onDone: () => { this.sms = this.t; },
                      });
                    },
                  });
                }
              },
            });
          },
        });
      }
    }
    this.movePackets(dt);
  }

  draw() {
    if (!this.w) return;
    this.begin();
    const c = this.c;
    const { ctx } = this;

    // Kühlschrank
    this.rect(FRIDGE.x, FRIDGE.y, FRIDGE.w, FRIDGE.h, { stroke: rgba(c.fg, 0.75), radius: 8 });
    this.line([[FRIDGE.x + 8, 114], [FRIDGE.x + FRIDGE.w - 8, 114]], rgba(c.fg, 0.2));
    this.line([[FRIDGE.x + 8, 186], [FRIDGE.x + FRIDGE.w - 8, 186]], rgba(c.fg, 0.2));
    this.line([[FRIDGE.x + FRIDGE.w - 12, 58], [FRIDGE.x + FRIDGE.w - 12, 84]], rgba(c.fg, 0.55), 2);
    this.text('Kühlschrank', FRIDGE.x + FRIDGE.w / 2, FRIDGE.y + FRIDGE.h + 16, { align: 'center' });

    // Kameras: wach (hell) oder im Deep Sleep (dunkel)
    CAMS.forEach(([x, y], i) => {
      const awake = this.wake && this.wake.cam === i && this.t - this.wake.t < 1.2;
      ctx.beginPath();
      ctx.arc(this.X(x), this.Y(y), 6 * this.k, 0, Math.PI * 2);
      ctx.strokeStyle = rgba(awake ? c.accent : c.fg, awake ? 1 : 0.45);
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(this.X(x), this.Y(y), 2 * this.k, 0, Math.PI * 2);
      ctx.fillStyle = rgba(awake ? c.accent : c.fg, awake ? 1 : 0.35);
      ctx.fill();
      this.line([[x + 6, y], [x + 18, y], [MAIN[0] - 7, MAIN[1]]], rgba(c.fg, 0.1), 1, [2, 3]);
      if (awake) this.flash(x, y, this.t - this.wake.t, c.accent);
    });
    this.text('Cams', 54, 100, { align: 'center' });

    // Haupt-Kamera mit eigenem WLAN
    this.node(MAIN[0], MAIN[1], { size: 12, on: true });
    for (let i = 1; i <= 2; i++) {
      ctx.beginPath();
      ctx.arc(this.X(MAIN[0]), this.Y(MAIN[1]), (10 + i * 7) * this.k, Math.PI * 0.62, Math.PI * 1.38);
      ctx.strokeStyle = rgba(c.accent, 0.35 / i);
      ctx.stroke();
    }
    this.text('Main-Cam', MAIN[0] + 14, MAIN[1] + 22);

    // WireGuard-Tunnel
    this.line([[MAIN[0] + 8, MAIN[1] - 5], [LAB.x, MAIN[1] - 5]], rgba(c.accent, 0.45), 1, [4, 3]);
    this.line([[MAIN[0] + 8, MAIN[1] + 5], [LAB.x, MAIN[1] + 5]], rgba(c.accent, 0.45), 1, [4, 3]);
    this.text('WireGuard', (MAIN[0] + LAB.x) / 2 + 4, MAIN[1] - 18, { align: 'center' });

    // Homelab mit Modell
    this.rect(LAB.x, LAB.y, LAB.w, LAB.h, { stroke: rgba(c.fg, 0.8) });
    this.text('Homelab', LAB.x + 8, LAB.y + 14);
    this.text('YOLO', LAB.x + 8, LAB.y + 38, { color: rgba(c.fg, 1), size: 1.15 });
    const pulse = this.counted ? clamp(1 - (this.t - this.counted) / 0.8, 0, 1) : 0;
    this.text(`Bananen: ${this.count}`, LAB.x + LAB.w / 2, LAB.y + LAB.h + 18, {
      align: 'center',
      color: rgba(pulse > 0 ? c.accent : c.fg, 0.6 + 0.4 * pulse + (this.count <= 2 ? 0.4 : 0)),
    });

    // AWS
    this.line([[LAB.x + LAB.w / 2, LAB.y], [LAB.x + LAB.w / 2, AWS.y + AWS.h]], rgba(c.fg, 0.25));
    this.rect(AWS.x, AWS.y, AWS.w, AWS.h, { stroke: rgba(c.fg, 0.8) });
    this.text('AWS', AWS.x + 8, AWS.y + 14);
    this.text('Lambda', AWS.x + 8, AWS.y + 31, { color: rgba(c.fg, 0.9) });
    this.text('SNS', AWS.x + 8, AWS.y + 44, { color: rgba(c.fg, 0.9) });

    // Handy
    this.line([[AWS.x + AWS.w, AWS.y + AWS.h / 2], [PHONE.x, AWS.y + AWS.h / 2]], rgba(c.fg, 0.25));
    const smsAge = this.t - this.sms;
    const lit = smsAge >= 0 && smsAge < 4;
    this.rect(PHONE.x, PHONE.y, PHONE.w, PHONE.h, { stroke: rgba(lit ? c.accent : c.fg, lit ? 1 : 0.8), radius: 6, fill: lit ? rgba(c.accent, 0.12) : null });
    this.line([[PHONE.x + 13, PHONE.y + 6], [PHONE.x + 23, PHONE.y + 6]], rgba(c.fg, 0.5));
    this.text('SMS', PHONE.x + PHONE.w / 2, PHONE.y + PHONE.h + 14, { align: 'center' });
    if (lit) {
      const a = clamp(Math.min(smsAge / 0.3, (4 - smsAge) / 0.5), 0, 1);
      this.rect(314, 116, 84, 40, { stroke: rgba(c.accent, a), fill: rgba(c.bg, a * 0.9) });
      this.text('Nur noch', 322, 129, { color: rgba(c.fg, a) });
      this.text('2 Bananen', 322, 144, { color: rgba(c.fg, a) });
    }

    this.drawPackets();
  }
}

export function createScene(canvas) {
  const type = canvas.dataset.scene;
  if (type === 'firewall') return new FirewallScene(canvas);
  if (type === 'fridge') return new FridgeScene(canvas);
  return null;
}
