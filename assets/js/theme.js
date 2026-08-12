/* ==========================================================================
   ATELIER ZÉRO — Thème clair / sombre / système
   Chargé par toutes les pages. Le choix est mémorisé dans localStorage.
   L'application avant le premier rendu se fait par un script en ligne dans
   le <head> de chaque page, pour éviter le flash de thème.
   ========================================================================== */
(function () {
  'use strict';

  var CLE = 'az:theme';
  var racine = document.documentElement;

  function lire() {
    try {
      var v = localStorage.getItem(CLE);
      return (v === 'light' || v === 'dark') ? v : 'auto';
    } catch (e) { return 'auto'; }
  }

  function appliquer(valeur) {
    if (valeur === 'auto') racine.removeAttribute('data-theme');
    else racine.setAttribute('data-theme', valeur);

    try {
      if (valeur === 'auto') localStorage.removeItem(CLE);
      else localStorage.setItem(CLE, valeur);
    } catch (e) {}

    document.querySelectorAll('[data-theme-val]').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.themeVal === valeur));
    });
  }

  appliquer(lire());

  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-theme-val]');
    if (b) appliquer(b.dataset.themeVal);
  });

  window.AZTheme = { lire: lire, appliquer: appliquer };
})();
