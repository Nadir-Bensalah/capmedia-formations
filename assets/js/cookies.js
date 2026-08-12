/* ==========================================================================
   CAPMEDIA ACADEMY · Consentement cookies

   Gestion réelle et honnête :
   - « Strictement nécessaires » : toujours actifs (auth, sécurité de session).
     Ils sont dispensés de consentement par la loi.
   - « Préférences » : thème et profil. Fonctionnels, stockés en localStorage.
   - Aucun traceur publicitaire, aucune mesure d'audience tierce aujourd'hui.

   Le choix est mémorisé 6 mois. window.AZConsent.prefs() dit si les
   préférences sont autorisées : quand elles ne le sont pas, thème et profil
   ne sont pas persistés (ils restent le temps de la visite uniquement).
   ========================================================================== */
(function () {
  'use strict';

  var CLE = 'az:cookies';
  var VERSION = 1;                       // à incrémenter si les finalités changent
  var SIX_MOIS = 1000 * 60 * 60 * 24 * 182;

  function lire() {
    try {
      var c = JSON.parse(localStorage.getItem(CLE));
      if (!c || c.v !== VERSION) return null;
      if (Date.now() - c.date > SIX_MOIS) return null;
      return c;
    } catch (e) { return null; }
  }

  function ecrire(prefs) {
    try {
      localStorage.setItem(CLE, JSON.stringify({ v: VERSION, prefs: !!prefs, date: Date.now() }));
    } catch (e) {}
    // Si les préférences sont refusées, on nettoie ce qui n'est pas essentiel.
    if (!prefs) {
      try { localStorage.removeItem('az:profil'); } catch (e) {}
    }
  }

  window.AZConsent = {
    prefs: function () { var c = lire(); return c ? c.prefs : true; },
    reset: function () { try { localStorage.removeItem(CLE); } catch (e) {} },
  };

  /* --- Icônes (cohérentes avec le reste du site) ------------------------- */
  function svg(d) {
    return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>';
  }
  var ICO_COOKIE = svg('<path d="M12 2a10 10 0 1 0 10 10 4 4 0 0 1-5-5 4 4 0 0 1-5-5"/><path d="M8.5 8.5v.01"/><path d="M16 15.5v.01"/><path d="M12 12v.01"/><path d="M11 17v.01"/><path d="M7 14v.01"/>');

  /* --- Bandeau ----------------------------------------------------------- */
  function bandeau() {
    var el = document.createElement('div');
    el.className = 'cookie-bandeau';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', 'Cookies');
    el.innerHTML =
      '<div class="cookie-inner">' +
        '<div class="cookie-texte">' +
          '<p class="t-petit"><strong>On respecte ton appareil.</strong> ' +
          'Ce site n\'utilise que le strict nécessaire (te garder connecté) et tes ' +
          'préférences (thème, profil). Aucun traceur publicitaire, jamais. ' +
          '<a href="./cookies.html">En savoir plus</a>.</p>' +
        '</div>' +
        '<div class="cookie-actions">' +
          '<button type="button" class="btn btn-secondaire" data-c="refuser">Préférences seulement refusées</button>' +
          '<button type="button" class="btn btn-principal" data-c="accepter">Tout accepter</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(el);
    requestAnimationFrame(function () { el.classList.add('visible'); });

    el.querySelector('[data-c="accepter"]').addEventListener('click', function () { valider(el, true); });
    el.querySelector('[data-c="refuser"]').addEventListener('click', function () { valider(el, false); });
  }

  function valider(el, prefs) {
    ecrire(prefs);
    el.classList.remove('visible');
    setTimeout(function () { el.remove(); }, 260);
  }

  /* --- Panneau de gestion (rouvrable) ------------------------------------ */
  function panneau() {
    var actuel = window.AZConsent.prefs();
    var sur = document.createElement('div');
    sur.className = 'cookie-surcouche';
    sur.innerHTML =
      '<div class="cookie-panneau" role="dialog" aria-modal="true" aria-label="Gérer les cookies">' +
        '<div class="cookie-pan-tete">' +
          '<span class="cookie-ico">' + ICO_COOKIE + '</span>' +
          '<div><p class="etiquette">Confidentialité</p><h2 class="t-h3">Gérer les cookies</h2></div>' +
        '</div>' +
        '<div class="cookie-pan-corps">' +
          '<div class="cookie-cat">' +
            '<div class="cookie-cat-tete"><p class="t-petit t-fort">Strictement nécessaires</p>' +
              '<span class="cookie-fige">Toujours actifs</span></div>' +
            '<p class="t-micro t-3">Authentification et sécurité de session. Sans eux, l\'accès à la formation est impossible. Dispensés de consentement.</p>' +
          '</div>' +
          '<div class="cookie-cat">' +
            '<div class="cookie-cat-tete"><p class="t-petit t-fort">Préférences</p>' +
              '<label class="cookie-switch"><input type="checkbox" id="c-prefs"' + (actuel ? ' checked' : '') + '><span></span></label></div>' +
            '<p class="t-micro t-3">Thème (clair, sombre) et profil matériel, mémorisés sur ton appareil pour adapter la formation. Aucune donnée transmise.</p>' +
          '</div>' +
          '<div class="cookie-cat cookie-cat--off">' +
            '<div class="cookie-cat-tete"><p class="t-petit t-fort">Mesure d\'audience et publicité</p>' +
              '<span class="cookie-fige">Non utilisées</span></div>' +
            '<p class="t-micro t-3">Ce site n\'en utilise aucune. Cette ligne existe pour la transparence.</p>' +
          '</div>' +
        '</div>' +
        '<div class="cookie-pan-pied">' +
          '<button type="button" class="btn btn-secondaire" data-c="fermer">Annuler</button>' +
          '<button type="button" class="btn btn-principal" data-c="enregistrer">Enregistrer mes choix</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(sur);

    var fermer = function () { sur.remove(); };
    sur.addEventListener('click', function (e) { if (e.target === sur) fermer(); });
    sur.querySelector('[data-c="fermer"]').addEventListener('click', fermer);
    sur.querySelector('[data-c="enregistrer"]').addEventListener('click', function () {
      ecrire(sur.querySelector('#c-prefs').checked);
      fermer();
    });
  }

  /* --- Ouverture depuis n'importe quel lien « Gérer les cookies » -------- */
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-cookies-ouvrir]');
    if (b) { e.preventDefault(); panneau(); }
  });

  /* --- Au chargement : bandeau si aucun choix mémorisé ------------------- */
  if (!lire()) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', bandeau);
    } else {
      bandeau();
    }
  }
})();
