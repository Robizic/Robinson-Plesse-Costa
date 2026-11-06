/* ============================================================
   PARTICULES — traînée curseur (desktop) + explosion au clic menu
   Remplace tout le bloc "TRAÎNÉE PIXEL" de l'index.
   Nécessite : <canvas id="cursor-trail"></canvas> dans le HTML.
============================================================ */
(function () {
  'use strict';

  const canvas = document.getElementById('cursor-trail');
  if (!canvas) return;

  /* Respecte le réglage "réduire les animations" du système */
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    canvas.style.display = 'none';
    return;
  }

  const isFine = window.matchMedia('(pointer: fine)').matches; // souris = desktop

  /* ==========================================================
     RÉGLAGES — tout se règle ici
  ========================================================== */
  const CFG = {
    colors: [
      '#FF1744', '#FF6D00', '#FFD600', '#76FF03', '#00E676',
      '#00E5FF', '#2979FF', '#651FFF', '#D500F9', '#FF4081'
    ],

    maxParticles: isFine ? 450 : 120,

    /* Traînée (desktop uniquement) */
    trail: {
      gap:     18,     // espace entre le curseur et la traînée
      delay:   0.13,   // retard (plus petit = plus de retard)
      spacing: 7,      // distance entre pixels (plus petit = plus dense)
      sizeMin: 7,
      sizeMax: 12,
      decay:   0.018   // vitesse de disparition
    },

    /* Explosion au clic */
    burst: {
      count:    isFine ? 28 : 14,    // nombre de pixels
      speedMin: 1.5,
      speedMax: isFine ? 6 : 4.5,    // puissance
      sizeMin:  5,
      sizeMax:  isFine ? 10 : 8,
      decay:    isFine ? 0.026 : 0.035, // plus grand = plus court
      friction: 0.92,                // freinage (1 = jamais)
      gravity:  0.08                 // petite chute
    },

    /* Éléments qui déclenchent l'explosion */
    clickSelector: '.brand, .header-right a, .mobile-nav a, .menu-toggle',

    /* Délai avant changement de page (laisse voir l'explosion) */
    navDelay: 260
  };

  /* ==========================================================
     CANVAS PLEIN ÉCRAN (ne capte jamais la souris)
  ========================================================== */
  const ctx = canvas.getContext('2d');
  let width = 0, height = 0;

  Object.assign(canvas.style, {
    position: 'fixed',
    top: '0',
    left: '0',
    pointerEvents: 'none',
    zIndex: '9998'   // au-dessus du menu mobile, sous le curseur flèche
  });

  function resizeCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    width  = window.innerWidth;
    height = window.innerHeight;
    canvas.width  = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width  = width + 'px';
    canvas.style.height = height + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  /* ==========================================================
     PARTICULES
  ========================================================== */
  const particles = [];
  let colorIndex = 0;

  /* Couleurs en séquence → ruban arc-en-ciel le long de la traînée */
  function nextColor() {
    colorIndex = (colorIndex + 1) % CFG.colors.length;
    return CFG.colors[colorIndex];
  }

  function randomColor() {
    return CFG.colors[Math.floor(Math.random() * CFG.colors.length)];
  }

  function addParticle(p) {
    if (particles.length >= CFG.maxParticles) particles.shift();
    particles.push(p);
    startLoop();
  }

  /* ----------------------------------------------------------
     Traînée
  ---------------------------------------------------------- */
  let mouseX = window.innerWidth / 2;
  let mouseY = window.innerHeight / 2;
  let trailX = mouseX;
  let trailY = mouseY;
  let prevX = null;
  let prevY = null;

  function createTrailParticle(x, y) {
    const t = CFG.trail;
    addParticle({
      x: Math.round(x),
      y: Math.round(y),
      size: Math.round(t.sizeMin + Math.random() * (t.sizeMax - t.sizeMin)),
      color: nextColor(),
      life: 1,
      decay: t.decay + Math.random() * 0.012,
      vx: (Math.random() - 0.5) * 0.15,
      vy: (Math.random() - 0.5) * 0.15,
      friction: 1,
      gravity: 0
    });
  }

  function createTrail(x, y) {
    if (prevX === null || prevY === null) {
      prevX = x;
      prevY = y;
      return;
    }

    const dx = x - prevX;
    const dy = y - prevY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 1) return;

    /* La traînée s'arrête un peu avant le curseur */
    const endX = x - (dx / dist) * CFG.trail.gap;
    const endY = y - (dy / dist) * CFG.trail.gap;

    const tx = endX - prevX;
    const ty = endY - prevY;
    const tDist = Math.sqrt(tx * tx + ty * ty);
    if (tDist < 1) return;

    const steps = Math.max(1, Math.floor(tDist / CFG.trail.spacing));
    for (let i = 1; i <= steps; i++) {
      if (Math.random() > 0.15) {
        createTrailParticle(prevX + tx * (i / steps), prevY + ty * (i / steps));
      }
    }

    prevX = endX;
    prevY = endY;
  }

  function trailIsSettled() {
    return Math.abs(mouseX - trailX) < 0.5 && Math.abs(mouseY - trailY) < 0.5;
  }

  if (isFine) {
    document.addEventListener('mousemove', function (e) {
      mouseX = e.clientX;
      mouseY = e.clientY;
      startLoop();
    });
  }

  /* ----------------------------------------------------------
     Explosion
  ---------------------------------------------------------- */
  function burst(x, y) {
    const b = CFG.burst;
    for (let i = 0; i < b.count; i++) {
      const angle = (Math.PI * 2 * i) / b.count + Math.random() * 0.45;
      const speed = b.speedMin + Math.random() * (b.speedMax - b.speedMin);

      addParticle({
        x: x,
        y: y,
        size: Math.round(b.sizeMin + Math.random() * (b.sizeMax - b.sizeMin)),
        color: randomColor(),
        life: 1,
        decay: b.decay * (0.8 + Math.random() * 0.5),
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        friction: b.friction,
        gravity: b.gravity
      });
    }
  }

  /* Utilisable depuis d'autres scripts : window.particleBurst(x, y) */
  window.particleBurst = burst;

  /* ==========================================================
     BOUCLE D'ANIMATION
     Ne tourne que lorsqu'il y a quelque chose à animer.
  ========================================================== */
  let running = false;

  function startLoop() {
    if (running) return;
    running = true;
    requestAnimationFrame(frame);
  }

  function frame() {
    /* Avance la traînée vers le curseur (desktop) */
    if (isFine) {
      trailX += (mouseX - trailX) * CFG.trail.delay;
      trailY += (mouseY - trailY) * CFG.trail.delay;
      createTrail(trailX, trailY);
    }

    ctx.clearRect(0, 0, width, height);

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];

      p.life -= p.decay;
      if (p.life <= 0) {
        particles.splice(i, 1);
        continue;
      }

      p.vx *= p.friction;
      p.vy = p.vy * p.friction + p.gravity;
      p.x += p.vx;
      p.y += p.vy;

      /* Le pixel rétrécit en vieillissant */
      const s = Math.max(1, Math.round(p.size * (0.4 + 0.6 * p.life)));

      ctx.globalAlpha = p.life;
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.round(p.x), Math.round(p.y), s, s);
    }
    ctx.globalAlpha = 1;

    const idle = particles.length === 0 && (!isFine || trailIsSettled());
    if (idle) {
      running = false;
      return;
    }
    requestAnimationFrame(frame);
  }

  /* ==========================================================
     CLIC SUR LE MENU → EXPLOSION (+ délai avant changement de page)
  ========================================================== */
  function shouldDelayNavigation(link, e) {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return false;
    if (link.target === '_blank') return false;

    const href = link.getAttribute('href');
    if (!href || href.charAt(0) === '#' || href.indexOf('mailto:') === 0) return false;

    return link.origin === window.location.origin &&
           link.pathname !== window.location.pathname;
  }

  document.addEventListener('click', function (e) {
    const target = e.target.closest(CFG.clickSelector);
    if (!target) return;

    /* Clic clavier (Entrée) : pas de coordonnées → centre de l'élément */
    let x = e.clientX;
    let y = e.clientY;
    if (e.detail === 0) {
      const r = target.getBoundingClientRect();
      x = r.left + r.width / 2;
      y = r.top + r.height / 2;
    }

    burst(x, y);

    const link = target.closest('a[href]');
    if (link && shouldDelayNavigation(link, e)) {
      e.preventDefault();
      setTimeout(function () { window.location.href = link.href; }, CFG.navDelay);
    }
  });

  /* ==========================================================
     NETTOYAGE
  ========================================================== */
  window.addEventListener('blur', function () {
    particles.length = 0;
    prevX = null;
    prevY = null;
  });
})();