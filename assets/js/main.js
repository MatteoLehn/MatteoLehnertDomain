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

const scenes = new Map();
let portraitStarted = false;
let terminal = null;

const desktop = new Desktop({
  onOpen(id, el) {
    const canvas = el.querySelector('canvas.scene');
    if (canvas) {
      if (!scenes.has(id)) scenes.set(id, createScene(canvas));
      // einen Frame warten, damit das Canvas seine Grösse hat
      requestAnimationFrame(() => { const s = scenes.get(id); s.size(); s.setActive(true); });
    }
    if (id === 'about' && !portraitStarted) { portraitStarted = true; initPortrait(); }
    if (id === 'terminal' && terminal && window.matchMedia('(pointer: fine)').matches) terminal.focus();
    history.replaceState(null, '', `#${id}`);
  },
  onClose(id) {
    scenes.get(id)?.setActive(false);
  },
});
terminal = initTerminal(desktop);

// Screenshots im litho.ch-Fenster durchblättern
let shot = 0;
const showShot = (i) => {
  shot = (i + SHOTS.length) % SHOTS.length;
  const img = document.getElementById('shot');
  img.src = SHOTS[shot].src;
  img.alt = SHOTS[shot].alt;
  document.getElementById('shot-url').textContent = SHOTS[shot].url;
};
document.getElementById('shot-prev').addEventListener('click', () => showShot(shot - 1));
document.getElementById('shot-next').addEventListener('click', () => showShot(shot + 1));

document.querySelector('[data-action="reboot"]').addEventListener('click', () => {
  try { sessionStorage.removeItem('ml-booted'); } catch (e) { /* egal */ }
  location.hash = '';
  location.reload();
});

const fonts = document.fonts ? document.fonts.ready : Promise.resolve();
fonts.then(() => {
  const canvas = document.getElementById('field');
  if (canvas) new Field(canvas);
});

runBoot().then(() => {
  const wanted = location.hash.slice(1);
  const id = desktop.wins.has(wanted) ? wanted : 'about';
  setTimeout(() => desktop.open(id), 250);
});
