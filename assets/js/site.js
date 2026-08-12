/* ==========================================================================
   CAPMEDIA ACADEMY · Comportements de la page de vente
   Pas de dépendance, pas de framework.
   ========================================================================== */
(function () {
  'use strict';

  var cfg = window.AZ || {};

  /* --- 1. Tarif de lancement : une ligne de texte, pas un bandeau -------- */
  var elLancement = document.getElementById('lancement');
  if (elLancement && cfg.offre && cfg.offre.finLancement) {
    var fin = new Date(cfg.offre.finLancement).getTime();

    var majLancement = function () {
      var reste = fin - Date.now();

      if (reste <= 0) {
        elLancement.textContent = 'dernières heures au tarif de lancement';
        clearInterval(minuteur);
        return;
      }

      var jours = Math.floor(reste / 86400000);
      var heures = Math.floor((reste % 86400000) / 3600000);

      elLancement.textContent = jours > 0
        ? 'tarif de lancement : encore ' + jours + (jours > 1 ? ' jours' : ' jour')
        : 'tarif de lancement : encore ' + heures + ' h';
    };

    majLancement();
    var minuteur = setInterval(majLancement, 60000);
  }

  /* --- 2. En-tête : trait 1px seulement après défilement ----------------- */
  var entete = document.getElementById('entete');
  if (entete) {
    var majEntete = function () { entete.classList.toggle('decolle', window.scrollY > 8); };
    majEntete();
    window.addEventListener('scroll', majEntete, { passive: true });
  }

  /* --- 3. Barre collante mobile ----------------------------------------- */
  var barre = document.getElementById('barre-collante');
  var tarifs = document.getElementById('tarifs');
  if (barre && tarifs) {
    var majBarre = function () {
      var apresHeros = window.scrollY > window.innerHeight * 0.8;
      var r = tarifs.getBoundingClientRect();
      var surTarifs = r.top < window.innerHeight && r.bottom > 0;
      barre.classList.toggle('visible', apresHeros && !surTarifs);
    };
    majBarre();
    window.addEventListener('scroll', majBarre, { passive: true });
    window.addEventListener('resize', majBarre);
  }

  /* --- 4. Apparition au défilement -------------------------------------- */
  var cibles = document.querySelectorAll('.apparait');
  if (cibles.length) {
    if (!('IntersectionObserver' in window)) {
      cibles.forEach(function (el) { el.classList.add('vu'); });
    } else {
      var obs = new IntersectionObserver(function (entrees) {
        entrees.forEach(function (e) {
          if (!e.isIntersecting) return;
          e.target.classList.add('vu');
          obs.unobserve(e.target);
        });
      }, { rootMargin: '0px 0px -6% 0px', threshold: 0.05 });
      cibles.forEach(function (el) { obs.observe(el); });
    }
  }

  /* --- 5. Boutons Stripe ------------------------------------------------ */
  var liens = cfg.stripe || {};
  document.querySelectorAll('[data-stripe]').forEach(function (btn) {
    var url = liens[btn.getAttribute('data-stripe')];

    if (url) {
      btn.setAttribute('href', url);
      btn.setAttribute('rel', 'noopener');
      return;
    }

    btn.addEventListener('click', function (e) {
      e.preventDefault();
      var initial = btn.textContent;
      btn.textContent = 'Paiement bientôt disponible';
      setTimeout(function () { btn.textContent = initial; }, 2200);
    });
  });

  /* --- 6. Accordéons : un seul ouvert par liste ------------------------- */
  ['liste-programme', 'liste-faq'].forEach(function (id) {
    var liste = document.getElementById(id);
    if (!liste) return;

    liste.querySelectorAll('details.acc').forEach(function (d) {
      d.addEventListener('toggle', function () {
        if (!d.open) return;
        liste.querySelectorAll('details.acc').forEach(function (autre) {
          if (autre !== d) autre.open = false;
        });
      });
    });
  });

  /* --- 7. Défilement doux, en compensant l'en-tête ---------------------- */
  document.querySelectorAll('a[href^="#"]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      var id = a.getAttribute('href');
      if (id === '#' || id.length < 2) return;
      var cible = document.querySelector(id);
      if (!cible) return;
      e.preventDefault();
      window.scrollTo({
        top: cible.getBoundingClientRect().top + window.scrollY - 72,
        behavior: 'smooth',
      });
    });
  });

})();
