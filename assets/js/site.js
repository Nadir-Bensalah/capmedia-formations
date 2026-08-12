/* ==========================================================================
   ATELIER ZÉRO — Comportements de la page de vente
   Pas de dépendance, pas de framework. ~4 ko.
   ========================================================================== */
(function () {
  'use strict';

  var cfg = window.AZ || {};

  /* --- 1. Compte à rebours du tarif de lancement ------------------------ */
  var elCompte = document.getElementById('compte');
  if (elCompte && cfg.offre && cfg.offre.finLancement) {
    var fin = new Date(cfg.offre.finLancement).getTime();

    var tic = function () {
      var reste = fin - Date.now();

      if (reste <= 0) {
        var bandeau = document.getElementById('bandeau');
        if (bandeau) {
          bandeau.innerHTML = '<span>Dernières heures avant le retour au tarif plein.</span>';
        }
        clearInterval(minuteur);
        return;
      }

      var s = Math.floor(reste / 1000);
      var j = Math.floor(s / 86400);
      var h = Math.floor((s % 86400) / 3600);
      var m = Math.floor((s % 3600) / 60);
      var sec = s % 60;

      elCompte.textContent = j + 'j ' + pad(h) + 'h ' + pad(m) + 'm ' + pad(sec) + 's';
    };

    var pad = function (n) { return n < 10 ? '0' + n : '' + n; };
    tic();
    var minuteur = setInterval(tic, 1000);
  }

  /* --- 2. En-tête qui se décolle ---------------------------------------- */
  var entete = document.getElementById('entete');
  if (entete) {
    var majEntete = function () {
      entete.classList.toggle('decolle', window.scrollY > 8);
    };
    majEntete();
    window.addEventListener('scroll', majEntete, { passive: true });
  }

  /* --- 3. Barre collante mobile : apparaît après le héros --------------- */
  var barre = document.getElementById('barre-collante');
  var tarifs = document.getElementById('tarifs');
  if (barre && tarifs) {
    var majBarre = function () {
      var apresHeros = window.scrollY > window.innerHeight * 0.85;
      var rect = tarifs.getBoundingClientRect();
      var surTarifs = rect.top < window.innerHeight && rect.bottom > 0;
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
      var observateur = new IntersectionObserver(function (entrees) {
        entrees.forEach(function (e) {
          if (e.isIntersecting) {
            e.target.classList.add('vu');
            observateur.unobserve(e.target);
          }
        });
      }, { rootMargin: '0px 0px -8% 0px', threshold: 0.06 });

      cibles.forEach(function (el) { observateur.observe(el); });
    }
  }

  /* --- 5. Boutons Stripe ------------------------------------------------ */
  var liens = cfg.stripe || {};
  document.querySelectorAll('[data-stripe]').forEach(function (btn) {
    var offre = btn.getAttribute('data-stripe');
    var url = liens[offre];

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

  /* --- 6. Un seul module ouvert à la fois (accordéon) ------------------- */
  document.querySelectorAll('#programme details.module').forEach(function (d) {
    d.addEventListener('toggle', function () {
      if (!d.open) return;
      d.parentElement.querySelectorAll('details.module').forEach(function (autre) {
        if (autre !== d) autre.open = false;
      });
    });
  });

  /* --- 7. Petite animation du téléphone du héros ------------------------ */
  var puce = document.getElementById('puce-cible');
  if (puce && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    var coche = false;
    setInterval(function () {
      coche = !coche;
      puce.style.background = coche ? 'var(--vert)' : 'transparent';
      puce.style.borderColor = coche ? 'var(--vert)' : 'var(--trait-fort)';
    }, 2400);
  }

  /* --- 8. Défilement doux avec compensation de l'en-tête ---------------- */
  document.querySelectorAll('a[href^="#"]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      var id = a.getAttribute('href');
      if (id === '#' || id.length < 2) return;
      var cible = document.querySelector(id);
      if (!cible) return;
      e.preventDefault();
      var haut = cible.getBoundingClientRect().top + window.scrollY - 76;
      window.scrollTo({ top: haut, behavior: 'smooth' });
    });
  });

})();
