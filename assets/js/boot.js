// Einstieg: Computer einschalten, Boot-Zeilen laufen durch, dann Zoom in den Bildschirm.
// Der Zoom rechnet wie bei Tommy Biglow: Massstab so, dass der Bildschirm den Viewport füllt,
// Ursprung in der Bildschirmmitte.

import { reducedMotion, sleep } from './util.js';

const LINES = [
  'MatteOS 3.0',
  'eth0: link up, 1000 Mbit/s',
  'dhcp: Adresse erhalten',
  'mount /projekte: 3 Einträge',
  'starte Desktop ...',
];

// Ecken des Bildschirms im Foto, als Anteil von Breite und Höhe: oben links, oben rechts,
// unten rechts, unten links. Das Foto ist nicht ganz gerade, darum ist es kein exaktes Rechteck.
const QUAD = [[0.114, 0.130], [0.890, 0.128], [0.886, 0.706], [0.111, 0.713]];

// Projektive Abbildung eines w x h grossen Elements auf ein beliebiges Viereck
function quadMatrix(w, h, q) {
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = q;
  const dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3;
  const dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3;
  const den = dx1 * dy2 - dx2 * dy1;
  const g = (dx3 * dy2 - dx2 * dy3) / den;
  const k = (dx1 * dy3 - dx3 * dy1) / den;
  const a = x1 - x0 + g * x1, b = x3 - x0 + k * x3, c = x0;
  const d = y1 - y0 + g * y1, e = y3 - y0 + k * y3, f = y0;
  return `matrix3d(${a / w},${d / w},0,${g / w}, ${b / h},${e / h},0,${k / h}, 0,0,1,0, ${c},${f},0,1)`;
}

function fitScreen(img, screen) {
  const W = img.clientWidth;
  const H = img.clientHeight;
  if (!W || !H) return;
  const w = screen.offsetWidth;
  const h = screen.offsetHeight;
  screen.style.transform = quadMatrix(w, h, QUAD.map(([x, y]) => [x * W, y * H]));
}

export function runBoot() {
  const root = document.documentElement;
  const boot = document.getElementById('boot');
  if (!boot || root.classList.contains('booted')) return Promise.resolve();

  return new Promise((resolve) => {
    const rig = document.getElementById('rig');
    const screen = document.getElementById('crt-screen');
    const log = document.getElementById('boot-log');
    const img = rig.querySelector('img');
    let started = false;

    const fit = () => fitScreen(img, screen);
    fit();
    img.addEventListener('load', fit);
    window.addEventListener('resize', fit);

    const finish = () => {
      if (root.classList.contains('booted')) return;
      root.classList.add('booted');
      window.removeEventListener('resize', fit);
      try { sessionStorage.setItem('ml-booted', '1'); } catch (e) { /* privater Modus */ }
      resolve();
    };

    const start = async () => {
      if (started) return;
      started = true;
      boot.classList.add('is-on');
      if (reducedMotion()) { finish(); return; }

      log.textContent = '';
      for (const line of LINES) {
        log.textContent += `${line}\n`;
        await sleep(230);
      }
      await sleep(200);

      const r = screen.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const scale = Math.max(vw / r.width, vh / r.height) * 1.25;
      const rr = rig.getBoundingClientRect();
      rig.style.transformOrigin = `${r.left + r.width / 2 - rr.left}px ${r.top + r.height / 2 - rr.top}px`;
      const tx = vw / 2 - (r.left + r.width / 2);
      const ty = vh / 2 - (r.top + r.height / 2);
      rig.animate(
        [{ transform: 'none' }, { transform: `translate(${tx}px, ${ty}px) scale(${scale})` }],
        { duration: 1500, easing: 'cubic-bezier(.7,0,.16,1)', fill: 'forwards' },
      );
      boot.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 450, delay: 1050, easing: 'ease-in-out', fill: 'forwards' });
      setTimeout(finish, 1520);
    };

    document.getElementById('power').addEventListener('click', start);
    document.getElementById('skip').addEventListener('click', finish);
  });
}
