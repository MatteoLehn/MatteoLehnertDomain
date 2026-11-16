import { Field } from './field.js';
import { Desktop } from './os.js';
import { runBoot } from './boot.js';
import { initTerminal } from './terminal.js';
import { initPortrait } from './portrait.js';
import { createScene } from './scenes.js';
import { initClock, initCopyMail } from './ui.js';

const SHOTS = [
  { src: 'assets/img/litho-1.webp', url: 'https://www.litho.ch/', alt: 'litho.ch, Startseite' },
  { src: 'assets/img/litho-2.webp', url: 'https://www.litho.ch/portfolio', alt: 'litho.ch, Portfolio' },
  { src: 'assets/img/litho-3.webp', url: 'https://www.litho.ch/service', alt: 'litho.ch, Service' },
];

initClock();
initCopyMail();

// Bilder zeigen eine Ladefläche, bis sie da sind
const markLoaded = (img) => {
  const done = () => img.classList.add('is-loaded');
  if (img.complete && img.naturalWidth) done();
  else img.addEventListener('load', done, { once: true });
};
document.querySelectorAll('.thumb img, .shot img').forEach(markLoaded);

const scenes = new Map();
let portraitStarted = false;
let terminal = null;

const desktop = new Desktop({
  onShow(id, view) {
    const canvas = view.querySelector('canvas.scene');
    if (canvas) {
      if (!scenes.has(id)) scenes.set(id, createScene(canvas));
      // einen Frame warten, damit das Canvas seine Grösse hat
      requestAnimationFrame(() => { const s = scenes.get(id); s.size(); s.setActive(true); });
    }
    if (id === 'about' && !portraitStarted) { portraitStarted = true; initPortrait(); }
    // Video läuft nur, solange das Fenster offen ist, und ohne Ton
    const video = view.querySelector('video');
    if (video && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) video.play().catch(() => {});
    if (id === 'terminal' && terminal && window.matchMedia('(pointer: fine)').matches) terminal.focus();
  },
  onHide(id, view) {
    scenes.get(id)?.setActive(false);
    document.querySelector(`[data-view="${id}"] video`)?.pause();
  },
});
terminal = initTerminal(desktop);

// Screenshots im litho.ch-Fenster durchblättern
let shot = 0;
const shotImg = document.getElementById('shot');
const showShot = (i) => {
  shot = (i + SHOTS.length) % SHOTS.length;
  shotImg.classList.remove('is-loaded');
  shotImg.src = SHOTS[shot].src;
  shotImg.alt = SHOTS[shot].alt;
  markLoaded(shotImg);
  document.getElementById('shot-url').textContent = SHOTS[shot].url;
};
document.getElementById('shot-prev').addEventListener('click', () => showShot(shot - 1));
document.getElementById('shot-next').addEventListener('click', () => showShot(shot + 1));

document.querySelector('[data-action="reboot"]').addEventListener('click', () => {
  try { sessionStorage.removeItem('ml-booted'); } catch (e) { /* egal */ }
  history.replaceState(null, '', location.pathname);
  location.reload();
});

const fonts = document.fonts ? document.fonts.ready : Promise.resolve();
fonts.then(() => {
  const canvas = document.getElementById('field');
  if (canvas) new Field(canvas);
});

runBoot().then(() => {
  const wanted = location.hash.slice(1);
  const id = desktop.views.has(wanted) ? wanted : 'about';
  const from = document.querySelector(`.icon[data-open="${id}"]`);
  setTimeout(() => desktop.open(id, from), 250);
});
