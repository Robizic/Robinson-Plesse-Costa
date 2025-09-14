// Détection d'entrée dans le viewport pour déclencher l'animation
document.addEventListener("DOMContentLoaded", () => {
  const slides = document.querySelectorAll(".slide");

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add("visible");
      } else {
        entry.target.classList.remove("visible");
      }
    });
  }, {
    threshold: 0.4   // 40% visible pour déclencher
  });

  slides.forEach(slide => observer.observe(slide));
});
