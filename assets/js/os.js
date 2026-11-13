// Ein Fenster aufs Mal: Die Liste links wählt aus, das Fenster in der Mitte zeigt den Inhalt.
// Bedienung wie in Igors Lab (Index mit Zähler), Aussehen wie ein alter Desktop.

import { reducedMotion } from './util.js';

const EASE = 'cubic-bezier(.16,1,.3,1)';

export class Desktop {
  constructor({ onOpen = () => {}, onClose = () => {} } = {}) {
    this.onOpen = onOpen;
    this.onClose = onClose;
    this.current = null;
    this.wins = new Map();
    this.order = [...document.querySelectorAll('.index [data-open]')].map((b) => b.dataset.open);
    this.count = document.getElementById('index-count');

    document.querySelectorAll('.win').forEach((el) => {
      const id = el.id.replace('win-', '');
      this.wins.set(id, el);
      el.style.setProperty('--w', `${el.dataset.w || 640}px`);
      el.querySelector('.win-bar').insertAdjacentHTML('beforeend',
        '<span class="win-nav"><button type="button" data-step="-1" aria-label="Vorheriger Eintrag">&lt;</button><button type="button" data-step="1" aria-label="Nächster Eintrag">&gt;</button></span>');
    });

    document.addEventListener('click', (e) => {
      const opener = e.target.closest('[data-open]');
      if (opener) { this.open(opener.dataset.open); this.closeMenus(); return; }
      const step = e.target.closest('[data-step]');
      if (step) { this.step(+step.dataset.step); return; }
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
    });

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { this.closeMenus(); return; }
      if (e.target.closest('input, textarea') || e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { this.step(1); e.preventDefault(); }
      if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { this.step(-1); e.preventDefault(); }
    });
  }

  closeMenus() {
    document.querySelectorAll('.menu').forEach((m) => { m.hidden = true; m.previousElementSibling.setAttribute('aria-expanded', 'false'); });
  }

  step(dir) {
    const i = Math.max(0, this.order.indexOf(this.current));
    this.open(this.order[(i + dir + this.order.length) % this.order.length], dir);
  }

  close(id) {
    if (id === this.current) this.step(1);
  }

  open(id, dir = 0) {
    const el = this.wins.get(id);
    if (!el || id === this.current) return;
    const from = this.order.indexOf(this.current);
    const to = this.order.indexOf(id);
    if (!dir) dir = to >= from ? 1 : -1;

    if (this.current) {
      const old = this.wins.get(this.current);
      old.classList.remove('is-open', 'is-active');
      this.onClose(this.current, old);
    }
    this.current = id;
    el.classList.add('is-open', 'is-active');
    el.querySelector('.win-body').scrollTop = 0;

    document.querySelectorAll('.index [data-open]').forEach((b) => {
      const on = b.dataset.open === id;
      if (on) { b.setAttribute('aria-current', 'true'); b.scrollIntoView({ block: 'nearest', inline: 'center' }); }
      else b.removeAttribute('aria-current');
    });
    const pad = (n) => String(n).padStart(2, '0');
    this.count.textContent = `${pad(to + 1)} / ${pad(this.order.length)}`;

    if (!reducedMotion()) {
      el.animate(
        [{ transform: `translateY(${dir * 26}px) scale(.97)`, opacity: 0 }, { transform: 'none', opacity: 1 }],
        { duration: 380, easing: EASE },
      );
    }
    this.onOpen(id, el);
  }
}
