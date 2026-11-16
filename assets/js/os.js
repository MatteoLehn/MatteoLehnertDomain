// Fensterverwaltung wie auf dem Mac. Links im Dock stehen die Programme; ein Punkt darunter
// heisst, dass ein Fenster davon offen ist. Projekt-Fenster gehören zu ihrem Ordner, Nrlyze
// also zu "Projekte". Minimierte Fenster schrumpfen rechts vom Trenner zu einer kleinen
// Vorschau und kommen mit einem Klick darauf zurück.
// Ein Inhalt ist immer nur in einem Fenster offen; ein zweiter Klick holt dieses nach vorne.

import { reducedMotion } from './util.js?v=4';

const EASE = 'cubic-bezier(.16,1,.3,1)';
const ICON = {
  about: 'i-user', projekte: 'i-folder', schule: 'i-folder', hobbys: 'i-hobby',
  werdegang: 'i-cv', terminal: 'i-term', kontakt: 'i-mail',
};
// Zu welchem Programm im Dock ein Fenster gehört
const APP = {
  nrlyze: 'projekte', litho: 'projekte', portfolio: 'projekte',
  va: 'schule', 'probe-va': 'schule', fridge: 'schule', module: 'schule',
};

export class Desktop {
  constructor({ onShow = () => {}, onHide = () => {} } = {}) {
    this.onShow = onShow;
    this.onHide = onHide;
    this.stage = document.getElementById('stage');
    this.store = document.getElementById('views');
    this.bar = document.getElementById('taskbar');
    this.minBar = document.getElementById('dock-wins');
    this.tpl = document.getElementById('tpl-win');
    this.views = new Map([...document.querySelectorAll('.view')].map((v) => [v.dataset.view, v]));
    this.wins = new Map();          // view-id -> { el, app, mini, min, max }
    this.z = 10;
    this.small = window.matchMedia('(max-width: 720px)');

    document.addEventListener('click', (e) => this.click(e));
    window.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (document.querySelector('.menu:not([hidden])')) this.closeMenus();
      else if (this.top()) this.close(this.top());
    });
    window.addEventListener('resize', () => this.wins.forEach((w) => this.clamp(w.el)));
    this.small.addEventListener('change', () => this.wins.forEach((w) => this.place(w.el)));
  }

  // ---------------------------------------------------------------- Klicks

  click(e) {
    const mini = e.target.closest('.mini');
    if (mini) { this.restore(mini.dataset.id); return; }
    const opener = e.target.closest('[data-open]');
    if (opener) {
      if (opener.classList.contains('icon')) this.select(opener);
      if (opener.classList.contains('dock-app')) this.appClick(opener.dataset.app, opener);
      else this.open(opener.dataset.open, opener);
      this.closeMenus();
      return;
    }
    const act = e.target.closest('[data-action]');
    if (act) {
      const id = act.closest('.win')?.dataset.id;
      const a = act.dataset.action;
      if (a === 'close' && id) this.close(id);
      if (a === 'min' && id) this.minimize(id);
      if (a === 'max' && id) this.toggleMax(id);
      if (a === 'min-all') [...this.wins.keys()].forEach((k) => this.minimize(k));
      if (a === 'close-all') [...this.wins.keys()].forEach((k) => this.close(k));
      this.closeMenus();
      return;
    }
    const menuBtn = e.target.closest('.menu-btn');
    if (menuBtn) {
      const menu = menuBtn.nextElementSibling;
      const show = menu.hidden;
      this.closeMenus();
      menu.hidden = !show;
      menuBtn.setAttribute('aria-expanded', String(show));
      return;
    }
    this.closeMenus();
    if (!e.target.closest('.icon')) this.select(null);
  }

  select(icon) {
    document.querySelectorAll('.icon.is-selected').forEach((i) => i.classList.remove('is-selected'));
    if (icon) icon.classList.add('is-selected');
  }

  closeMenus() {
    document.querySelectorAll('.menu').forEach((m) => {
      m.hidden = true;
      m.previousElementSibling.setAttribute('aria-expanded', 'false');
    });
  }

  // Klick auf ein Programm im Dock: wie am Mac holt er das Programm nach vorne.
  // Ist das Ordnerfenster zu, aber ein Projekt daraus offen, kommt das Projekt.
  appClick(app, from) {
    if (this.wins.has(app)) { this.open(app, from); return; }
    const child = [...this.wins.entries()].filter(([, w]) => w.app === app && !w.min)
      .sort((a, b) => +b[1].el.style.zIndex - +a[1].el.style.zIndex)[0];
    if (child) this.focus(child[0], true);
    else this.open(app, from);
  }

  appBtn(app) {
    return this.bar.querySelector(`.dock-app[data-app="${app}"]`);
  }

  // Punkt unter dem Programm, solange irgendein Fenster davon offen ist
  syncDots() {
    this.bar.querySelectorAll('.dock-app').forEach((b) => {
      const mine = [...this.wins.values()].filter((w) => w.app === b.dataset.app);
      b.classList.toggle('is-open', mine.length > 0);
    });
    this.bar.classList.toggle('has-wins', this.minBar.children.length > 0);
  }

  // ---------------------------------------------------------------- Öffnen und Schliessen

  open(id, from = null) {
    const view = this.views.get(id);
    if (!view) return;
    const known = this.wins.get(id);
    if (known) {
      if (known.min) this.restore(id);
      else this.focus(id, true);
      return;
    }

    const el = this.tpl.content.firstElementChild.cloneNode(true);
    el.dataset.id = id;
    el.style.setProperty('--w', `${view.dataset.w || 680}px`);
    el.querySelector('.win-title').textContent = view.dataset.title || id;
    el.setAttribute('aria-label', view.dataset.title || id);
    el.querySelector('.win-body').append(view);
    view.classList.add('is-active');
    this.stage.append(el);

    const w = { el, app: APP[id] || id, mini: null, min: false, max: false };
    this.wins.set(id, w);
    this.syncDots();
    this.drag(el);
    el.addEventListener('pointerdown', () => this.focus(id));
    el.querySelector('.win-bar').addEventListener('dblclick', (e) => { if (!e.target.closest('button')) this.toggleMax(id); });

    this.place(el, from);
    this.focus(id);
    this.grow(el, from);
    this.onShow(id, view);
  }

  close(id) {
    const w = this.wins.get(id);
    if (!w || w.closing) return;
    w.closing = true;
    const done = () => {
      if (!this.wins.has(id)) return;
      const view = this.views.get(id);
      view.classList.remove('is-active');
      this.store.append(view);
      this.onHide(id, view);
      w.el.remove();
      w.mini?.remove();
      this.wins.delete(id);
      this.syncDots();
      const next = this.top();
      if (next) this.focus(next);
      else history.replaceState(null, '', location.pathname + location.search);
    };
    if (reducedMotion() || w.min) { done(); return; }
    const anim = w.el.animate([{ transform: 'none', opacity: 1 }, { transform: 'scale(.94)', opacity: 0 }], { duration: 160, easing: 'ease-in', fill: 'forwards' });
    anim.onfinish = done;
    setTimeout(done, 260);
  }

  // ---------------------------------------------------------------- Fokus und Reihenfolge

  focus(id, nudge = false) {
    const w = this.wins.get(id);
    if (!w) return;
    w.el.style.zIndex = ++this.z;
    this.wins.forEach((o, k) => o.el.classList.toggle('is-active', k === id));
    if (location.hash.slice(1) !== id) history.replaceState(null, '', `#${id}`);
    if (nudge && !reducedMotion()) {
      w.el.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.015)' }, { transform: 'scale(1)' }], { duration: 220 });
    }
  }

  top() {
    let best = null;
    let z = -1;
    this.wins.forEach((w, k) => { if (!w.min && +w.el.style.zIndex > z) { z = +w.el.style.zIndex; best = k; } });
    return best;
  }

  // ---------------------------------------------------------------- Minimieren und Vollbild

  // Kleine Vorschau des Fensters für das Dock: Titelleiste, erstes Bild oder Symbol, Programm-Abzeichen
  makeMini(id) {
    const view = this.views.get(id);
    const title = view.dataset.title || id;
    const img = view.querySelector('img:not(.portrait-fallback), video');
    const src = img?.tagName === 'VIDEO' ? img.poster : img?.currentSrc || img?.src;
    const app = APP[id] || id;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'mini';
    b.dataset.id = id;
    b.setAttribute('aria-label', `${title} wiederherstellen`);
    b.innerHTML = `<span class="mini-win"><span class="mini-bar"><i></i><i></i><i></i></span><span class="mini-body">${src ? '<img alt="">' : `<svg aria-hidden="true"><use href="#${ICON[id] || 'i-doc'}"/></svg>`}</span></span>`
      + `<svg class="mini-badge" aria-hidden="true"><use href="#${ICON[app] || 'i-doc'}"/></svg><span class="tip"></span>`;
    if (src) b.querySelector('img').src = src;
    b.querySelector('.tip').textContent = title;
    return b;
  }

  minimize(id) {
    const w = this.wins.get(id);
    if (!w || w.min) return;
    w.min = true;
    w.mini = this.makeMini(id);
    this.minBar.append(w.mini);
    this.syncDots();
    const hide = () => { w.el.hidden = true; };
    if (reducedMotion()) hide();
    else {
      // Fenster schrumpft in seine Vorschau im Dock, die Vorschau wächst gleichzeitig auf
      const a = w.el.getBoundingClientRect();
      const b = w.mini.getBoundingClientRect();
      w.mini.animate([{ width: '0px', opacity: 0 }, { width: `${b.width}px`, opacity: 1 }], { duration: 300, easing: EASE });
      const dx = b.left + b.width / 2 - (a.left + a.width / 2);
      const dy = b.top + b.height / 2 - (a.top + a.height / 2);
      const sc = Math.max(0.05, b.width / a.width);
      w.anim?.cancel();
      w.anim = w.el.animate(
        [{ transform: 'none', opacity: 1 }, { transform: `translate(${dx}px, ${dy}px) scale(${sc})`, opacity: 0.4 }],
        { duration: 380, easing: 'cubic-bezier(.5,0,.75,0)', fill: 'forwards' },
      );
      w.anim.onfinish = () => { hide(); w.anim.cancel(); };
    }
    const next = this.top();
    if (next) this.focus(next);
  }

  restore(id) {
    const w = this.wins.get(id);
    if (!w) return;
    const from = w.mini;
    const fromRect = from?.getBoundingClientRect();
    w.min = false;
    w.anim?.cancel();
    w.el.hidden = false;
    this.focus(id);
    if (fromRect) this.grow(w.el, { getBoundingClientRect: () => fromRect });
    if (from) {
      w.mini = null;
      const gone = () => { from.remove(); this.syncDots(); };
      if (reducedMotion()) gone();
      else from.animate([{ width: `${from.offsetWidth}px`, opacity: 1 }, { width: '0px', opacity: 0 }], { duration: 240, easing: EASE }).onfinish = gone;
    }
  }

  toggleMax(id) {
    const w = this.wins.get(id);
    if (!w || this.small.matches) return;
    const before = w.el.getBoundingClientRect();
    w.max = !w.max;
    w.el.classList.toggle('is-max', w.max);
    this.focus(id);
    if (reducedMotion()) return;
    const after = w.el.getBoundingClientRect();
    const sx = before.width / after.width;
    const sy = before.height / after.height;
    w.el.animate(
      [{ transformOrigin: '0 0', transform: `translate(${before.left - after.left}px, ${before.top - after.top}px) scale(${sx}, ${sy})` },
        { transformOrigin: '0 0', transform: 'none' }],
      { duration: 320, easing: EASE },
    );
  }

  // ---------------------------------------------------------------- Lage und Animation

  place(el, from = null) {
    if (this.small.matches) { el.style.left = ''; el.style.top = ''; return; }
    const s = this.stage.getBoundingClientRect();
    const n = this.wins.size - 1;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    // erstes Fenster mittig im freien Bereich, weitere leicht versetzt
    let x = (s.width - w) / 2 - 40 + (n % 5) * 28;
    let y = Math.max(8, (s.height - h) / 2 - 20) + (n % 5) * 24;
    const parent = from?.closest?.('.win');
    if (parent) { x = parent.offsetLeft + 36; y = parent.offsetTop + 30; }
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    this.clamp(el);
  }

  clamp(el) {
    if (this.small.matches || el.classList.contains('is-max')) return;
    const s = this.stage.getBoundingClientRect();
    const x = Math.min(s.width - 80, Math.max(80 - el.offsetWidth, el.offsetLeft));
    const y = Math.min(s.height - 40, Math.max(0, el.offsetTop));
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    // Fenster nie unter das Dock ragen lassen
    el.style.maxHeight = `${Math.max(160, s.height - y)}px`;
  }

  grow(el, from) {
    if (reducedMotion()) return;
    const r = el.getBoundingClientRect();
    let dx = 0;
    let dy = 24;
    let sc = 0.92;
    if (from?.getBoundingClientRect) {
      const f = from.getBoundingClientRect();
      dx = f.left + f.width / 2 - (r.left + r.width / 2);
      dy = f.top + f.height / 2 - (r.top + r.height / 2);
      sc = Math.max(0.06, Math.min(0.3, f.width / r.width));
    }
    el.animate(
      [{ transform: `translate(${dx}px, ${dy}px) scale(${sc})`, opacity: 0.2 }, { transform: 'none', opacity: 1 }],
      { duration: 400, easing: EASE },
    );
    el.querySelectorAll('.grid li').forEach((li, i) => {
      li.animate([{ opacity: 0, transform: 'translateY(8px) scale(.96)' }, { opacity: 1, transform: 'none' }],
        { duration: 320, delay: 120 + i * 45, easing: EASE, fill: 'backwards' });
    });
  }

  drag(el) {
    const bar = el.querySelector('.win-bar');
    let start = null;
    bar.addEventListener('pointerdown', (e) => {
      if (this.small.matches || el.classList.contains('is-max') || e.target.closest('button')) return;
      start = { x: e.clientX, y: e.clientY, left: el.offsetLeft, top: el.offsetTop };
      bar.setPointerCapture(e.pointerId);
      el.classList.add('is-dragging');
    });
    bar.addEventListener('pointermove', (e) => {
      if (!start) return;
      el.style.left = `${start.left + e.clientX - start.x}px`;
      el.style.top = `${start.top + e.clientY - start.y}px`;
    });
    const end = () => {
      if (!start) return;
      start = null;
      el.classList.remove('is-dragging');
      this.clamp(el);
    };
    bar.addEventListener('pointerup', end);
    bar.addEventListener('pointercancel', end);
  }
}
