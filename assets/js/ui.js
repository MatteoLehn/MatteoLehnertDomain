// Uhr, Glyphen-Scramble, Einblenden beim Scrollen, aktive Sektion im Dock, Mail kopieren.

import { reducedMotion } from './util.js';

const POOL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&*+=<>/';

// Wie Ivans Glyphen-Pool: Jedes Zeichen wechselt in festen Ticks durch Zufallszeichen
// und rastet dann von links nach rechts ein.
export function scramble(el, text, { duration = 650, tick = 48 } = {}) {
  if (!el) return;
  const final = text ?? el.dataset.text ?? el.textContent;
  el.dataset.text = final;
  if (reducedMotion()) { el.textContent = final; return; }
  cancelAnimationFrame(el._scramble || 0);
  const chars = [...final];
  const settle = chars.map((_, i) => (i / Math.max(1, chars.length)) * duration * 0.65 + Math.random() * duration * 0.35);
  const seed = Math.random() * 1000;
  const start = performance.now();
  const step = (now) => {
    const t = now - start;
    const k = Math.floor(t / tick);
    let out = '';
    let done = true;
    for (let i = 0; i < chars.length; i++) {
      const ch = chars[i];
      if (ch === ' ' || t >= settle[i]) { out += ch; continue; }
      done = false;
      const h = Math.abs(Math.sin((i + 1) * 12.9898 + (k + seed) * 78.233)) * 43758.5453;
      out += POOL[Math.floor((h - Math.floor(h)) * POOL.length)];
    }
    el.textContent = out;
    if (!done) el._scramble = requestAnimationFrame(step);
  };
  el._scramble = requestAnimationFrame(step);
}

export function initClock() {
  const el = document.getElementById('clock');
  if (!el) return;
  const fmt = new Intl.DateTimeFormat('de-CH', {
    timeZone: 'Europe/Zurich', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  });
  const update = () => {
    const now = new Date();
    el.textContent = fmt.format(now);
    el.dateTime = now.toISOString();
  };
  update();
  setInterval(update, 1000);
}

export function initReveal() {
  const els = document.querySelectorAll('[data-reveal]');
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      e.target.classList.add('is-in');
      e.target.querySelectorAll('[data-scramble]').forEach((s) => scramble(s));
      io.unobserve(e.target);
    }
  }, { rootMargin: '0px 0px -12% 0px' });
  els.forEach((el) => io.observe(el));
}

export function initDock() {
  const links = [...document.querySelectorAll('.dock a')];
  const byId = new Map(links.map((a) => [a.getAttribute('href').slice(1), a]));
  const sections = ['top', ...byId.keys()].map((id) => document.getElementById(id)).filter(Boolean);

  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      links.forEach((a) => a.removeAttribute('aria-current'));
      const link = byId.get(e.target.id);
      if (link) link.setAttribute('aria-current', 'true');
    }
  }, { rootMargin: '-48% 0px -48% 0px' });
  sections.forEach((s) => io.observe(s));

  links.forEach((a) => {
    const label = a.querySelector('.label');
    a.addEventListener('pointerenter', () => scramble(label, label.dataset.text || label.textContent, { duration: 420 }));
  });
}

export function initCopyMail() {
  const btn = document.getElementById('copy-mail');
  if (!btn) return;
  const label = btn.querySelector('.copy-label');
  const original = label.textContent;
  btn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText('matteolehnert@gmail.com');
      scramble(label, 'Kopiert');
      clearTimeout(btn._t);
      btn._t = setTimeout(() => scramble(label, original), 2200);
    } catch {
      window.location.href = 'mailto:matteolehnert@gmail.com';
    }
  });
}
