/* parallax.js
   - compatible anciens navigateurs
   - utilise requestAnimationFrame pour de meilleures perf
   - désactive l'effet sur petits écrans
*/

(function () {
  try {
    var slides = [];
    var ticking = false;
    var mouseTop = 0;

    function init() {
      slides = document.querySelectorAll('.slide');
      if (!slides || slides.length === 0) {
        console.warn('parallax.js: aucun élément ".slide" trouvé.');
        return;
      }

      // initialiser position pour éviter le "saut" au chargement
      onScroll();

      // scroll listener (passive pour perf)
      window.addEventListener('scroll', onScroll, { passive: true });
      // resize pour réactiver/désactiver selon largeur écran
      window.addEventListener('resize', onScroll, { passive: true });
    }

    function onScroll() {
      // désactiver le parallax sur mobile/tablette si souhaité
      if (window.innerWidth < 768) {
        // remettre backgroundPosition par défaut et sortir
        for (var i = 0; i < slides.length; i++) {
          slides[i].style.backgroundPosition = 'center center';
        }
        return;
      }

      mouseTop = window.pageYOffset || document.documentElement.scrollTop || 0;
      if (!ticking) {
        requestAnimationFrame(updatePositions);
        ticking = true;
      }
    }

    function updatePositions() {
      // facteur de vitesse, 0.2 = discret, 0.6 = marqué
      var speed = 0.2;

      for (var i = 0; i < slides.length; i++) {
        var slide = slides[i];

        // calcule offset basé sur la distance entre le scroll global et la position de la slide
        // on utilise offsetTop pour avoir un mouvement relatif à la position de la slide
        var slideTop = slide.offsetTop || 0;
        var offset = (mouseTop - slideTop) * speed;

        // limite la translation pour éviter positions extrêmes
        if (offset > 200) offset = 200;
        if (offset < -200) offset = -200;

        // applique la nouvelle position de background
        // on met center calc(50% + Xpx) pour un mouvement vertical
        slide.style.backgroundPosition = 'center calc(50% + ' + offset + 'px)';
      }

      ticking = false;
    }

    // initialisation après chargement DOM
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  } catch (err) {
    // log complet si erreur inattendue
    console.error('parallax.js erreur :', err);
  }
})();
