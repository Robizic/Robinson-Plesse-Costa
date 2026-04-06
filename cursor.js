const cursor = document.querySelector('.custom-cursor');

let mouseX = window.innerWidth / 2;
let mouseY = window.innerHeight / 2;

let currentX = mouseX;
let currentY = mouseY;

const speed = 0.15;   // vitesse du curseur principal

/* --- variables pour la déformation --- */
let lastX = currentX;
let lastY = currentY;
const maxStretch = 0.1; // étirement max

// ✅ Mode actuel de langue (fr par défaut)
let currentLang = "fr";

// --- Mise à jour de la position de la souris ---
document.addEventListener('mousemove', e => {
  mouseX = e.clientX;
  mouseY = e.clientY;
});

// --- Animation fluide + déformation ---
function animate() {
  currentX += (mouseX - currentX) * speed;
  currentY += (mouseY - currentY) * speed;

  const dx = currentX - lastX;
  const dy = currentY - lastY;

  const stretchX = Math.min(Math.max(dx * 0.02, -maxStretch), maxStretch);
  const stretchY = Math.min(Math.max(dy * 0.02, -maxStretch), maxStretch);

  const scaleX = 1 + Math.abs(stretchX);
  const scaleY = 1 + Math.abs(stretchY);

  cursor.style.left = currentX + 'px';
  cursor.style.top  = currentY + 'px';
  cursor.style.transform = `translate(-50%, -50%) scale(${scaleX}, ${scaleY})`;

  lastX = currentX;
  lastY = currentY;

  requestAnimationFrame(animate);
}

animate();

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

/* ==============================
   TRADUCTION + CHANGEMENT DE CURSEUR
================================= */

// Sélectionne les zones traduisibles
const translatableBlocks = document.querySelectorAll('.project-intro, .bio-block, .education-block');

// Au survol : afficher le drapeau correspondant à la langue cible
translatableBlocks.forEach(block => {
  block.addEventListener('mouseenter', () => {
    if (currentLang === "fr") {
      cursor.classList.add('flag-en'); // on propose anglais
    } else {
      cursor.classList.add('flag-fr'); // on propose français
    }
  });

  block.addEventListener('mouseleave', () => {
    cursor.classList.remove('flag-en', 'flag-fr'); // retour au curseur normal
  });

  // Clic = toggle la langue
  block.addEventListener('click', () => {
    if (currentLang === "fr") {
      currentLang = "en";
      // 👉 ici tu charges ou affiches la traduction en anglais
      document.body.classList.add("lang-en");
      document.body.classList.remove("lang-fr");
    } else {
      currentLang = "fr";
      // 👉 ici tu reviens au français
      document.body.classList.add("lang-fr");
      document.body.classList.remove("lang-en");
    }
    cursor.classList.remove('flag-en', 'flag-fr'); // reset curseur après clic
  });

});

