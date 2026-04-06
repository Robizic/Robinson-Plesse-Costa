/* lang-cursor.js
   - Assure-toi d'avoir <div class="custom-cursor"></div> dans le body
   - Assure-toi d'avoir défini tes éléments HTML avec data-i18n et class="translatable"
*/

(function () {
  // ============ CONFIG =================
  const cursor = document.querySelector('.custom-cursor');
  if (!cursor) {
    console.warn('lang-cursor: .custom-cursor introuvable dans le DOM');
    return;
  }

  // vitesse de suivi (0 = très lent, 1 = instantané)
  const FOLLOW_SPEED = 0.15;

  // déformation
  const MAX_STRETCH = 0.18; // réduire pour moins de déformation (ex : 0.1)

  // langue initiale (persistée)
  let currentLang = localStorage.getItem('site_lang') || 'fr';

  // mouvement
  let mouseX = window.innerWidth / 2, mouseY = window.innerHeight / 2;
  let currentX = mouseX, currentY = mouseY;
  let lastX = currentX, lastY = currentY;

  // état hover
  let hoveredTranslatable = null;

  // ============ TRADUCTIONS EXEMPLE ============
  // Structure : translations[key][lang] = "texte"
  // Remplace/complète avec ton propre contenu.
  const translations = {
    // clé globale ex: about.bio
    'about.bio': {
      fr: "Je suis artiste/graphiste basé·e à Paris. Mon travail explore …",
      en: "I am an artist/designer based in Paris. My work explores …"
    },
    'project1.title': {
      fr: "Erreur système",
      en: "System Error"
    },
    'project1.text': {
      fr: "Je travaille à partir de formes géométriques : spirales, circuits…",
      en: "I work from geometric forms: spirals, circuits…"
    },
    'project2.title': {
      fr: "Erreur système",
      en: "System Error"
    },
    'project2.text': {
      fr: "Court métrage expérimental réalisé sur Blender sur tv cathodique pour une exposition collective au Doc en janvier 2024.",
      en: "Experimental short film made in Blender on a cathode-ray TV for a group exhibition at Doc in January 2024."
    }
 };

  // ============ UTILITAIRES TRADUCTION ============
  // Lors du chargement, enregistre le contenu original si tu veux fallback
  document.querySelectorAll('[data-i18n]').forEach(el => {
    // sauvegarde contenu original s'il n'existe pas déjà
    if (!el.dataset.original) el.dataset.original = el.innerHTML.trim();
  });

  function applyTranslations(lang) {
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = buildKeyForElement(el); // ex: "about.bio" ou "project1.title"
      if (!key) return;
      const entry = translations[key];
      if (entry && entry[lang]) {
        el.innerHTML = entry[lang];
      } else {
        // fallback : garder original
        el.innerHTML = el.dataset.original || el.innerHTML;
      }
    });
  }

  // construit la clé à partir des attributs (tu peux adapter si tu as une autre logique)
  function buildKeyForElement(el) {
    // Recherche d'un parent ayant data-i18n-root pour préfixer
    const root = el.closest('[data-i18n-root]');
    const rootKey = root ? root.dataset.i18nRoot : null;
    const subKey = el.dataset.i18n;
    if (rootKey && subKey) return `${rootKey}.${subKey}`;
    if (subKey) return subKey;
    return null;
  }

  function setLanguage(lang) {
    currentLang = lang;
    localStorage.setItem('site_lang', lang);
    applyTranslations(lang);
  }

  // initialise la langue au chargement
  applyTranslations(currentLang);

  // ============ EVENTS CURSEUR & TRADUCTION ============
// suivre la souris
document.addEventListener('mousemove', e => {
  mouseX = e.clientX;
  mouseY = e.clientY;
});

// cibler les blocs traduisibles
const translatables = document.querySelectorAll('.translatable');

function updateCursorIcon() {
  if (hoveredTranslatable) {
    if (currentLang === 'fr') {
      cursor.classList.add('flag-en');
      cursor.classList.remove('flag-fr');
    } else {
      cursor.classList.add('flag-fr');
      cursor.classList.remove('flag-en');
    }
  } else {
    cursor.classList.remove('flag-en', 'flag-fr');
  }
}

translatables.forEach(block => {
  block.addEventListener('mouseenter', () => {
    hoveredTranslatable = block;
    updateCursorIcon();
  });

  block.addEventListener('mouseleave', () => {
    hoveredTranslatable = null;
    updateCursorIcon();
  });

  block.addEventListener('click', () => {
    const newLang = (currentLang === 'fr') ? 'en' : 'fr';
    setLanguage(newLang);

    // 🔑 forcer l’update du curseur immédiatement après le changement de langue
    updateCursorIcon();
  });
});



  // ============ ANIMATION / DÉFORMATION CURSEUR ============
  function animate() {
    // interpolation = effet de délai
    currentX += (mouseX - currentX) * FOLLOW_SPEED;
    currentY += (mouseY - currentY) * FOLLOW_SPEED;

    // calculer vitesse / déformation
    const dx = currentX - lastX;
    const dy = currentY - lastY;

    const stretchX = Math.max(Math.min(dx * 0.03, MAX_STRETCH), -MAX_STRETCH);
    const stretchY = Math.max(Math.min(dy * 0.03, MAX_STRETCH), -MAX_STRETCH);

    // on veut étirer dans le sens du mouvement : on combine les deux axes pour un rendu doux
    const scaleX = 1 + Math.abs(stretchX);
    const scaleY = 1 + Math.abs(stretchY);

    // appliquer position + déformation
    cursor.style.left = `${currentX}px`;
    cursor.style.top  = `${currentY}px`;
    cursor.style.transform = `translate(-50%, -50%) scale(${scaleX}, ${scaleY})`;

    lastX = currentX;
    lastY = currentY;

    requestAnimationFrame(animate);
  }

  // démarre la loop
  animate();

  // expose si besoin (debug)
  window.__siteLang = {
    get: () => currentLang,
    set: setLanguage
  };

window.addEventListener('keydown', e => {
  console.log('Touche pressée :', e.key);
});

// EASTER EGG — GROSSISSEMENT DU CURSEUR
let cursorSizeState = 0;

window.addEventListener('keydown', (e) => {
  if (e.key.toLowerCase() === 'e') {
    cursorSizeState = (cursorSizeState + 1) % 4;

    const scale = [1, 16, 32, 64][cursorSizeState];
    cursor.style.transition = 'transform 1s ease';
    cursor.style.transform = `translate(-50%, -50%) scale(${scale})`;

    console.log('Taille curseur :', cursorSizeState, '→ scale', scale);
  }
});

})();

