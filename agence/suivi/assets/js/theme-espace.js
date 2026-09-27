/* ==========================================================================
   CAPMEDIA · l'apparence d'un espace, sombre par défaut
   L'espace Test et le Hub se présentent en sombre, sur le web comme dans
   l'application Mac ou Windows. On peut choisir Clair ou Automatique dans le
   rail ; le choix se retient à part pour chaque espace (la clé vient de
   l'attribut data-cle de la balise script), et à part des autres espaces :
   un même navigateur peut ouvrir le Cockpit en clair et le Hub en sombre.
   La même interface que theme.js : AZTheme.lire() et AZTheme.appliquer(),
   et les boutons [data-theme-val]. Le premier rendu est déjà juste : la page
   pose l'attribut dans son <head>, avant le premier pixel.
   ========================================================================== */
(function () {
  'use strict';

  var CLE = (document.currentScript && document.currentScript.dataset.cle) || 'suivi:theme';
  var racine = document.documentElement;

  function lire() {
    try {
      var v = localStorage.getItem(CLE);
      return (v === 'light' || v === 'dark' || v === 'auto') ? v : 'dark';
    } catch (e) { return 'dark'; }
  }

  function poser(valeur) {
    if (valeur === 'auto') racine.removeAttribute('data-theme');
    else racine.setAttribute('data-theme', valeur);
    document.querySelectorAll('[data-theme-val]').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.themeVal === valeur));
    });
  }

  function appliquer(valeur) {
    poser(valeur);
    try { localStorage.setItem(CLE, valeur); } catch (e) { /* stockage refusé */ }
  }

  poser(lire());

  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-theme-val]');
    if (b) appliquer(b.dataset.themeVal);
  });

  window.AZTheme = { lire: lire, appliquer: appliquer };
})();
