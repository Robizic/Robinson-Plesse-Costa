/* ============================================================
   site.js — comportements communs aux pages Shop et Confirmation
   · menu hamburger mobile
   · position du curseur custom (flèche)
   (index.html garde sa propre version dans son script intégré)
============================================================ */
(() => {
  'use strict';

  /* ── Menu hamburger ── */
  const toggle = document.getElementById('menuToggle');
  const nav    = document.getElementById('mobileNav');

  function setMenu(open) {
    toggle.classList.toggle('open', open);
    nav.classList.toggle('open', open);
    nav.setAttribute('aria-hidden', String(!open));
    toggle.setAttribute('aria-expanded', String(open));
    document.body.style.overflow = open ? 'hidden' : '';
  }

  toggle.addEventListener('click', () => setMenu(!nav.classList.contains('open')));
  nav.addEventListener('click', e => { if (e.target.tagName === 'A') setMenu(false); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') setMenu(false); });

  /* ── Curseur custom : suit la souris (écrans à pointeur précis seulement) ── */
  const cursor = document.getElementById('cursor');
  if (cursor && window.matchMedia('(pointer: fine)').matches) {
    document.addEventListener('mousemove', e => {
      cursor.style.left = e.clientX + 'px';
      cursor.style.top  = e.clientY + 'px';
    });
  }
})();
