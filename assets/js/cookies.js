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

  var EN = window.location.pathname.indexOf('/en/') !== -1;
  // Le site agence (racine capmedia.app) vouvoie ; l'Academy tutoie.
  var VOUS = /^(www\.)?capmedia\.app$/.test(window.location.hostname);
  var TXT = EN ? {
    bandeau: '<strong>We respect your device.</strong> This site only uses the strict ' +
      'necessary (keeping you signed in) and your preferences (theme, profile). ' +
      'No advertising trackers, ever. ',
    savoir: 'Learn more',
    refuser: 'Preferences declined',
    accepter: 'Accept all',
    confidentialite: 'Privacy',
    gerer: 'Manage cookies',
    necessaires: 'Strictly necessary',
    toujours: 'Always on',
    necTexte: 'Authentication and session security. Without them, accessing the content is impossible. Exempt from consent.',
    prefs: 'Preferences',
    prefsTexte: 'Theme (light, dark) and device profile, stored on your device. No data transmitted.',
    pub: 'Analytics and advertising',
    pubOff: 'Not used',
    pubTexte: 'This site uses none. This line exists for transparency.',
    annuler: 'Cancel',
    enregistrer: 'Save my choices',
  } : VOUS ? {
    bandeau: '<strong>On respecte votre appareil.</strong> ' +
      'Ce site n\'utilise que le strict nécessaire (vous garder connecté) et vos ' +
      'préférences (thème). Aucun traceur publicitaire, jamais. ',
    savoir: 'En savoir plus',
    refuser: 'Préférences seulement refusées',
    accepter: 'Tout accepter',
    confidentialite: 'Confidentialité',
    gerer: 'Gérer les cookies',
    necessaires: 'Strictement nécessaires',
    toujours: 'Toujours actifs',
    necTexte: 'Sécurité et bon fonctionnement du site. Dispensés de consentement.',
    prefs: 'Préférences',
    prefsTexte: 'Thème (clair, sombre), mémorisé sur votre appareil. Aucune donnée transmise.',
    pub: 'Mesure d\'audience et publicité',
    pubOff: 'Non utilisées',
    pubTexte: 'Ce site n\'en utilise aucune. Cette ligne existe pour la transparence.',
    annuler: 'Annuler',
    enregistrer: 'Enregistrer mes choix',
  } : {
    bandeau: '<strong>On respecte ton appareil.</strong> ' +
      'Ce site n\'utilise que le strict nécessaire (te garder connecté) et tes ' +
      'préférences (thème, profil). Aucun traceur publicitaire, jamais. ',
    savoir: 'En savoir plus',
    refuser: 'Préférences seulement refusées',
    accepter: 'Tout accepter',
    confidentialite: 'Confidentialité',
    gerer: 'Gérer les cookies',
    necessaires: 'Strictement nécessaires',
    toujours: 'Toujours actifs',
    necTexte: 'Authentification et sécurité de session. Sans eux, l\'accès à la formation est impossible. Dispensés de consentement.',
    prefs: 'Préférences',
    prefsTexte: 'Thème (clair, sombre) et profil matériel, mémorisés sur ton appareil pour adapter la formation. Aucune donnée transmise.',
    pub: 'Mesure d\'audience et publicité',
    pubOff: 'Non utilisées',
    pubTexte: 'Ce site n\'en utilise aucune. Cette ligne existe pour la transparence.',
    annuler: 'Annuler',
    enregistrer: 'Enregistrer mes choix',
  };

  // Le lien « En savoir plus » : absolu, pour rester juste depuis n'importe
  // quelle profondeur (/apps/, /blog/…) et sur chacun des deux sites.
  var LIEN_COOKIES = /(^|\.)capmedia\.app$/.test(location.hostname) && location.hostname.indexOf('academy') === -1
    ? '/cookies' : '/cookies';

  var CLE = 'az:cookies';
  var VERSION = 1;                       // à incrémenter si les finalités changent
  var SIX_MOIS = 1000 * 60 * 60 * 24 * 182;

  // Le choix vaut pour capmedia.app ET academy.capmedia.app : il voyage
  // dans un cookie posé sur le domaine parent, en plus du localStorage.
  var DOMAINE = /(^|\.)capmedia\.app$/.test(location.hostname) ? '; domain=.capmedia.app' : '';

  function lireCookie() {
    var m = document.cookie.match(/(?:^|; )cm-consentement=([^;]+)/);
    if (!m) return null;
    try { return JSON.parse(decodeURIComponent(m[1])); } catch (e) { return null; }
  }

  function lire() {
    try {
      var c = lireCookie() || JSON.parse(localStorage.getItem(CLE));
      if (!c || c.v !== VERSION) return null;
      if (Date.now() - c.date > SIX_MOIS) return null;
      return c;
    } catch (e) { return null; }
  }

  function ecrire(prefs) {
    var choix = { v: VERSION, prefs: !!prefs, date: Date.now() };
    try { localStorage.setItem(CLE, JSON.stringify(choix)); } catch (e) {}
    try {
      document.cookie = 'cm-consentement=' + encodeURIComponent(JSON.stringify(choix)) +
        DOMAINE + '; path=/; max-age=' + Math.floor(SIX_MOIS / 1000) + '; samesite=lax; secure';
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
          '<p class="t-petit">' + TXT.bandeau +
          '<a href="' + LIEN_COOKIES + '">' + TXT.savoir + '</a>.</p>' +
        '</div>' +
        '<div class="cookie-actions">' +
          '<button type="button" class="btn btn-secondaire" data-c="refuser">' + TXT.refuser + '</button>' +
          '<button type="button" class="btn btn-principal" data-c="accepter">' + TXT.accepter + '</button>' +
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
      '<div class="cookie-panneau" role="dialog" aria-modal="true" aria-label="' + TXT.gerer + '">' +
        '<div class="cookie-pan-tete">' +
          '<span class="cookie-ico">' + ICO_COOKIE + '</span>' +
          '<div><p class="etiquette">' + TXT.confidentialite + '</p><h2 class="t-h3">' + TXT.gerer + '</h2></div>' +
        '</div>' +
        '<div class="cookie-pan-corps">' +
          '<div class="cookie-cat">' +
            '<div class="cookie-cat-tete"><p class="t-petit t-fort">' + TXT.necessaires + '</p>' +
              '<span class="cookie-fige">' + TXT.toujours + '</span></div>' +
            '<p class="t-micro t-3">' + TXT.necTexte + '</p>' +
          '</div>' +
          '<div class="cookie-cat">' +
            '<div class="cookie-cat-tete"><p class="t-petit t-fort">' + TXT.prefs + '</p>' +
              '<label class="cookie-switch"><input type="checkbox" id="c-prefs"' + (actuel ? ' checked' : '') + '><span></span></label></div>' +
            '<p class="t-micro t-3">' + TXT.prefsTexte + '</p>' +
          '</div>' +
          '<div class="cookie-cat cookie-cat--off">' +
            '<div class="cookie-cat-tete"><p class="t-petit t-fort">' + TXT.pub + '</p>' +
              '<span class="cookie-fige">' + TXT.pubOff + '</span></div>' +
            '<p class="t-micro t-3">' + TXT.pubTexte + '</p>' +
          '</div>' +
        '</div>' +
        '<div class="cookie-pan-pied">' +
          '<button type="button" class="btn btn-secondaire" data-c="fermer">' + TXT.annuler + '</button>' +
          '<button type="button" class="btn btn-principal" data-c="enregistrer">' + TXT.enregistrer + '</button>' +
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
