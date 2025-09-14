const cursor = document.querySelector('.custom-cursor');

let mouseX = window.innerWidth / 2;
let mouseY = window.innerHeight / 2;

let currentX = mouseX;
let currentY = mouseY;

const speed = 0.15; // 0 = lent, 1 = direct, ajuste pour le délai

// Mettre à jour la position de la souris
document.addEventListener('mousemove', e => {
  mouseX = e.clientX;
  mouseY = e.clientY;
});

// Animation fluide
function animate() {
  // Calculer la nouvelle position avec interpolation
  currentX += (mouseX - currentX) * speed;
  currentY += (mouseY - currentY) * speed;

  // Appliquer la position au curseur
  cursor.style.left = currentX + 'px';
  cursor.style.top = currentY + 'px';

  requestAnimationFrame(animate);
}

// Lancer l'animation
animate();
