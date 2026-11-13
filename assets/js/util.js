// Kleine Helfer, die mehrere Module brauchen.

const mqReduced = window.matchMedia('(prefers-reduced-motion: reduce)');
const mqFine = window.matchMedia('(hover: hover) and (pointer: fine)');

export const reducedMotion = () => mqReduced.matches;
export const finePointer = () => mqFine.matches;

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const easeOut = (t) => 1 - Math.pow(1 - t, 3);
export const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

// mulberry32: gleicher Seed, gleiches Muster
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

// "#2ea8ec" oder "rgba(1, 2, 3, .4)" in [r, g, b]
export function toRgb(color) {
  const c = color.trim();
  if (c.startsWith('#')) {
    const h = c.length === 4 ? [...c.slice(1)].map((x) => x + x).join('') : c.slice(1, 7);
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  }
  const m = c.match(/[\d.]+/g);
  return m ? m.slice(0, 3).map(Number) : [255, 255, 255];
}

export const rgba = (rgb, a) => `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a})`;

// Canvas auf seine CSS-Grösse mal Pixeldichte bringen
export function fitCanvas(canvas, maxDpr = 2) {
  // clientWidth statt getBoundingClientRect: unabhängig von laufenden Transform-Animationen
  const r = { width: canvas.clientWidth, height: canvas.clientHeight };
  const dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
  const w = Math.max(1, Math.round(r.width * dpr));
  const h = Math.max(1, Math.round(r.height * dpr));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  return { w: r.width, h: r.height, dpr };
}

// requestAnimationFrame-Schleife, die nur läuft, solange das Element sichtbar ist,
// der Tab offen ist und enabled() true liefert.
export function visibleLoop(el, frame, { enabled = () => true, rootMargin = '120px' } = {}) {
  let onScreen = false;
  let raf = 0;
  let last = 0;

  const tick = (now) => {
    raf = 0;
    if (!onScreen || document.hidden || !enabled()) { last = 0; return; }
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
    last = now;
    frame(dt, now / 1000);
    raf = requestAnimationFrame(tick);
  };
  const start = () => {
    if (!raf && onScreen && !document.hidden && enabled()) raf = requestAnimationFrame(tick);
  };

  const io = new IntersectionObserver(([entry]) => {
    onScreen = entry.isIntersecting;
    start();
  }, { rootMargin });
  io.observe(el);
  document.addEventListener('visibilitychange', start);

  return {
    start,
    get running() { return raf !== 0; },
    get onScreen() { return onScreen; },
  };
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function imageReady(img) {
  if (!img) return Promise.resolve();
  if (img.complete && img.naturalWidth) return img.decode ? img.decode().catch(() => {}) : Promise.resolve();
  return new Promise((resolve) => {
    img.addEventListener('load', resolve, { once: true });
    img.addEventListener('error', resolve, { once: true });
  });
}
