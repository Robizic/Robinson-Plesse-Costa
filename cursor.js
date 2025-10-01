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

document.addEventListener('mousemove', e => {
  mouseX = e.clientX;
  mouseY = e.clientY;
});

function animate() {
  // --- Curseur principal (avec déformation) ---
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

  // ✅ relance l'animation à chaque frame
  requestAnimationFrame(animate);
}

// ✅ démarre la boucle
animate();
